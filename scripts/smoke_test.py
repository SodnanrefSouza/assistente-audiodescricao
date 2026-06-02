from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("AD_ASSIST_DATA_DIR", str(Path(tempfile.gettempdir()) / "ad_assist_smoke_tests"))

from app.main import create_app  # noqa: E402
from app.core.ffmpeg_utils import _classify_audio_background, _parse_rms_samples  # noqa: E402
from app.core.interval_tools import (  # noqa: E402
    mark_transcript_overlaps,
    merge_interval_candidates,
    parse_timed_transcript_segments,
    speech_gap_intervals,
)
from app.core.projects import ProjectStore  # noqa: E402


class SmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def test_home_exposes_review_ui(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        for expected in (
            "Linha do tempo das pausas",
            "Checklist antes de gravar",
            "timelineTrack",
            "audioInsightPanel",
            "playbackSpeed",
            "selectedSegmentBar",
            "addIntervalAtCurrentBtn",
            "addIntervalListBtn",
            "intervalPager",
            'class="panel transcript-panel" hidden',
            "20260602-top-menus",
            "Exportar ▾",
            "Histórico ▾",
            "Ver checklist",
        ):
            self.assertIn(expected, html)

    def test_static_assets_include_timeline_controls(self) -> None:
        js = (ROOT / "app" / "static" / "js" / "app.js").read_text(encoding="utf-8")
        css = (ROOT / "app" / "static" / "css" / "styles.css").read_text(encoding="utf-8")
        for expected in (
            "playbackSpeed: $('playbackSpeed')",
            "intervalPager: $('intervalPager')",
            "addIntervalAtCurrentBtn: $('addIntervalAtCurrentBtn')",
            "addIntervalListBtn: $('addIntervalListBtn')",
            "function renderIntervalPager",
            "function addIntervalAtCurrentTime",
            "function deleteInterval",
            "function intervalRowHtml",
            "function applyTooltips",
            "function updateSelectedSegmentBar",
            "function timelineDetailRulerHtml",
            "[5, 10, 15, 20, 30, 50]",
            "function timelineGroups",
            "function timelineDetailTicksHtml",
            "playbackRate",
            "intervalPageSize",
            "backgroundInfoForInterval",
            "recommendationState",
            "speech_overlap_segments",
        ):
            self.assertIn(expected, js)
        for expected in (
            ".interval-pager",
            ".interval-workbench",
            ".interval-row",
            ".interval-detail-card",
            ".compact-panel",
            ".summary-action",
            ".project-open",
            ".speed-control",
            ".top-menu-popover",
            ".selected-segment-bar",
            ".timeline-detail-ruler",
            ".timeline-detail-tick",
            ".timeline-detail-playhead",
            "body[data-large-text=\"true\"]",
            "body[data-contrast=\"high\"]",
            "body[data-large-text=\"true\"] .button",
            "body[data-contrast=\"high\"] :focus-visible",
            "audio-background states",
            ".timeline-cell.caution",
        ):
            self.assertIn(expected, css)

    def test_launcher_exists_for_double_click(self) -> None:
        launcher = ROOT / "Abrir Assistente.cmd"
        self.assertTrue(launcher.exists())
        content = launcher.read_text(encoding="utf-8")
        self.assertIn(".venv\\Scripts\\python.exe", content)
        self.assertIn("run.py", content)

    def test_project_delete_removes_project_folder(self) -> None:
        store = ProjectStore(Path(os.environ["AD_ASSIST_DATA_DIR"]))
        project = store.create_project("video_teste.mp4", title="Teste exclusao")
        folder = store.project_folder(project["id"])
        exports = store.exports_dir(project["id"])
        (exports / "arquivo_gerado.mp4").write_bytes(b"gerado")
        self.assertTrue(folder.exists())

        response = self.client.delete(f"/api/projects/{project['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(folder.exists())

    def test_open_project_refreshes_saved_interval_analysis(self) -> None:
        store = ProjectStore(Path(os.environ["AD_ASSIST_DATA_DIR"]))
        project = store.create_project("video_teste.mp4", title="Teste antigo")
        project["duration"] = 20
        project["intervals"] = [
            {"start": 1.0, "end": 2.0, "silence_start": 1.0, "silence_end": 2.0, "detection_source": "som baixo"},
            {"start": 2.3, "end": 3.2, "silence_start": 2.3, "silence_end": 3.2, "detection_source": "som baixo"},
        ]
        store.save(project, reason="Fixture intervalos antigos")

        response = self.client.get(f"/api/projects/{project['id']}")
        self.assertEqual(response.status_code, 200)
        refreshed = response.get_json()["project"]
        self.assertEqual(len(refreshed["intervals"]), 1)
        self.assertAlmostEqual(refreshed["intervals"][0]["end"], 3.2)

    def test_audio_background_classifier(self) -> None:
        self.assertEqual(_classify_audio_background([-120, -118, -119], -35)["state"], "quiet")
        self.assertEqual(_classify_audio_background([-44, -42, -43], -35)["state"], "low_background")
        self.assertEqual(_classify_audio_background([-18, -16, -17], -35)["state"], "active_background")
        self.assertEqual(_classify_audio_background([], -35)["state"], "unknown")
        samples = _parse_rms_samples(
            "frame:0 pts:0 pts_time:1.5\n"
            "lavfi.astats.Overall.RMS_level=-42.3\n"
            "frame:1 pts:1 pts_time:2.0\n"
            "lavfi.astats.Overall.RMS_level=-inf\n"
        )
        self.assertEqual(samples, [(1.5, -42.3), (2.0, -120.0)])

    def test_transcript_gap_detection(self) -> None:
        srt = (
            "1\n00:00:00,000 --> 00:00:02,000\nfala inicial\n\n"
            "2\n00:00:06,000 --> 00:00:08,000\nfala final\n"
        )
        segments = parse_timed_transcript_segments(srt)
        self.assertEqual(len(segments), 2)
        gaps = speech_gap_intervals(srt, 10, min_gap=1.0, padding_start=0.1, padding_end=0.1)
        self.assertTrue(any(2.0 < gap["start"] < 3.0 and 5.0 < gap["end"] < 6.0 for gap in gaps))
        self.assertTrue(all(gap["detection_source"] == "fala/transcricao" for gap in gaps))

    def test_short_transcript_speech_marks_interval_for_review(self) -> None:
        srt = "1\n00:00:05,100 --> 00:00:05,350\nobrigado\n"
        intervals = [
            {"start": 5.0, "end": 5.8, "silence_start": 5.0, "silence_end": 5.8, "detection_source": "som baixo"},
            {"start": 7.0, "end": 8.5, "silence_start": 7.0, "silence_end": 8.5, "detection_source": "som baixo"},
        ]
        checked = mark_transcript_overlaps(intervals, srt)
        self.assertTrue(checked[0]["speech_overlap"])
        self.assertEqual(checked[0]["speech_overlap_segments"][0]["text"], "obrigado")
        self.assertFalse(checked[1]["speech_overlap"])

    def test_close_automatic_intervals_are_merged(self) -> None:
        intervals = [
            {"start": 10.0, "end": 11.2, "silence_start": 10.0, "silence_end": 11.2, "detection_source": "som baixo"},
            {"start": 11.6, "end": 12.5, "silence_start": 11.6, "silence_end": 12.5, "detection_source": "som baixo"},
            {"start": 15.0, "end": 16.0, "silence_start": 15.0, "silence_end": 16.0, "detection_source": "manual"},
        ]
        merged = merge_interval_candidates(intervals, [])
        self.assertEqual(len(merged), 2)
        self.assertAlmostEqual(merged[0]["start"], 10.0)
        self.assertAlmostEqual(merged[0]["end"], 12.5)

    def test_health_endpoint(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsInstance(data, dict)
        self.assertTrue(data.get("ok"))
        self.assertIn("ffmpeg_ok", data)

    def test_javascript_syntax(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("Node não encontrado para validar JavaScript.")
        result = subprocess.run(
            [node, "--check", str(ROOT / "app" / "static" / "js" / "app.js")],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
