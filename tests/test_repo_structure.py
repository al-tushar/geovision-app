"""Basic checks that the repository is complete and the data files are consistent."""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = {"no-damage", "minor-damage", "major-damage", "destroyed"}


def test_required_files_exist():
    for name in [
        "README.md",
        "demo/index.html",
        "demo/app.js",
        "demo/config.js",
        "supabase/functions/predict-damage/index.ts",
    ]:
        assert (ROOT / name).is_file(), f"Missing file: {name}"


def _read(name):
    with open(ROOT / "data" / "manifests" / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_manifest_labels_are_valid():
    for name in ["train_crops_128_manifest.csv", "val_crops_128_manifest.csv"]:
        rows = _read(name)
        assert rows, f"{name} is empty"
        assert {r["damage_label"] for r in rows} <= LABELS


def test_no_image_is_in_both_train_and_val():
    train = {r["image_name"] for r in _read("train_crops_128_manifest.csv")}
    val = {r["image_name"] for r in _read("val_crops_128_manifest.csv")}
    assert not (train & val), "Same source image appears in train and val"


def test_no_secret_keys_in_demo():
    for path in (ROOT / "demo").rglob("*"):
        if path.suffix in {".js", ".html", ".mjs"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert "service_role" not in text, f"service_role found in {path}"
            assert "sb_secret" not in text, f"secret key found in {path}"
