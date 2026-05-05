from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .timecode import seconds_to_hhmmss, seconds_to_srt


def export_json(project: dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(project, f, ensure_ascii=False, indent=2)
    return output_path


def export_csv(project: dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "index",
        "inicio",
        "fim",
        "duracao_segundos",
        "qualidade",
        "titulo",
        "status",
        "roteiro",
        "observacoes",
        "arquivo_gravacao",
        "duracao_gravacao_segundos",
        "aviso",
    ]
    with output_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";")
        writer.writeheader()
        for interval in project.get("intervals", []):
            writer.writerow(
                {
                    "index": interval.get("index"),
                    "inicio": seconds_to_hhmmss(interval.get("start", 0)),
                    "fim": seconds_to_hhmmss(interval.get("end", 0)),
                    "duracao_segundos": interval.get("duration", 0),
                    "qualidade": interval.get("quality", ""),
                    "titulo": interval.get("title", ""),
                    "status": interval.get("status", ""),
                    "roteiro": interval.get("script", ""),
                    "observacoes": interval.get("notes", ""),
                    "arquivo_gravacao": interval.get("recording_filename") or "",
                    "duracao_gravacao_segundos": interval.get("recording_duration") or "",
                    "aviso": interval.get("warning") or "",
                }
            )
    return output_path


def export_srt(project: dict[str, Any], output_path: Path) -> Path:
    """Exporta as descrições como legenda/roteiro SRT. Útil para revisão e referência.

    Observação: SRT não é uma faixa de audiodescrição real. Ele serve para revisar os tempos e textos.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    blocks = []
    counter = 1
    for interval in project.get("intervals", []):
        text = (interval.get("script") or "").strip()
        if not text:
            continue
        start = seconds_to_srt(interval.get("start", 0))
        end = seconds_to_srt(interval.get("end", 0))
        blocks.append(f"{counter}\n{start} --> {end}\n{text}\n")
        counter += 1
    with output_path.open("w", encoding="utf-8") as f:
        f.write("\n".join(blocks))
    return output_path


def export_marker_csv(project: dict[str, Any], output_path: Path, flavor: str = "generic") -> Path:
    """Exporta CSV de marcações para edição em planilha ou importação manual em editores.

    A compatibilidade exata varia conforme versão do Premiere/DaVinci. Por isso o arquivo é
    intencionalmente simples: nome, início, fim, duração, texto e observações.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        if flavor == "premiere":
            writer.writerow(["Name", "Start", "End", "Duration", "Description", "Type"])
            for interval in project.get("intervals", []):
                writer.writerow(
                    [
                        interval.get("title") or f"AD {interval.get('index')}",
                        seconds_to_hhmmss(interval.get("start", 0)),
                        seconds_to_hhmmss(interval.get("end", 0)),
                        seconds_to_hhmmss(interval.get("duration", 0)),
                        interval.get("script", ""),
                        "Comment",
                    ]
                )
        elif flavor == "davinci":
            writer.writerow(["Marker Name", "Start TC", "End TC", "Duration", "Notes", "Color"])
            for interval in project.get("intervals", []):
                writer.writerow(
                    [
                        interval.get("title") or f"AD {interval.get('index')}",
                        seconds_to_hhmmss(interval.get("start", 0)),
                        seconds_to_hhmmss(interval.get("end", 0)),
                        seconds_to_hhmmss(interval.get("duration", 0)),
                        interval.get("script", ""),
                        "Blue",
                    ]
                )
        else:
            writer.writerow(["Nome", "Inicio", "Fim", "Duracao", "Texto", "Observacoes", "Status"])
            for interval in project.get("intervals", []):
                writer.writerow(
                    [
                        interval.get("title") or f"AD {interval.get('index')}",
                        seconds_to_hhmmss(interval.get("start", 0)),
                        seconds_to_hhmmss(interval.get("end", 0)),
                        seconds_to_hhmmss(interval.get("duration", 0)),
                        interval.get("script", ""),
                        interval.get("notes", ""),
                        interval.get("status", ""),
                    ]
                )
    return output_path


def export_readable_script(project: dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    lines.append(f"# Roteiro de audiodescrição — {project.get('title', '')}\n")
    lines.append(f"Arquivo original: {project.get('source_filename', '')}")
    lines.append(f"Duração do vídeo: {seconds_to_hhmmss(project.get('duration', 0))}\n")
    lines.append("## Intervalos\n")
    for interval in project.get("intervals", []):
        start = seconds_to_hhmmss(interval.get("start", 0))
        end = seconds_to_hhmmss(interval.get("end", 0))
        duration = interval.get("duration", 0)
        script = (interval.get("script") or "[roteiro ainda não preenchido]").strip()
        lines.append(f"### {interval.get('index')}. {start} até {end} — {duration}s")
        lines.append(f"Qualidade do espaço: {interval.get('quality', '')}")
        lines.append(f"Status: {interval.get('status', '')}")
        lines.append("")
        lines.append(script)
        notes = (interval.get("notes") or "").strip()
        if notes:
            lines.append("")
            lines.append(f"Observações: {notes}")
        warning = (interval.get("warning") or "").strip()
        if warning:
            lines.append("")
            lines.append(f"Aviso: {warning}")
        lines.append("")
    with output_path.open("w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return output_path
