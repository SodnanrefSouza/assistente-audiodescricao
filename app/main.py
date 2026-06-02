from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
import threading
import time
import traceback
import uuid
import webbrowser
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.exceptions import BadRequest, NotFound
from werkzeug.utils import secure_filename

from .core.exporters import (
    export_csv,
    export_json,
    export_marker_csv,
    export_readable_script,
    export_srt,
)
from .core.ffmpeg_utils import (
    build_ad_audio_track,
    build_final_mixed_video,
    detect_silences,
    detect_silences_with_progress,
    ffmpeg_path,
    ffprobe_path,
    get_duration,
    recording_duration,
)
from .core.interval_tools import (
    create_manual_interval,
    merge_interval_candidates,
    normalize_intervals,
    speech_gap_intervals,
)
from .core.projects import ALLOWED_EXTENSIONS, VALID_STATUSES, ProjectStore, safe_filename
from .core.timecode import parse_float
from .core.transcription import result_to_metadata, transcribe_video


def resource_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[1]


def runtime_data_dir() -> Path:
    env_dir = os.environ.get("AD_ASSIST_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "dados_audio_descricao"
    return Path(__file__).resolve().parents[1] / "data"


class JobManager:
    """Gerenciador simples de tarefas em segundo plano.

    Ele fica em memória porque o aplicativo é local e de usuário único. Se o programa for fechado, tarefas em andamento são encerradas.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, kind: str, title: str) -> str:
        job_id = uuid.uuid4().hex[:12]
        now = time.time()
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "kind": kind,
                "title": title,
                "status": "running",
                "percent": 0,
                "message": "Preparando...",
                "details": "",
                "error": None,
                "traceback": None,
                "result": None,
                "created_at": now,
                "updated_at": now,
            }
        return job_id

    def update(self, job_id: str, **kwargs: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.update(kwargs)
            job["updated_at"] = time.time()

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def run(self, job_id: str, target) -> None:
        def _runner() -> None:
            try:
                target()
            except Exception as exc:
                friendly = friendly_exception_message(exc)
                self.update(
                    job_id,
                    status="error",
                    percent=100,
                    message="Ocorreu um erro.",
                    error=friendly,
                    traceback=traceback.format_exc(),
                )

        threading.Thread(target=_runner, daemon=True).start()


def friendly_exception_message(exc: Exception) -> str:
    text = str(exc) or exc.__class__.__name__
    lower = text.lower()
    if "ffmpeg não encontrado" in lower or "ffprobe não encontrado" in lower:
        return text + "\n\nComo corrigir: instale o FFmpeg pelo winget ou coloque ffmpeg.exe e ffprobe.exe em third_party/ffmpeg/bin/."
    if "não possui faixa de áudio" in lower:
        return text + "\n\nComo corrigir: use um vídeo que tenha áudio, ou extraia/adicio­ne uma faixa de áudio antes da detecção."
    if "formato de vídeo não suportado" in lower:
        return text + "\n\nComo corrigir: tente converter o vídeo para .mp4 e envie novamente."
    if "arquivo muito grande" in lower or "request entity too large" in lower:
        return text + "\n\nComo corrigir: nesta versão o vídeo é enviado em partes. Se esse erro aparecer, uma parte ficou grande demais. Diminua AD_ASSIST_UPLOAD_CHUNK_MB ou aumente AD_ASSIST_MAX_CHUNK_MB."
    if "permission" in lower or "permissão" in lower or "access is denied" in lower:
        return text + "\n\nComo corrigir: verifique se o vídeo não está aberto em outro programa e se a pasta do projeto permite escrita."
    if "faster-whisper" in lower or "transcricao automatica" in lower or "transcrição automática" in lower:
        return text + "\n\nComo corrigir: instale as dependências com .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt e tente novamente."
    return text


def create_app() -> Flask:
    root = resource_root()
    app = Flask(
        __name__,
        template_folder=str(root / "app" / "templates"),
        static_folder=str(root / "app" / "static"),
    )
    # O upload principal é fracionado no navegador. Este limite agora vale por requisição/parte,
    # não pelo tamanho total do vídeo. Assim um arquivo de 10 GB, 50 GB etc. pode ser enviado
    # em partes menores, desde que exista espaço em disco.
    app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("AD_ASSIST_MAX_CHUNK_MB", "256")) * 1024 * 1024
    store = ProjectStore(runtime_data_dir())
    store.ensure()
    upload_sessions_dir = store.data_dir / "upload_sessions"
    upload_sessions_dir.mkdir(parents=True, exist_ok=True)
    jobs = JobManager()
    active_transcription_jobs: dict[str, str] = {}

    def ok(data: dict[str, Any] | None = None, **kwargs):
        payload = {"ok": True}
        if data:
            payload.update(data)
        payload.update(kwargs)
        return jsonify(payload)

    def fail(message: str, status: int = 400, **kwargs):
        payload = {"ok": False, "error": message}
        payload.update(kwargs)
        return jsonify(payload), status

    def _transcript(project: dict[str, Any]) -> dict[str, Any]:
        transcript = project.get("transcript")
        if not isinstance(transcript, dict):
            transcript = {}
        project["transcript"] = transcript
        return transcript

    def _set_transcript_status(project: dict[str, Any], status: str, **extra: Any) -> None:
        transcript = _transcript(project)
        transcript["status"] = status
        transcript["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        for key, value in extra.items():
            transcript[key] = value

    def _start_transcription_job(project_id: str, *, force: bool = False) -> tuple[str | None, dict[str, Any], str]:
        project = store.load(project_id)
        transcript = _transcript(project)
        if (transcript.get("text") or "").strip() and not force:
            return None, project, "Checagem de voz já existe para este projeto."

        active_job_id = active_transcription_jobs.get(project_id)
        active_job = jobs.get(active_job_id) if active_job_id else None
        if active_job and active_job.get("status") == "running":
            return active_job_id, project, "Checagem de voz já está em andamento."

        job_id = jobs.create("transcript", f"Checar voz {project.get('title') or project_id}")
        active_transcription_jobs[project_id] = job_id
        _set_transcript_status(project, "running", source="automatic", error="", job_id=job_id)
        store.save(project, reason="Checagem de voz iniciada")

        def work() -> None:
            try:
                def progress(percent: float, message: str) -> None:
                    jobs.update(
                        job_id,
                        percent=round(percent, 1),
                        message="Checando voz do vídeo...",
                        details=message,
                    )

                fresh_project = store.load(project_id)
                jobs.update(job_id, percent=2, message="Preparando checagem de voz...", details="A tarefa roda localmente no seu computador.")
                result = transcribe_video(
                    store.video_path(fresh_project),
                    store.project_folder(project_id) / "transcription",
                    duration=float(fresh_project.get("duration") or 0),
                    progress_callback=progress,
                )
                fresh_project = store.load(project_id)
                transcript_data = result_to_metadata(result)
                transcript_data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                transcript_data["job_id"] = job_id
                fresh_project["transcript"] = transcript_data
                if fresh_project.get("intervals"):
                    settings = _parse_detection_settings(fresh_project, {})
                    fresh_project["intervals"] = _with_transcript_gap_candidates(
                        fresh_project,
                        fresh_project.get("intervals", []),
                        settings,
                    )
                store.save(fresh_project, reason="Checagem de voz gerada")
                jobs.update(
                    job_id,
                    status="done",
                    percent=100,
                    message="Checagem de voz concluída.",
                    details=f"{len(result.segments)} fala(s) reconhecida(s).",
                    result={
                        "project": fresh_project,
                        "message": f"Checagem de voz pronta: {len(result.segments)} fala(s) reconhecida(s).",
                    },
                )
            except Exception as exc:
                try:
                    failed_project = store.load(project_id)
                    _set_transcript_status(
                        failed_project,
                        "error",
                        source="automatic",
                        error=friendly_exception_message(exc),
                        job_id=job_id,
                    )
                    store.save(failed_project, reason="Falha na checagem de voz")
                finally:
                    raise
            finally:
                active_transcription_jobs.pop(project_id, None)

        jobs.run(job_id, work)
        return job_id, project, "Checagem de voz iniciada."

    @app.errorhandler(413)
    def too_large(_):
        max_mb = int(os.environ.get("AD_ASSIST_MAX_CHUNK_MB", "256"))
        return fail(
            f"Uma parte do upload ficou maior que o limite por requisição ({max_mb} MB). Diminua AD_ASSIST_UPLOAD_CHUNK_MB ou aumente AD_ASSIST_MAX_CHUNK_MB.",
            413,
        )

    @app.errorhandler(BadRequest)
    def bad_request(e):
        return fail(str(e.description or e), 400)

    @app.errorhandler(NotFound)
    def not_found(e):
        return fail(str(e.description or e), 404)

    @app.errorhandler(ValueError)
    def value_error(e):
        return fail(friendly_exception_message(e), 400)

    @app.errorhandler(FileNotFoundError)
    def file_not_found(e):
        return fail(friendly_exception_message(e), 404)

    @app.errorhandler(Exception)
    def unhandled(e):
        return fail(friendly_exception_message(e), 500)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        try:
            ffp = ffmpeg_path()
            fpp = ffprobe_path()
            ffmpeg_ok = True
            ffmpeg_message = "FFmpeg encontrado."
        except Exception as exc:
            ffp = None
            fpp = None
            ffmpeg_ok = False
            ffmpeg_message = str(exc)
        transcription_ok = importlib.util.find_spec("faster_whisper") is not None
        return ok(
            {
                "data_dir": str(store.data_dir),
                "ffmpeg_ok": ffmpeg_ok,
                "ffmpeg_message": ffmpeg_message,
                "ffmpeg_path": ffp,
                "ffprobe_path": fpp,
                "transcription_ok": transcription_ok,
                "transcription_message": (
                    "Checagem de voz disponível."
                    if transcription_ok
                    else "Checagem de voz precisa instalar faster-whisper."
                ),
                "max_upload_mb": None,
                "max_chunk_mb": int(os.environ.get("AD_ASSIST_MAX_CHUNK_MB", "256")),
                "recommended_chunk_mb": int(os.environ.get("AD_ASSIST_UPLOAD_CHUNK_MB", "64")),
                "upload_mode": "chunked",
            }
        )

    @app.get("/api/jobs/<job_id>")
    def get_job(job_id: str):
        job = jobs.get(job_id)
        if not job:
            raise NotFound("Tarefa não encontrada. Talvez o programa tenha sido reiniciado.")
        return ok({"job": job})

    @app.get("/api/projects")
    def list_projects():
        return ok({"projects": store.list_projects()})

    def _upload_session_path(upload_id: str) -> Path:
        return upload_sessions_dir / f"{secure_filename(upload_id)}.json"

    def _load_upload_session(upload_id: str) -> dict[str, Any]:
        path = _upload_session_path(upload_id)
        if not path.exists():
            raise NotFound("Sessão de upload não encontrada. Recarregue a página e tente criar o projeto novamente.")
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _save_upload_session(session: dict[str, Any]) -> None:
        path = _upload_session_path(session["id"])
        with path.open("w", encoding="utf-8") as f:
            json.dump(session, f, ensure_ascii=False, indent=2)

    @app.post("/api/projects/upload/start")
    def upload_start_route():
        data = request.get_json(force=True, silent=True) or {}
        filename = safe_filename(data.get("filename") or "video.mp4")
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise BadRequest("Formato de vídeo não suportado. Use MP4, MOV, MKV, AVI, WEBM, M4V, MPG, MPEG ou WMV.")

        try:
            size = int(data.get("size") or 0)
            chunk_size = int(data.get("chunk_size") or int(os.environ.get("AD_ASSIST_UPLOAD_CHUNK_MB", "64")) * 1024 * 1024)
            total_chunks = int(data.get("total_chunks") or 0)
        except Exception:
            raise BadRequest("Metadados inválidos para iniciar o upload.")

        if size <= 0:
            raise BadRequest("O arquivo selecionado parece estar vazio.")
        max_chunk_bytes = int(os.environ.get("AD_ASSIST_MAX_CHUNK_MB", "256")) * 1024 * 1024
        if chunk_size <= 0 or chunk_size > max_chunk_bytes:
            raise BadRequest(
                f"Tamanho de parte inválido. Use partes de até {max_chunk_bytes // (1024 * 1024)} MB."
            )
        if total_chunks <= 0:
            raise BadRequest("Quantidade de partes inválida.")

        upload_id = uuid.uuid4().hex[:16]
        temp_path = upload_sessions_dir / f"{upload_id}.part"
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.write_bytes(b"")
        session = {
            "id": upload_id,
            "filename": filename,
            "title": data.get("title") or Path(filename).stem,
            "size": size,
            "chunk_size": chunk_size,
            "total_chunks": total_chunks,
            "expected_index": 0,
            "bytes_received": 0,
            "temp_path": str(temp_path),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        _save_upload_session(session)
        return ok({
            "upload_id": upload_id,
            "chunk_size": chunk_size,
            "total_chunks": total_chunks,
            "message": "Upload fracionado iniciado.",
        })

    @app.post("/api/projects/upload/chunk")
    def upload_chunk_route():
        upload_id = request.form.get("upload_id") or ""
        if "chunk" not in request.files:
            raise BadRequest("Parte do vídeo não enviada.")
        try:
            chunk_index = int(request.form.get("chunk_index") or "0")
        except Exception:
            raise BadRequest("Índice da parte inválido.")

        session = _load_upload_session(upload_id)
        expected = int(session.get("expected_index") or 0)
        if chunk_index < expected:
            # Requisição repetida depois de uma resposta perdida. Não duplicamos dados.
            return ok({
                "upload_id": upload_id,
                "received": session.get("bytes_received", 0),
                "expected_index": expected,
                "duplicate": True,
            })
        if chunk_index != expected:
            raise BadRequest(
                f"Parte fora de ordem. Esperado: {expected + 1}. Recebido: {chunk_index + 1}. Recomece o envio do projeto."
            )

        file_storage = request.files["chunk"]
        temp_path = Path(session["temp_path"])
        with temp_path.open("ab") as f:
            shutil.copyfileobj(file_storage.stream, f, length=1024 * 1024)

        bytes_received = temp_path.stat().st_size
        session["bytes_received"] = bytes_received
        session["expected_index"] = expected + 1
        session["updated_at"] = time.time()
        _save_upload_session(session)
        return ok({
            "upload_id": upload_id,
            "received": bytes_received,
            "expected_index": session["expected_index"],
            "total_chunks": session["total_chunks"],
        })

    @app.post("/api/projects/upload/finish")
    def upload_finish_route():
        data = request.get_json(force=True, silent=True) or {}
        upload_id = data.get("upload_id") or ""
        session = _load_upload_session(upload_id)
        temp_path = Path(session["temp_path"])
        expected_size = int(session.get("size") or 0)
        actual_size = temp_path.stat().st_size if temp_path.exists() else 0
        if int(session.get("expected_index") or 0) != int(session.get("total_chunks") or 0):
            raise BadRequest("O upload ainda não recebeu todas as partes do vídeo.")
        if actual_size != expected_size:
            raise BadRequest(
                f"O tamanho recebido não confere. Esperado: {expected_size} bytes. Recebido: {actual_size} bytes."
            )

        project = store.create_project(session["filename"], title=session.get("title"))
        try:
            video_path = store.import_existing_video(project, temp_path)
            project["duration"] = round(get_duration(video_path), 3)
            store.save(project, reason="Vídeo importado e duração validada")
        except Exception:
            store.delete(project["id"])
            raise
        finally:
            sp = _upload_session_path(upload_id)
            if sp.exists():
                sp.unlink()
            if temp_path.exists():
                temp_path.unlink()
        transcription_job_id, project, transcript_message = _start_transcription_job(project["id"])
        return ok({
            "project": project,
            "message": "Projeto criado com upload fracionado.",
            "transcription_job_id": transcription_job_id,
            "transcription_message": transcript_message,
        })

    @app.delete("/api/projects/upload/<upload_id>")
    def upload_cancel_route(upload_id: str):
        try:
            session = _load_upload_session(upload_id)
            temp_path = Path(session.get("temp_path") or "")
            if temp_path.exists():
                temp_path.unlink()
        except Exception:
            pass
        sp = _upload_session_path(upload_id)
        if sp.exists():
            sp.unlink()
        return ok({"message": "Upload cancelado."})

    @app.post("/api/projects")
    def create_project_route():
        if "video" not in request.files:
            raise BadRequest("Envie um arquivo de vídeo no campo 'video'.")
        uploaded = request.files["video"]
        if not uploaded.filename:
            raise BadRequest("Nenhum arquivo foi selecionado.")
        filename = safe_filename(uploaded.filename)
        title = request.form.get("title") or Path(filename).stem
        project = store.create_project(filename, title=title)
        video_path = store.save_uploaded_video(project, uploaded)
        try:
            project["duration"] = round(get_duration(video_path), 3)
        except Exception as exc:
            store.delete(project["id"])
            raise RuntimeError(f"O arquivo foi enviado, mas não conseguimos ler a duração do vídeo. {exc}")
        store.save(project, reason="Vídeo importado e duração validada")
        transcription_job_id, project, transcript_message = _start_transcription_job(project["id"])
        return ok({
            "project": project,
            "transcription_job_id": transcription_job_id,
            "transcription_message": transcript_message,
        })

    @app.get("/api/projects/<project_id>")
    def get_project(project_id: str):
        if not store.exists(project_id):
            raise NotFound("Projeto não encontrado.")
        return ok({"project": store.load(project_id)})

    @app.delete("/api/projects/<project_id>")
    def delete_project(project_id: str):
        if not store.exists(project_id):
            raise NotFound("Projeto não encontrado.")
        store.delete(project_id)
        return ok({"message": "Projeto arquivado na lixeira local."})

    @app.post("/api/projects/<project_id>/notes")
    def update_project_notes(project_id: str):
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        project["notes"] = data.get("notes", "")
        store.save(project, reason="Observações gerais atualizadas")
        return ok({"project": project})

    @app.post("/api/projects/<project_id>/transcript")
    def update_project_transcript(project_id: str):
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        transcript = project.get("transcript") or {}
        transcript["text"] = data.get("text", "")
        transcript["source"] = data.get("source", "")
        transcript["status"] = "done" if transcript["text"].strip() else "empty"
        transcript["error"] = ""
        transcript["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        project["transcript"] = transcript
        if project.get("intervals"):
            settings = _parse_detection_settings(project, {})
            project["intervals"] = _with_transcript_gap_candidates(project, project.get("intervals", []), settings)
        store.save(project, reason="Checagem de voz atualizada")
        return ok({"project": project})

    @app.post("/api/projects/<project_id>/transcript/start")
    def start_project_transcription(project_id: str):
        data = request.get_json(force=True, silent=True) or {}
        force = bool(data.get("force"))
        job_id, project, message = _start_transcription_job(project_id, force=force)
        return ok({"project": project, "job_id": job_id, "message": message})

    @app.get("/api/projects/<project_id>/history")
    def project_history(project_id: str):
        return ok({"history": store.list_history(project_id)})

    @app.post("/api/projects/<project_id>/history/<snapshot_id>/restore")
    def restore_project_history(project_id: str, snapshot_id: str):
        project = store.restore_history(project_id, snapshot_id)
        return ok({"project": project, "message": "Histórico restaurado."})

    def _parse_detection_settings(project: dict[str, Any], data: dict[str, Any]) -> dict[str, float]:
        def clamp(value: float, minimum: float, maximum: float) -> float:
            return max(minimum, min(maximum, value))

        settings = project.get("settings", {})
        return {
            "noise_db": clamp(parse_float(data.get("noise_db"), settings.get("noise_db", -35)), -80, 0),
            "min_silence": clamp(parse_float(data.get("min_silence"), settings.get("min_silence", 1.0)), 0.2, 10),
            "min_ad_duration": clamp(parse_float(data.get("min_ad_duration"), settings.get("min_ad_duration", 0.8)), 0.2, 30),
            "padding_start": clamp(parse_float(data.get("padding_start"), settings.get("padding_start", 0.1)), 0, 5),
            "padding_end": clamp(parse_float(data.get("padding_end"), settings.get("padding_end", 0.1)), 0, 5),
            "preview_margin": clamp(parse_float(data.get("preview_margin"), settings.get("preview_margin", 2.0)), 0, 30),
        }

    def _with_transcript_gap_candidates(
        project: dict[str, Any],
        intervals: list[dict[str, Any]],
        settings: dict[str, float],
    ) -> list[dict[str, Any]]:
        transcript = project.get("transcript") or {}
        transcript_text = transcript.get("text") or ""
        duration = parse_float(project.get("duration"), 0)
        speech_intervals = speech_gap_intervals(
            transcript_text,
            duration,
            min_gap=settings["min_ad_duration"],
            padding_start=settings["padding_start"],
            padding_end=settings["padding_end"],
        )
        if not speech_intervals:
            return normalize_intervals(intervals)
        return merge_interval_candidates(intervals, speech_intervals)

    @app.post("/api/projects/<project_id>/detect/start")
    def detect_start_route(project_id: str):
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        settings = _parse_detection_settings(project, data)
        job_id = jobs.create("detect", f"Detectar pausas — {project.get('title') or project_id}")

        def work() -> None:
            jobs.update(job_id, percent=1, message="Preparando detecção...", details="Validando arquivo e configurações.")

            def progress(percent: float, message: str) -> None:
                jobs.update(job_id, percent=round(percent, 1), message=message, details="Aguarde. Em vídeos longos essa etapa pode levar alguns minutos.")

            fresh_project = store.load(project_id)
            intervals = detect_silences_with_progress(
                store.video_path(fresh_project),
                noise_db=settings["noise_db"],
                min_silence=settings["min_silence"],
                min_ad_duration=settings["min_ad_duration"],
                padding_start=settings["padding_start"],
                padding_end=settings["padding_end"],
                progress_callback=progress,
            )
            intervals = _with_transcript_gap_candidates(fresh_project, intervals, settings)
            fresh_project["settings"] = settings
            fresh_project["intervals"] = intervals
            store.save(fresh_project, reason="Detecção automática de pausas")
            jobs.update(
                job_id,
                status="done",
                percent=100,
                message=f"Detecção concluída: {len(intervals)} intervalos encontrados.",
                details="Você já pode revisar os cards de intervalo.",
                result={"project": fresh_project, "message": f"{len(intervals)} intervalos encontrados."},
            )

        jobs.run(job_id, work)
        return ok({"job_id": job_id})

    @app.post("/api/projects/<project_id>/detect")
    def detect_route(project_id: str):
        # Mantido por compatibilidade. A interface nova usa /detect/start para mostrar progresso.
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        settings = _parse_detection_settings(project, data)

        intervals = detect_silences(
            store.video_path(project),
            noise_db=settings["noise_db"],
            min_silence=settings["min_silence"],
            min_ad_duration=settings["min_ad_duration"],
            padding_start=settings["padding_start"],
            padding_end=settings["padding_end"],
        )
        intervals = _with_transcript_gap_candidates(project, intervals, settings)
        project["settings"] = settings
        project["intervals"] = intervals
        store.save(project, reason="Detecção automática de pausas")
        return ok({"project": project, "message": f"{len(intervals)} intervalos encontrados."})

    @app.post("/api/projects/<project_id>/intervals")
    def create_interval(project_id: str):
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        duration = parse_float(project.get("duration"), 0)
        start = max(0.0, parse_float(data.get("start"), 0))
        fallback_length = parse_float((project.get("settings") or {}).get("min_ad_duration"), 2.0)
        interval_length = max(0.2, parse_float(data.get("duration"), fallback_length))
        end = parse_float(data.get("end"), start + interval_length)
        if duration:
            start = min(start, max(0.0, duration - 0.1))
            end = min(max(start + 0.1, end), duration)
        if end <= start:
            raise BadRequest("O fim do intervalo precisa ser maior que o inicio.")

        intervals = project.get("intervals", [])
        intervals.append(create_manual_interval(start, end, data.get("title") or "Intervalo manual"))
        project["intervals"] = normalize_intervals(intervals)
        created = min(project["intervals"], key=lambda item: abs(parse_float(item.get("start"), 0) - start))
        workflow = project.get("workflow") or {}
        workflow["current_interval"] = created.get("index")
        project["workflow"] = workflow
        store.save(project, reason=f"Intervalo manual {created.get('index')} adicionado")
        return ok({"project": project, "interval": created, "message": "Intervalo manual adicionado."})

    @app.delete("/api/projects/<project_id>/intervals/<int:index>")
    def delete_interval(project_id: str, index: int):
        project = store.load(project_id)
        intervals = project.get("intervals", [])
        if index < 1 or index > len(intervals):
            raise NotFound("Intervalo nao encontrado.")
        interval = intervals[index - 1]
        store.trash_recording(project_id, interval.get("recording_filename"))
        del intervals[index - 1]
        project["intervals"] = normalize_intervals(intervals)
        workflow = project.get("workflow") or {}
        if workflow.get("current_interval") == index:
            workflow["current_interval"] = project["intervals"][0]["index"] if project["intervals"] else None
        project["workflow"] = workflow
        store.save(project, reason=f"Intervalo {index} excluido")
        return ok({"project": project, "message": "Intervalo excluido."})

    @app.post("/api/projects/<project_id>/intervals/<int:index>")
    def update_interval(project_id: str, index: int):
        project = store.load(project_id)
        data = request.get_json(force=True, silent=True) or {}
        intervals = project.get("intervals", [])
        if index < 1 or index > len(intervals):
            raise NotFound("Intervalo não encontrado.")
        interval = intervals[index - 1]
        for key in ["title", "script", "notes", "status"]:
            if key in data:
                value = data.get(key) or ""
                if key == "status" and value not in VALID_STATUSES:
                    raise BadRequest("Status inválido para o intervalo.")
                interval[key] = value
        if interval.get("script") and interval.get("status") == "pendente":
            interval["status"] = "roteirizado"
        store.save(project, reason=f"Intervalo {index} atualizado")
        return ok({"project": project, "interval": interval})

    @app.post("/api/projects/<project_id>/recordings/<int:index>")
    def upload_recording(project_id: str, index: int):
        project = store.load(project_id)
        intervals = project.get("intervals", [])
        if index < 1 or index > len(intervals):
            raise NotFound("Intervalo não encontrado.")
        if "audio" not in request.files:
            raise BadRequest("Envie a gravação no campo 'audio'.")
        audio = request.files["audio"]
        original = secure_filename(audio.filename or f"intervalo_{index}.webm")
        ext = Path(original).suffix.lower() or ".webm"
        if ext not in {".webm", ".ogg", ".wav", ".mp3", ".m4a"}:
            ext = ".webm"
        filename = f"intervalo_{index:03d}{ext}"
        interval = intervals[index - 1]
        store.trash_recording(project_id, interval.get("recording_filename"))
        path = store.recordings_dir(project_id) / filename
        audio.save(path)

        rec_duration = recording_duration(path)
        interval["recording_filename"] = filename
        interval["recording_duration"] = round(rec_duration, 3) if rec_duration is not None else None
        interval["status"] = "gravado"
        interval_duration = float(interval.get("duration") or 0)
        if rec_duration and interval_duration and rec_duration > interval_duration:
            interval["warning"] = (
                f"A gravação tem {rec_duration:.2f}s e o intervalo tem {interval_duration:.2f}s. "
                "Ela pode invadir uma fala ou som importante. Considere regravar mais curta ou usar audiodescrição estendida."
            )
        else:
            interval["warning"] = ""
        store.save(project, reason=f"Gravação do intervalo {index} salva")
        return ok({"project": project, "interval": interval})

    @app.delete("/api/projects/<project_id>/recordings/<int:index>")
    def delete_recording(project_id: str, index: int):
        project = store.load(project_id)
        intervals = project.get("intervals", [])
        if index < 1 or index > len(intervals):
            raise NotFound("Intervalo não encontrado.")
        interval = intervals[index - 1]
        filename = interval.get("recording_filename")
        store.trash_recording(project_id, filename)
        interval["recording_filename"] = None
        interval["recording_duration"] = None
        interval["warning"] = ""
        if interval.get("script"):
            interval["status"] = "roteirizado"
        else:
            interval["status"] = "pendente"
        store.save(project, reason=f"Gravação do intervalo {index} removida")
        return ok({"project": project, "interval": interval})

    @app.get("/media/<project_id>/video")
    def media_video(project_id: str):
        project = store.load(project_id)
        path = store.video_path(project)
        if not path.exists():
            raise NotFound("Vídeo não encontrado.")
        return send_file(path, conditional=True)

    @app.get("/media/<project_id>/recordings/<filename>")
    def media_recording(project_id: str, filename: str):
        store.load(project_id)
        path = store.recordings_dir(project_id) / secure_filename(filename)
        if not path.exists():
            raise NotFound("Gravação não encontrada.")
        return send_file(path, conditional=True)

    def _build_export_file(project_id: str, kind: str) -> Path:
        project = store.load(project_id)
        exports_dir = store.exports_dir(project_id)
        slug = project.get("slug") or "audiodescricao"
        project_folder = store.project_folder(project_id)

        if kind == "json":
            path = export_json(project, exports_dir / f"{slug}_projeto.json")
        elif kind == "csv":
            path = export_csv(project, exports_dir / f"{slug}_intervalos.csv")
        elif kind == "srt":
            path = export_srt(project, exports_dir / f"{slug}_roteiro.srt")
        elif kind == "script":
            path = export_readable_script(project, exports_dir / f"{slug}_roteiro.md")
        elif kind == "premiere_csv":
            path = export_marker_csv(project, exports_dir / f"{slug}_marcadores_premiere.csv", flavor="premiere")
        elif kind == "davinci_csv":
            path = export_marker_csv(project, exports_dir / f"{slug}_marcadores_davinci.csv", flavor="davinci")
        elif kind == "ad_audio":
            path = build_ad_audio_track(project, project_folder, exports_dir / f"{slug}_faixa_audiodescricao.wav")
        elif kind == "final_video":
            ad_path = build_ad_audio_track(project, project_folder, exports_dir / f"{slug}_faixa_audiodescricao.wav")
            path = build_final_mixed_video(project, project_folder, ad_path, exports_dir / f"{slug}_video_com_audiodescricao.mp4")
        else:
            raise NotFound("Tipo de exportação não encontrado.")
        return path

    @app.post("/api/projects/<project_id>/export/<kind>/start")
    def export_start_route(project_id: str, kind: str):
        project = store.load(project_id)
        if kind not in {"ad_audio", "final_video"}:
            raise BadRequest("Esta exportação não precisa de tarefa em segundo plano.")
        job_id = jobs.create("export", f"Exportar {project.get('title') or project_id}")

        def work() -> None:
            jobs.update(
                job_id,
                percent=3,
                message="Preparando exportação...",
                details="A exportação roda em segundo plano para não travar a interface em vídeos grandes.",
            )
            if kind == "ad_audio":
                jobs.update(job_id, percent=15, message="Gerando faixa de audiodescrição...", details="Misturando as gravações nos tempos corretos.")
            else:
                jobs.update(job_id, percent=10, message="Gerando vídeo final...", details="Criando a faixa de audiodescrição e misturando com o áudio original.")
            path = _build_export_file(project_id, kind)
            jobs.update(
                job_id,
                status="done",
                percent=100,
                message="Exportação concluída.",
                details="O arquivo está pronto para baixar.",
                result={
                    "filename": path.name,
                    "download_url": f"/api/jobs/{job_id}/download",
                },
                result_path=str(path),
            )

        jobs.run(job_id, work)
        return ok({"job_id": job_id})

    @app.get("/api/jobs/<job_id>/download")
    def job_download(job_id: str):
        job = jobs.get(job_id)
        if not job:
            raise NotFound("Tarefa não encontrada. Exporte novamente.")
        if job.get("status") != "done" or not job.get("result_path"):
            raise BadRequest("A exportação ainda não terminou.")
        path = Path(job["result_path"])
        if not path.exists():
            raise NotFound("Arquivo exportado não encontrado.")
        return send_file(path, as_attachment=True, download_name=path.name)

    @app.get("/api/projects/<project_id>/export/<kind>")
    def export_route(project_id: str, kind: str):
        path = _build_export_file(project_id, kind)
        return send_file(path, as_attachment=True, download_name=path.name)

    return app


def open_browser_later(url: str) -> None:
    def _open():
        time.sleep(1.0)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_open, daemon=True).start()


def run_app() -> None:
    host = os.environ.get("AD_ASSIST_HOST", "127.0.0.1")
    port = int(os.environ.get("AD_ASSIST_PORT", "8765"))
    url = f"http://{host}:{port}"
    app = create_app()
    print("=" * 72)
    print("Assistente de Audiodescrição")
    print(f"Acesse: {url}")
    print(f"Dados locais: {runtime_data_dir()}")
    print("Para encerrar, feche esta janela ou pressione Ctrl+C no terminal.")
    print("=" * 72)
    open_browser_later(url)
    try:
        from waitress import serve

        serve(app, host=host, port=port, threads=8)
    except ImportError:
        app.run(host=host, port=port, debug=False)
