"""Deterministic renderers: structured document JSON -> DOCX / HTML / PDF.

The structured JSON (produced by the vision reader) is the interchange format.
Rendering is deterministic (no LLM) so output is reproducible, and the same JSON
targets three formats:

- DOCX  : flow layout, editable (python-docx)
- HTML  : self-contained page, best for quick review / web (string template)
- PDF   : print-ready (reportlab platypus)

Image blocks may carry "src" (a filename in assets_dir, produced by bbox
cropping) which gets embedded; otherwise a captioned placeholder is used.

Schema (best-effort; missing keys tolerated):

{
  "pages": [
    {"page": 1, "blocks": [
      {"type":"heading","level":1,"text":"..."},
      {"type":"paragraph","align":"left|center|right|justify",
       "runs":[{"text":"...","bold":false,"italic":false,"underline":false,"size_pt":11}]},
      {"type":"list","ordered":false,"items":["..."]},
      {"type":"table","header":true,"rows":[[{"text":"...","bold":true}]]},
      {"type":"key_value","pairs":[{"key":"...","value":"..."}]},
      {"type":"image","caption":"...","bbox":[x0,y0,x1,y1],"src":"crop.png"}
    ]}
  ]
}
"""

from __future__ import annotations

import html
from pathlib import Path

from docflow.document_io import split_safe_text


def _safe(x) -> str:
    return split_safe_text("" if x is None else str(x))


def _pages_of(structure):
    pages = structure.get("pages") if isinstance(structure, dict) else structure
    return pages or []


def _runs_of(blk):
    runs = blk.get("runs")
    if runs is None and "text" in blk:
        runs = [{"text": blk["text"]}]
    return runs or []


def _run_fields(r):
    if isinstance(r, str):
        return r, False, False, False, None
    return (
        r.get("text", ""),
        bool(r.get("bold")),
        bool(r.get("italic")),
        bool(r.get("underline")),
        r.get("size_pt"),
    )


def _cell_obj(cell):
    if isinstance(cell, dict):
        return _safe(cell.get("text", "")), bool(cell.get("bold"))
    return _safe(cell), False


def _resolve_src(blk, assets_dir):
    src = blk.get("src")
    if src and assets_dir:
        p = Path(assets_dir) / src
        if p.exists():
            return p
    return None


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------
def render_structure_to_docx(structure, out_path: Path, title: str = "", assets_dir=None) -> dict:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt

    align_map = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    doc = Document()
    if title:
        doc.add_heading(_safe(title), level=0)

    def render_block(blk):
        if not isinstance(blk, dict):
            return
        t = blk.get("type", "paragraph")
        if t == "heading":
            lvl = max(1, min(int(blk.get("level", 1) or 1), 4))
            doc.add_heading(_safe(blk.get("text", "")), level=lvl)
        elif t == "paragraph":
            p = doc.add_paragraph()
            al = align_map.get((blk.get("align") or "").lower())
            if al is not None:
                p.alignment = al
            for r in _runs_of(blk):
                text, b, i, u, size = _run_fields(r)
                run = p.add_run(_safe(text))
                run.bold, run.italic, run.underline = b, i, u
                if size:
                    try:
                        run.font.size = Pt(float(size))
                    except (TypeError, ValueError):
                        pass
        elif t == "list":
            style = "List Number" if blk.get("ordered") else "List Bullet"
            for item in blk.get("items", []):
                doc.add_paragraph(_safe(item), style=style)
        elif t == "table":
            rows = blk.get("rows") or []
            ncols = max((len(r) for r in rows), default=0)
            if ncols:
                table = doc.add_table(rows=0, cols=ncols)
                try:
                    table.style = "Light Grid Accent 1"
                except KeyError:
                    pass
                for ri, row in enumerate(rows):
                    cells = table.add_row().cells
                    for ci in range(ncols):
                        text, bold = _cell_obj(row[ci]) if ci < len(row) else ("", False)
                        cells[ci].text = text
                        if bold or (blk.get("header") and ri == 0):
                            for pp in cells[ci].paragraphs:
                                for run in pp.runs:
                                    run.bold = True
        elif t == "key_value":
            pairs = blk.get("pairs", [])
            if pairs:
                table = doc.add_table(rows=0, cols=2)
                for pair in pairs:
                    cells = table.add_row().cells
                    cells[0].text = _safe(pair.get("key", ""))
                    for pp in cells[0].paragraphs:
                        for run in pp.runs:
                            run.bold = True
                    cells[1].text = _safe(pair.get("value", ""))
        elif t == "image":
            src = _resolve_src(blk, assets_dir)
            if src:
                try:
                    doc.add_picture(str(src), width=Inches(5.5))
                except Exception:
                    src = None
            if not src:
                run = doc.add_paragraph().add_run(f"[{_safe(blk.get('caption', '')) or 'image'}]")
                run.italic = True

    pages = _pages_of(structure)
    blocks = 0
    for pi, page in enumerate(pages):
        for blk in (page.get("blocks", []) if isinstance(page, dict) else page) or []:
            render_block(blk)
            blocks += 1
        if pi < len(pages) - 1:
            doc.add_page_break()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    return {"pages": len(pages), "blocks": blocks, "format": "docx"}


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
_HTML_CSS = """
:root { color-scheme: light dark; }
body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 820px;
  margin: 2rem auto; padding: 0 1.25rem; line-height: 1.55; }
h1,h2,h3,h4 { line-height: 1.25; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th,td { border: 1px solid #bbb; padding: 6px 10px; text-align: left; vertical-align: top; }
thead th, tr.kv td:first-child { font-weight: 600; }
img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px; margin: .5rem 0; }
.page { padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px dashed #ccc; }
.page:last-child { border-bottom: none; }
figure { margin: .5rem 0; } figcaption { font-style: italic; color: #666; font-size: .9em; }
"""


def _html_runs(runs) -> str:
    out = []
    for r in runs:
        text, b, i, u, _ = _run_fields(r)
        s = html.escape(_safe(text))
        if b:
            s = f"<strong>{s}</strong>"
        if i:
            s = f"<em>{s}</em>"
        if u:
            s = f"<u>{s}</u>"
        out.append(s)
    return "".join(out)


def render_structure_to_html(structure, out_path: Path, title: str = "", assets_dir=None) -> dict:
    parts = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        f"<title>{html.escape(_safe(title) or out_path.stem)}</title>",
        f"<style>{_HTML_CSS}</style></head><body>",
    ]
    if title:
        parts.append(f"<h1>{html.escape(_safe(title))}</h1>")

    def render_block(blk):
        if not isinstance(blk, dict):
            return
        t = blk.get("type", "paragraph")
        if t == "heading":
            lvl = max(1, min(int(blk.get("level", 1) or 1), 4))
            parts.append(f"<h{lvl}>{html.escape(_safe(blk.get('text', '')))}</h{lvl}>")
        elif t == "paragraph":
            al = (blk.get("align") or "left").lower()
            parts.append(f"<p style='text-align:{html.escape(al)}'>{_html_runs(_runs_of(blk))}</p>")
        elif t == "list":
            tag = "ol" if blk.get("ordered") else "ul"
            items = "".join(f"<li>{html.escape(_safe(x))}</li>" for x in blk.get("items", []))
            parts.append(f"<{tag}>{items}</{tag}>")
        elif t == "table":
            rows = blk.get("rows") or []
            buf = ["<table>"]
            for ri, row in enumerate(rows):
                buf.append("<tr>")
                tag = "th" if (blk.get("header") and ri == 0) else "td"
                for cell in row:
                    text, bold = _cell_obj(cell)
                    inner = html.escape(text)
                    if bold and tag == "td":
                        inner = f"<strong>{inner}</strong>"
                    buf.append(f"<{tag}>{inner}</{tag}>")
                buf.append("</tr>")
            buf.append("</table>")
            parts.append("".join(buf))
        elif t == "key_value":
            buf = ["<table>"]
            for pair in blk.get("pairs", []):
                buf.append(
                    f"<tr class='kv'><td>{html.escape(_safe(pair.get('key', '')))}</td>"
                    f"<td>{html.escape(_safe(pair.get('value', '')))}</td></tr>"
                )
            buf.append("</table>")
            parts.append("".join(buf))
        elif t == "image":
            src = _resolve_src(blk, assets_dir)
            cap = html.escape(_safe(blk.get("caption", "")))
            if src:
                parts.append(
                    f"<figure><img src='{html.escape(src.name)}' alt='{cap}'>"
                    + (f"<figcaption>{cap}</figcaption>" if cap else "")
                    + "</figure>"
                )
            else:
                parts.append(f"<p><em>[{cap or 'image'}]</em></p>")

    pages = _pages_of(structure)
    blocks = 0
    for page in pages:
        parts.append("<div class='page'>")
        for blk in (page.get("blocks", []) if isinstance(page, dict) else page) or []:
            render_block(blk)
            blocks += 1
        parts.append("</div>")
    parts.append("</body></html>")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("".join(parts), encoding="utf-8")
    return {"pages": len(pages), "blocks": blocks, "format": "html"}


# ---------------------------------------------------------------------------
# PDF (reportlab)
# ---------------------------------------------------------------------------
def render_structure_to_pdf(structure, out_path: Path, title: str = "", assets_dir=None) -> dict:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Image,
        ListFlowable,
        ListItem,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )
    from xml.sax.saxutils import escape as xescape

    styles = getSampleStyleSheet()
    align_map = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT, "justify": TA_JUSTIFY}
    max_w = A4[0] - 1.5 * inch

    def inline(runs):
        out = []
        for r in runs:
            text, b, i, u, _ = _run_fields(r)
            s = xescape(_safe(text)).replace("\n", "<br/>")
            if b:
                s = f"<b>{s}</b>"
            if i:
                s = f"<i>{s}</i>"
            if u:
                s = f"<u>{s}</u>"
            out.append(s)
        return "".join(out) or "&nbsp;"

    flow = []
    if title:
        flow.append(Paragraph(xescape(_safe(title)), styles["Title"]))

    def add_block(blk):
        if not isinstance(blk, dict):
            return
        t = blk.get("type", "paragraph")
        if t == "heading":
            lvl = max(1, min(int(blk.get("level", 1) or 1), 4))
            flow.append(Paragraph(xescape(_safe(blk.get("text", ""))), styles[f"Heading{lvl}"]))
        elif t == "paragraph":
            st = styles["BodyText"].clone("p")
            st.alignment = align_map.get((blk.get("align") or "left").lower(), TA_LEFT)
            flow.append(Paragraph(inline(_runs_of(blk)), st))
        elif t == "list":
            items = [
                ListItem(Paragraph(xescape(_safe(x)), styles["BodyText"]))
                for x in blk.get("items", [])
            ]
            if items:
                flow.append(ListFlowable(items, bulletType="1" if blk.get("ordered") else "bullet"))
        elif t == "table":
            rows = blk.get("rows") or []
            data = [[Paragraph(xescape(_cell_obj(c)[0]), styles["BodyText"]) for c in row] for row in rows]
            if data:
                tbl = Table(data, hAlign="LEFT")
                tbl.setStyle(
                    TableStyle(
                        [
                            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke)
                            if blk.get("header")
                            else ("BACKGROUND", (0, 0), (-1, 0), colors.white),
                        ]
                    )
                )
                flow.append(tbl)
        elif t == "key_value":
            data = [
                [
                    Paragraph(f"<b>{xescape(_safe(p.get('key', '')))}</b>", styles["BodyText"]),
                    Paragraph(xescape(_safe(p.get("value", ""))), styles["BodyText"]),
                ]
                for p in blk.get("pairs", [])
            ]
            if data:
                tbl = Table(data, hAlign="LEFT", colWidths=[max_w * 0.35, max_w * 0.65])
                tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
                flow.append(tbl)
        elif t == "image":
            src = _resolve_src(blk, assets_dir)
            placed = False
            if src:
                try:
                    from PIL import Image as PILImage

                    with PILImage.open(str(src)) as im:
                        iw, ih = im.size
                    w = min(max_w, iw * 72.0 / 96.0)
                    h = w * ih / iw
                    flow.append(Image(str(src), width=w, height=h))
                    placed = True
                except Exception:
                    placed = False
            if not placed:
                flow.append(Paragraph(f"<i>[{xescape(_safe(blk.get('caption', '')) or 'image')}]</i>", styles["BodyText"]))
        flow.append(Spacer(1, 6))

    pages = _pages_of(structure)
    blocks = 0
    for pi, page in enumerate(pages):
        for blk in (page.get("blocks", []) if isinstance(page, dict) else page) or []:
            add_block(blk)
            blocks += 1
        if pi < len(pages) - 1:
            flow.append(PageBreak())

    out_path.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(out_path), pagesize=A4).build(flow)
    return {"pages": len(pages), "blocks": blocks, "format": "pdf"}


# ---------------------------------------------------------------------------
# Dispatch by extension
# ---------------------------------------------------------------------------
def render_structure(structure, out_path: Path, title: str = "", assets_dir=None) -> dict:
    ext = out_path.suffix.lower()
    if ext == ".html" or ext == ".htm":
        return render_structure_to_html(structure, out_path, title, assets_dir)
    if ext == ".pdf":
        return render_structure_to_pdf(structure, out_path, title, assets_dir)
    return render_structure_to_docx(structure, out_path, title, assets_dir)
