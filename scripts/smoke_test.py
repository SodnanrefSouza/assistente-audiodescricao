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
            "intervalPager",
            'class="panel transcript-panel" hidden',
            "20260526-audio-background",
        ):
            self.assertIn(expected, html)

    def test_static_assets_include_timeline_controls(self) -> None:
        js = (ROOT / "app" / "static" / "js" / "app.js").read_text(encoding="utf-8")
        css = (ROOT / "app" / "static" / "css" / "styles.css").read_text(encoding="utf-8")
        for expected in (
            "playbackSpeed: $('playbackSpeed')",
            "intervalPager: $('intervalPager')",
            "function renderIntervalPager",
            "function timelineGroups",
            "playbackRate",
            "intervalPageSize",
            "backgroundInfoForInterval",
            "recommendationState",
        ):
            self.assertIn(expected, js)
        for expected in (
            ".interval-pager",
            ".speed-control",
            "body[data-large-text=\"true\"]",
            "body[data-contrast=\"high\"]",
            "body[data-large-text=\"true\"] .button",
            "body[data-contrast=\"high\"] :focus-visible",
            "audio-background states",
            ".timeline-cell.caution",
        ):
            self.assertIn(expected, css)

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