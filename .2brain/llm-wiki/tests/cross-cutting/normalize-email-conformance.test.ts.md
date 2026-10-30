---
source: tests/cross-cutting/normalize-email-conformance.test.ts
sha256: f1032dc61606ac6358f805289da6c9a6afc6f547a45bd5a0934c1837ec18b9cb
generated_at: 2026-10-29T06:47:28.030605+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/normalize-email-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript `canonicalMailbox` implementation produces the same results as its PHP twin for a shared set of 16 email-normalization cases. It guards against divergence between the two language implementations.

## Key elements

- **`mailboxCase`** — A Zod schema extending `caseBase` with two additional fields: `email` (the input address) and `mailbox` (the expected canonical output).
- **`describeCases('normalize-email', mailboxCase, 16, …)`** — Loads 16 cases from the shared YAML suite and asserts `canonicalMailbox(input) === expected` for each.

## Relationships

- **`src/infrastructure/persistence/normalize-email.ts`** — Supplies `canonicalMailbox`, the function under test.
- **`tests/support/cases.ts`** — Supplies `caseBase` (the base Zod schema) and `describeCases` (the case-suite runner that loads the shared YAML and wires up the describe/it blocks).

## Notes

- The shared case file is `shared/cases/normalize-email.cases.yaml`, referenced in the file's doc comment. Both the TS and PHP test suites consume the same YAML, making it the single source of truth for expected behavior.
- The expected case count (`16`) is passed as a literal to `describeCases`; adding or removing entries in the YAML requires updating this number or the suite will fail.
