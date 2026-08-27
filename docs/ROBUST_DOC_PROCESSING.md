# Robust Document Processing — Techniques & Code

A field guide to the mechanisms that make LLM-driven document processing reliable.
Each section is independent: the **Problem**, the **failure it prevents**, the
**code**, and **how to reuse it**. Code is Python; stack is FastAPI + LangGraph +
an OpenAI-compatible multimodal model + python-docx / PyMuPDF / reportlab.

---

## 1. XML-safe text before writing DOCX

**Problem.** DOCX is zipped XML. If you write a control character that's illegal
in XML 1.0 (e.g. `\x00`–`\x08`, `\x0b`, `\x0c`, `\x1f`) into a `<w:t>` node, Word
opens the file with **"unreadable content — recover?"** or refuses it outright.
LLM output and OCR text routinely contain these.

**Prevents.** Corrupt/unopenable Word files from generated or translated text.

```python
def _is_valid_xml_char(ch: str) -> bool:
    """True if ch is a legal XML 1.0 character."""
    cp = ord(ch)
    return (
        cp in (0x9, 0xA, 0xD)          # tab, LF, CR
        or 0x20 <= cp <= 0xD7FF
        or 0xE000 <= cp <= 0xFFFD
        or 0x10000 <= cp <= 0x10FFFF
    )

def split_safe_text(text: str) -> str:
    if text is None:
        return ""
    return "".join(ch for ch in text if _is_valid_xml_char(ch))
```

**Reuse.** Call `split_safe_text()` on **every** string before it enters a docx
(paragraph text, run text, table cells, titles). Cheap, idempotent, no deps.

---

## 2. Format-preserving DOCX edits (open-XML, not python-docx)

**Problem.** python-docx rewrites the **entire** package when you save, and the
naive "clear runs, dump text into run[0]" edit **flattens all formatting** on the
changed paragraph (bold/fonts/spacing lost). For find/replace and applying
revisions you want the document to come out **identical except for the changed
text**.

**Prevents.** Silent loss of styles/fonts/images/numbering; corrupted packages
from re-serialization.

**Core idea.** Open the `.docx` zip, edit only the text inside `<w:t>` nodes of
`word/document.xml`, and copy **every other zip entry byte-for-byte**. Two
subtleties make it actually work:

1. **Preserve the root element verbatim.** ElementTree drops the
   `mc:Ignorable` attribute and reorders namespace decls on `<w:document>`, which
   Word flags as corrupt. Capture the original opening tag and splice it back.
2. **Write Word's exact XML declaration.** ET's default (`'utf-8'`, no
   `standalone`) makes Word complain; emit the canonical one manually.

```python
import io, re, zipfile
import xml.etree.ElementTree as ET

W  = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WT = f"{{{W}}}t"
WP = f"{{{W}}}p"
_XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
# register w:, r:, mc:, etc. so ET serializes with correct prefixes (not ns0:)

def _original_root_tag(document_xml: bytes) -> str | None:
    m = re.search(rb"<w:document\b[^>]*>", document_xml)
    return m.group(0).decode("utf-8") if m else None

def _serialize_document(doc_root, original_open_tag):
    body = ET.tostring(doc_root, encoding="unicode")
    if original_open_tag:                       # restore namespaces + mc:Ignorable
        body = re.sub(r"<w:document\b[^>]*>", lambda _: original_open_tag, body, count=1)
    return (_XML_DECL + body).encode("utf-8")

def _apply_pairs_to_root(doc_root, pairs):
    """Prefer single-<w:t> replacement (formatting preserved); fall back to
    paragraph-level join only when the match spans multiple runs."""
    applied, misses, norm = 0, [], []
    for p in pairs:
        find = (p.get("find") or p.get("original") or "").strip()
        replace = p.get("replace") if "replace" in p else p.get("revised", "")
        if find:
            norm.append((find, replace or ""))
    paragraphs = list(doc_root.iter(WP))
    for find, replace in norm:
        hit = False
        for para in paragraphs:
            tnodes = list(para.iter(WT))
            if not tnodes:
                continue
            for t in tnodes:                         # 1) single run — lossless
                if t.text and find in t.text:
                    t.text = split_safe_text(t.text.replace(find, replace))
                    applied += 1; hit = True; break
            if hit:
                break
            concat = "".join(t.text or "" for t in tnodes)   # 2) multi-run fallback
            if find in concat:
                tnodes[0].text = split_safe_text(concat.replace(find, replace))
                for t in tnodes[1:]:
                    t.text = ""
                applied += 1; hit = True; break
        if not hit:
            misses.append(find[:60])
    return applied, misses

def apply_replacements(docx_bytes, pairs):
    """Returns (new_docx_bytes, applied_count, unmatched_finds).
    Every part other than word/document.xml is copied byte-for-byte."""
    with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as zin:
        names = zin.namelist()
        document_xml = zin.read("word/document.xml")
        parts = {n: zin.read(n) for n in names}
        infos = {n: zin.getinfo(n) for n in names}
    doc_root = ET.fromstring(document_xml)
    applied, misses = _apply_pairs_to_root(doc_root, pairs)
    parts["word/document.xml"] = _serialize_document(doc_root, _original_root_tag(document_xml))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(infos[n], parts[n])
    return out.getvalue(), applied, misses
```

**Reuse.** Use this for find/replace and "apply revisions/amendments." Verify it
with: edit one phrase, then assert only `word/document.xml` differs between input
and output zips (this is the regression test that proves formatting survives).
Use python-docx instead only when **generating a brand-new** file from scratch.

---

## 3. Defensive JSON extraction from LLM output

**Problem.** When you ask a model for JSON you get: code fences (` ```json `),
reasoning prose around it (reasoning models emit a "thinking" preamble), or a
trailing comment. Naive `json.loads()` fails; naive "grab first `[` to last `]`"
**slices the inner array out of an enclosing object** and silently returns the
wrong shape.

**Prevents.** Empty/garbled structured reads; crashes on tool output.

```python
import json

def _extract_json(text: str):
    text = (text or "").strip()
    if text.startswith("```"):                       # strip code fences
        text = "\n".join(text.splitlines()[1:])
        if "```" in text:
            text = text[: text.rfind("```")]
    text = text.strip()
    try:                                             # clean whole-string parse first
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fallback: outermost OBJECT first, then array — order matters so we don't
    # grab an inner [...] out of a {...,"blocks":[...]} payload.
    for opener, closer in (("{", "}"), ("[", "]")):
        s, e = text.find(opener), text.rfind(closer)
        if s != -1 and e != -1 and e > s:
            try:
                return json.loads(text[s : e + 1])
            except json.JSONDecodeError:
                continue
    return None
```

**Reuse.** Route *all* "model returns JSON" through this. The object-before-array
ordering is the non-obvious bug-fixer — without it, structured page reads come
back empty.

---

## 4. LLM resilience: concurrency gate + exponential backoff

**Problem.** Document jobs fan out many model calls (one per page, per language).
A burst trips provider **429 rate limits**, and in a naive setup a single 429
inside a parallel task **kills the whole job**, discarding pages that already
succeeded.

**Prevents.** Rate-limit cascades; total job failure from one transient error.

```python
import os, time, random, threading

_LLM_CONCURRENCY = int(os.getenv("LLM_CONCURRENCY", "2"))
_LLM_SEMAPHORE   = threading.Semaphore(max(1, _LLM_CONCURRENCY))   # global cap
_LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "6"))
_LLM_BACKOFF_BASE = float(os.getenv("LLM_BACKOFF_BASE", "2.0"))
_LLM_BACKOFF_CAP  = float(os.getenv("LLM_BACKOFF_CAP", "30.0"))
_RETRYABLE_HINTS = ("rate limit", "429", "timeout", "overloaded", "503", "502", "temporarily")

def _is_retryable(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    if status in (429, 500, 502, 503, 504):
        return True
    name = type(exc).__name__.lower()
    if any(k in name for k in ("ratelimit", "timeout", "connection", "serviceunavailable")):
        return True
    return any(h in str(exc).lower() for h in _RETRYABLE_HINTS)

def _invoke(llm, messages):
    """Invoke with a global concurrency gate + jittered exponential backoff."""
    for attempt in range(_LLM_MAX_RETRIES):
        try:
            with _LLM_SEMAPHORE:                 # cap concurrent calls across ALL threads
                return llm.invoke(messages)
        except Exception as exc:
            if attempt >= _LLM_MAX_RETRIES - 1 or not _is_retryable(exc):
                raise
            delay = min(_LLM_BACKOFF_CAP, _LLM_BACKOFF_BASE * (2 ** attempt)) + random.uniform(0, 1)
            time.sleep(delay)                    # sleep OUTSIDE the semaphore
```

**Key details.** The semaphore is **module-global** so it caps concurrency across
every parallel worker, not per-call. The backoff `sleep` happens *after* the
`with` block releases the semaphore, so a backing-off task doesn't hold a slot.
Route **every** model call through `_invoke`.

---

## 5. Per-item batch resilience (partial results beat total failure)

**Problem.** Parallel page processing: if one page raises (model error, bad
image), `future.result()` re-raises and you lose the whole document.

**Prevents.** One bad page nuking an otherwise-successful multi-page job.

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def read_pages(path, page_list, read_one):
    results = {}
    with ThreadPoolExecutor(max_workers=min(4, len(page_list))) as ex:
        futures = {ex.submit(read_one, path, p): p for p in page_list}
        for fut in as_completed(futures):
            p = futures[fut]                     # know WHICH page this future was
            try:
                r = fut.result()
            except Exception as exc:             # record a placeholder, keep going
                r = {"page": p, "blocks": [
                    {"type": "paragraph",
                     "runs": [{"text": f"[Page {p} could not be read: {exc}]"}]}]}
            results[r["page"]] = r
    return {"pages": [results[p] for p in sorted(results)]}
```

**Reuse.** Map `future -> item` (not the other way) so a failure is attributable.
Emit a typed placeholder so downstream rendering still works and the user sees
exactly which page to re-run. Combine with §4: the semaphore + backoff means
failures here are rare; this is the last line of defense.

---

## 6. Graceful degradation: dependency guards + optional heavy engines

**Problem.** Heavy/optional deps (Docling for layout+OCR, PyMuPDF, Tesseract)
may be absent. Hard imports at module top crash the whole app; cryptic
`ImportError` deep in a call is worse.

**Prevents.** App won't start without optional deps; unhelpful errors.

```python
# (a) Clear, actionable errors for required-but-maybe-missing deps:
def get_fitz():
    try:
        import fitz                              # PyMuPDF
        return fitz
    except ImportError as exc:
        raise RuntimeError("Missing dependency 'PyMuPDF' (fitz). Install it.") from exc

# (b) Lazy singleton for an OPTIONAL heavy engine, with silent fallback:
_CONVERTER = None
def _get_converter():
    global _CONVERTER
    if _CONVERTER is None:
        try:
            from docling.document_converter import DocumentConverter  # heavy/optional
            _CONVERTER = DocumentConverter(...)
        except ImportError:
            _CONVERTER = None                     # absence is allowed
    return _CONVERTER

def read_to_text(path):
    conv = _get_converter()
    if conv is None:
        return _read_with_pymupdf(path)           # fall back to a lighter path
    try:
        return conv.convert(str(path)).document.export_to_markdown()
    except Exception:
        return _read_with_pymupdf(path)           # never let best-effort kill the call
```

**Reuse.** Pattern: **lazy-load** optional engines on first use (faster startup,
lower memory), treat `ImportError` as "feature off, use fallback," and wrap the
best-effort path in `try/except` so it degrades instead of throwing.

---

## 7. Reading scanned/image PDFs — render + crop robustly

**Problem.** Image-only PDFs have no text layer; you must rasterize pages and
send them to a vision model. Bounding boxes from a model are unreliable (out of
range, inverted).

**Prevents.** Crashes on degenerate bboxes; wrong MIME; whole-page failures.

```python
import base64, io

def _page_image(path, page_number):              # PDF page -> PNG bytes; images pass through
    ext = path.suffix.lower()
    if ext == ".pdf":
        import fitz
        doc = fitz.open(str(path))
        try:
            pix = doc[page_number - 1].get_pixmap(matrix=fitz.Matrix(150/72, 150/72))
            return pix.tobytes("png"), "image/png"
        finally:
            doc.close()
    mime = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
            ".webp":"image/webp",".tif":"image/tiff",".tiff":"image/tiff"}.get(ext, "image/png")
    return path.read_bytes(), mime

def _crop_page_region(path, page_number, bbox, dpi=150):
    """Crop a normalized [x0,y0,x1,y1] (0-1, top-left origin). Returns PNG or None."""
    try:
        x0, y0, x1, y1 = (float(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    x0, y0 = max(0.0, min(x0, 1.0)), max(0.0, min(y0, 1.0))   # clamp
    x1, y1 = max(0.0, min(x1, 1.0)), max(0.0, min(y1, 1.0))
    if x1 <= x0 or y1 <= y0:                                  # reject degenerate
        return None
    if path.suffix.lower() == ".pdf":
        import fitz
        doc = fitz.open(str(path))
        try:
            r = doc[page_number - 1].rect
            clip = fitz.Rect(r.x0 + x0*r.width, r.y0 + y0*r.height,
                             r.x0 + x1*r.width, r.y0 + y1*r.height)
            return doc[page_number - 1].get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72), clip=clip).tobytes("png")
        finally:
            doc.close()
    try:
        from PIL import Image
        with Image.open(str(path)) as im:
            w, h = im.size
            crop = im.crop((int(x0*w), int(y0*h), int(x1*w), int(y1*h)))
            buf = io.BytesIO(); crop.convert("RGB").save(buf, "PNG"); return buf.getvalue()
    except Exception:
        return None

def _data_url(data, mime):
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")
```

**Reuse.** Always **clamp** normalized coords and **reject** degenerate boxes
(return `None`, render a caption placeholder). Pick MIME by extension. Send the
image to the model as a `data:` URL content block.

---

## 8. Provider & model quirks (the ones that cost hours)

- **Non-standard sampling params on OpenAI-compatible endpoints.** Fireworks
  accepts `top_k`, but the OpenAI client rejects unknown top-level kwargs — pass
  them via `extra_body`, not as direct params:
  ```python
  ChatOpenAI(model=..., base_url=..., api_key=...,
             max_retries=6, extra_body={"top_k": 40}, temperature=0.6, max_tokens=4000)
  ```
- **Reasoning models leak "thinking."** They may emit a visible reasoning preamble
  before/around the answer. Always parse defensively (§3) and, for extraction,
  use `temperature=0` and a large `max_tokens` (dense pages need ~8000).
- **Routing:** when plain text extraction returns near-empty for a PDF (no text
  layer), **fall through to the vision reader** instead of failing. A length
  threshold on the extracted text is enough to detect it.

---

## 9. Safe file serving & links (small things that break UX)

- **Path-traversal guard** when resolving a user/model-supplied filename:
  ```python
  def _resolve(docs_dir, filename):
      p = (docs_dir / filename).resolve()
      if docs_dir.resolve() not in p.parents and p != docs_dir.resolve():
          raise ValueError(f"Path outside docs folder: {filename}")
      return p
  ```
- **Absolute download URLs.** Build links from the request base URL
  (`http://host/files/name`), not bare `/files/...`, or clients render them as
  broken relative paths. Plumb a `files_url_prefix` from the request down to
  wherever links are generated.

---

## 10. Silent semantic failures (output looks right but is wrong)

**Problem.** The most dangerous failures aren't crashes — they're operations that
*succeed* and return a plausible file with **wrong content**: a "translated" doc
that's still in the source language, a "redacted" file that isn't, an "applied
revisions" doc where nothing matched. The pipeline reports success, the user
trusts it, and the error ships. Real case: a scanned doc was reconstructed
faithfully and saved as `..._EN.docx`, but translation was never invoked — the
file was perfect German with an English name.

**Prevents.** Confidently-wrong deliverables; loss of user trust; bugs that pass
every "did it run?" check.

**Three defenses, in increasing strength:**

### (a) Intent tripwire from the request/filename
A language-suffixed output name almost always encodes intent. Detect it and
either auto-correct or warn — never ship a mismatch silently.

```python
import re
from pathlib import Path

_LANG_HINTS = {
    "en": "English", "english": "English",
    "de": "German", "deutsch": "German",
    "tr": "Turkish", "turkish": "Turkish",
    "fr": "French", "es": "Spanish", "it": "Italian",
    # ...extend as needed
}

def filename_language_hint(name: str) -> str | None:
    """Infer a target language from a trailing token like '..._EN' / '..._turkish'."""
    tokens = [t for t in re.split(r"[ _\-.()]+", Path(name).stem.lower()) if t]
    for tok in reversed(tokens):           # check the LAST token first
        if tok in _LANG_HINTS:
            return _LANG_HINTS[tok]
    return None

# In the one-shot tool: if no target was passed but the name implies one, honor it.
if not translate_to and (hint := filename_language_hint(output_filename)):
    translate_to = hint                    # auto-correct the forgotten intent
```
Guard against false positives by only matching whole tokens against a known map
(so `report_v2.docx` → `None`, not "Venetian").

### (b) Always state what you did
Never return a bare "Saved file.x". State the semantic outcome so a wrong path is
visible in the response itself.

```python
if inferred:
    note = f" (translated into {inferred}, inferred from the filename)"
elif translate_to:
    note = f" (translated into {translate_to})"
else:
    note = " (no translation — content kept in the source language)"
return f"Rebuilt {n} page(s){note}. Saved {link}."
```
For an agent, this is also a self-correction signal: it sees "no translation" and
can retry. For a human, it's an audit line.

### (c) Verify the post-condition (strongest — no heuristics)
Check that the operation actually changed what it claimed to. A translation that
leaves nearly every substantive string identical is a no-op, regardless of names.

```python
def looks_like_noop_translation(src_texts, out_texts, *, min_strings=5, ratio=0.95):
    """True if a 'translation' left ~everything unchanged."""
    substantive = [s for s in src_texts
                   if len(s.strip()) > 3 and any(c.isalpha() for c in s)]
    if len(substantive) < min_strings:
        return False                       # too little signal to judge
    unchanged = sum(
        1 for s, t in zip(src_texts, out_texts)
        if len(s.strip()) > 3 and any(c.isalpha() for c in s)
        and s.strip() == (t or "").strip()
    )
    return unchanged >= ratio * len(substantive)

# After translating:
if looks_like_noop_translation(src_texts, translated_texts):
    emit_progress("⚠️ translation looks like a no-op — verify source/target language.")
```
The threshold matters: legitimate translation *keeps* numbers, codes, and proper
nouns unchanged, so the test must be "≈all substantive strings unchanged," not
"any unchanged." Generalize the idea to other ops:
- **apply_changes / revisions:** if `applied_count == 0`, that's a failure to
  report, not a success ("0 of N replacements matched").
- **redaction/cleanup:** assert the target tokens are *absent* from the output.
- **extraction:** assert non-empty / expected field count.

**Reuse.** Pick the strongest defense you can afford: (c) > (b) > (a). At minimum
do (b) everywhere — it's free and turns silent failures into visible ones. Treat
"the operation ran without raising" as **necessary but not sufficient**; every
transform should be able to answer "did it actually do the thing?"

---

## Reliability checklist (porting to a new project)

- [ ] All docx-bound text goes through `split_safe_text` (§1)
- [ ] Edits use open-XML byte-preserving replace; new files use python-docx (§2)
- [ ] Regression test: edit one phrase → only `word/document.xml` changes (§2)
- [ ] All model JSON parsed via `_extract_json`, object-before-array (§3)
- [ ] Every model call wrapped in `_invoke` with global semaphore + backoff (§4)
- [ ] Parallel loops map `future -> item` and record placeholders on failure (§5)
- [ ] Optional engines lazy-loaded with fallback; required deps guarded (§6)
- [ ] bboxes clamped + degenerate-rejected; MIME by extension (§7)
- [ ] `extra_body` for non-standard params; defensive parse for reasoning models (§8)
- [ ] Path-traversal guard + absolute file URLs (§9)
- [ ] Every transform states what it did + verifies its post-condition (§10)
