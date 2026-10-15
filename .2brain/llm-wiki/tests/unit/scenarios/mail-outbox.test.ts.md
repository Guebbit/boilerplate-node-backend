---
source: tests/unit/scenarios/mail-outbox.test.ts
sha256: 8cc5ecc07709371ced3e378781b4bf693a5d07c3d036bf2e20a8f7b0a051dfc2
generated_at: 2026-10-15T13:24:12.522541+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/mail-outbox.test.ts

## Purpose

Unit tests for the demo outbox mail transport (`scenarios/support/doubles/mail-outbox.ts`). They verify the recording/replay semantics that the paired frontend's password-reset and verification suites depend on, particularly token extraction from template link URLs. A regression here surfaces as an "empty inbox" failure in another repo.

## Key elements

- **`afterEach → clearDemoOutbox()`** — resets the in-memory outbox between tests.
- **`it('records newest first…')`** — confirms FIFO→LIFO ordering and that primitive template variables are rendered as `"key: value"` lines on the recorded message.
- **`it('lifts the token out of a link URL…')`** — asserts that a `#token=<hex>` fragment in `linkUrl` is extracted into a top-level `token` field when no bare `token` variable is present.
- **`it('prefers a bare token variable over the link')`** — guards the precedence rule: explicit `token` var wins over the URL fragment.
- **`it('finds the token when the link carries other query parameters…')`** — ensures extraction works even when `?ref=…` precedes the `#token=` fragment.
- **`it('records no token for a link that carries none…')`** — confirms `token` is `undefined` for links without a `#token=` fragment (e.g. order-confirmation).
- **`it('clears to an empty inbox…')`** — verifies `clearDemoOutbox` resets to `[]`.
- **`it('records an attachment by filename only…')`** — asserts attachments are stored as a flat string array of filenames, never raw bytes.
- **`it('omits attachments entirely…')`** — confirms the `attachments` key is absent (not an empty array) when none were sent.

## Relationships

- **Imports** `clearDemoOutbox`, `readDemoOutbox`, `recordDemoEmail` from `scenarios/support/doubles/mail-outbox.ts` — the module under test. All assertions exercise the behavior of those three functions.
- **Consumed by** the paired frontend's password-reset and email-verification specs (in a separate repo), which read `token` and `lines` from the recorded outbox to drive UI flows.

## Notes

- The outbox is a **demo-profile** sink, not a real SMTP transport; tests here are pure in-memory assertions with no network or file I/O.
- Token extraction priority is a **behavioral contract**: bare `token` variable > `#token=` fragment in `linkUrl`. Reordering this would silently break frontend suites that pass their own token var.
- `attachments` is deliberately `undefined` (not `[]`) when absent — frontend code may check for key presence rather than array length.
- The `key` field on attachment objects (e.g. `'abc123.pdf'`) is internal storage metadata; only `filename` is exposed to consumers.
