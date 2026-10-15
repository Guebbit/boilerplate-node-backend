---
source: tests/unit/infrastructure/http/read-capped-body.test.ts
sha256: ec8ac1729f5eb67274686ef5ab8f08b226a77d51f43c02c659884f54a7f56335
generated_at: 2026-10-15T13:15:16.184267+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/read-capped-body.test.ts

## Purpose

Unit tests for `readCappedText` and `readCappedJson`, verifying that HTTP response bodies are read whole when under a byte cap, refused (with stream cancellation) when they exceed it, and that type mismatches (e.g. non-JSON fed to the JSON reader) surface as errors rather than silent empty results.

## Key elements

- **`chunked(...chunks)`** — local helper that builds a `Response` whose `ReadableStream` uses `start` to enqueue each string chunk (encoded via `TextEncoder`) immediately, then closes. Used for simple under/over-cap cases.
- **`describe('readCappedText')`** — six cases: multi-chunk body under cap, body exactly at cap, body one byte over cap, cross-chunk overflow (asserts the stream is cancelled, not drained, by counting `pull` invocations < 10), multi-byte byte-counting (Japanese chars: 3 chars / 9 bytes), and a 204 bodiless response reading as `''`.
- **`describe('readCappedJson')`** — three cases: successful parse under cap, refusal before parse when over cap, and rejection of a non-JSON body.

## Relationships

- **`src/infrastructure/http/read-capped-body.ts`** — the module under test; this file imports `readCappedText` and `readCappedJson` from it via the `@infrastructure/http/read-capped-body` alias.

## Notes

- The cross-chunk overflow test deliberately switches from the `start`-based `chunked` helper to a `pull`-based stream that would enqueue >50 chunks if read unboundedly. The assertion `pulled < 10` is the primary guard that the implementation cancels the stream at the cap rather than draining it.
- Byte-counting is verified with a 3-character / 9-byte Japanese string: cap of 8 must reject, cap of 9 must accept. This pins the contract to UTF-8 byte length, not character count.
- `readCappedJson` is expected to reject on size *before* attempting `JSON.parse`, so a size-violation test uses a body that would be valid JSON if it fit.
