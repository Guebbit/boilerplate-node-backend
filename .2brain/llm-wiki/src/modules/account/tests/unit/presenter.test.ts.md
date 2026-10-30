---
source: src/modules/account/tests/unit/presenter.test.ts
sha256: f68c9fdc1bf7cdb624920935c5c93d2002c3553ddb5ce3f6e4850db363b391dc
generated_at: 2026-10-29T03:05:01.181634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/presenter.test.ts

## Purpose

Unit tests for the account presenter's three mapping functions (`presentSession`, `presentExportSession`, `presentExport`). The tests verify that stored repository rows are correctly shaped into wire responses and that the credential digest (`tokenHash`) never leaks into any output.

## Key elements

- **`row`** – shared fixture cast to `SessionRow`; includes a `tokenHash` (`'a-credential-digest'`) specifically so tests can assert it is absent from results.
- **`describe('presentSession')`** – verifies field mapping (id, dates, device), the `current` flag, omission of `undefined` fields, and credential exclusion via `JSON.stringify`.
- **`describe('presentExportSession')`** – confirms the wire shape uses the row's own `expiresAt` and that `current` is absent (export context has no caller).
- **`describe('presentExport')`** – with its own `exportRow` fixture, checks id/status/createdAt mapping, `expiresAt` appearing only for `'ready'` status, and the `actions` object (`download`/`request` flags) varying by status.

## Relationships

- **`src/modules/account/presenter.ts`** – source of all three functions under test (`presentSession`, `presentExportSession`, `presentExport`).
- **`src/modules/account/repository.ts`** – supplies the `SessionRow` type used for the fixture's cast and shape.

## Notes

- `presentSession` takes a *reference date* and a *boolean* as its second/third arguments; the expected `expiration` in the test is derived from that reference date, not the row's `expiresAt`.
- `presentExport` receives a string status (`'building' | 'ready' | 'failed'`); the `actions` object and the presence of `expiresAt` are both status-dependent.
- The credential-leak assertion uses `JSON.stringify(wire)` rather than a property check, guarding against the digest appearing under any key name.
