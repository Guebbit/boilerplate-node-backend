---
source: tests/unit/scripts/contracts/openapi-document.test.ts
sha256: eab1ee67ff7c08605a147c48be54a419b856150c2962b107316405a4d3f0dce1
generated_at: 2026-11-08T10:33:46.446768+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/openapi-document.test.ts

## Purpose
Unit tests for the three OpenAPI document helpers (`parseOpenApi`, `operationsOf`, `securityOpenMethods`) that every bundler step relies on. Verifies the parse guard rejects non-object YAML, that the operation walk picks up exactly the HTTP-method keys, and that only methods explicitly declaring `security: []` are flagged as open.

## Key elements
- **`describe('parseOpenApi')`** — asserts round-trip parsing of a valid YAML object and that scalars, lists, and empty strings throw `/did not parse to an object/`.
- **`describe('operationsOf')`** — confirms the walk returns `{ route, method }` pairs for `get`/`delete` on a path, skips non-operation keys (`parameters`, `summary`, empty path items), and returns `[]` when `paths` is absent.
- **`describe('securityOpenMethods')`** — verifies that only methods with `security: []` (empty array) are returned; methods with `security: [{}]`, `security: [{ bearerAuth: [] }]`, or no `security` key are excluded.
- **`pathItemOf(item)`** (local helper) — wraps a single path-item object inside a minimal valid OpenAPI document so it can be fed through `parseOpenApi` → `paths['/x']`.

## Relationships
- **`scripts/contracts/openapi-document.ts`** — sole source under test. The file imports `operationsOf`, `parseOpenApi`, and `securityOpenMethods` from it; no other modules are exercised.

## Notes
- Tests construct YAML strings at runtime via `yaml`'s `stringify` rather than using fixtures, so the assertions are self-contained.
- `securityOpenMethods` distinguishes `security: []` (explicitly open) from `security: [{}]` (a scheme with no scopes) and from a missing key — the test pins that only the first case is returned.
- The `pathItemOf` helper is intentionally narrow: it always uses route `/x` and `openapi: '3.1.0'`, so it is a convenience wrapper, not a general fixture builder.
