---
source: tests/unit/infrastructure/persistence/normalize-email.test.ts
sha256: 5237fd1b6af45d38e6b0a1a94e5257a5791859fda6cf07e39cf3148df5f12d7f
generated_at: 2026-10-15T13:18:29.098845+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/normalize-email.test.ts

## Purpose

Unit tests for the two email-normalization utilities in the persistence layer. They pin down the exact contract of light normalization (`normalizeEmail`) versus aggressive mailbox folding (`canonicalMailbox`), including edge cases around Gmail-specific rules and malformed input.

## Key elements

- **`describe('normalizeEmail')`** — Verifies that `normalizeEmail` trims surrounding whitespace and lowercases the entire string, and that the result is idempotent.
- **`describe('canonicalMailbox')`** — Table-driven tests (`it.each`) plus targeted cases covering:
  - Stripping `+tag` local-parts (single and multiple tags).
  - Dropping dots in the local-part **only** for `gmail.com` / `googlemail.com`; dots are preserved for other domains.
  - Unifying `googlemail.com` → `gmail.com`.
  - Keeping genuinely different mailboxes distinct (different local-parts or domains).
  - Leaving malformed addresses (`+tag@…`, no `@`) unchanged except for lowercasing.
  - Never altering a `+` that appears in the **domain** portion.

## Relationships

- **`src/infrastructure/persistence/normalize-email.ts`** — Sole import source; provides `normalizeEmail` and `canonicalMailbox`, the two functions under test.

## Notes

- Gmail-specific dot-stripping and `googlemail.com` unification are called out explicitly in an inline comment; they do **not** apply to any other provider. A dot in `a.da@example.com` is intentionally preserved.
- A leading `+` (i.e., `+tag@…`) is treated as malformed and passed through untouched (aside from lowercasing); the function defers structural validation to a downstream step.
- The test for domain-level `+` (`ada@exa+mple.com`) guards against an over-eager split-on-`+` implementation.
