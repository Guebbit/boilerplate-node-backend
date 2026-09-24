---
source: tests/cross-cutting/contract-scalars.test.ts
sha256: 17d2b25d02f5e10f3c3c7f8ecb64663c1fb6b219247fdcfcc950a1b9709885bc
generated_at: 2026-09-23T19:55:10.086529+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-scalars.test.ts

## Purpose

Guarantees that the scalar bounds declared in `infrastructure/http/schemas.ts` (page-size max, page max, hard-delete default) stay in lock-step with the per-operation constants orval emits from `openapi.yaml`. Because orval duplicates each shared component into one constant per endpoint, infrastructure cannot import a single "the" constant without leaking a domain name into the shared layer; this test substitutes for the compile-time check an import would otherwise provide.

## Key elements

- **`constantsEndingIn(suffix)`** – Filters the generated `@api/schemas.zod` module's entries by name suffix, returning `[name, value]` pairs. The mechanism that makes the sweep endpoint-agnostic.
- **Canary test** (`finds the generated constants…`) – Asserts the sweep is non-trivial (>5 for PageSizeMax/PageMax, >2 for HardDeleteDefault) so a silent orval rename doesn't let every other test pass over an empty set.
- **PageSizeMax pair** – One test asserts every generated constant is accepted by `pageSizeSchema`; a second asserts `value + 1` is *rejected*, catching a silently lowered bound.
- **PageMax pair** – Same two-sided check against `pageSchema`.
- **HardDeleteDefault test** – Parses the default from `hardDeleteSchema` (via `parse(undefined)`) and asserts every generated constant equals it.

## Relationships

- **`src/infrastructure/http/schemas.ts`** – Source of the three Zod schemas (`pageSchema`, `pageSizeSchema`, `hardDeleteSchema`) that define the bounds. This test is the only consumer that validates *all* generated per-operation constants against those bounds; no other test or runtime path enforces the equivalence.

## Notes

- The sweep reads the entire generated module at import time, so a new endpoint appearing after regeneration is covered automatically—no list to update.
- The "rejects one above" half is essential: without it, a lowered `maximum` in the contract would pass the "accepts" test trivially (any smaller value still parses) while real clients would start getting 422s.
- `constantsEndingIn` relies on orval's naming convention (`<Operation><Scalar>Max|Default`). The canary test is the only guard against a future orval version changing that pattern.
