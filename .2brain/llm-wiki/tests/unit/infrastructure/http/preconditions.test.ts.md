---
source: tests/unit/infrastructure/http/preconditions.test.ts
sha256: c337700bd5822d7d874f5b141da2a3bfd5de15a2b387b28a2f9366976bbb9db6
generated_at: 2026-10-15T13:15:06.357570+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/preconditions.test.ts

## Purpose

Unit tests for the `preconditionOf` and `setEtag` helpers in `src/infrastructure/http/preconditions.ts`. Verifies that `If-Match` parsing follows RFC 9110 §13.1.1 (including the "garbled header → empty list → never matches" invariant) and that `ETag` stamping is driven solely by `editRevision`, while also removing `If-None-Match` from the request to suppress spurious 304 responses.

## Key elements

- **`requestWith(ifMatch?)`** — local factory returning an `asStub<Request>` whose `get` returns the given `If-Match` value (or `undefined`).
- **`describe('preconditionOf')`** — covers: absent header → `undefined`; single tag; comma-list with whitespace and weak `W/` prefix preserved; `*` → `etags: 'any'`; a table of malformed inputs that must all yield `etags: []`.
- **`makeResponse(headers?)`** — local factory returning a stub `Response` with a spy `setHeader` and a `req.headers` object seeded with the given lower-cased headers.
- **`describe('setEtag')`** — covers: stamps `ETag` as `"<n>"` from `editRevision`; deletes `if-none-match` from `req.headers` when an ETag is set; calls `setHeader` zero times and leaves `if-none-match` intact when the entity has no `editRevision`.

## Relationships

- **`src/infrastructure/http/preconditions.ts`** — the module under test; provides `preconditionOf` (parses `If-Match` into `{ id, etags }`) and `setEtag` (writes `ETag` header and mutates the request).
- **`tests/support/stub.ts`** — provides `asStub<T>`, used to create lightweight Express `Request`/`Response` stubs without a full Express app.

## Notes

- `preconditionOf` returns `undefined` (not an empty-object) when the header is absent, signalling an unconditional write; empty `etags: []` means "nothing matches."
- The weak validator prefix `W/` is preserved verbatim in the parsed tag list — it is *not* stripped.
- `setEtag` has a side effect on `response.req.headers` (deleting `If-None-Match`) in addition to calling `setHeader`; tests assert on the headers object directly, not on a return value.
- `editRevision` is the *only* field that triggers an ETag; a row with `title`/`updatedAt` but no counter produces no header.
