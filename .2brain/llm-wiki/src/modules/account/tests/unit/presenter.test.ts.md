---
source: src/modules/account/tests/unit/presenter.test.ts
sha256: f68c9fdc1bf7cdb624920935c5c93d2002c3553ddb5ce3f6e4850db363b391dc
generated_at: 2026-11-08T04:48:33.355399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/presenter.test.ts

## Purpose

Unit tests for the three presenter functions in the account module (`presentSession`, `presentExportSession`, `presentExport`). Verifies that each maps a stored row into the correct wire shape, omits fields that are absent, and never leaks the credential digest into the output.

## Key elements

- **`row`** — a shared `SessionRow` fixture that deliberately carries `tokenHash: 'a-credential-digest'` so every test can assert it does not appear in the wire result.
- **`describe('presentSession')`** — two tests: (1) full field mapping with `current: true`; (2) that `undefined` fields (`lastUsedAt`, `device`) are absent from the output and the credential string never appears (checked via `JSON.stringify`).
- **`describe('presentExportSession')`** — one test: expiration comes from the row's own `expiresAt` (not a caller-supplied date) and the output has no `current` property.
- **`describe('presentExport')`** — uses a separate `exportRow` fixture (`_id`, `createdAt`, `expiresAt`). Three tests covering status-dependent behavior:
  - `expiresAt` is present only when status is `'ready'`.
  - `actions.download` is `true` only when `'ready'`; `actions.request` is `false` only when `'building'`.
  - The full `toEqual` shape for the `'building'` status.

## Relationships

- **`src/modules/account/presenter.ts`** — source under test; this file imports `presentSession`, `presentExportSession`, and `presentExport` and asserts on their return values.
- **`src/modules/account/repository.ts`** — provides the `SessionRow` type used to shape the main fixture; defines the "in" side of the mapping the presenter consumes.

## Notes

- The credential-leak check is intentionally done with `JSON.stringify(wire).not.toContain('a-credential-digest')` rather than a named-property assertion, guarding against the digest appearing under any key.
- `presentExport` receives a *different* input shape (plain `_id`/`createdAt`/`expiresAt`) than `SessionRow`; the `exportRow` fixture is not typed as `SessionRow`.
- The `'ready'` vs `'building'` vs `'failed'` status string is passed at call time — the presenter does not read status from the row itself.
