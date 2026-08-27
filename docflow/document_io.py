"""Robust DOCX / PDF I/O for DocFlow.

A deliberately minimal subset of the original document_io module - only the
fixes that matter for general documents:

- XML-safe text writing (avoids Word's "unreadable content / recover?" prompt).
- Open-XML, format-preserving find/replace: edits word/document.xml text nodes
  in place and leaves every other part of the package byte-identical, so styles,
  fonts, images, headers and numbering survive untouched. python-docx, by
  contrast, rewrites the whole package and flattens run formatting on edits.
- Optional furniture stripping (headers / footers / line numbers) for the cases
  where a user explicitly wants a clean export.
"""

from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
import zipfile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WT = f"{{{W}}}t"
WP = f"{{{W}}}p"

# Register the common WordprocessingML namespaces so ElementTree serializes with
# the right prefixes (w:, r:, ...) instead of ns0:.
for _prefix, _uri in {
    "w": W,
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
}.items():
    ET.register_namespace(_prefix, _uri)

# Word's canonical declaration. ElementTree's own xml_declaration uses single
# quotes / lowercase utf-8 / no standalone, which Word flags as corrupt.
_XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

# Furniture (only used by strip_docx_furniture).
_RE_HEADER_REF = re.compile(rb"<w:headerReference\b[^>]*/>")
_RE_FOOTER_REF = re.compile(rb"<w:footerReference\b[^>]*/>")
_RE_LNUM = re.compile(rb"<w:lnNumType\b[^>]*/>")


# ---------------------------------------------------------------------------
# XML-safe text
# ---------------------------------------------------------------------------
def _is_valid_xml_char(ch: str) -> bool:
    """True if ch is a legal XML 1.0 character."""
    cp = ord(ch)
    return (
        cp in (0x9, 0xA, 0xD)
        or 0x20 <= cp <= 0xD7FF
        or 0xE000 <= cp <= 0xFFFD
        or 0x10000 <= cp <= 0x10FFFF
    )


def split_safe_text(text: str) -> str:
    """Drop characters that are illegal in XML 1.0 text nodes. Writing these
    produces a DOCX that Word refuses to open without "recovery"."""
    if text is None:
        return ""
    return "".join(ch for ch in text if _is_valid_xml_char(ch))


# ---------------------------------------------------------------------------
# Dependency guards
# ---------------------------------------------------------------------------
def get_fitz():
    try:
        import fitz  # PyMuPDF

        return fitz
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Missing dependency 'PyMuPDF' (fitz). Install it in your .venv.") from exc


def read_docx(path: str):
    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Missing dependency 'python-docx'. Install it in your .venv.") from exc
    return Document(path)


# ---------------------------------------------------------------------------
# Open-XML, format-preserving find/replace
# ---------------------------------------------------------------------------
def _original_root_tag(document_xml: bytes) -> str | None:
    """Return the exact original <w:document ...> opening tag (with all its
    xmlns declarations and mc:Ignorable) so we can restore it verbatim."""
    m = re.search(rb"<w:document\b[^>]*>", document_xml)
    return m.group(0).decode("utf-8") if m else None


def _serialize_document(doc_root: ET.Element, original_open_tag: str | None) -> bytes:
    body = ET.tostring(doc_root, encoding="unicode")
    if original_open_tag:
        # Swap ElementTree's reconstructed root tag for the original verbatim one
        # (preserves namespace order + mc:Ignorable that ET would otherwise drop).
        body = re.sub(r"<w:document\b[^>]*>", lambda _: original_open_tag, body, count=1)
    return (_XML_DECL + body).encode("utf-8")


def _apply_pairs_to_root(doc_root: ET.Element, pairs: list[dict]) -> tuple[int, list[str]]:
    """Apply [{find/original, replace/revised}] to the parsed document tree.

    Strategy: prefer replacing inside a single <w:t> run (preserves that run's
    formatting exactly). Fall back to paragraph-level join/redistribute only when
    the match spans multiple runs.
    """
    applied = 0
    misses: list[str] = []
    norm = []
    for p in pairs:
        find = (p.get("find") or p.get("original") or "").strip()
        replace = p.get("replace") if "replace" in p else p.get("revised", "")
        if find:
            norm.append((find, replace or ""))

    paragraphs = list(doc_root.iter(WP))
    for find, replace in norm:
        hit = False
        for para in paragraphs:
            tnodes = [t for t in para.iter(WT)]
            if not tnodes:
                continue
            # 1) single-run replacement (formatting preserved)
            for t in tnodes:
                if t.text and find in t.text:
                    t.text = split_safe_text(t.text.replace(find, replace))
                    applied += 1
                    hit = True
                    break
            if hit:
                break
            # 2) multi-run: rebuild from concatenated paragraph text
            concat = "".join(t.text or "" for t in tnodes)
            if find in concat:
                new_text = concat.replace(find, replace)
                tnodes[0].text = split_safe_text(new_text)
                for t in tnodes[1:]:
                    t.text = ""
                applied += 1
                hit = True
                break
        if not hit:
            misses.append(find[:60])
    return applied, misses


def apply_replacements(docx_bytes: bytes, pairs: list[dict]) -> tuple[bytes, int, list[str]]:
    """Format-preserving find/replace on a DOCX.

    Returns (new_docx_bytes, applied_count, unmatched_finds). Every part of the
    package other than word/document.xml is copied byte-for-byte.
    """
    in_buf = io.BytesIO(docx_bytes)
    with zipfile.ZipFile(in_buf, "r") as zin:
        names = zin.namelist()
        document_xml = zin.read("word/document.xml")
        parts = {name: zin.read(name) for name in names}
        infos = {name: zin.getinfo(name) for name in names}

    doc_root = ET.fromstring(document_xml)
    applied, misses = _apply_pairs_to_root(doc_root, pairs)
    parts["word/document.xml"] = _serialize_document(doc_root, _original_root_tag(document_xml))

    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name in names:
            zout.writestr(infos[name], parts[name])
    return out_buf.getvalue(), applied, misses


# ---------------------------------------------------------------------------
# Optional furniture stripping
# ---------------------------------------------------------------------------
def strip_docx_furniture(
    docx_bytes: bytes,
    *,
    keep_header_footer: bool = False,
    keep_line_numbers: bool = False,
) -> bytes:
    """Remove page furniture that's usually noise on export.

    Edits word/document.xml in place:
      - drops <w:headerReference/> and <w:footerReference/> from the section
        properties, so Word renders no headers/footers (the header*/footer*.xml
        parts are left in the package but become unreferenced, which Word
        tolerates);
      - drops <w:lnNumType/> so margin line numbering disappears.

    If both keep_* flags are True there's nothing to strip and the input is
    returned unchanged.
    """
    if keep_header_footer and keep_line_numbers:
        return docx_bytes

    in_buf = io.BytesIO(docx_bytes)
    out_buf = io.BytesIO()
    with zipfile.ZipFile(in_buf, "r") as zin, zipfile.ZipFile(
        out_buf, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "word/document.xml":
                if not keep_header_footer:
                    data = _RE_HEADER_REF.sub(b"", data)
                    data = _RE_FOOTER_REF.sub(b"", data)
                if not keep_line_numbers:
                    data = _RE_LNUM.sub(b"", data)
            zout.writestr(info, data)
    return out_buf.getvalue()


__all__ = [
    "split_safe_text",
    "get_fitz",
    "read_docx",
    "apply_replacements",
    "strip_docx_furniture",
]
