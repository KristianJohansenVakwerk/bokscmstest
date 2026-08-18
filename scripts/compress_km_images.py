#!/usr/bin/env python3
"""Compress the KM_images gallery: downscale oversized photos and recompress at
high quality, writing the results to KM_images_opt with identical filenames.

The originals are full-resolution camera files (up to ~19 MB, 4000-6000px wide),
but nothing on the site renders above ~1080px. Capping the longest edge and
recompressing keeps them visually identical while cutting file size ~10-30x.

Usage:
    python3 scripts/compress_km_images.py [--max-edge 2560] [--quality 85]
                                          [--src DIR] [--dst DIR] [--force]

Defaults are tuned to preserve quality: 2560px is still crisp on retina, and
JPEG q=85 with optimize+progressive is visually lossless for photos.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageOps

# Extensions we treat as JPEG (case-insensitive), everything else copied as-is
# through Pillow with its own encoder (PNG stays PNG, etc.).
JPEG_EXTS = {".jpg", ".jpeg"}


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}GB"


def process(path: Path, out: Path, max_edge: int, quality: int) -> None:
    with Image.open(path) as im:
        # Bake in EXIF orientation so rotated phone/camera shots stay upright
        # once the EXIF is stripped on save.
        im = ImageOps.exif_transpose(im)

        # Downscale so the longest edge is at most max_edge (never upscale).
        w, h = im.size
        longest = max(w, h)
        if longest > max_edge:
            scale = max_edge / longest
            im = im.resize(
                (round(w * scale), round(h * scale)),
                Image.Resampling.LANCZOS,
            )

        # Preserve the embedded color profile for accurate colors.
        icc = im.info.get("icc_profile")
        ext = path.suffix.lower()

        if ext in JPEG_EXTS:
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            save_kwargs = dict(
                format="JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
            )
            if icc:
                save_kwargs["icc_profile"] = icc
            im.save(out, **save_kwargs)
        else:
            # Non-JPEG (e.g. the lone PNG): keep the format, just optimize.
            save_kwargs = dict(optimize=True)
            if icc:
                save_kwargs["icc_profile"] = icc
            im.save(out, **save_kwargs)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-edge", type=int, default=2560,
                    help="cap the longest edge in px (default: 2560)")
    ap.add_argument("--quality", type=int, default=85,
                    help="JPEG quality 1-95 (default: 85)")
    ap.add_argument("--src", default="public/KM_images",
                    help="source folder (default: public/KM_images)")
    ap.add_argument("--dst", default="public/KM_images_opt",
                    help="output folder (default: public/KM_images_opt)")
    ap.add_argument("--force", action="store_true",
                    help="overwrite outputs that already exist")
    args = ap.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    if not src.is_dir():
        print(f"error: source folder not found: {src}", file=sys.stderr)
        return 1
    dst.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in src.iterdir() if p.is_file() and not p.name.startswith("."))
    total_in = total_out = 0
    done = skipped = failed = 0

    for i, path in enumerate(files, 1):
        out = dst / path.name  # keep the exact same filename
        if out.exists() and not args.force:
            skipped += 1
            continue
        try:
            process(path, out, args.max_edge, args.quality)
        except Exception as e:  # noqa: BLE001 — report and keep going
            print(f"[{i}/{len(files)}] FAILED {path.name}: {e}", file=sys.stderr)
            failed += 1
            continue

        in_sz, out_sz = path.stat().st_size, out.stat().st_size
        total_in += in_sz
        total_out += out_sz
        done += 1
        pct = (1 - out_sz / in_sz) * 100 if in_sz else 0
        print(f"[{i}/{len(files)}] {path.name}: "
              f"{human(in_sz)} -> {human(out_sz)} ({pct:.0f}% smaller)")

    print("-" * 60)
    print(f"compressed {done} file(s), skipped {skipped}, failed {failed}")
    if total_in:
        pct = (1 - total_out / total_in) * 100
        print(f"total: {human(total_in)} -> {human(total_out)} "
              f"({pct:.0f}% smaller)")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
