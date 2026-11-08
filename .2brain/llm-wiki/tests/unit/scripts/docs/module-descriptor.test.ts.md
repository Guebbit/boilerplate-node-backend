---
source: tests/unit/scripts/docs/module-descriptor.test.ts
sha256: f7ce7b0c8f5fc5d7d44f86b04e41294d38e7dd3e6329c6b1b89756877de8de07
generated_at: 2026-11-08T10:36:03.649895+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/module-descriptor.test.ts

## Purpose

Unit tests for `moduleDescriptorSchema`, verifying that the validation rules for module descriptor objects behave correctly — specifically that required fields are enforced, optional fields are permitted when absent, empty `noAudit` values are rejected, and unknown keys (typos) cause a parse failure rather than being silently dropped.

## Key elements

- **`MINIMAL`** — A constant holding the smallest descriptor object the schema should accept (`summary`, `subdomain`, `group`, empty `dependsOn`). Serves as the baseline for every test case.
- **`describe('moduleDescriptorSchema')` block** — Four `it` cases:
  - *accepts the minimal descriptor* — `parse` round-trips `MINIMAL` unchanged.
  - *requires a summary* — `safeParse` fails when `summary` is stripped out.
  - *refuses a noAudit with no reason* — `safeParse` fails when `noAudit` is an empty string.
  - *refuses an unknown key* — `safeParse` fails when a typo'd key (`noAudits`) is present, confirming the schema is non-pass-through.

## Relationships

- **Imports** `moduleDescriptorSchema` from `scripts/docs/module-descriptor.ts` — the sole production dependency; every assertion exercises that exported schema.

## Notes

- The tests use `safeParse` (not `parse`) for the negative cases so that a failure does not throw and the test can assert `success === false`.
- The unknown-key test implicitly confirms the schema uses a strict or exact-object mode (e.g. Zod's `.strict()` or equivalent); adding a new optional field to the schema without updating these tests will break this case.
- `MINIMAL` intentionally omits any optional fields (`noAudit`, `declarations`, etc.) so the "accepts minimal" test guards against accidentally making optional fields required.
