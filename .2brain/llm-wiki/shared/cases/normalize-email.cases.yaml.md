---
source: shared/cases/normalize-email.cases.yaml
source_sha256: 3ec50c555c4a80a281293fad6fb9520d315d9195018d2f4311263209680d24a2
context_sha256: 59c43667049aa00844e2707bba6cce5ea963cf62d2999245a9fce3724d071dc0
generated_at: 2026-11-22T02:21:49.008617+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/normalize-email.cases.yaml

## Purpose
A shared, data-driven test-case table for an email-to-mailbox normalizer. The mailbox is the address's delivery target and is used only to bucket budgets (e.g. rate limits), never to store or compare accounts. Each case pairs an input `email` with its expected `mailbox`.

## Key elements
- `cases:` – list of entries, each with `name`, `email` (input) and `mailbox` (expected output).
- Normalization rules the cases pin down:
  - Lowercase using full Unicode, not ASCII-only (`ÄDA` → `äda`; `İ` → `i` plus a combining dot; word-final Greek `Σ` → `ς`).
  - Trim surrounding whitespace.
  - Drop a `+tag` from the local part, starting at the first `+` (`ada+a+b` → `ada`).
  - Drop dots in the local part only for Gmail; `a.d.a@example.com` keeps its dots.
  - `googlemail.com` is treated as `gmail.com` (`A.D.A+news@GoogleMail.com` → `ada@gmail.com`).
- Edge cases:
  - The last `@` splits local part from domain (`ada+x@y@example.com` → `ada@example.com`).
  - A `+` after the last `@` belongs to the domain and is kept.
  - A leading `+` is not a tag (`+ada@example.com` and `+@example.com` stay unchanged).
  - Input with no `@`, or starting with `@`, is only lowercased.

## Relationships
- `shared/cases/rate-limit-keys.cases.yaml` is a sibling case file in the same directory. The header comment says mailboxes are used to bucket budgets, which is consistent with rate-limit keys being derived from them. The file content itself shows no explicit reference between the two.

## Notes
- The file contains only data, with no code. Any implementation must reproduce these outputs exactly.
- Several expectations are subtle: the dotted-capital-I and final-sigma cases require Unicode-aware lowercasing rather than simple per-character mapping.
- Values with leading whitespace or special characters are quoted in the YAML, and the whitespace case includes a trailing `\n`.
