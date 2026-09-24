---
source: tests/unit/infrastructure/http/uploads.test.ts
sha256: 7dcc752f7485ccc4079ebad40e777547bae5ead0410e03f799c0906292e056d2
generated_at: 2026-09-23T20:23:43.757822+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/uploads.test.ts

## Purpose

Unit tests for the two upload-helper functions exported by `src/infrastructure/http/uploads.ts`. The file exists to lock in two invariants: (1) `getFormFiles` collapses all three multer shapes into one uniform array-or-undefined result, and (2) `readUploadedImage` returns only store-recorded URLs and never leaks a filesystem path into `imageUrl`.

## Key elements

- **`uploaded(path)`** — local factory that produces a minimal `Express.Multer.File` stub carrying only `path`.
- **`requestWith(parts)`** — local factory that spreads a partial object over `{ body: {} }` and casts to `Request`, so the `readUploadedImage` fallback branch never sees `undefined` for `body`.
- **`describe('getFormFiles')`** — seven cases covering:
    - `multer.single` (`req.file`) → wrapped in a one-element array.
    - `multer.array` (`req.files[]`) → mapped to paths in order.
    - `multer.fields` (`req.files` as keyed object) → flattened across all fields.
    - Precedence: `req.file` wins when both `file` and `files` are present.
    - No upload → `undefined`.
    - Empty field-object (`{ avatar: [], gallery: [] }`) → `undefined` (not `[]`).
    - Empty array (`files: []`) → `undefined`, asserted as a _separate_ case to prove it agrees with the fields case.
- **`describe('readUploadedImage')`** — five cases covering:
    - Returns the first URL from `storedImageUrls`.
    - Absolute (remote) URLs pass through unchanged.
    - Only the first URL is returned when multiple are present.
    - No stored URLs → `imageUrl` is `undefined` (not `""`).
    - A staged `req.file.path` that the store never committed is ignored; `imageUrl` stays `undefined`.

## Relationships

- **`src/infrastructure/http/uploads.ts`** — sole import target. The test exercises `getFormFiles` and `readUploadedImage` directly; no other module is imported.

## Notes

- The two "empty → undefined" tests (fields-object and array) are kept as **separate assertions** deliberately: the invariant is that both shapes agree, and a single merged assertion could not detect a regression where they diverge.
- The `requestWith` helper defaults `body` to `{}`. This is unrelated to `getFormFiles` (which never reads `body`) but prevents a spurious `undefined` body from triggering the `readUploadedImage` fallback branch inside the `getFormFiles` tests.
- The "ignores a staged file" test encodes a security boundary: if it ever regresses, a temp filesystem path could be persisted into a database row via `imageUrl`.
