from __future__ import annotations

import json
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mpg", ".mpeg", ".wmv"
}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def safe_filename(filename: str) -> str:
    filename = secure_filename(filename or "video.mp4")
    if not filename:
        filename = "video.mp4"
    return filename


def slugify(value: str, fallback: str = "projeto") -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9\-_]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or fallback


@dataclass
class ProjectStore:
    data_dir: Path

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    def ensure(self) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def create_project(self, original_filename: str, title: str | None = None) -> dict[str, Any]:
        self.ensure()
        ext = Path(original_filename or "video.mp4").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                "Formato de vídeo não suportado. Use MP4, MOV, MKV, AVI, WEBM, M4V, MPG, MPEG ou WMV."
            )

        project_id = uuid.uuid4().hex[:12]
        project_title = title or Path(original_filename).stem or "Projeto de audiodescrição"
        folder = self.projects_dir / project_id
        (folder / "recordings").mkdir(parents=True, exist_ok=True)
        (folder / "exports").mkdir(parents=True, exist_ok=True)
        video_name = f"video{ext}"
        project = {
            "id": project_id,
            "title": project_title,
            "slug": slugify(project_title),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "source_filename": original_filename,
            "video_filename": video_name,
            "duration": 0.0,
            "settings": {
                "noise_db": -35,
                "min_silence": 1.0,
                "min_ad_duration": 0.8,
                "padding_start": 0.10,
                "padding_end": 0.10,
                "preview_margin": 2.0,
            },
            "intervals": [],
            "notes": "",
        }
        self.save(project)
        return project

    def save_uploaded_video(self, project: dict[str, Any], file_storage) -> Path:
        folder = self.project_folder(project["id"])
        video_path = folder / project["video_filename"]
        file_storage.save(video_path)
        return video_path

    def import_existing_video(self, project: dict[str, Any], source_path: Path) -> Path:
        """Move um arquivo de vídeo já recebido para a pasta definitiva do projeto.

        Usado pelo upload fracionado para evitar carregar vídeos gigantes na memória
        e para não depender de um limite único de upload HTTP.
        """
        folder = self.project_folder(project["id"])
        folder.mkdir(parents=True, exist_ok=True)
        video_path = folder / project["video_filename"]
        if video_path.exists():
            video_path.unlink()
        shutil.move(str(source_path), str(video_path))
        return video_path

    def project_folder(self, project_id: str) -> Path:
        return self.projects_dir / project_id

    def project_path(self, project_id: str) -> Path:
        return self.project_folder(project_id) / "project.json"

    def exists(self, project_id: str) -> bool:
        return self.project_path(project_id).exists()

    def load(self, project_id: str) -> dict[str, Any]:
        path = self.project_path(project_id)
        if not path.exists():
            raise FileNotFoundError("Projeto não encontrado.")
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, project: dict[str, Any]) -> None:
        project["updated_at"] = now_iso()
        folder = self.project_folder(project["id"])
        folder.mkdir(parents=True, exist_ok=True)
        with self.project_path(project["id"]).open("w", encoding="utf-8") as f:
            json.dump(project, f, ensure_ascii=False, indent=2)

    def delete(self, project_id: str) -> None:
        folder = self.project_folder(project_id)
        if folder.exists():
            shutil.rmtree(folder)

    def list_projects(self) -> list[dict[str, Any]]:
        self.ensure()
        projects: list[dict[str, Any]] = []
        for project_file in self.projects_dir.glob("*/project.json"):
            try:
                with project_file.open("r", encoding="utf-8") as f:
                    p = json.load(f)
                projects.append(
                    {
                        "id": p.get("id"),
                        "title": p.get("title"),
                        "source_filename": p.get("source_filename"),
                        "created_at": p.get("created_at"),
                        "updated_at": p.get("updated_at"),
                        "duration": p.get("duration", 0),
                        "interval_count": len(p.get("intervals", [])),
                    }
                )
            except Exception:
                continue
        projects.sort(key=lambda p: p.get("updated_at") or "", reverse=True)
        return projects

    def video_path(self, project: dict[str, Any]) -> Path:
        return self.project_folder(project["id"]) / project["video_filename"]

    def recordings_dir(self, project_id: str) -> Path:
        path = self.project_folder(project_id) / "recordings"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def exports_dir(self, project_id: str) -> Path:
        path = self.project_folder(project_id) / "exports"
        path.mkdir(parents=True, exist_ok=True)
        return path
