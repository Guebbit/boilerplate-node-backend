---
source: src/infrastructure/config/shared-rules/cookies.ts
source_sha256: dae2d7d9889042a701ae037ceaf9beb7c5fee3cdce862a4ae5befd703686f10a
context_sha256: 23cbeddecd528c771cf3b35a7b7df31f5335faede45bc6967b3b09da5ff26fc3
generated_at: 2026-11-22T02:44:34.569249+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/cookies.ts

## Purpose
Defines the Zod schema for `shared/rules/cookies.yaml`, the inventory of every cookie (or, in the frontend's own file, browser storage item) an app sets. Backend and frontend use one format for both files. The module uses relative imports only (see `load.ts`).

## Key elements
- `cookiesSchema` (exported): strict object with a `cookies` record keyed by row id. Its refinements reject:
  - an empty inventory (`the inventory is empty`);
  - a row that has both `maxAgeMs` and `lifetime` (`a row has both maxAgeMs and lifetime`);
  - two rows with the same `name` (`a name is listed twice`).
- `cookieRowSchema` (module-private): strict object for one row. Fields:
  - `name`: the wire name as the browser stores it, non-empty.
  - `setter`: `backend`, `frontend` or `library`.
  - `kind`: `cookie`, `localStorage` or `sessionStorage`.
  - `purpose`: one plain sentence, non-empty; the GDPR table prints it.
  - `necessity`: `necessary` (the ePrivacy Art. 5(3) exemption) or `preference`.
  - `secret`: boolean; marks a credential whose value the log scrubber never writes.
  - `maxAgeMs`: optional positive integer lifetime in ms, only where code reads it from here.
  - `lifetime`: optional `sessionTier` or `challenge`, for lifetimes that are not constants.
- `rowId` (module-private): regex `^[a-z][A-Za-z0-9]*$`. Ids are camelCase because the frontend uses them as translation keys.

## Relationships
- `registry.ts` is a graph neighbor in the same `shared-rules` folder. The schema is presumably registered or consumed there; this file does not show how.
- `tests/unit/infrastructure/config/cookies-schema.test.ts` is the unit test for this schema.

## Notes
- Both the row schema and the top-level schema are `strictObject`. An unknown key is treated as a typo, or as behaviour that belongs in code rather than in the YAML.
- `maxAgeMs` and `lifetime` are mutually exclusive, but both may be omitted.
- Cookie names must be unique across all rows, whatever their `kind` or `setter`.
