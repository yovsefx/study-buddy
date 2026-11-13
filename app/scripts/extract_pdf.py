"""Extrahiert Text pro Seite aus einer PDF als JSON (stdout).
Aufruf: python -I extract_pdf.py <pdf>
Ausgabe: {"pages": N, "title": "...", "text": ["seite1", ...], "scanned": [seitennummern ohne Text]}"""
import json, sys
import pymupdf as fitz

doc = fitz.open(sys.argv[1])
texts, scanned = [], []
for i, page in enumerate(doc):
    t = page.get_text("text") or ""
    t = "\n".join(line.rstrip() for line in t.splitlines())
    texts.append(t)
    if len(t.strip()) < 40 and (page.get_images() or page.get_drawings()):
        scanned.append(i + 1)
title = (doc.metadata or {}).get("title") or ""
print(json.dumps({"pages": len(doc), "title": title, "text": texts, "scanned": scanned}, ensure_ascii=False))
