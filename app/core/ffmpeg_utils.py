from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable


ProgressCallback = Callable[[float, str], None]


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        # Diretório temporário do PyInstaller quando empacotado em --onefile.
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]


def find_binary(name: str) -> str | None:
    env_key = f"{name.upper()}_PATH"
    if os.environ.get(env_key):
        path = Path(os.environ[env_key])
        if path.exists():
            return str(path)

    root = app_root()
    possible_names = [name]
    if os.name == "nt":
        possible_names.insert(0, f"{name}.exe")

    candidates = []
    for n in possible_names:
        candidates.extend(
            [
                root / "third_party" / "ffmpeg" / "bin" / n,
                Path.cwd() / "third_party" / "ffmpeg" / "bin" / n,
                Path(sys.executable).parent / "third_party" / "ffmpeg" / "bin" / n,
            ]
        )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    found = shutil.which(name)
    if found:
        return found
    if os.name == "nt":
        return shutil.which(f"{name}.exe")
    return None


def ffmpeg_path() -> str:
    path = find_binary("ffmpeg")
    if not path:
        raise RuntimeError(
            "FFmpeg não encontrado. Instale o FFmpeg e reinicie o programa, ou coloque ffmpeg.exe em third_party/ffmpeg/bin/."
        )
    return path


def ffprobe_path() -> str:
    path = find_binary("ffprobe")
    if path:
        return path
    # Tenta inferir ffprobe a partir do diretório do ffmpeg.
    ffmpeg = Path(ffmpeg_path())
    candidate = ffmpeg.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if candidate.exists():
        return str(candidate)
    raise RuntimeError(
        "FFprobe não encontrado. Ele normalmente vem junto com o FFmpeg. Coloque ffprobe.exe no mesmo diretório do ffmpeg.exe."
    )


def run_command(args: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


def get_media_info(path: Path) -> dict[str, Any]:
    args = [
        ffprobe_path(),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = run_command(args)
    if result.returncode != 0:
        raise RuntimeError(f"Não foi possível ler informações do arquivo.\n{result.stderr}")
    return json.loads(result.stdout or "{}")


def get_duration(path: Path) -> float:
    info = get_media_info(path)
    duration = (info.get("format") or {}).get("duration")
    try:
        return float(duration)
    except (TypeError, ValueError):
        return 0.0


def has_audio_stream(path: Path) -> bool:
    info = get_media_info(path)
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "audio":
            return True
    return False


def _parse_ffmpeg_time(value: str) -> float | None:
    value = (value or "").strip()
    if not value or value.upper() == "N/A":
        return None
    # Formato típico do FFmpeg: HH:MM:SS.micro
    if ":" in value:
        try:
            h, m, s = value.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
        except Exception:
            return None
    try:
        raw = float(value)
    except ValueError:
        return None
    return raw


def _progress_seconds_from_line(line: str) -> float | None:
    line = line.strip()
    if line.startswith("out_time_us="):
        try:
            return float(line.split("=", 1)[1]) / 1_000_000
        except ValueError:
            return None
    if line.startswith("out_time_ms="):
        try:
            raw = float(line.split("=", 1)[1])
            # O campo historicamente se chama ms, mas frequentemente vem em microssegundos.
            # Se vier pequeno, usamos milissegundos; se vier grande, usamos microssegundos.
            return raw / 1_000_000 if raw > 10_000 else raw / 1000
        except ValueError:
            return None
    if line.startswith("out_time="):
        return _parse_ffmpeg_time(line.split("=", 1)[1])
    m = re.search(r"time=([0-9:.]+)", line)
    if m:
        return _parse_ffmpeg_time(m.group(1))
    return None


def _build_intervals_from_output(
    output: str,
    duration: float,
    min_ad_duration: float,
    padding_start: float,
    padding_end: float,
) -> list[dict[str, Any]]:
    starts: list[float] = []
    raw_segments: list[tuple[float, float, float]] = []
    start_re = re.compile(r"silence_start:\s*([0-9]+(?:\.[0-9]+)?)")
    end_re = re.compile(r"silence_end:\s*([0-9]+(?:\.[0-9]+)?)\s*\|\s*silence_duration:\s*([0-9]+(?:\.[0-9]+)?)")

    for line in output.splitlines():
        m_start = start_re.search(line)
        if m_start:
            starts.append(float(m_start.group(1)))
            continue
        m_end = end_re.search(line)
        if m_end:
            end = float(m_end.group(1))
            sil_duration = float(m_end.group(2))
            if starts:
                start = starts.pop(0)
            else:
                start = max(0.0, end - sil_duration)
            raw_segments.append((start, end, sil_duration))

    # Caso o último silêncio vá até o final do vídeo, o FFmpeg nem sempre imprime silence_end.
    for start in starts:
        if duration > start:
            raw_segments.append((start, duration, duration - start))

    intervals: list[dict[str, Any]] = []
    for sil_start, sil_end, raw_duration in raw_segments:
        ad_start = max(0.0, sil_start + max(0.0, padding_start))
        ad_end = max(ad_start, sil_end - max(0.0, padding_end))
        ad_duration = max(0.0, ad_end - ad_start)
        if ad_duration < min_ad_duration:
            continue
        quality = "excelente" if ad_duration >= 5 else "bom" if ad_duration >= 3 else "curto"
        intervals.append(
            {
                "index": len(intervals) + 1,
                "silence_start": round(sil_start, 3),
                "silence_end": round(sil_end, 3),
                "silence_duration": round(raw_duration, 3),
                "start": round(ad_start, 3),
                "end": round(ad_end, 3),
                "duration": round(ad_duration, 3),
                "quality": quality,
                "title": f"Audiodescrição {len(intervals) + 1}",
                "script": "",
                "notes": "",
                "status": "pendente",
                "recording_filename": None,
                "recording_duration": None,
                "warning": "",
            }
        )
    return intervals


def detect_silences(
    media_path: Path,
    noise_db: float = -35,
    min_silence: float = 1.0,
    min_ad_duration: float = 0.8,
    padding_start: float = 0.10,
    padding_end: float = 0.10,
) -> list[dict[str, Any]]:
    return detect_silences_with_progress(
        media_path,
        noise_db=noise_db,
        min_silence=min_silence,
        min_ad_duration=min_ad_duration,
        padding_start=padding_start,
        padding_end=padding_end,
        progress_callback=None,
    )


def detect_silences_with_progress(
    media_path: Path,
    noise_db: float = -35,
    min_silence: float = 1.0,
    min_ad_duration: float = 0.8,
    padding_start: float = 0.10,
    padding_end: float = 0.10,
    progress_callback: ProgressCallback | None = None,
) -> list[dict[str, Any]]:
    """Detecta silêncios no áudio usando FFmpeg silencedetect.

    Quando progress_callback é enviado, a função informa uma porcentagem aproximada baseada no tempo já processado pelo FFmpeg.
    """
    def notify(percent: float, message: str) -> None:
        if progress_callback:
            progress_callback(max(0.0, min(100.0, percent)), message)

    if not media_path.exists():
        raise FileNotFoundError("Arquivo de mídia não encontrado.")

    notify(1, "Validando o arquivo de vídeo...")
    if not has_audio_stream(media_path):
        raise RuntimeError("O vídeo não possui faixa de áudio. Não há como detectar pausas entre falas.")

    duration = get_duration(media_path)
    if duration <= 0:
        duration = 1.0
    notify(3, f"Vídeo reconhecido. Duração aproximada: {duration:.1f}s.")

    args = [
        ffmpeg_path(),
        "-hide_banner",
        "-nostdin",
        "-progress",
        "pipe:1",
        "-nostats",
        "-i",
        str(media_path),
        "-af",
        f"silencedetect=noise={noise_db}dB:d={min_silence}",
        "-f",
        "null",
        "-",
    ]

    output_lines: list[str] = []
    notify(5, "Iniciando varredura das pausas com FFmpeg...")
    try:
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        raise RuntimeError("FFmpeg não foi encontrado no momento da execução. Verifique a instalação e reinicie o programa.")

    last_percent = 5.0
    assert process.stdout is not None
    for line in process.stdout:
        output_lines.append(line.rstrip("\n"))
        seconds = _progress_seconds_from_line(line)
        if seconds is not None:
            percent = 5 + min(90, (seconds / duration) * 90)
            if percent >= last_percent + 1 or percent >= 99:
                last_percent = percent
                notify(percent, f"Analisando áudio... {percent:.0f}%")

    returncode = process.wait()
    output = "\n".join(output_lines)
    if returncode != 0 and "silence_" not in output:
        raise RuntimeError(f"Erro ao detectar silêncios.\n{output[-4000:]}")

    notify(97, "Organizando os intervalos encontrados...")
    intervals = _build_intervals_from_output(
        output,
        duration=duration,
        min_ad_duration=min_ad_duration,
        padding_start=padding_start,
        padding_end=padding_end,
    )
    notify(100, f"Detecção concluída: {len(intervals)} intervalos encontrados.")
    return intervals


def recording_duration(path: Path) -> float | None:
    try:
        return get_duration(path)
    except Exception:
        return None


def build_ad_audio_track(
    project: dict[str, Any],
    project_folder: Path,
    output_path: Path,
    sample_rate: int = 48000,
) -> Path:
    """Cria uma faixa WAV com silêncio do tamanho do vídeo e gravações posicionadas nos tempos corretos."""
    intervals = project.get("intervals", [])
    recordings = []
    for interval in intervals:
        filename = interval.get("recording_filename")
        if not filename:
            continue
        path = project_folder / "recordings" / filename
        if path.exists():
            recordings.append((interval, path))

    duration = float(project.get("duration") or 0)
    if duration <= 0:
        duration = 1.0

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not recordings:
        args = [
            ffmpeg_path(),
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=channel_layout=stereo:sample_rate={sample_rate}",
            "-t",
            str(duration),
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
        result = run_command(args)
        if result.returncode != 0:
            raise RuntimeError(f"Erro ao criar faixa silenciosa.\n{result.stderr}")
        return output_path

    args = [
        ffmpeg_path(),
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=channel_layout=stereo:sample_rate={sample_rate}",
        "-t",
        str(duration),
    ]
    for _, rec_path in recordings:
        args.extend(["-i", str(rec_path)])

    filter_parts = []
    mix_labels = ["[0:a]"]
    for input_idx, (interval, _) in enumerate(recordings, start=1):
        delay_ms = int(round(float(interval.get("start") or 0) * 1000))
        label = f"a{input_idx}"
        filter_parts.append(
            f"[{input_idx}:a]aresample={sample_rate},aformat=channel_layouts=stereo,adelay={delay_ms}|{delay_ms}[{label}]"
        )
        mix_labels.append(f"[{label}]")

    filter_parts.append(
        "".join(mix_labels)
        + f"amix=inputs={len(mix_labels)}:duration=first:dropout_transition=0,volume=1.0[out]"
    )
    filter_complex = ";".join(filter_parts)

    args.extend(["-filter_complex", filter_complex, "-map", "[out]", "-c:a", "pcm_s16le", str(output_path)])
    result = run_command(args, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"Erro ao gerar faixa de audiodescrição.\n{result.stderr[-4000:]}")
    return output_path


def build_final_mixed_video(project: dict[str, Any], project_folder: Path, ad_audio_path: Path, output_path: Path) -> Path:
    video_path = project_folder / project["video_filename"]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if has_audio_stream(video_path):
        args = [
            ffmpeg_path(),
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(ad_audio_path),
            "-filter_complex",
            "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]",
            "-map",
            "0:v:0",
            "-map",
            "[a]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_path),
        ]
    else:
        args = [
            ffmpeg_path(),
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(ad_audio_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_path),
        ]
    result = run_command(args, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(f"Erro ao gerar vídeo final.\n{result.stderr[-4000:]}")
    return output_path
