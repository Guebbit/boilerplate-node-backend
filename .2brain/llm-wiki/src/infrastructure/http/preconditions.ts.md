---
source: src/infrastructure/http/preconditions.ts
sha256: 16acd3a23bedfc7a9b2dcbb5020d266ba8faceb13e43a6210b1b5139f7ed96ac
generated_at: 2026-10-14T07:59:35.591356+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/preconditions.ts

## Purpose

The HTTP-facing half of conditional writes (RFC 9110 §13.1.1). Parses the `If-Match` request header into a `Precondition`, scopes a write inside that precondition, and stamps the `ETag` response header. All version semantics (what a version is, how comparison works) live in `versioning.ts`; this file knows nothing about row shape.

## Key elements

- **`preconditionOf(request, id)`** — Reads `If-Match` off the request. Returns `undefined` (unconditional write) when the header is absent, `{ id, etags: 'any' }` for `*`, or `{ id, etags: string[] }` for a comma-separated tag list. A header that fails the syntax check yields an *empty* tag list, guaranteeing a 412 rather than a silent unconditional write.
- **`withIfMatch<T>(request, id, work)`** — Convenience wrapper: extracts the precondition and delegates to `runWithPrecondition`, so callers pass only their write thunk.
- **`setEtag(response, row)`** — Extracts the version from the row via `versionOf`, sets the `ETag` header via `etagOf`, and **deletes `If-None-Match`** from the request so Express does not short-circuit with a 304. No-op when the row carries no version.
- **`IF_MATCH_SYNTAX`** (internal) — Regex enforcing the RFC 9110 entity-tag-list grammar (`*`, quoted tags, optional `W/` prefix, comma-separated).
- **`tagsOf(header)`** (internal) — Splits a validated list into trimmed tags, preserving any `W/` prefix.

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — Source of `etagOf`, `runWithPrecondition`, `versionOf`, and the `Precondition` type. This file is the sole HTTP adapter over those primitives.
- **`src/infrastructure/surfaces/create-delete-controller.ts`**, **`create-item-controller.ts`**, **`create-update-controller.ts`** — Write-path controllers that call `withIfMatch` before performing their mutation and `setEtag` on the response.
- **`src/modules/account/controllers/get-account.ts`**, **`src/modules/orders/controllers/get-order-item.ts`** — Read-path controllers that call `setEtag` to stamp the response with the row's version.
- **`tests/unit/infrastructure/http/preconditions.test.ts`** — Unit tests covering header parsing, `*` handling, invalid-syntax rejection, and `setEtag` side-effects.

## Notes

- **Invalid `If-Match` ≠ absent `If-Match`.** A syntactically bad header produces an empty tag list (→ 412), not `undefined` (→ unconditional write). This is a deliberate fail-closed choice.
- **Weak tags are preserved on purpose.** `W/"…"` is kept as-is so the strong comparison in `versioning.ts` can reject it against the strong ETag the API emits, matching RFC 9110 §13.1.1.
- **`setEtag` mutates the request.** It deletes the incoming `If-None-Match` header to suppress Express's built-in 304 logic. The ETag here only covers row-level edits, not config-derived fields (prices, i18n strings), so a 304 could serve a stale body.
- **`*` maps to the string `'any'`**, not a boolean or sentinel object. Callers of `versioning.ts` must treat `'any'` as "matches regardless of stored version."
