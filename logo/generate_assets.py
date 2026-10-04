#!/usr/bin/env python3
"""Generate all Tuyu product logo copies from the TuyuServe authority."""

from __future__ import annotations

import hashlib
import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VECTOR_SOURCE = HERE / "途遇AI.ai"
BITMAP_SOURCE = HERE / "途遇墨绿色500.png"
VECTOR_SHA256 = "24e0489b8b10e47d3b7bba009c74b1cb94d915087150db928e9722980442531b"
BITMAP_SHA256 = "27391305fe4e564dfceb54284383525901b3f70b39ff57e12e552f9eb4aa7b89"
CANONICAL_SIZES = (
    16, 20, 29, 32, 40, 48, 58, 60, 64, 76, 80, 87, 96, 100, 120, 128,
    144, 152, 167, 180, 192, 256, 384, 512, 1024,
)
ANDROID_LAUNCHER = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
ANDROID_SPLASH = {
    "mdpi": 128,
    "hdpi": 192,
    "xhdpi": 256,
    "xxhdpi": 384,
    "xxxhdpi": 512,
}

# Android 前景按 108dp 画布中的 66dp 安全区域缩放，底色独立铺满。
ANDROID_PRODUCTS = (
    "tuyubooking/app", "tuyufactory/app", "tuyulove", "tuyulife",
)


def android_resources(source: Image.Image) -> dict[str, str]:
    """只生成原生 XML 包装，不修改正式 Logo 或平台位图。"""
    color = "#%02x%02x%02x" % source.getpixel((0, 0))[:3]
    resources: dict[str, str] = {}
    for product in ANDROID_PRODUCTS:
        root = f"{product}/android/app/src/main/res"
        bitmap = "@drawable/tuyu_logo" if product == "tuyufactory/app" else "@mipmap/ic_launcher"
        resources[f"{root}/drawable-v26/app_icon.xml"] = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<!-- 由 tuyuserve/logo 生成；完整标识位于安全区域，底色由独立背景铺满。 -->\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@drawable/app_icon_background" />\n'
            '    <foreground>\n'
            f'        <inset android:drawable="{bitmap}" android:inset="19.444444%" />\n'
            '    </foreground>\n'
            '</adaptive-icon>\n'
        )
        resources[f"{root}/drawable-v26/app_icon_background.xml"] = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<!-- 底色直接取正式 Logo 左上角，不手工维护另一套品牌颜色。 -->\n'
            '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
            f'    <solid android:color="{color}" />\n'
            '</shape>\n'
        )
        if product != "tuyufactory/app":
            resources[f"{root}/drawable/app_icon.xml"] = (
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<!-- Android 按系统版本选择资源，位图继续引用既有权威副本。 -->\n'
                '<bitmap xmlns:android="http://schemas.android.com/apk/res/android"\n'
                '    android:src="@mipmap/ic_launcher" android:gravity="fill" android:filter="true" />\n'
            )
    return resources


def write_android_resources(source: Image.Image) -> list[dict[str, str]]:
    records = []
    for relative, content in android_resources(source).items():
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        records.append({"path": relative, "purpose": "android-launcher-resource", "sha256": sha256(target)})
    return records


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(source: Image.Image, size: int, destination: Path) -> None:
    image = source.resize((size, size), Image.Resampling.LANCZOS)
    background = Image.new("RGB", image.size, source.getpixel((0, 0))[:3])
    background.paste(image, mask=image.getchannel("A"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    background.save(destination, format="PNG", optimize=True)


def copy_bitmap(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BITMAP_SOURCE, destination)


def image_record(path: Path, purpose: str) -> dict[str, object]:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "purpose": purpose,
        "width": width,
        "height": height,
        "sha256": sha256(path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--android-only", action="store_true", help="仅更新 Android 自适应资源及清单")
    args = parser.parse_args()
    if sha256(VECTOR_SOURCE) != VECTOR_SHA256:
        raise SystemExit("途遇矢量 Logo 已变化；必须先审核并更新权威哈希")
    if sha256(BITMAP_SOURCE) != BITMAP_SHA256:
        raise SystemExit("途遇位图 Logo 已变化；必须先审核并更新权威哈希")

    source = Image.open(BITMAP_SOURCE).convert("RGBA")
    if source.size != (500, 500):
        raise SystemExit(f"正式位图必须为 500x500，当前为 {source.size}")

    if args.android_only:
        # 原平台副本原地保留，只纠正已完成工程改名后的登记路径。
        manifest = json.loads((HERE / "manifest.json").read_text())
        for item in manifest["images"] + manifest["windows_icons"]:
            item["path"] = item["path"].replace("tuyubooking/desktop/", "tuyubooking/app/")
            if not (ROOT / item["path"]).is_file():
                raise SystemExit(f"既有资产不存在，拒绝重建或猜测路径：{item['path']}")
        manifest["android_resources"] = write_android_resources(source)
        (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return

    outputs: list[tuple[Path, str]] = []
    for size in CANONICAL_SIZES:
        target = HERE / "generated" / f"tuyu-logo-{size}.png"
        render(source, size, target)
        outputs.append((target, f"canonical-{size}"))

    # 页面 Logo 直接位于产品工程根；macOS、Windows 使用已整合的原生资源路径。
    # iOS 资源目录保持原结构，不重新创建已删除的包装目录。
    page_assets = (
        ROOT / "tuyulove/tuyu_logo.png",
        ROOT / "tuyulife/tuyu_logo.png",
        ROOT / "tuyubooking/app/tuyu_logo.png",
        ROOT / "tuyufactory/app/tuyu_logo.png",
        ROOT / "tuyuweb/public/assets/tuyu-logo.png",
    )
    for target in page_assets:
        copy_bitmap(target)
        outputs.append((target, "page-brand"))

    mobile_roots = (
        ROOT / "tuyulove",
        ROOT / "tuyulife",
        ROOT / "tuyubooking/app",
    )
    for product in mobile_roots:
        for density, size in ANDROID_LAUNCHER.items():
            target = product / (
                f"android/app/src/main/res/mipmap-{density}/ic_launcher.png"
            )
            render(source, size, target)
            outputs.append((target, "android-launcher"))
        for density, size in ANDROID_SPLASH.items():
            target = product / (
                f"android/app/src/main/res/mipmap-{density}/launch_image.png"
            )
            render(source, size, target)
            outputs.append((target, "android-splash"))

        app_icons = product / "ios/Runner/Assets.xcassets/AppIcon.appiconset"
        for target in sorted(app_icons.glob("*.png")):
            with Image.open(target) as current:
                size = current.width
            render(source, size, target)
            outputs.append((target, "ios-app-icon"))

        launch_images = (
            product / "ios/Runner/Assets.xcassets/LaunchImage.imageset"
        )
        for name, size in (
            ("LaunchImage.png", 128),
            ("LaunchImage@2x.png", 256),
            ("LaunchImage@3x.png", 384),
        ):
            target = launch_images / name
            render(source, size, target)
            outputs.append((target, "ios-splash"))

    desktop_roots = (
        ROOT / "tuyubooking/app",
        ROOT / "tuyufactory/app",
    )
    windows_icons: list[dict[str, object]] = []
    for product in desktop_roots:
        app_icons = product / "macos/Runner/AppIcon.appiconset"
        for target in sorted(app_icons.glob("*.png")):
            with Image.open(target) as current:
                size = current.width
            render(source, size, target)
            outputs.append((target, "macos-app-icon"))

        windows_icon = product / "windows/runner/app_icon.ico"
        windows_icon.parent.mkdir(parents=True, exist_ok=True)
        icon = source.resize((256, 256), Image.Resampling.LANCZOS)
        background = Image.new("RGB", icon.size, source.getpixel((0, 0))[:3])
        background.paste(icon, mask=icon.getchannel("A"))
        background.save(
            windows_icon,
            format="ICO",
            sizes=[
                (16, 16), (24, 24), (32, 32), (48, 48),
                (64, 64), (128, 128), (256, 256),
            ],
        )
        windows_icons.append({
            "path": windows_icon.relative_to(ROOT).as_posix(),
            "purpose": "windows-app-icon",
            "sha256": sha256(windows_icon),
        })

    manifest = {
        "schema_version": 1,
        "authority_directory": "tuyuserve/logo",
        "vector_source": {
            "path": "tuyuserve/logo/途遇AI.ai",
            "sha256": VECTOR_SHA256,
        },
        "bitmap_source": {
            "path": "tuyuserve/logo/途遇墨绿色500.png",
            "width": 500,
            "height": 500,
            "sha256": BITMAP_SHA256,
        },
        "images": [
            image_record(path, purpose)
            for path, purpose in sorted(
                outputs,
                key=lambda item: item[0].as_posix(),
            )
        ],
        "windows_icons": windows_icons,
        "android_resources": write_android_resources(source),
    }
    (HERE / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
