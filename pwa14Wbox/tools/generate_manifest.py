#!/usr/bin/env python3
"""Generate media manifest for OPFS downloader."""

from __future__ import annotations

import json
from pathlib import Path

AUDIO_EXTENSIONS = {".mp3", ".ogg", ".wav"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".svg"}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MEDIA_ROOT = PROJECT_ROOT / "assets" / "media"
OUTPUT_PATH = PROJECT_ROOT / "assets" / "media-manifest.json"


def classify_file(file_path: Path) -> str | None:
    suffix = file_path.suffix.lower()
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    return None


def build_manifest() -> list[dict]:
    entries: list[dict] = []

    if not MEDIA_ROOT.exists():
        return entries

    for file_path in sorted(p for p in MEDIA_ROOT.rglob("*") if p.is_file()):
        file_type = classify_file(file_path)
        if file_type is None:
            continue

        relative_path = file_path.relative_to(MEDIA_ROOT).as_posix()
        entries.append(
            {
                "type": file_type,
                "path": relative_path,
                "url": f"./assets/media/{relative_path}",
                "size": file_path.stat().st_size,
            }
        )

    return entries


def main() -> None:
    manifest = build_manifest()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_files = len(manifest)
    total_size = sum(entry["size"] for entry in manifest)
    total_size_mb = total_size / (1024 * 1024)

    if total_files == 0:
        print("WARNING: assets/media/ has no supported files, generated empty manifest [].")

    print(f"Total files: {total_files}")
    print(f"Total size: {total_size_mb:.2f} MB")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
