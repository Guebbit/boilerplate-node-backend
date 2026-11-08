---
source: src/infrastructure/http/preconditions.ts
sha256: 16acd3a23bedfc7a9b2dcbb5020d266ba8faceb13e43a6210b1b5139f7ed96ac
generated_at: 2026-11-08T03:33:44.828629+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/preconditions.ts

## Purpose

The HTTP-facing half of conditional writes (RFC 9110 §13.1.1). It parses `If-Match` off an Express request into a `Precondition` object, wraps a write in that precondition scope, and stamps `ETag` on responses. The version value and the actual check live in `persistence/versioning.ts`; this file is purely request/response plumbing and knows nothing about row shape.

## Key elements

- **`IF_MATCH_SYNTAX`** (private regex) — validates the full `If-Match` header: `*` or a comma-separated list of entity-tags, each optionally weak-prefixed (`W/`) and double-quoted.
- **`tagsOf`** (private helper) — splits a syntactically valid header into trimmed tag strings, preserving any `W/` prefix.
- **`preconditionOf(request, id)`** — reads `If-Match` from the request and returns a `Precondition | undefined`. `undefined` means the write is unconditional. An unparseable header yields `{ id, etags: [] }` (empty list → guaranteed 412). A literal `*` yields `{ id, etags: 'any' }`.
- **`withIfMatch<T>(request, id, work)`** — convenience wrapper that calls `preconditionOf` and feeds the result into `runWithPrecondition` from versioning, executing `work` under the precondition scope.
- **`setEtag(response, row)`** — extracts the version from a row via `versionOf`, sets the `ETag` response header via `etagOf`, and **deletes `if-none-match`** from the stored request headers so Express does not auto-answer 304. No-op when the row carries no version.

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — sole source of the domain logic: `Precondition`, `etagOf`, `versionOf`, `runWithPrecondition` are all imported from here. This file never computes a version or performs the comparison itself.
- **`src/infrastructure/surfaces/create-delete-controller.ts`**, **`create-item-controller.ts`**, **`create-update-controller.ts`** — factory functions that produce Express controllers; they call `withIfMatch` (for writes) and `setEtag` (for responses) to wire conditional-write semantics into the routes they generate.
- **`src/modules/account/controllers/get-account.ts`**, **`src/modules/orders/controllers/get-order.ts`** — module-level controllers that call `setEtag` on their GET/PUT/DELETE responses so clients can capture the tag for subsequent conditional writes.
- **`scripts/audit/api-standards.yaml`** — the API-standards spec that mandates `ETag`/`If-Match` support; this file is the implementation that satisfies that standard.
- **`tests/unit/infrastructure/http/preconditions.test.ts`** — unit tests covering header parsing, the empty-list-on-bad-syntax path, `*` handling, and the `if-none-match` deletion side-effect.
- **`tests/cross-cutting/request-headers-conformance.test.ts`** — integration-level test asserting the header contract (presence of `ETag` on writes, `If-Match` → 412) end-to-end across surfaces.

## Notes

- An **invalid** `If-Match` header does not produce a 400; it produces an **empty etag list**, which causes the repository check to fail and return 412. Rationale: the caller *intended* a conditional write, so silently running it unconditionally would be worse.
- `setEtag` deliberately strips `if-none-match` from the stored request headers. Without this, Express's built-in `fresh` logic would compare the new `ETag` against the (possibly stale) `If-None-Match` and short-circuit to 304, serving a body that may be out of date for config-derived fields (prices, language, etc.).
- Weak tags (`W/"…"`) are **preserved** in the parsed list. Because this API only emits strong tags, a weak tag in `If-Match` will never equal the stored strong tag — which is exactly RFC 9110's strong-comparison rule for `If-Match`.
- The file is typed as `@module` (no named exports beyond the three public functions); consumers import it as a namespace.
