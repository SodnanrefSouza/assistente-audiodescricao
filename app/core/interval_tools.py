from __future__ import annotations

import re
from typing import Any

VALID_STATUSES = {"pendente", "roteirizado", "gravado", "revisado", "descartado"}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def interval_quality(duration: float) -> str:
    if duration >= 5:
        return "excelente"
    if duration >= 3:
        return "bom"
    return "curto"


def normalize_intervals(intervals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in intervals:
        interval = dict(item)
        start = max(0.0, _as_float(interval.get("start"), _as_float(interval.get("silence_start"))))
        end = max(start, _as_float(interval.get("end"), _as_float(interval.get("silence_end"), start)))
        duration = max(0.0, end - start)
        interval["start"] = round(start, 3)
        interval["end"] = round(end, 3)
        interval["duration"] = round(duration, 3)
        interval["silence_start"] = round(_as_float(interval.get("silence_start"), start), 3)
        interval["silence_end"] = round(_as_float(interval.get("silence_end"), end), 3)
        interval["silence_duration"] = round(_as_float(interval.get("silence_duration"), duration), 3)
        interval["quality"] = interval.get("quality") or interval_quality(duration)
        interval["title"] = interval.get("title") or "Audiodescricao"
        interval["script"] = interval.get("script") or ""
        interval["notes"] = interval.get("notes") or ""
        interval["status"] = interval.get("status") if interval.get("status") in VALID_STATUSES else "pendente"
        interval["recording_filename"] = interval.get("recording_filename")
        interval["recording_duration"] = interval.get("recording_duration")
        interval["warning"] = interval.get("warning") or ""
        interval["detection_source"] = interval.get("detection_source") or "som baixo"
        normalized.append(interval)

    normalized.sort(key=lambda item: (_as_float(item.get("start")), _as_float(item.get("end"))))
    for index, interval in enumerate(normalized, start=1):
        interval["index"] = index
        if not interval.get("title") or interval["title"] == "Audiodescricao":
            interval["title"] = f"Audiodescricao {index}"
    return normalized


def create_manual_interval(start: float, end: float, title: str | None = None) -> dict[str, Any]:
    start = max(0.0, float(start or 0))
    end = max(start + 0.1, float(end or start + 2))
    duration = end - start
    return {
        "index": 0,
        "silence_start": round(start, 3),
        "silence_end": round(end, 3),
        "silence_duration": round(duration, 3),
        "start": round(start, 3),
        "end": round(end, 3),
        "duration": round(duration, 3),
        "quality": interval_quality(duration),
        "title": title or "Intervalo manual",
        "script": "",
        "notes": "",
        "status": "pendente",
        "recording_filename": None,
        "recording_duration": None,
        "warning": "",
        "detection_source": "manual",
        "background_state": "unknown",
        "background_label": "fundo nao medido",
        "background_detail": "Este intervalo foi adicionado manualmente. Ouça o trecho antes de gravar.",
    }


def _parse_time(value: str) -> float:
    match = re.match(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?", value.strip())
    if not match:
        return 0.0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    millis = int((match.group(4) or "0").ljust(3, "0")[:3])
    return hours * 3600 + minutes * 60 + seconds + millis / 1000


def parse_timed_transcript_segments(text: str) -> list[dict[str, Any]]:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    segments: list[dict[str, Any]] = []
    range_re = re.compile(
        r"(?P<start>(?:(?:\d{1,2}:)?\d{1,2}:)?\d{2}[,.]\d{1,3}|(?:\d{1,2}:)?\d{1,2}:\d{2})"
        r"\s*-->\s*"
        r"(?P<end>(?:(?:\d{1,2}:)?\d{1,2}:)?\d{2}[,.]\d{1,3}|(?:\d{1,2}:)?\d{1,2}:\d{2})"
    )
    for block in re.split(r"\n\s*\n", text):
        match = range_re.search(block)
        if not match:
            continue
        lines = [line.strip() for line in block.splitlines()]
        spoken_lines = [line for line in lines if line and not line.isdigit() and "-->" not in line]
        segments.append(
            {
                "start": round(_parse_time(match.group("start")), 3),
                "end": round(_parse_time(match.group("end")), 3),
                "text": " ".join(spoken_lines).strip(),
            }
        )

    if segments:
        return _merge_speech_segments(segments)

    line_re = re.compile(
        r"^\s*(?P<time>(?:(?:\d{1,2}:)?\d{1,2}:)?\d{2}[,.]\d{1,3}|(?:\d{1,2}:)?\d{1,2}:\d{2})\s+"
        r"(?P<text>.+?)\s*$",
        re.MULTILINE,
    )
    for match in line_re.finditer(text):
        start = _parse_time(match.group("time"))
        segments.append({"start": round(start, 3), "end": round(start + 2.0, 3), "text": match.group("text").strip()})
    return _merge_speech_segments(segments)


def _merge_speech_segments(segments: list[dict[str, Any]], tolerance: float = 0.25) -> list[dict[str, Any]]:
    ordered = sorted(segments, key=lambda item: (_as_float(item.get("start")), _as_float(item.get("end"))))
    merged: list[dict[str, Any]] = []
    for segment in ordered:
        start = max(0.0, _as_float(segment.get("start")))
        end = max(start, _as_float(segment.get("end")))
        text = str(segment.get("text") or "").strip()
        if not merged or start > _as_float(merged[-1].get("end")) + tolerance:
            merged.append({"start": round(start, 3), "end": round(end, 3), "text": text})
        else:
            merged[-1]["end"] = round(max(_as_float(merged[-1].get("end")), end), 3)
            if text:
                merged[-1]["text"] = " ".join(filter(None, [merged[-1].get("text"), text]))
    return merged


def speech_gap_intervals(
    transcript_text: str,
    duration: float,
    *,
    min_gap: float,
    padding_start: float = 0.1,
    padding_end: float = 0.1,
) -> list[dict[str, Any]]:
    duration = max(0.0, float(duration or 0))
    if not duration:
        return []
    segments = parse_timed_transcript_segments(transcript_text)
    if not segments:
        return []

    gaps: list[dict[str, Any]] = []
    cursor = 0.0
    for segment in segments:
        speech_start = max(0.0, _as_float(segment.get("start")))
        speech_end = max(speech_start, _as_float(segment.get("end")))
        if speech_start > cursor:
            gaps.append(_speech_gap_candidate(cursor, speech_start, min_gap, padding_start, padding_end))
        cursor = max(cursor, speech_end)
    if duration > cursor:
        gaps.append(_speech_gap_candidate(cursor, duration, min_gap, padding_start, padding_end))
    return [gap for gap in gaps if gap]


def _speech_gap_candidate(
    raw_start: float,
    raw_end: float,
    min_gap: float,
    padding_start: float,
    padding_end: float,
) -> dict[str, Any] | None:
    safe_start = max(0.0, raw_start + max(0.0, padding_start))
    safe_end = max(safe_start, raw_end - max(0.0, padding_end))
    safe_duration = safe_end - safe_start
    if safe_duration < max(0.1, float(min_gap or 0)):
        return None
    interval = create_manual_interval(safe_start, safe_end, "Intervalo por fala")
    interval.update(
        {
            "silence_start": round(raw_start, 3),
            "silence_end": round(raw_end, 3),
            "silence_duration": round(raw_end - raw_start, 3),
            "detection_source": "fala/transcricao",
            "speech_gap_confirmed": True,
            "background_detail": "A transcricao indicou que nao ha fala neste espaco. O fundo ainda precisa ser ouvido.",
        }
    )
    return interval


def merge_interval_candidates(
    base_intervals: list[dict[str, Any]],
    speech_intervals: list[dict[str, Any]],
    *,
    tolerance: float = 0.35,
) -> list[dict[str, Any]]:
    merged = [dict(interval) for interval in base_intervals]
    for candidate in speech_intervals:
        best = _find_related_interval(merged, candidate, tolerance)
        if best is None:
            merged.append(dict(candidate))
            continue
        best["speech_gap_confirmed"] = True
        source = str(best.get("detection_source") or "som baixo")
        if "fala" not in source:
            best["detection_source"] = f"{source} + fala/transcricao"
    return normalize_intervals(merged)


def _find_related_interval(
    intervals: list[dict[str, Any]],
    candidate: dict[str, Any],
    tolerance: float,
) -> dict[str, Any] | None:
    start = _as_float(candidate.get("start"))
    end = _as_float(candidate.get("end"))
    duration = max(0.1, end - start)
    for interval in intervals:
        other_start = _as_float(interval.get("start"))
        other_end = _as_float(interval.get("end"))
        overlap = max(0.0, min(end, other_end) - max(start, other_start))
        distance = min(abs(start - other_end), abs(end - other_start), abs(start - other_start))
        if overlap / duration >= 0.35 or distance <= tolerance:
            return interval
    return None
