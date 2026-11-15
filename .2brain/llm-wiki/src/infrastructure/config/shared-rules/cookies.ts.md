---
source: src/infrastructure/config/shared-rules/cookies.ts
sha256: 0e9920027ee4478a6c3b4fb14a1eb0f0ac5c38a739548b48af3e491e1b931260
generated_at: 2026-11-14T17:56:58.853058+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/cookies.ts

## Purpose

Defines the Zod schema for `shared/rules/cookies.yaml` — a single inventory format listing every cookie and browser-storage item the app sets, shared between the backend and frontend copies. Validates structure, mutual-exclusion rules, and uniqueness at parse time.

## Key elements

- **`cookieRowSchema`** (private) — Strict Zod object for one row: `name`, `setter` (backend/frontend/library), `kind` (cookie/localStorage/sessionStorage), `purpose`, `necessity` (necessary/preference), `secret`, and mutually-exclusive `maxAgeMs` / `lifetime`.
- **`CookieRow`** (exported type) — `z.infer` of the row schema; the TypeScript shape of a single parsed entry.
- **`rowId`** (private) — Regex (`/^[a-z][A-Za-z0-9]*$/`) enforcing camelCase keys, since the frontend reuses them as translation keys.
- **`cookiesSchema`** (exported) — Strict top-level object: a non-empty `record(rowId, cookieRowSchema)` with three refinements: inventory must be non-empty, `maxAgeMs` and `lifetime` are mutually exclusive per row, and `name` values must be unique across rows.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Consumes `cookiesSchema` to register this file in the shared-rules loading pipeline.
- **`tests/unit/infrastructure/config/cookies-schema.test.ts`** — Unit-tests the schema's accept/reject behaviour (shape, refinements, strictness).

## Notes

- Every object uses `z.strictObject`, so any key not listed is a hard parse error (catches typos early).
- `maxAgeMs` and `lifetime` are both optional but **mutually exclusive** per row; the refinement rejects a row that sets both.
- Row IDs are camelCase by convention (not a generic identifier) because the frontend maps them to i18n keys.
- `purpose` is a free-text string that feeds directly into the GDPR cookie table, so it should be a single plain-language sentence.
- The module doc comment notes that this file uses relative imports only, deferring to `src/infrastructure/config/shared-rules/load.ts` for the mechanism.
