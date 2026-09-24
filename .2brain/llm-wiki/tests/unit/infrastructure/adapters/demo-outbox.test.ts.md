---
source: tests/unit/infrastructure/adapters/demo-outbox.test.ts
sha256: d0334a524c33f391acff3318799fffe611378eea87718dfdab747a0b1bf07982
generated_at: 2026-09-23T20:16:43.598511+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/demo-outbox.test.ts

## Purpose

Unit tests for the demo profile's email sink (`demo-outbox` adapter). They pin down the recording, ordering, token-extraction, and attachment behaviour that the demo frontend's password-reset and verification specs depend on across repo boundaries.

## Key elements

- **`afterEach` → `clearDemoOutbox()`** — resets the outbox between specs so each test starts from an empty inbox.
- **"records newest first…"** — verifies `readDemoOutbox()` returns entries in reverse-insertion order and that primitive template variables are stored as readable `key: value` lines.
- **"lifts the token out of a link URL"** — confirms `token` is parsed from `?token=…` in `linkUrl` when no bare `token` variable is present.
- **"prefers a bare token variable over the link"** — asserts that an explicit `token` variable wins over the URL-embedded one.
- **"finds the token when the link carries other query parameters"** — ensures extraction works even with surrounding params (`ref`, `utm`).
- **"records no token for a link that carries none"** — guards the order-confirmation template (no token in URL → `token` is `undefined`).
- **"clears to an empty inbox"** — confirms `clearDemoOutbox()` resets state to `[]`.
- **"records an attachment by filename only"** — verifies `attachments` are stored as a string array of `filename` values, never raw bytes or keys.
- **"omits attachments entirely for a send that carried none"** — confirms the field is `undefined` (not `[]`) when no attachments were sent.

## Relationships

- **`src/infrastructure/adapters/demo-outbox.ts`** — the sole import source; this file exercises its three exports (`recordDemoEmail`, `readDemoOutbox`, `clearDemoOutbox`).

## Notes

- The header comment warns that the `token` extraction logic is **load-bearing for another repo**: the paired frontend's reset/verification specs read `token` from this outbox and will fail with an "empty inbox" message if extraction regresses.
- Token priority is strict: bare `token` variable > `?token=` query param > absent.
- Attachments are deliberately reduced to `filename` strings — the adapter never persists byte content.
- The `attachments` field is `undefined` (not an empty array) when none were attached; tests assert this distinction.
