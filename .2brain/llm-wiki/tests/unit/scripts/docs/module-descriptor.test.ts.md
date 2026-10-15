---
source: tests/unit/scripts/docs/module-descriptor.test.ts
sha256: 15420aae16b71c75a8008b5997bc6d88d54c6d6e0aff95068dac2bc45d443be0
generated_at: 2026-10-15T13:27:20.086909+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/module-descriptor.test.ts

## Purpose

Unit tests for the `moduleDescriptorSchema` validator and the `frontendCounterparts` helper in `scripts/docs/module-descriptor.ts`. Ensures the schema enforces its required fields, rejects invalid or unknown keys, and that `frontendCounterparts` falls back correctly when a module declares no frontend pairing.

## Key elements

- **`MINIMAL`** – A constant holding the smallest object the schema should accept (`summary`, `subdomain`, `group`, `dependsOn: []`); used as the base for every assertion.
- **`describe('moduleDescriptorSchema')`** – Four cases:
  - Accepts `MINIMAL` as-is (optional fields absent).
  - Rejects an object missing `summary`.
  - Rejects `noAudit: ''` (a reason string is required when the field is present).
  - Rejects an unknown key (`noAudits`), confirming strict-key behavior.
- **`describe('frontendCounterparts')`** – Two cases:
  - Returns `[<moduleName>]` when the descriptor has no `frontend` block.
  - Returns the declared `frontend.counterparts` array verbatim (including an empty array) when `frontend.why` is set.

## Relationships

- **`scripts/docs/module-descriptor.ts`** (import source) – Provides `moduleDescriptorSchema` (the Zod schema under test) and `frontendCounterparts` (the helper under test). All assertions in this file exercise those two exports directly.

## Notes

- The schema is **strict**: any key not in the schema (even a typo like `noAudits`) causes `safeParse` to fail. This is intentional and explicitly tested.
- `frontendCounterparts` signature is `(moduleName: string, descriptor: ParsedDescriptor) => string[]`. The first argument is the module's own name and serves as the single-element fallback.
- `noAudit` is an *optional* field but, when present, must be a non-empty string. Tests only cover the empty-string rejection; a missing `noAudit` is fine.
