
"""Inspect the expected GeoVision dataset directory structure."""

from pathlib import Path


def inspect_dataset(root: Path) -> None:
    """Report whether the dataset directory exists."""
    print(f"Dataset location: {root.resolve()}")
    print(f"Dataset directory exists: {root.is_dir()}")

    if not root.is_dir():
        print("No dataset found yet. This is expected before downloading.")
        return

    print("\nTop-level entries:")

    for item in sorted(root.iterdir()):
        entry_type = "Directory" if item.is_dir() else "File"
        print(f"- {item.name} ({entry_type})")


if __name__ == "__main__":
    dataset_root = Path("data") / "raw"
    inspect_dataset(dataset_root)
