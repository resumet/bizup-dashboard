"""Unprivileged parser. Receives local paths and options, never service credentials."""
import collections
import json
import math
import re
import sys
import uuid
from pathlib import Path

import pymupdf


def text_node(text, marks=None):
    return {"type": "text", "text": text, **({"marks": marks} if marks else {})}


def paragraph(text):
    return {"type": "paragraph", "content": [text_node(text)]} if text else {"type": "paragraph"}


def convert(source, destination, options, max_pages=100, progress=None):
    output = Path(destination)
    output.mkdir(parents=True, exist_ok=True)
    try:
        doc = pymupdf.open(source)
    except Exception:
        raise ValueError("손상되었거나 지원하지 않는 PDF입니다.") from None
    with doc:
        if doc.needs_pass or doc.is_encrypted:
            raise ValueError("암호화된 PDF입니다. 암호를 해제한 파일을 업로드해 주세요.")
        if not 0 < len(doc) <= max_pages:
            raise ValueError(f"PDF는 {max_pages}페이지까지 변환할 수 있습니다.")
        sizes = []
        headers = collections.Counter()
        for page in doc:
            for block in page.get_text("dict", flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(span["text"] for span in line["spans"]).strip()
                    sizes.extend(round(span["size"]) for span in line["spans"] if span["text"].strip())
                    if line["bbox"][1] < 45 or line["bbox"][3] > page.rect.height - 35:
                        headers[text] += 1
        body_size = collections.Counter(sizes).most_common(1)[0][0] if sizes else 12
        heading_sizes = sorted({s for s in sizes if s >= body_size * 1.2}, reverse=True)[:3]
        result = {"version": 1, "title": (doc.metadata.get("title") or Path(source).stem)[:200], "pageCount": len(doc), "blocks": [], "outline": []}
        asset_bytes = 0
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            issues = []
            method = "text"
            textpage = None
            if len(page.get_text().strip()) < 8:
                if options.get("ocr"):
                    try:
                        textpage = page.get_textpage_ocr(language="kor+eng", dpi=150, full=True)
                        method = "ocr"
                        issues.append("OCR 결과를 원본과 대조해 주세요.")
                    except Exception:
                        issues.append("OCR을 사용할 수 없습니다. 원본 페이지를 확인해 주세요.")
                else:
                    issues.append("텍스트가 적은 페이지입니다. OCR 또는 원본 확인이 필요합니다.")
            raw = page.get_text("dict", textpage=textpage, sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)["blocks"]
            spans = [b for b in raw if b.get("lines")]
            if any(b["bbox"][0] > page.rect.width * .48 for b in spans) and any(b["bbox"][2] < page.rect.width * .52 for b in spans):
                issues.append("다단 구성의 읽기 순서를 검토해 주세요.")
            tables = []
            elements = []
            try:
                for table in page.find_tables().tables:
                    rows = table.extract()
                    if not rows or len(rows) > 500 or max(map(len, rows)) > 100:
                        issues.append("복잡한 표는 원본에서 확인해 주세요.")
                        continue
                    tables.append(pymupdf.Rect(table.bbox))
                    elements.append((table.bbox, {"type": "table", "content": [
                        {"type": "tableRow", "content": [{"type": "tableHeader" if i == 0 else "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [paragraph(cell or "")]} for cell in row]}
                        for i, row in enumerate(rows)
                    ]}, ["표의 병합 셀과 헤더를 원본과 대조해 주세요."]))
            except Exception:
                issues.append("표 구조를 분석하지 못했습니다. 원본 페이지를 확인해 주세요.")
            for block in raw:
                lines = block.get("lines", [])
                if not lines:
                    continue
                bbox = block["bbox"]
                if any(table.contains(pymupdf.Rect(bbox)) for table in tables):
                    continue
                plain = " ".join("".join(s["text"] for s in line["spans"]).strip() for line in lines).strip()
                if not plain:
                    continue
                repeated = headers[plain] >= max(3, math.ceil(len(doc) * .6))
                margin = bbox[1] < 45 or bbox[3] > page.rect.height - 35
                block_issues = list(issues)
                if repeated and margin:
                    block_issues.append("반복 머리말·꼬리말입니다. 삭제 여부를 검토해 주세요.")
                content = []
                for li, line in enumerate(lines):
                    for si, span in enumerate(line["spans"]):
                        text = span["text"]
                        if not text:
                            continue
                        marks = []
                        if span["flags"] & 16:
                            marks.append({"type": "bold"})
                        if span["flags"] & 2:
                            marks.append({"type": "italic"})
                        for link in page.get_links():
                            uri = link.get("uri", "")
                            if re.match(r"^https?://", uri) and pymupdf.Rect(link["from"]).intersects(pymupdf.Rect(span["bbox"])):
                                marks.append({"type": "link", "attrs": {"href": uri}})
                                break
                        if li and si == 0:
                            content.append({"type": "hardBreak"} if options.get("mode") == "structure" else text_node(" "))
                        content.append(text_node(text, marks))
                maximum = max(s["size"] for line in lines for s in line["spans"])
                level = next((i+1 for i, size in enumerate(heading_sizes) if maximum >= size-.5), 0)
                if level and len(plain) < 200 and not repeated:
                    node = {"type": "heading", "attrs": {"level": level}, "content": content}
                elif all(re.match(r"^\s*(?:[•●▪\-]|\d+[.)])\s+", "".join(s["text"] for s in line["spans"])) for line in lines):
                    ordered = bool(re.match(r"^\s*\d", plain))
                    node = {"type": "orderedList" if ordered else "bulletList", "content": [
                        {"type": "listItem", "content": [paragraph(re.sub(r"^\s*(?:[•●▪\-]|\d+[.)])\s+", "", "".join(s["text"] for s in line["spans"])))]} for line in lines
                    ]}
                else:
                    node = {"type": "paragraph", "content": content}
                elements.append((bbox, node, block_issues))
            # Clip embedded figures to preserve masks, rotation and captions in page coordinates.
            if options.get("images", True) or not spans:
                regions = [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()] if spans else [page.rect]
                for ai, region in enumerate(regions):
                    if region.is_empty or region.width < 5 or region.height < 5:
                        continue
                    scale = min(1.5, 1800 / max(region.width, region.height))
                    data = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=region, alpha=False).tobytes("png")
                    asset_bytes += len(data)
                    if asset_bytes > 80 * 1024 * 1024:
                        issues.append("이미지 추출 용량 한도를 초과했습니다. 원본에서 확인해 주세요.")
                        break
                    name = f"p{page_no}-{ai}.png"
                    (output / name).write_bytes(data)
                    elements.append((list(region), {"type": "image", "attrs": {"src": name, "alt": f"원본 {page_no}페이지 이미지"}}, list(issues)))
            if not elements:
                elements.append((list(page.rect), paragraph(f"원본 {page_no}페이지 확인 필요"), issues or ["추출 가능한 내용이 없습니다."]))
            elements.sort(key=lambda e: (e[0][1], e[0][0]))
            for bbox, node, flags in elements:
                block_id = str(uuid.uuid4())
                result["blocks"].append({"id": block_id, "node": node, "source": {"page": page_no, "bbox": list(bbox), "confidence": .6 if flags else .9, "method": method}, "issues": flags})
                if node["type"] == "heading":
                    title = "".join(n.get("text", "") for n in node["content"])
                    result["outline"].append({"title": title, "level": node["attrs"]["level"], "page": page_no, "blockId": block_id})
            if len(result["blocks"]) > 500:
                raise ValueError("변환된 문단이 500개를 초과합니다. PDF를 나누어 업로드해 주세요.")
            (output / "progress.json").write_text(json.dumps({"page": page_no, "total": len(doc)}))
            if progress:
                progress(page_no, len(doc))
        bookmarks = doc.get_toc()
        if bookmarks:
            result["outline"] = [{"title": title[:200], "level": min(level, 3), "page": page, "blockId": next((b["id"] for b in result["blocks"] if b["source"]["page"] >= page), result["blocks"][-1]["id"])} for level, title, page in bookmarks if page > 0]
        (output / "result.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        return result


if __name__ == "__main__":
    try:
        convert(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), int(sys.argv[4]))
    except Exception as error:
        # Never log document text or the original filename.
        message = str(error) if isinstance(error, ValueError) else "PDF 분석 중 오류가 발생했습니다. 파일을 확인해 주세요."
        (Path(sys.argv[2]) / "error.json").write_text(json.dumps({"message": message}, ensure_ascii=False), encoding="utf-8")
        sys.exit(1)
