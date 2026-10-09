#!/usr/bin/env python3
"""只检查TuyuServe本仓已登记图片，不读取其它产品目录或生成外仓产物。"""

from __future__ import annotations

import hashlib
import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def owned_path(relative: str, root: Path = ROOT) -> Path:
    """历史资产登记只投影本仓条目，路径必须逐级无链接且在本仓logo/generated内。"""
    prefix = "tuyuserve/logo/generated/"
    if not isinstance(relative, str) or not relative.startswith(prefix):
        raise ValueError("asset must belong to TuyuServe generated images")
    local = relative.removeprefix("tuyuserve/")
    pieces = local.split("/")
    if any(part in ("", ".", "..") for part in pieces) or "\\" in local:
        raise ValueError("asset path is not canonical")
    path = root.joinpath(*pieces)
    current = root
    for part in pieces:
        current = current / part
        if current.is_symlink():
            raise ValueError("asset path must not contain links")
    if path.resolve() != path or not path.is_file():
        raise ValueError("asset is not an owned regular file")
    return path


class OwnedAssetTests(unittest.TestCase):
    def test_registered_images_match_owned_files_bytes_and_dimensions(self) -> None:
        manifest = json.loads((HERE / "manifest.json").read_text())
        selected = [item for item in manifest["images"]
                    if item["path"].startswith("tuyuserve/logo/generated/")]
        self.assertTrue(selected, "owned image registration must not be empty")
        paths = [owned_path(item["path"]) for item in selected]
        self.assertEqual(len(set(paths)), len(paths), "duplicate owned image")
        self.assertEqual(set(paths), set((HERE / "generated").glob("*.png")))
        for item, path in zip(selected, paths, strict=True):
            data = path.read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"])
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(data[12:16], b"IHDR")
            self.assertEqual(struct.unpack(">II", data[16:24]), (item["width"], item["height"]))

    def test_foreign_absolute_parent_and_unknown_asset_paths_are_rejected(self) -> None:
        for path in ("foreign/logo/generated/icon.png", "/logo/generated/icon.png",
                     "tuyuserve/logo/generated/../manifest.json",
                     "tuyuserve/logo/generated/./icon.png",
                     "tuyuserve/logo/generated/missing.png"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                owned_path(path)

    def test_image_path_cannot_be_replaced_by_a_symbolic_link(self) -> None:
        # 合成反例只在本产品target当前测试工作根生成，退出自动清理。
        supplied = Path(os.environ.get("TMPDIR", str(ROOT / "target/cloudflare/test")))
        if ROOT / "target" not in supplied.resolve().parents:
            raise ValueError("asset fixture must belong to product target")
        supplied.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=supplied) as work:
            fixture_root = Path(work)
            generated = fixture_root / "logo/generated"
            generated.mkdir(parents=True)
            source = generated / "fixture.png"
            source.write_bytes(b"synthetic image")
            link = generated / "alias.png"
            link.symlink_to(source)
            self.assertEqual(owned_path("tuyuserve/logo/generated/fixture.png", fixture_root), source)
            with self.assertRaises(ValueError):
                owned_path("tuyuserve/logo/generated/alias.png", fixture_root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
