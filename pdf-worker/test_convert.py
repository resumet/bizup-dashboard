import contextlib
import json
import tempfile
import unittest
from pathlib import Path

import pymupdf
from jsonschema import validate

from convert import convert


def fixture(path):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((60, 70), "PDF Import Guide", fontsize=24)
    page.insert_text((60, 120), "This text must remain inside the page image.", fontsize=12)
    page2 = doc.new_page()
    page2.insert_text((60, 70), "Second page", fontsize=22)
    page2.draw_rect(pymupdf.Rect(60, 110, 300, 260), color=(0, 0, 0), fill=(0.9, 0.9, 0.9))
    doc.save(path)
    doc.close()


class ConverterTests(unittest.TestCase):
    def test_each_page_becomes_one_uploaded_image_block(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root / "test.pdf")
            output = root / "out"
            result = convert(root / "test.pdf", output, {"output": "page_images"})

            validate(result, json.loads(Path(__file__).with_name("ir.schema.json").read_text()))
            self.assertEqual(result["version"], 2)
            self.assertEqual(result["pageCount"], 2)
            self.assertEqual(len(result["blocks"]), 2)
            self.assertEqual([block["source"]["page"] for block in result["blocks"]], [1, 2])
            self.assertTrue(all(block["node"]["type"] == "image" for block in result["blocks"]))
            self.assertTrue(all(block["source"]["method"] == "render" for block in result["blocks"]))
            self.assertNotIn("This text must remain", json.dumps(result))

            for page_number in (1, 2):
                image = output / f"p{page_number}-0.png"
                self.assertEqual(image.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
                pixmap = pymupdf.Pixmap(str(image))
                self.assertEqual(pixmap.width, 1600)
                self.assertGreater(pixmap.height, 0)

    def test_bad_pdf_encryption_and_page_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "bad.pdf").write_bytes(b"not pdf")
            with self.assertRaises(ValueError):
                convert(root / "bad.pdf", root / "out", {})
            fixture(root / "test.pdf")
            with self.assertRaises(ValueError):
                convert(root / "test.pdf", root / "out", {}, 1)
            with pymupdf.open(root / "test.pdf") as doc:
                doc.save(root / "locked.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="user")
            with self.assertRaises(ValueError):
                convert(root / "locked.pdf", root / "out", {})

    def test_blank_page_is_rendered_without_ocr_or_text_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with pymupdf.open() as doc:
                doc.new_page()
                doc.save(root / "blank.pdf")
            result = convert(root / "blank.pdf", root / "out", {"ocr": True, "images": False})
            self.assertEqual(result["pageCount"], 1)
            self.assertEqual(len(result["blocks"]), 1)
            self.assertEqual(result["blocks"][0]["node"]["type"], "image")
            self.assertEqual(result["blocks"][0]["source"]["method"], "render")
            self.assertEqual(result["blocks"][0]["issues"], [])


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--fixture-json":
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root / "test.pdf")
            with contextlib.redirect_stdout(sys.stderr):
                result = convert(root / "test.pdf", root / "out", {"output": "page_images"})
            print(json.dumps(result))
    else:
        unittest.main()
