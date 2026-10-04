#!/usr/bin/env python3
"""Validate Tuyu logo sources and every generated product copy."""

from __future__ import annotations

import hashlib
import json
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image
from generate_assets import ANDROID_PRODUCTS, android_resources


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise AssertionError(f"不是有效 PNG：{path}")
    return struct.unpack(">II", data[16:24])


def test_factory_paths() -> None:
    """厂家路径独立验收，不因其他产品资源的状态掩盖本次路径变更。"""
    manifest = json.loads((HERE / "manifest.json").read_text())
    items = [
        item
        for item in manifest["images"] + manifest["windows_icons"]
        if item["path"].startswith("tuyufactory/")
    ]
    # macOS 多个尺寸槽可以引用同一文件，以官方资产目录登记的文件闭集为准。
    icons = "tuyufactory/app/macos/Runner/AppIcon.appiconset"
    catalog = json.loads((ROOT / icons / "Contents.json").read_text())
    expected = {f"{icons}/{item['filename']}" for item in catalog["images"]}
    expected.update({
        "tuyufactory/app/tuyu_logo.png",
        "tuyufactory/app/windows/runner/app_icon.ico",
    })
    assert {item["path"] for item in items} == expected
    assert len({item["path"] for item in items}) == len(items)
    for item in items:
        assert item["path"].startswith("tuyufactory/app/"), item["path"]
        path = ROOT / item["path"]
        assert path.is_file(), item["path"]
        assert sha256(path) == item["sha256"], item["path"]
        if path.suffix == ".png":
            assert png_size(path) == (item["width"], item["height"])
    generator = (HERE / "generate_assets.py").read_text()
    assert 'ROOT / "tuyufactory/app/tuyu_logo.png"' in generator
    assert 'ROOT / "tuyufactory/app"' in generator
    print(f"verified {len(items)} factory assets and generator paths")


def main() -> None:
    test_android_resources()
    if "--android-only" in sys.argv:
        return
    test_factory_paths()
    manifest = json.loads((HERE / "manifest.json").read_text())
    assert manifest["authority_directory"] == "tuyuserve/logo"

    for source_name in ("vector_source", "bitmap_source"):
        item = manifest[source_name]
        path = ROOT / item["path"]
        assert path.is_file(), item["path"]
        assert sha256(path) == item["sha256"], item["path"]

    for item in manifest["images"]:
        path = ROOT / item["path"]
        assert path.is_file(), item["path"]
        assert sha256(path) == item["sha256"], item["path"]
        assert png_size(path) == (item["width"], item["height"]), item["path"]

    for item in manifest["windows_icons"]:
        path = ROOT / item["path"]
        assert path.is_file() and path.stat().st_size > 0, item["path"]
        assert sha256(path) == item["sha256"], item["path"]

    print(
        f"verified 2 Tuyu authority sources, "
        f"{len(manifest['images'])} PNG assets and "
        f"{len(manifest['windows_icons'])} Windows icons"
    )


def test_android_resources() -> None:
    """校验四产品实际资源、清单、引用以及圆形裁切安全边界。"""
    manifest = json.loads((HERE / "manifest.json").read_text())
    for key in ("vector_source", "bitmap_source"):
        record = manifest[key]
        assert sha256(ROOT / record["path"]) == record["sha256"]
    with Image.open(ROOT / manifest["bitmap_source"]["path"]) as original:
        source = original.convert("RGBA")
    expected = android_resources(source)
    records = manifest["android_resources"]
    assert len(records) == len(expected) == 11
    assert {item["path"] for item in records} == set(expected)
    for record in records:
        path = ROOT / record["path"]
        assert path.read_text() == expected[record["path"]], path
        assert sha256(path) == record["sha256"], path
        ET.fromstring(path.read_text())
    attr = "{http://schemas.android.com/apk/res/android}"
    for product in ANDROID_PRODUCTS:
        root = ROOT / product
        application = ET.parse(root / "android/app/src/main/AndroidManifest.xml").getroot().find("application")
        assert application is not None
        assert application.get(attr + "icon") == "@drawable/app_icon", product
        assert application.get(attr + "roundIcon") == "@drawable/app_icon", product
        assert application.get(attr + "label") == "@string/app_name", product
        base = ET.parse(root / "android/app/src/main/res/drawable/app_icon.xml").getroot()
        bitmap = "@drawable/tuyu_logo" if product == "tuyufactory/app" else "@mipmap/ic_launcher"
        assert base.get(attr + "src") == bitmap
        icon = ET.parse(root / "android/app/src/main/res/drawable-v26/app_icon.xml").getroot()
        assert icon.tag == "adaptive-icon"
        assert icon.find("background").get(attr + "drawable") == "@drawable/app_icon_background"
        inset = icon.find("foreground/inset")
        assert inset is not None and inset.get(attr + "drawable") == bitmap
        assert inset.get(attr + "inset") == "19.444444%"
        if product == "tuyufactory/app":
            assert sha256(root / "tuyu_logo.png") == manifest["bitmap_source"]["sha256"]
        else:
            for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
                relative = f"{product}/android/app/src/main/res/mipmap-{density}/ic_launcher.png"
                record = next(item for item in manifest["images"] if item["path"] == relative)
                assert sha256(ROOT / relative) == record["sha256"]
    # 以最严格的 66dp 内切圆检查所有可见标识像素，同时覆盖方形和圆角方形。
    background = source.getpixel((0, 0))[:3]
    visible = 0
    for y in range(source.height):
        for x in range(source.width):
            pixel = source.getpixel((x, y))
            if pixel[3] and max(abs(pixel[i] - background[i]) for i in range(3)) > 24:
                visible += 1
                dx = ((x + 0.5) / source.width - 0.5) * 66
                dy = ((y + 0.5) / source.height - 0.5) * 66
                assert dx * dx + dy * dy <= 33 * 33, (x, y)
    assert visible > 0
    # 防止生产端缩进被误改为零后，静态引用测试仍误报通过。
    assert ((source.width / 2) ** 2) > 33 * 33
    print(f"verified 4 Android products, 11 XML resources, authority hashes and {visible} safe logo pixels")


if __name__ == "__main__":
    main()
