---
source: shared/rules/audit-actions.yaml
sha256: e52a88e63f4c5be8e0d52ad566059d71b61c38eaf0dce74a1f68b110d0e754ea
generated_at: 2026-11-08T03:08:45.817575+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/audit-actions.yaml

## Purpose

Declares the set of audit-action wire strings emitted by the shared security guards for requests that are refused before any domain module sees them. Because no module owns these events, they live here rather than in a per-module rules file. The file is a **build-time source of truth only**: `npm run regenerate` compiles it into `src/infrastructure/observability/audit-actions.generated.ts`, where the values become a closed `CoreAuditAction` union type (a runtime-loaded list would widen the type to `string`).

## Key elements

- **`actions`** — Ordered list of objects, each with:
  - `value` — The literal wire string (e.g. `security.unauthorized`). The generated constant key is derived from this: upper-cased with `.` → `_` (e.g. `SECURITY_UNAUTHORIZED`).
  - `description` — Human/AI-readable explanation of when the action fires.
- Seven actions covering: `unauthorized`, `forbidden`, `rate_limit_hit`, `reauth_required`, `token.invalid_signature`, `token.malformed`, `api_key.revoked`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The `value` strings are the exact tokens that appear in API responses (audit-action headers/fields). The OpenAPI contract defines the response schema that carries these strings; this YAML is the authoritative enumeration of what values that field can hold. Changing a `value` here requires a matching update in the OpenAPI spec so the two stay in sync.

## Notes

- **Do not import this file at runtime.** It is consumed exclusively by the code-generation step. Importing the YAML directly would give you a `string[]` and destroy the `CoreAuditAction` union.
- **Key derivation is mechanical, not configurable.** There is no separate `key` field; the generated constant name is always `value.toUpperCase().replace(/\./g, '_')`.
- **`security.token.malformed` vs. `security.token.invalid_signature`** — The former means the value isn't a well-formed token at all; the latter means it is well-formed but cryptographically wrong. Do not conflate them when adding new actions.
- **`security.reauth_required`** is recorded at the *demand* point, not the subsequent successful retry. This is intentional: without this record the step-up challenge is invisible in logs.
