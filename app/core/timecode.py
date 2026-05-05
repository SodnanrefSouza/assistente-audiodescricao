from __future__ import annotations


def clamp_seconds(value: float) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, value)


def seconds_to_hhmmss(seconds: float, separator: str = ".") -> str:
    """Retorna tempo no formato HH:MM:SS.mmm ou HH:MM:SS,mmm."""
    seconds = clamp_seconds(seconds)
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_seconds = total_ms // 1000
    s = total_seconds % 60
    total_minutes = total_seconds // 60
    m = total_minutes % 60
    h = total_minutes // 60
    return f"{h:02d}:{m:02d}:{s:02d}{separator}{ms:03d}"


def seconds_to_srt(seconds: float) -> str:
    return seconds_to_hhmmss(seconds, separator=",")


def seconds_to_ffmpeg_timestamp(seconds: float) -> str:
    return seconds_to_hhmmss(seconds, separator=".")


def parse_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
