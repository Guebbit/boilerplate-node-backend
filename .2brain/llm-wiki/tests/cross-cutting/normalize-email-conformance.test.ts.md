---
source: tests/cross-cutting/normalize-email-conformance.test.ts
sha256: 8e4c02c3f8970cdf36d91b612415017a71e6d9afa2fe88a5c8cd939fac825d4f
generated_at: 2026-11-08T09:28:57.377776+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/normalize-email-conformance.test.ts

## Purpose

Conformance test that verifies `canonicalMailbox` produces the same output as the PHP twin implementation for every case defined in the shared spec (`shared/cases/normalize-email.cases.yaml`). It exists to lock cross-language behavior and catch divergence when either side changes.

## Key elements

- **`mailboxCase`** – Zod schema extending `caseBase` with two required string fields: `email` (input address) and `mailbox` (expected canonical result).
- **`describeCases('normalize-email', mailboxCase, fn)`** – Invokes the shared-case runner, which loads the YAML cases, validates each against `mailboxCase`, and asserts `canonicalMailbox(one.email) === one.mailbox`.

## Relationships

- **`src/infrastructure/persistence/normalize-email.ts`** – Provides `canonicalMailbox`, the function under test. This file only imports and calls it; no mutation or side-effect coupling.
- **`tests/support/cases.ts`** – Supplies the `caseBase` schema (common case-envelope fields) and the `describeCases` helper that loads, validates, and iterates the shared YAML cases.

## Notes

- Cases live in an external YAML file (`shared/cases/normalize-email.cases.yaml`); adding or changing a case does **not** require editing this test file.
- The "cross-cutting" directory name reflects that this test enforces a contract shared by multiple language implementations (TypeScript here, PHP elsewhere), not an internal unit concern.
- The assertion is a strict `toBe` (reference/value equality), so any formatting drift (e.g., trailing dots, case differences) will fail.
