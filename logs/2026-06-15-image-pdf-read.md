# Test log — image-based PDF read failure

**Date:** 2026-06-15
**Tester:** Baris
**Build:** DocFlow initial (Fireworks qwen3p7-plus, open-XML document_io merged)

## What was tested
Asked DocFlow to translate a real document into English + Turkish:
`Rentenversicherungsverlauf_05-2024_BarisCanKuru.pdf` (German pension insurance
statement, 5 pages, 958 KB, **scanned / image-based, no text layer**).

## What happened
The agent behaved sensibly but hit a capability gap:

1. `list_documents` → found the PDF. ✅
2. `read_document` → returned little/no text (image-only PDF, PyMuPDF text layer empty). 
3. `extract_tables_from_pdf` → nothing (Docling not installed; no text layer anyway).
4. `detect_section_pages` → empty previews (text-based detection, image PDF).
5. **Improvised:** called `extract_revisions_batch` then `extract_revisions_from_page`
   on all 5 pages — clever, but that tool is built for *diffs/revisions*, so it
   returned `0 revisions` and produced nothing useful.
6. Gave up with a message claiming "the OCR tool needed to read image-based PDFs
   isn't available in this environment."

## Root cause
There is **no direct vision/OCR reading tool**. The only vision-capable tool was
`extract_revisions_from_page`, framed around revisions, so the agent had nothing
to point at "just read the text out of this scanned page." qwen3p7-plus *is*
multimodal, so the capability exists — it just wasn't exposed as a tool.

## Fix (implemented 2026-06-15)
Added three vision tools (qwen3p7-plus, works on image-based PDFs **and** image
files png/jpg/webp/tiff):

1. **`read_document_vision(filename, pages?)`** — renders each page to an image,
   transcribes text into Markdown **preserving tables, headings and emphasis**
   as seen in the image, runs pages in parallel with live progress. Each page is
   tagged with metadata: `title/topic`, `language`, `has_tables`,
   `has_handwriting`, `has_figures` — surfaced inline for further processing.
2. **`describe_pages(filename, pages?)`** — fast metadata-only triage (no full
   transcription): per-page tags so the agent can route work (which pages have
   tables / handwriting / what each page is about).
3. **`ocr_page(filename, page_number)`** — simple verbatim text dump of one page,
   no formatting, to cross-check / confirm what the structured read produced.

Supporting changes:
- `read_document` now detects an image-based PDF (near-empty text layer) and
  tells the agent to use `read_document_vision` instead of failing.
- System prompt updated: scanned/image PDF workflow → vision read, then translate.

## Layout-preserving rebuild (added 2026-06-15, same day)
Built the structured-JSON document-model pipeline so scanned docs can be rebuilt
(and translated) into formatted DOCX:

- `read_document_structured(filename, pages?)` → JSON block tree (heading /
  paragraph+runs / list / table / key_value / image), reading order preserved,
  text verbatim. Parallel per page.
- `translate_structure(json, target_language)` → same JSON, text translated in
  place (per-page LLM call), numbers/dates/codes kept.
- `render_structure_to_docx(json, output)` → deterministic python-docx render
  (no LLM) in `docflow/reconstruct.py`.
- `reconstruct_document(filename, output, translate_to?, pages?)` → one-shot
  read→(translate)→render.

Bug found & fixed during this: `_extract_json` preferred `[...]` over `{...}`,
so it grabbed the inner `blocks` array out of the fenced page object → empty
render. Now tries a whole-string `json.loads` first, then object-before-array
fallback.

Verified: page 1 of the pension PDF → English DOCX with headings, the form
fields as a key/value table, the contributions table, and codes (24 261195 K
044) left unchanged.

Schema carries an optional `bbox` for future figure-cropping / geometry; DOCX is
flow-based so exact positioning isn't reproduced (would target HTML/PDF later).

## Multi-format render + figure cropping (added 2026-06-15)
- `docflow/reconstruct.py` now renders the same structured JSON to **DOCX, HTML
  and PDF** (reportlab). `render_structure` (and `reconstruct_document`) pick the
  format from the output filename extension.
- **Figure cropping:** structured-read prompt now asks for `bbox` on image
  blocks; `read_document_structured` crops those regions from the source
  (PyMuPDF clip for PDFs, Pillow for images), saves them as `<stem>_p<n>_imgN.png`
  in the docs folder, and sets `block["src"]`. All three renderers embed `src`
  when present, else a captioned placeholder.
- Verified: one structured JSON → docx (2 tables + 1 inline image) / html (img +
  table) / pdf, all valid.
- New deps: reportlab, pillow.

## Rate-limit (429) handling (added 2026-06-15)
Test: "rebuild + translate into English and Turkish" on the 5-page scanned PDF
fired ~5 parallel vision calls + translation and hit Fireworks 429, which killed
the whole stream (no partial result). Fix:
- Global concurrency gate: `_LLM_SEMAPHORE` (env `DOCFLOW_LLM_CONCURRENCY`,
  default 2) wraps every model call so parallel page/translation work never
  bursts past N concurrent requests.
- `_invoke(llm, messages)` central wrapper: bounded exponential backoff + jitter
  on retryable errors (429/500/502/503/504, timeouts, connection) up to
  `DOCFLOW_LLM_MAX_RETRIES` (default 6). All `llm.invoke` calls routed through it;
  `ChatOpenAI(max_retries=...)` also set for the streaming agent loop.
- Per-page resilience: structured/vision/describe batch loops now catch a failed
  page, record a placeholder/error for that page, and continue (partial output
  instead of total failure).
Tunable via env: DOCFLOW_LLM_CONCURRENCY, DOCFLOW_LLM_MAX_RETRIES,
DOCFLOW_LLM_BACKOFF_BASE, DOCFLOW_LLM_BACKOFF_CAP.

## Untranslated output named "_EN" (2026-06-16)
Test: user asked to translate a scanned recipe card; got `IMG_8603_EN.docx` that
was still **German**. Diagnosis: the rebuild had 2 embedded images, but the
translate path (`_remove_image_blocks`) strips crops -> so `translate_to` was
never set. Root cause = **agent routing**: it reconstructed the doc faithfully
and just named it `_EN` without translating. Translation code itself was fine.

Fix (defense-in-depth):
- `_filename_language_hint(name)`: infers a target language from a trailing
  filename token (`_en`, `_turkish`, `-de`, ...). No false positive on `_v2`.
- `reconstruct_document`: when `translate_to` is empty but the output name hints
  a language, **infer it and translate** (notes "inferred from filename"). The
  success message now always states the translation status explicitly.
- `render_structure`: appends a ⚠️ warning when the output name hints a language
  (since render never translates) telling the agent to translate first.
- System prompt rule 1c: "TRANSLATION IS NOT AUTOMATIC... never give an output a
  language-suffixed name unless you actually translated it."

## Follow-ups / ideas
- Optional real OCR engine (Tesseract/pytesseract) as a non-LLM confirm backend.
- Cache vision transcriptions per (file, page) to avoid re-billing.
- Geometry-accurate HTML/PDF using bbox positions (absolute layout), not just
  flow order.
- Two-pass extraction (layout map -> per-region OCR) for dense/multi-column pages.
