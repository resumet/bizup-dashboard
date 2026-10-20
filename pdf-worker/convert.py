"""Unprivileged PDF page renderer. Receives local paths, never service credentials."""
import json
import sys
import uuid
from pathlib import Path

import pymupdf


MAX_ASSET_BYTES = 80 * 1024 * 1024
PAGE_IMAGE_WIDTH = 1600


def convert(source, destination, _options, max_pages=100, progress=None):
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

        result = {
            "version": 2,
            "title": (doc.metadata.get("title") or Path(source).stem)[:200],
            "pageCount": len(doc),
            "blocks": [],
            "outline": [],
        }
        asset_bytes = 0

        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            rect = page.rect
            if rect.width <= 0 or rect.height <= 0:
                raise ValueError(f"{page_no}페이지의 크기가 올바르지 않습니다.")

            scale = PAGE_IMAGE_WIDTH / rect.width
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            data = pixmap.tobytes("png")
            asset_bytes += len(data)
            if asset_bytes > MAX_ASSET_BYTES:
                raise ValueError("페이지 이미지 용량이 80MB를 초과했습니다. PDF를 나누어 업로드해 주세요.")

            asset = f"p{page_no}-0.png"
            (output / asset).write_bytes(data)
            block_id = str(uuid.uuid4())
            result["blocks"].append({
                "id": block_id,
                "node": {
                    "type": "image",
                    "attrs": {
                        "src": asset,
                        "alt": f"{result['title']} {page_no}페이지",
                    },
                },
                "source": {
                    "page": page_no,
                    "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
                    "confidence": 1,
                    "method": "render",
                },
                "issues": [],
            })
            result["outline"].append({
                "title": f"{page_no}페이지",
                "level": 1,
                "page": page_no,
                "blockId": block_id,
            })
            (output / "progress.json").write_text(
                json.dumps({"page": page_no, "total": len(doc)}),
                encoding="utf-8",
            )
            if progress:
                progress(page_no, len(doc))

        (output / "result.json").write_text(
            json.dumps(result, ensure_ascii=False),
            encoding="utf-8",
        )
        return result


if __name__ == "__main__":
    try:
        convert(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), int(sys.argv[4]))
    except Exception as error:
        # Never log document text or the original filename.
        message = str(error) if isinstance(error, ValueError) else "PDF 이미지 생성 중 오류가 발생했습니다. 파일을 확인해 주세요."
        (Path(sys.argv[2]) / "error.json").write_text(
            json.dumps({"message": message}, ensure_ascii=False),
            encoding="utf-8",
        )
        sys.exit(1)
