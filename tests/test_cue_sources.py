import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


generator = load_script("generate-cues.py")


class SourceAdapterTests(unittest.TestCase):
    def test_render_line_preserves_selected_channel_bytes(self):
        units = {
            "sample@legacy": {
                "blocks": [
                    {"type": "stanza", "he": "אָב", "tr": "Av"},
                    {"type": "stanza", "he": "גָּד", "tr": "Gad"},
                ]
            }
        }
        result = generator.render_line(
            {"unit": "sample@legacy", "channel": "he", "blocks": [0, 1], "separator": " | "},
            units,
            {},
        )
        self.assertEqual(result, "אָב | גָּד")

    def test_render_line_fails_closed_on_non_stanza(self):
        units = {"sample@legacy": {"blocks": [{"type": "english", "he": "wrong"}]}}
        with self.assertRaises(generator.SourceError):
            generator.render_line(
                {"unit": "sample@legacy", "channel": "he", "blocks": [0]}, units, {}
            )

    def test_committed_catalog_and_mapping_validate(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate-cues.py")],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("validated 8 source-mapped cues", result.stdout)

    def test_catalog_has_no_english_translation_channel(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        channels = {
            spec.get("channel")
            for cue in mapping["cues"]
            for lines in cue["fields"].values()
            for spec in lines
            if "channel" in spec
        }
        self.assertEqual(channels, {"he", "tr"})


if __name__ == "__main__":
    unittest.main()
