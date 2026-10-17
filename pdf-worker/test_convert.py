import json
import tempfile
import unittest
import contextlib
from pathlib import Path

import pymupdf
from jsonschema import validate
from convert import convert


def fixture(path):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((60, 70), "PDF Import Guide", fontsize=24)
    page.insert_text((60, 120), "Original paragraph with a hyperlink.", fontsize=12)
    page.insert_text((60, 150), "Second line of original content.", fontsize=12)
    page.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(60, 105, 270, 125), "uri": "https://example.com/reference"})
    for x in (60, 180, 300):
        page.draw_line((x, 200), (x, 290))
    for y in (200, 230, 260, 290):
        page.draw_line((60, y), (300, y))
    for row, values in enumerate((("Item", "Value"), ("Alpha", "10"), ("Beta", "20"))):
        for col, text in enumerate(values):
            page.insert_text((65 + col * 120, 218 + row * 30), text, fontsize=11)
    pix = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 40, 40), False)
    pix.clear_with(130)
    page.insert_image(pymupdf.Rect(60, 320, 160, 420), pixmap=pix)
    page2 = doc.new_page()
    page2.insert_text((60, 70), "Second section", fontsize=22)
    page2.insert_text((60, 120), "Korean: 한글 문서 변환", fontname="korea", fontsize=12)
    doc.set_toc([[1, "First chapter", 1], [1, "Second chapter", 2]])
    doc.save(path)
    doc.close()


class ConverterTests(unittest.TestCase):
    def test_structure_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root / "test.pdf")
            result = convert(root / "test.pdf", root / "out", {"mode": "structure", "images": True})
            validate(result, json.loads(Path(__file__).with_name("ir.schema.json").read_text()))
            types = [block["node"]["type"] for block in result["blocks"]]
            self.assertIn("heading", types)
            self.assertIn("table", types)
            self.assertIn("image", types)
            self.assertEqual(result["pageCount"], 2)
            self.assertEqual(result["outline"][1]["page"], 2)
            self.assertTrue(all(len(block["source"]["bbox"]) == 4 for block in result["blocks"]))
            text = json.dumps(result, ensure_ascii=False)
            self.assertIn("한글", text)
            self.assertIn("https://example.com/reference", text)
            self.assertIn("Alpha", text)
            self.assertEqual(len({b["id"] for b in result["blocks"]}), len(result["blocks"]))

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

    def test_scan_fallback_keeps_page_and_marks_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with pymupdf.open() as doc:
                doc.new_page()
                doc.save(root / "scan.pdf")
            result = convert(root / "scan.pdf", root / "out", {"ocr": False, "images": False})
            self.assertEqual(result["pageCount"], 1)
            self.assertTrue(result["blocks"][0]["issues"])
            self.assertEqual(result["blocks"][0]["node"]["type"], "image")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--fixture-json":
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root / "test.pdf")
            with contextlib.redirect_stdout(sys.stderr):
                result = convert(root / "test.pdf", root / "out", {"images": False})
            print(json.dumps(result))
    else:
        unittest.main()
