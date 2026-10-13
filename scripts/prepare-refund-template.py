"""Prepare the public blank form. Requires PyMuPDF (pip install PyMuPDF)."""
from pathlib import Path
import argparse
import pymupdf

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Prepare a blank refund form from the locally held source PDF.")
parser.add_argument("source", type=Path, help="Path to the original refund application PDF (keep private)")
source = parser.parse_args().source.resolve()
destination = root / "public/templates/refund-application-v1.pdf"
document = pymupdf.open(source)
page = document[0]
assert len(document) == 1 and tuple(page.rect) == (0, 0, 612, 792)

# Remove the actual text, rather than hiding applicant data behind white boxes.
# Keep table borders and header cells untouched.
removed_values = []
for rect in [
    (56, 143.8, 232, 164),  # name
    (235, 143.8, 395, 164),  # phone
    (398, 143.8, 556, 164),  # email and underline
    (56, 232.2, 234.5, 252.5),  # course
    (237, 232.2, 398.5, 252.5),  # payment
    (401, 232.2, 556, 252.5),  # refund amount
    (114, 275, 130, 287),  # the sample's selected reason (A)
    (53, 299, 169, 310),  # reason A's bold text and selection underline
    (378, 589, 480, 603),  # sample date and its underline
]:
    removed_values.extend(value.strip() for value in page.get_text(clip=pymupdf.Rect(rect)).splitlines() if value.strip())
    page.add_redact_annot(pymupdf.Rect(rect), fill=(1, 1, 1))
page.apply_redactions(images=0, graphics=2, text=0)

for link in page.get_links():
    page.delete_link(link)

document.set_metadata({})
document.del_xml_metadata()
document.set_toc([])
for name in document.embfile_names():
    document.embfile_del(name)
# Rebuild a plain page document to discard tags, old object trees and actions.
clean = pymupdf.open()
clean.insert_pdf(document, links=False, annots=False, widgets=False)
destination.parent.mkdir(parents=True, exist_ok=True)
clean.save(destination, garbage=4, deflate=True, clean=True)

with pymupdf.open(destination) as result:
    text = result[0].get_text()
    for removed in removed_values:
        assert removed not in text, "A source field was not fully removed"
    assert "비즈업클래스 강의료 환불 신청서 및 약정서" in text
    assert not result[0].get_links()
print(f"Prepared {destination.name}")
