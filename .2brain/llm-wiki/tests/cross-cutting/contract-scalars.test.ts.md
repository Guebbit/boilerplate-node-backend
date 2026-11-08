---
source: tests/cross-cutting/contract-scalars.test.ts
sha256: 0eb32fe82cd469f04b71442dbfbf0b7b466aab1f6b04b070e2dd3a41f1035db2
generated_at: 2026-11-08T09:25:57.475078+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-scalars.test.ts

## Purpose

Verifies that the scalar bounds and patterns declared in `infrastructure` still match every per-operation constant orval emits from `openapi.yaml`. Because orval flattens each shared component into a separate constant per endpoint (dozens of identical numbers), `infrastructure` cannot simply import "the" constant without coupling to a domain name. This test substitutes for that missing import: change `maximum` in the contract, regenerate, and the mismatch fails here instead of silently returning 422 for a legally-sized page.

## Key elements

- **`constantsEndingIn(suffix)`** — local helper that sweeps `@api/schemas.zod` and returns entries whose key ends with the given suffix. Replaces a hardcoded list so new endpoints are covered automatically.
- **`describe('contract scalars')`** — the test suite, containing:
  - *Canary test* — asserts the suffix-based sweep actually finds constants (guards against an orval naming change producing an empty pass).
  - *PageSize max agreement / rejection* — every generated `*PageSizeMax` must satisfy `pageSizeSchema` **and** `pageSizeSchema` must reject `value + 1`.
  - *Page max agreement / rejection* — same dual check for `*PageMax` against `pageSchema`.
  - *HardDelete default* — every generated `*HardDeleteDefault` must equal `hardDeleteSchema.parse(undefined)`.
  - *Id pattern* — at least 50 generated `*RegExp` constants must have `.source` equal to `CONTRACT_ID_PATTERN`, confirming `ids.ts` can still locate id fields in request schemas.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — exports `pageSchema`, `pageSizeSchema`, and `hardDeleteSchema`; this test uses them as the source of truth that each generated constant must satisfy.
- **`src/infrastructure/http/ids.ts`** — exports `CONTRACT_ID_PATTERN`; this test asserts the pattern still appears in generated RegExp constants, which is how `ids.ts` discovers id fields in parsed schemas.
- **`@api/schemas.zod`** (generated) — the module that is swept; every assertion compares its per-operation constants against the `infrastructure` schemas/pattern.

## Notes

- The sweep is dynamic (name-suffix filter over `Object.entries`), not a static list. Adding a new endpoint in `openapi.yaml` is covered without editing this file.
- Each bound is checked in both directions (accepts the value, rejects value + 1). A one-directional check would miss a *lowered* contract bound.
- The Id-pattern test threshold (50) is intentionally high: it survived the removal of the shop domain (87 → still > 50) and would drop to zero if the pattern string changed in the contract.
- The file's top-of-file comment documents *why* the test exists (orval's per-operation flattening) and is the primary reference for the design decision; read it before modifying.
