import hashlib
from pathlib import Path
import sys
from zipfile import ZipFile


dist = Path(__file__).resolve().parents[1] / "dist"
with ZipFile(sys.argv[1]) as apk:
    corrupt_entry = apk.testzip()
    if corrupt_entry:
        raise SystemExit(f"Corrupt APK entry: {corrupt_entry}")
    for required in ("AndroidManifest.xml", "classes.dex"):
        if not apk.read(required):
            raise SystemExit(f"Empty APK entry: {required}")
    for asset in sorted(dist.rglob("*")):
        if not asset.is_file():
            continue
        relative = asset.relative_to(dist).as_posix()
        entry = f"assets/public/{relative}"
        if entry not in apk.namelist():
            raise SystemExit(f"APK is missing current web asset: {relative}")
        packaged = apk.read(entry)
        if packaged != asset.read_bytes():
            raise SystemExit(f"APK asset differs from current build: {relative}")
        print(f"{relative}: {len(packaged)} bytes, SHA256 {hashlib.sha256(packaged).hexdigest()}")
