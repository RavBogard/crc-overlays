import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

# The authoring pack is built from a checkout of shireishabbat sitting beside this repo. That
# checkout is not present on a CI runner, and the path is Daniel's machine's, so it is read from
# the environment with the local default and the one test that needs it skips when it is absent.
SOURCE_ROOT = Path(os.environ.get("CRC_SHIREISHABBAT_ROOT", "C:/Users/dsbog/shireishabbat"))
HAVE_SOURCE_ROOT = SOURCE_ROOT.is_dir()


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
            {"transliterationFontSize": 29, "hebrewFontSize": 34},
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

    def test_birchot_rows_are_two_visible_panels_with_hidden_legacy_aliases(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        ids = {
            "0135de3c-9a47-4fdc-91b9-99bacdf64970",
            "b60c1abc-2257-4316-9ae4-2a03f72133d6",
            "ceb24b8c-d9a7-4607-99bf-c0962e2a88ff",
            "2b3da7a3-dc18-46f1-a792-13a4771b343c",
        }
        cues = [cue for cue in catalog if cue["id"] in ids]
        by_id = {cue["id"]: cue for cue in cues}
        target = by_id["b60c1abc-2257-4316-9ae4-2a03f72133d6"]
        aliases = [
            by_id["ceb24b8c-d9a7-4607-99bf-c0962e2a88ff"],
            by_id["2b3da7a3-dc18-46f1-a792-13a4771b343c"],
        ]
        self.assertEqual([len(cue["contentRows"]) for cue in cues], [4, 4, 4, 4])
        self.assertEqual(sum(not cue.get("hidden", False) for cue in cues), 2)
        self.assertTrue(all(alias["aliasOf"] == target["id"] for alias in aliases))
        self.assertTrue(all(alias["hidden"] for alias in aliases))
        self.assertTrue(all(alias["contentRows"] == target["contentRows"] for alias in aliases))
        self.assertEqual(
            target["contentRows"][-1]["en"],
            "Blessed are you, the eternal, our God,\n…who has provided me all I need.",
        )
        validator.validate(mapping, catalog)

    @unittest.skipUnless(HAVE_SOURCE_ROOT, f"no shireishabbat checkout at {SOURCE_ROOT}")
    def test_authoring_pack_exposes_only_pinned_birchot_translations(self):
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "build-authoring-sources.py"),
                "--check",
                "--source-root",
                str(SOURCE_ROOT),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        pack = json.loads(
            (ROOT / "content" / "authoring-sources.json").read_text(encoding="utf-8")
        )
        translations = [
            (unit, block)
            for unit in pack["sources"]
            for block in unit["blocks"]
            if block["kind"] == "translation-en"
        ]
        self.assertEqual(len(translations), 8)
        self.assertEqual(
            {unit["id"] for unit, _ in translations},
            {"awakening.birchot-hashachar@legacy-shabbat-morning"},
        )
        self.assertTrue(all(len(block["pairedBlockIds"]) == 2 for _, block in translations))
        self.assertTrue(all(len(block["sourceBlockSha256"]) == 64 for _, block in translations))
        final = next(block for _, block in translations if block["index"] == 24)
        self.assertEqual(final["supplementIds"], ["birchot-hashachar-final-clause"])
        self.assertEqual(
            final["en"],
            "Blessed are you, the eternal, our God,\n…who has provided me all I need.",
        )

    def test_validator_rejects_birchot_translation_reordering(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        cue = next(
            item
            for item in mapping["cues"]
            if item["id"] == "0135de3c-9a47-4fdc-91b9-99bacdf64970"
        )
        cue["contentRows"].reverse()
        with self.assertRaisesRegex(validator.ValidationError, "coverage/order changed"):
            validator.validate(mapping, catalog)

    def test_accepted_side_sequences_keep_stable_hidden_aliases(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        mapped = {cue["id"]: cue for cue in mapping["cues"]}
        compiled = {cue["id"]: cue for cue in catalog}
        accepted_aliases = {
            "f792daee-3663-4350-a3cb-783897e1f463": "65743cb0-95c9-4d26-b8eb-74c86f1f1b36",
            "dbf354df-e399-4d8b-bcfc-c067cc3cf2fc": "f15c1944-da76-4d61-95c8-05c032d47c4d",
            "5bad62c7-3005-4977-8349-230520c70211": "a5c90765-48c0-4384-a3e2-65b43cc2adf1",
        }
        for alias_id, target_id in accepted_aliases.items():
            self.assertEqual(mapped[alias_id]["aliasOf"], target_id)
            self.assertTrue(mapped[alias_id]["hidden"])
            self.assertEqual(compiled[alias_id]["aliasOf"], target_id)
            self.assertTrue(compiled[alias_id]["hidden"])
            for field in ("textMain", "textMainheb", "textMainEng"):
                self.assertEqual(
                    compiled[alias_id]["texts"].get(field),
                    compiled[target_id]["texts"].get(field),
                )
        validator.validate(mapping, catalog)

    def test_validator_rejects_consolidated_sequence_omission(self):
        mapping = json.loads(
            (ROOT / "content" / "legacy-crc-shabbat-morning.sources.json").read_text(encoding="utf-8")
        )
        catalog = json.loads((ROOT / "lib" / "cues.json").read_text(encoding="utf-8"))
        cue = next(item for item in mapping["cues"] if item["operatorName"] == "Psukei DZimrah 1")
        cue["fields"]["textMainheb"][-1]["blocks"].pop()
        cue["fields"]["textMainEng"][-1]["blocks"].pop()
        with self.assertRaisesRegex(validator.ValidationError, "sequence coverage/order changed"):
            validator.validate(mapping, catalog)


if __name__ == "__main__":
    unittest.main()
