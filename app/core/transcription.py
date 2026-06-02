from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .ffmpeg_utils import ffmpeg_path

ProgressCallback = Callable[[float, str], None]


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    text: str
    plain_text: str
    segments: list[TranscriptSegment]
    language: str
    model: str
    srt_path: Path
    txt_path: Path


def format_srt_time(seconds: float) -> str:
    ms = int(round(float(seconds or 0) * 1000))
    hours = ms // 3_600_000
    ms %= 3_600_000
    minutes = ms // 60_000
    ms %= 60_000
    secs = ms // 1000
    ms %= 1000
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def _notify(callback: ProgressCallback | None, percent: float, message: str) -> None:
    if callback:
        callback(percent, message)


def _load_whisper_model(model_name: str, device: str, compute_type: str):
    try:
        from faster_whisper import WhisperModel
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "A transcricao automatica precisa do pacote faster-whisper. "
            "Instale as dependencias com: .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        ) from exc

    try:
        return WhisperModel(model_name, device=device, compute_type=compute_type)
    except Exception as exc:
        raise RuntimeError(
            f"Nao foi possivel carregar o modelo de transcricao '{model_name}'. "
            "Na primeira vez o faster-whisper pode precisar baixar o modelo da internet. "
            f"Erro original: {exc}"
        ) from exc


def extract_audio(video_path: Path, audio_path: Path) -> None:
    ffmpeg = ffmpeg_path()
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(audio_path),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True)
    if completed.returncode != 0:
        output = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(f"Erro ao extrair audio para transcricao.\n{output[-4000:]}")


def segments_to_srt(segments: list[TranscriptSegment]) -> str:
    blocks: list[str] = []
    for index, segment in enumerate(segments, start=1):
        text = " ".join((segment.text or "").split())
        if not text:
            continue
        blocks.append(
            f"{index}\n"
            f"{format_srt_time(segment.start)} --> {format_srt_time(segment.end)}\n"
            f"{text}"
        )
    return "\n\n".join(blocks).strip() + ("\n" if blocks else "")


def segments_to_plain_text(segments: list[TranscriptSegment]) -> str:
    lines = [" ".join((segment.text or "").split()) for segment in segments]
    return "\n".join(line for line in lines if line).strip() + ("\n" if lines else "")


def save_outputs(segments: list[TranscriptSegment], srt_path: Path, txt_path: Path) -> tuple[str, str]:
    srt_text = segments_to_srt(segments)
    plain_text = segments_to_plain_text(segments)
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text(srt_text, encoding="utf-8")
    txt_path.write_text(plain_text, encoding="utf-8")
    return srt_text, plain_text


def _word_value(word: Any) -> str:
    return str(getattr(word, "word", "") or "").strip()


def _segment_words(raw_segments: Any, *, word_gap: float = 0.45) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    current_words: list[str] = []
    current_start: float | None = None
    current_end: float | None = None
    fallback_segments: list[TranscriptSegment] = []

    def flush_current() -> None:
        nonlocal current_words, current_start, current_end
        text = " ".join(" ".join(current_words).split())
        if text and current_start is not None and current_end is not None and current_end > current_start:
            segments.append(TranscriptSegment(round(current_start, 3), round(current_end, 3), text))
        current_words = []
        current_start = None
        current_end = None

    for raw in raw_segments:
        raw_start = round(float(getattr(raw, "start", 0) or 0), 3)
        raw_end = round(float(getattr(raw, "end", raw_start) or raw_start), 3)
        raw_text = str(getattr(raw, "text", "") or "").strip()
        words = list(getattr(raw, "words", None) or [])
        if not words:
            if raw_text:
                fallback_segments.append(TranscriptSegment(raw_start, raw_end, raw_text))
            continue

        for word in words:
            text = _word_value(word)
            if not text:
                continue
            start = float(getattr(word, "start", current_end if current_end is not None else raw_start) or raw_start)
            end = float(getattr(word, "end", start) or start)
            if current_end is not None and start > current_end + word_gap:
                flush_current()
            if current_start is None:
                current_start = start
            current_end = max(float(current_end or start), end)
            current_words.append(text)

    flush_current()
    return segments or fallback_segments


def transcribe_video(
    video_path: Path,
    output_dir: Path,
    *,
    duration: float = 0,
    model_name: str | None = None,
    device: str | None = None,
    compute_type: str | None = None,
    language: str | None = None,
    keep_audio: bool | None = None,
    progress_callback: ProgressCallback | None = None,
) -> TranscriptionResult:
    if not video_path.exists():
        raise FileNotFoundError("Video do projeto nao encontrado para transcricao.")

    model_name = model_name or os.environ.get("AD_ASSIST_TRANSCRIBE_MODEL", "small")
    device = device or os.environ.get("AD_ASSIST_TRANSCRIBE_DEVICE", "cpu")
    compute_type = compute_type or os.environ.get("AD_ASSIST_TRANSCRIBE_COMPUTE_TYPE", "int8")
    language = language or os.environ.get("AD_ASSIST_TRANSCRIBE_LANGUAGE", "")
    keep_audio = keep_audio if keep_audio is not None else os.environ.get("AD_ASSIST_TRANSCRIBE_KEEP_AUDIO") == "1"

    output_dir.mkdir(parents=True, exist_ok=True)
    audio_path = output_dir / "audio_16k_mono.wav"
    srt_path = output_dir / "transcricao.srt"
    txt_path = output_dir / "transcricao.txt"

    _notify(progress_callback, 5, "Extraindo audio do video...")
    extract_audio(video_path, audio_path)

    _notify(progress_callback, 20, f"Carregando modelo {model_name}...")
    model = _load_whisper_model(model_name, device, compute_type)

    _notify(progress_callback, 28, "Transcrevendo falas do video...")
    try:
        raw_segments, info = model.transcribe(
            str(audio_path),
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
            language=language or None,
        )
        collected_raw_segments: list[Any] = []
        for raw in raw_segments:
            collected_raw_segments.append(raw)
            if duration:
                percent = 28 + min(62, (float(raw.end or 0) / max(duration, 1)) * 62)
                _notify(progress_callback, percent, f"Transcrevendo... {format_srt_time(raw.end or 0)}")
        segments = _segment_words(collected_raw_segments)
    finally:
        if not keep_audio:
            try:
                audio_path.unlink()
            except OSError:
                pass

    if not segments:
        raise RuntimeError("A transcricao terminou, mas nenhuma fala foi reconhecida no audio do video.")

    _notify(progress_callback, 94, "Salvando transcricao no projeto...")
    srt_text, plain_text = save_outputs(segments, srt_path, txt_path)
    detected_language = getattr(info, "language", None) or language or ""
    _notify(progress_callback, 100, "Transcricao pronta.")
    return TranscriptionResult(
        text=srt_text,
        plain_text=plain_text,
        segments=segments,
        language=detected_language,
        model=model_name,
        srt_path=srt_path,
        txt_path=txt_path,
    )


def result_to_metadata(result: TranscriptionResult) -> dict[str, Any]:
    return {
        "text": result.text,
        "plain_text": result.plain_text,
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
            }
            for segment in result.segments
        ],
        "source": "automatic",
        "status": "done",
        "language": result.language,
        "model": result.model,
        "timing_level": "word",
        "segment_count": len(result.segments),
        "srt_filename": result.srt_path.name,
        "txt_filename": result.txt_path.name,
        "error": "",
    }
