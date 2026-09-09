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
validator = load_script("validate-cues.py")


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

    def test_render_line_accepts_only_declared_original_english(self):
        units = {
            "sample@legacy": {
                "blocks": [{"type": "english", "role": "original", "en": "Source text"}]
            }
        }
        result = generator.render_line(
            {
                "unit": "sample@legacy",
                "channel": "en",
                "role": "original",
                "blocks": [0],
            },
            units,
            {},
        )
        self.assertEqual(result, "Source text")
        with self.assertRaises(generator.SourceError):
            generator.render_line(
                {
                    "unit": "sample@legacy",
                    "channel": "en",
                    "role": "translation",
                    "blocks": [0],
                },
                units,
                {},
            )

    def test_presentation_metadata_is_bounded_and_compiled_exactly(self):
        cue_id = "4343d861-686f-449a-9f4e-2943da5a59db"
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        cue_map = next(item for item in mapping["cues"] if item["id"] == cue_id)
        cue = next(item for item in catalog if item["id"] == cue_id)
        self.assertEqual(
            cue_map["presentation"],
            {"transliterationFontSize": 30, "hebrewFontSize": 34},
        )
        self.assertEqual(cue["presentation"], cue_map["presentation"])
        with self.assertRaisesRegex(generator.SourceError, "integer from 24 to 52"):
            generator.presentation({"hebrewFontSize": True}, cue_id)
        cue_map["presentation"]["hebrewFontSize"] = 53
        with self.assertRaisesRegex(validator.ValidationError, "integer from 24 to 52"):
            validator.validate(mapping, catalog)

    def test_validator_rejects_compiled_presentation_drift(self):
        cue_id = "4343d861-686f-449a-9f4e-2943da5a59db"
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        next(item for item in catalog if item["id"] == cue_id)["presentation"][
            "hebrewFontSize"
        ] = 35
        with self.assertRaisesRegex(validator.ValidationError, "compiled presentation metadata"):
            validator.validate(mapping, catalog)

    def test_committed_catalog_and_mapping_validate(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate-cues.py")],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("validated 29 source-mapped cues", result.stdout)

    def test_catalog_allows_only_declared_original_english(self):
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
        self.assertEqual(channels, {"he", "tr", "en"})
        english_specs = [
            (cue, spec)
            for cue in mapping["cues"]
            for lines in cue["fields"].values()
            for spec in lines
            if spec.get("channel") == "en"
        ]
        self.assertTrue(english_specs)
        self.assertTrue(all(cue.get("originalReading") for cue, _ in english_specs))
        self.assertTrue(all(spec.get("role") == "original" for _, spec in english_specs))

    def test_new_service_cues_have_named_source_slices(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        new_cues = mapping["cues"][8:]
        self.assertEqual(len(new_cues), 21)
        for cue in new_cues:
            specs = [spec for lines in cue["fields"].values() for spec in lines]
            self.assertTrue(specs, cue["operatorName"])
            self.assertTrue(all(spec.get("sliceId") for spec in specs), cue["operatorName"])

    def test_validator_rejects_mismatched_bilingual_source_coverage(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        cue = next(item for item in mapping["cues"] if item["operatorName"] == "Psalm 150")
        cue["fields"]["textMainheb"] = [
            {
                "sliceId": "old-ashrei-he",
                "unit": "psukei.ashrei-opening@legacy-shabbat-morning",
                "channel": "he",
                "blocks": [0, 1],
                "separator": " ",
            },
            {
                "sliceId": "old-refrain-he",
                "unit": "psukei.psalm-150@legacy-shabbat-morning",
                "channel": "he",
                "blocks": [11, 12],
                "separator": " ",
            },
        ]
        with self.assertRaisesRegex(
            validator.ValidationError, "Hebrew/transliteration source coverage differs"
        ):
            validator.validate(mapping, catalog)

    def test_validator_rejects_reordered_bilingual_source_coverage(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        cue = next(item for item in mapping["cues"] if item["operatorName"] == "Vahavta 1")
        cue["fields"]["textMainEng"][0]["blocks"].reverse()
        with self.assertRaisesRegex(
            validator.ValidationError, "Hebrew/transliteration source coverage differs"
        ):
            validator.validate(mapping, catalog)


if __name__ == "__main__":
    unittest.main()
