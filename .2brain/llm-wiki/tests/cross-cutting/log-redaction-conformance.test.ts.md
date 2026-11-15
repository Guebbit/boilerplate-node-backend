---
source: tests/cross-cutting/log-redaction-conformance.test.ts
sha256: dc2057b98fea42765ff6d3935ddb805f533dd25e5ce4ab3e2b2e73ceca94e1e4
generated_at: 2026-11-14T23:04:08.602044+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/log-redaction-conformance.test.ts

## Purpose
Conformance test that pins the repo's log-redaction behavior (field redaction, URL-secret masking, and error-message masking) against a shared set of cases also consumed by the PHP twin. Ensures both implementations produce identical outputs for the same inputs, keeping the redaction contract language-agnostic.

## Key elements
- **`redactionCase`** — Zod discriminated-union schema (`kind: 'key' | 'traceUrl' | 'message'`) that validates each YAML case before the test body runs.
- **`HASH_SPAN`** — Regex (`/\{hash:([^}]*)\}/g`) used in expected-output strings as a placeholder; at assertion time it is replaced by the actual `correlationDigest` of the captured address.
- **Test body (inside `describeCases`)** — Three branches:
  - `key`: calls `redactSensitiveFields` on a single-key object and asserts the value was either replaced or kept.
  - `traceUrl`: calls `redactUrlSecrets` and compares to the expected string (with `{hash:…}` spans resolved).
  - `message`: calls `serializeError(new Error(input))` and compares `.message`, proving the full serialization path applies the mask.

## Relationships
- **`src/infrastructure/adapters/logger.ts`** — source of `redactSensitiveFields` and `serializeError`; the units under test for the `key` and `message` cases.
- **`src/infrastructure/runtime/otel-sdk.ts`** — source of `redactUrlSecrets`; the unit under test for the `traceUrl` case.
- **`src/infrastructure/security/pseudonymise.ts`** — provides `correlationDigest`, used to resolve `{hash:…}` placeholders in expected outputs so the assertion compares against the real digest.
- **`tests/support/cases.ts`** — provides `caseBase` (shared Zod base with fields like `id`, `description`) and `describeCases` (the runner that loads the YAML file, validates each entry, and calls the per-case callback).

## Notes
- The YAML case file and the redaction key-list (`shared/rules/log-redaction.yaml`) live outside this repo's source tree; they are the single source of truth shared with the PHP twin. Changing the rules changes the test expectations without touching this file.
- The `message` branch deliberately routes through `serializeError` rather than calling a lower-level mask function, so a regression in the serialization wiring (e.g., mask applied after serialization) would be caught here.
- `{hash:…}` spans are a *test-only* convention: production code never emits them; they exist so the expected string can reference a digest without hard-coding the hash value.
