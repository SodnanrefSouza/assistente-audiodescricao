from __future__ import annotations

import re
from typing import Any

VALID_STATUSES = {"pendente", "roteirizado", "gravado", "revisado", "descartado"}
AUTO_MERGE_GAP_SECONDS = 0.75
SPEECH_SAFETY_MARGIN_SECONDS = 0.25
SPARSE_SPEECH_MIN_DURATION_SECONDS = 6.0
SPARSE_SPEECH_SECONDS_PER_WORD = 0.85
SPARSE_SPEECH_EXTRA_SECONDS = 0.8


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


def _is_auto_unedited_interval(interval: dict[str, Any]) -> bool:
    source = str(interval.get("detection_source") or "").lower()
    return (
        "manual" not in source
        and not str(interval.get("script") or "").strip()
        and not str(interval.get("notes") or "").strip()
        and not interval.get("recording_filename")
        and (interval.get("status") in (None, "", "pendente"))
    )


def _merge_sources(left: Any, right: Any) -> str:
    parts: list[str] = []
    for value in (left, right):
        for piece in str(value or "").split("+"):
            piece = piece.strip()
            if piece and piece not in parts:
                parts.append(piece)
    return " + ".join(parts) or "som baixo"


def _combine_background_state(left: dict[str, Any], right: dict[str, Any]) -> str:
    priority = {
        "quiet": 0,
        "unknown": 1,
        "low_background": 2,
        "active_background": 3,
    }
    left_state = str(left.get("background_state") or "unknown")
    right_state = str(right.get("background_state") or "unknown")
    return left_state if priority.get(left_state, 1) >= priority.get(right_state, 1) else right_state


def _background_label_for_state(state_name: str) -> tuple[str, str]:
    if state_name == "quiet":
        return (
            "silencio quase puro",
            "Os trechos unidos ficaram com volume muito baixo.",
        )
    if state_name == "low_background":
        return (
            "fundo baixo possivel",
            "Ha fundo baixo no trecho unido. Ouça antes de gravar.",
        )
    if state_name == "active_background":
        return (
            "fundo audivel: ouca antes",
            "Ha fundo audivel em parte do trecho unido. Revise com cuidado.",
        )
    return (
        "fundo nao medido",
        "O trecho unido ainda precisa de nova medicao de fundo.",
    )


def _merge_auto_pair(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    merged = dict(left)
    start = min(_as_float(left.get("start")), _as_float(right.get("start")))
    end = max(_as_float(left.get("end")), _as_float(right.get("end")))
    silence_start = min(_as_float(left.get("silence_start"), start), _as_float(right.get("silence_start"), start))
    silence_end = max(_as_float(left.get("silence_end"), end), _as_float(right.get("silence_end"), end))
    background_state = _combine_background_state(left, right)
    background_label, background_detail = _background_label_for_state(background_state)
    speech_segments = []
    for item in (left, right):
        for segment in item.get("speech_overlap_segments") or []:
            if segment not in speech_segments:
                speech_segments.append(segment)
    warnings = [str(item.get("warning") or "").strip() for item in (left, right)]
    merged.update(
        {
            "start": start,
            "end": end,
            "duration": end - start,
            "silence_start": silence_start,
            "silence_end": silence_end,
            "silence_duration": silence_end - silence_start,
            "quality": interval_quality(end - start),
            "title": "Audiodescricao",
            "detection_source": _merge_sources(left.get("detection_source"), right.get("detection_source")),
            "speech_gap_confirmed": bool(left.get("speech_gap_confirmed") or right.get("speech_gap_confirmed")),
            "speech_overlap": bool(left.get("speech_overlap") or right.get("speech_overlap")),
            "speech_overlap_segments": speech_segments[:5],
            "speech_checked": bool(left.get("speech_checked") or right.get("speech_checked")),
            "background_state": background_state,
            "background_label": background_label,
            "background_detail": background_detail,
            "background_rms_db": min(
                _as_float(left.get("background_rms_db"), 0),
                _as_float(right.get("background_rms_db"), 0),
            )
            if left.get("background_rms_db") is not None and right.get("background_rms_db") is not None
            else left.get("background_rms_db") if left.get("background_rms_db") is not None else right.get("background_rms_db"),
            "warning": " ".join(w for w in warnings if w),
        }
    )
    return merged


def coalesce_auto_intervals(
    intervals: list[dict[str, Any]],
    *,
    max_gap: float = AUTO_MERGE_GAP_SECONDS,
) -> list[dict[str, Any]]:
    ordered = sorted((dict(item) for item in intervals), key=lambda item: (_as_float(item.get("start")), _as_float(item.get("end"))))
    merged: list[dict[str, Any]] = []
    for interval in ordered:
        if (
            merged
            and _is_auto_unedited_interval(merged[-1])
            and _is_auto_unedited_interval(interval)
            and _as_float(interval.get("start")) <= _as_float(merged[-1].get("end")) + max_gap
        ):
            merged[-1] = _merge_auto_pair(merged[-1], interval)
            continue
        merged.append(interval)
    return normalize_intervals(merged)


def _segment_overlaps_interval(
    segment: dict[str, Any],
    interval: dict[str, Any],
    *,
    margin: float = SPEECH_SAFETY_MARGIN_SECONDS,
    include_boundary: bool = True,
) -> bool:
    start = max(0.0, _as_float(interval.get("start")) - margin)
    end = max(start, _as_float(interval.get("end")) + margin)
    seg_start = max(0.0, _as_float(segment.get("start")))
    seg_end = max(seg_start, _as_float(segment.get("end"), seg_start + 0.3))
    overlap = max(0.0, min(end, seg_end) - max(start, seg_start))
    if overlap >= 0.05:
        return True
    if not include_boundary:
        return False
    boundary_margin = max(margin, 0.35)
    return (
        start - boundary_margin <= seg_start <= end + boundary_margin
        or start - boundary_margin <= seg_end <= end + boundary_margin
    )


def mark_transcript_overlaps(
    intervals: list[dict[str, Any]],
    transcript_text: str,
    *,
    margin: float = SPEECH_SAFETY_MARGIN_SECONDS,
) -> list[dict[str, Any]]:
    normalized = normalize_intervals(intervals)
    segments = parse_timed_transcript_segments(transcript_text)
    if not segments:
        return normalized

    for interval in normalized:
        interval_margin = 0.05 if interval.get("speech_gap_confirmed") else margin
        matches = [
            segment
            for segment in segments
            if _segment_overlaps_interval(
                segment,
                interval,
                margin=interval_margin,
                include_boundary=not bool(interval.get("speech_gap_confirmed")),
            )
        ]
        interval["speech_checked"] = True
        interval["speech_overlap"] = bool(matches)
        interval["speech_overlap_segments"] = [
            {
                "start": round(_as_float(segment.get("start")), 3),
                "end": round(_as_float(segment.get("end")), 3),
                "text": str(segment.get("text") or "").strip(),
            }
            for segment in matches[:5]
        ]
        interval["speech_overlap_detail"] = (
            "A transcricao encontrou fala dentro ou perto desta pausa."
            if matches
            else "A transcricao nao encontrou fala relevante nesta pausa."
        )
    return normalized


def _should_preserve_existing_interval(interval: dict[str, Any]) -> bool:
    source = str(interval.get("detection_source") or "").lower()
    return (
        "manual" in source
        or bool(str(interval.get("script") or "").strip())
        or bool(str(interval.get("notes") or "").strip())
        or bool(interval.get("recording_filename"))
        or str(interval.get("status") or "pendente") not in {"", "pendente"}
    )


def preserved_user_intervals(intervals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mantem apenas intervalos que parecem ter edicao humana."""
    return normalize_intervals([dict(interval) for interval in intervals if _should_preserve_existing_interval(interval)])


def _interval_overlap_ratio(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_start = _as_float(left.get("start"))
    left_end = _as_float(left.get("end"), left_start)
    right_start = _as_float(right.get("start"))
    right_end = _as_float(right.get("end"), right_start)
    duration = max(0.01, min(left_end - left_start, right_end - right_start))
    overlap = max(0.0, min(left_end, right_end) - max(left_start, right_start))
    return overlap / duration


def speech_first_intervals(
    existing_intervals: list[dict[str, Any]],
    transcript_text: str,
    duration: float,
    *,
    min_gap: float,
    padding_start: float,
    padding_end: float,
) -> list[dict[str, Any]]:
    speech_intervals = speech_gap_intervals(
        transcript_text,
        duration,
        min_gap=min_gap,
        padding_start=padding_start,
        padding_end=padding_end,
    )
    if not speech_intervals:
        return mark_transcript_overlaps(coalesce_auto_intervals(existing_intervals), transcript_text)

    preserved = [dict(interval) for interval in existing_intervals if _should_preserve_existing_interval(interval)]
    generated: list[dict[str, Any]] = []
    for interval in speech_intervals:
        if any(_interval_overlap_ratio(interval, kept) >= 0.65 for kept in preserved):
            continue
        interval = dict(interval)
        interval["detection_source"] = "fala/transcricao"
        interval["speech_gap_confirmed"] = True
        interval["background_state"] = interval.get("background_state") or "unknown"
        interval["background_label"] = interval.get("background_label") or "fundo nao medido"
        interval["background_detail"] = (
            interval.get("background_detail")
            or "A transcricao encontrou um espaco sem fala. O fundo ainda sera usado apenas como aviso."
        )
        generated.append(interval)

    return mark_transcript_overlaps(normalize_intervals(preserved + generated), transcript_text)


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


def _speech_word_count(text: str) -> int:
    return len(re.findall(r"[\wÀ-ÿ]+", text or "", flags=re.UNICODE))


def _compact_sparse_speech_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for segment in segments:
        start = max(0.0, _as_float(segment.get("start")))
        end = max(start, _as_float(segment.get("end"), start))
        text = str(segment.get("text") or "").strip()
        duration = end - start
        word_count = _speech_word_count(text)
        plausible_duration = max(1.0, word_count * SPARSE_SPEECH_SECONDS_PER_WORD + SPARSE_SPEECH_EXTRA_SECONDS)
        if duration >= SPARSE_SPEECH_MIN_DURATION_SECONDS and duration > plausible_duration * 2.2:
            compacted.append(
                {
                    **segment,
                    "start": round(start, 3),
                    "end": round(min(end, start + plausible_duration), 3),
                    "original_start": round(start, 3),
                    "original_end": round(end, 3),
                    "timing_adjusted": True,
                }
            )
            continue
        compacted.append({**segment, "start": round(start, 3), "end": round(end, 3)})
    return compacted


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
        return _compact_sparse_speech_segments(_merge_speech_segments(segments))

    line_re = re.compile(
        r"^\s*(?P<time>(?:(?:\d{1,2}:)?\d{1,2}:)?\d{2}[,.]\d{1,3}|(?:\d{1,2}:)?\d{1,2}:\d{2})\s+"
        r"(?P<text>.+?)\s*$",
        re.MULTILINE,
    )
    for match in line_re.finditer(text):
        start = _parse_time(match.group("time"))
        segments.append({"start": round(start, 3), "end": round(start + 2.0, 3), "text": match.group("text").strip()})
    return _compact_sparse_speech_segments(_merge_speech_segments(segments))


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
    previous_segment: dict[str, Any] | None = None
    for segment in segments:
        speech_start = max(0.0, _as_float(segment.get("start")))
        speech_end = max(speech_start, _as_float(segment.get("end")))
        if speech_start > cursor:
            gaps.append(
                _speech_gap_candidate(
                    cursor,
                    speech_start,
                    min_gap,
                    padding_start,
                    padding_end,
                    previous_speech=previous_segment,
                    next_speech=segment,
                )
            )
        cursor = max(cursor, speech_end)
        previous_segment = segment
    if duration > cursor:
        gaps.append(
            _speech_gap_candidate(
                cursor,
                duration,
                min_gap,
                padding_start,
                padding_end,
                previous_speech=previous_segment,
                next_speech=None,
            )
        )
    return [gap for gap in gaps if gap]


def _speech_gap_candidate(
    raw_start: float,
    raw_end: float,
    min_gap: float,
    padding_start: float,
    padding_end: float,
    *,
    previous_speech: dict[str, Any] | None = None,
    next_speech: dict[str, Any] | None = None,
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
            "previous_speech": _speech_context_payload(previous_speech),
            "next_speech": _speech_context_payload(next_speech),
        }
    )
    return interval


def _speech_context_payload(segment: dict[str, Any] | None) -> dict[str, Any] | None:
    if not segment:
        return None
    text = " ".join(str(segment.get("text") or "").split())
    return {
        "start": round(_as_float(segment.get("start")), 3),
        "end": round(_as_float(segment.get("end")), 3),
        "text": text[:260],
        "timing_adjusted": bool(segment.get("timing_adjusted")),
    }


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
    return coalesce_auto_intervals(merged)


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
