---
source: tests/unit/infrastructure/persistence/normalize-email.test.ts
sha256: 5237fd1b6af45d38e6b0a1a94e5257a5791859fda6cf07e39cf3148df5f12d7f
generated_at: 2026-11-08T10:22:23.682056+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/normalize-email.test.ts

## Purpose

Unit tests for the two email-normalization helpers exported by `normalize-email.ts`: the simple `normalizeEmail` (trim + lowercase) and the more opinionated `canonicalMailbox` (strip local-part `+tags`, apply Gmail-specific dot/domain folding, preserve everything else). The file pins down the exact boundary between "same mailbox" and "different mailbox" so future changes to the rules are caught immediately.

## Key elements

- **`describe('normalizeEmail')`** — verifies trim + lowercase and that the operation is idempotent on an already-clean address.
- **`describe('canonicalMailbox')`** — the main block; covers:
  - Stripping all `+tag` segments from the local part (including multiple tags).
  - Gmail-specific rules: dropping `.` in the local part and mapping `googlemail.com` → `gmail.com`.
  - *Not* applying those Gmail rules to other domains (`a.da@example.com` stays intact).
  - Distinct mailboxes (different user, different domain) remain distinct after canonicalization.
  - Malformed inputs (leading `+`, no `@`): only lowercased, no other mutation — validation is left to a separate step.
  - `+` characters **inside the domain** are never touched.

## Relationships

- **`src/infrastructure/persistence/normalize-email.ts`** — the system under test. The test file imports `normalizeEmail` and `canonicalMailbox` and asserts their output; no other dependencies exist.

## Notes

- The Gmail dot/domain special-casing is intentional and documented *in the test comments*: other providers treat dots as significant, so the canonicalization is provider-aware, not a blanket rule.
- Malformed-address cases (`+tag@…`, `NoAtSign`) are explicitly **not** fixed here; the contract is "lowercase and pass through." Don't expect this module to validate.
- The `+`-in-domain test (`ada@exa+mple.com`) guards against an overly aggressive regex that strips `+` everywhere rather than only in the local part.
