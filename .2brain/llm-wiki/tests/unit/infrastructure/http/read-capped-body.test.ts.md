---
source: tests/unit/infrastructure/http/read-capped-body.test.ts
sha256: b299b7228bedd231fd6b093e1360da9aadf457ad8c7751ffe3b2aba04764ba73
generated_at: 2026-11-08T10:17:41.133445+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/read-capped-body.test.ts

## Purpose

Unit tests for the `readCappedText` and `readCappedJson` helpers, verifying that response bodies are read up to a byte cap, refused (with stream cancellation) if they exceed it, and that malformed bodies surface as errors rather than silent empties.

## Key elements

- **`chunked(...chunks)`** – local helper that builds a `Response` whose `ReadableStream` enqueues the given string chunks (each UTF-8 encoded) then closes, simulating a multi-chunk network body.
- **`describe('readCappedText')`** – covers: multi-chunk body under cap, body exactly at cap, one-byte-over refusal, cross-chunk cap crossing with stream *cancellation* (asserts `pull` is called fewer than 10 times instead of 50), multi-byte characters counted by bytes (9 bytes for CJK), and a 204 bodiless response reading as `''`.
- **`describe('readCappedJson')`** – covers: successful parse under cap, refusal over cap *before* parsing, and rejection of a non-JSON body.

## Relationships

- **`src/infrastructure/http/read-capped-body.ts`** – the sole production module under test; provides `readCappedText` and `readCappedJson` imported via the `@infrastructure/http/read-capped-body` alias.

## Notes

- The cancellation test constructs a stream with a `pull`-based controller that would emit 50+ chunks if read unboundedly; it asserts the reader stops well before that, confirming the stream is **canceled** (not drained) when the cap is exceeded.
- Byte-cap semantics are tested explicitly with multi-byte UTF-8 (`日本語` = 3 chars / 9 bytes): the cap is a *byte* limit, not a character limit.
- The `chunked` helper enqueues all chunks synchronously in `start`; the cancellation test deliberately uses `pull` to model a truly lazy stream.
