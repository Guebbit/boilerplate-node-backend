---
source: shared/cases/normalize-email.cases.yaml
sha256: 3ec50c555c4a80a281293fad6fb9520d315d9195018d2f4311263209680d24a2
generated_at: 2026-11-08T03:05:37.829860+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/normalize-email.cases.yaml

## Purpose

Test-case specification for the email→mailbox normalization step. The resulting mailbox string is used **only to bucket rate-limit budgets**; it is never used to store or compare accounts. Each case pins down one aspect of the normalization contract (lowercasing, trimming, plus-tag removal, dot collapsing) so implementers and reviewers can verify behavior against a shared, language-agnostic reference.

## Key elements

- **Top-level comment** — states the single-sentence normalization rule: *lowercase (full Unicode), trim, drop `+tag`, drop dots only for Gmail*.
- **`cases:`** — a flat list of `{name, email, mailbox}` objects. `email` is the raw input; `mailbox` is the expected normalized output. There is no separate "function under test" field; the file is consumed by a harness that applies the normalizer to `email` and asserts equality with `mailbox`.
- **Coverage highlights** — the list explicitly exercises: case folding, whitespace trimming, `+tag` stripping (first-`+`-only, `+` at local-part start is *not* a tag, `+` in domain is not a tag), dot preservation on non-Gmail domains, dot removal on `gmail.com` / `googlemail.com`, last-`@`-sign splitting, values with no `@`, full-Unicode lowercasing (Ä, İ → i + combining dot, Greek final sigma).

## Relationships

- **`shared/cases/rate-limit-keys.cases.yaml`** — sibling test-case file in the same `shared/cases/` directory. Both follow the same `{name, input, expected}` YAML shape and are consumed by the same case-runner harness. This file supplies the *normalization* half of the pipeline; the rate-limit-keys file covers key derivation that consumes the normalized mailbox.

## Notes

- **Not ASCII lowercasing.** The spec demands full Unicode case mapping. The `İ` (U+0130) → `i̇` (i + U+0307) and `ΟΔΟΣ` → `οδος` (final sigma, not medial) cases are the canonical edge cases; an `ascii_lowercase` implementation will fail them.
- **`+` is positional, not syntactic.** Only the *first* `+` in the local part starts a tag. A leading `+` (`+ada@…`, `+@…`) is a literal character, and a `+` that appears after the last `@` belongs to the domain.
- **Dot rules are domain-conditional.** Dots are stripped only when the (already lowercased) domain is `gmail.com` or `googlemail.com`. All other domains preserve dots verbatim.
- **No validation.** Cases include inputs that are not valid RFC 5322 addresses (`Not-An-Address`, `@Example.com`). The normalizer is a *transform*, not a parser; it must not reject them.
- **`googlemail.com` ≡ `gmail.com`.** The normalizer maps the domain to `gmail.com` before applying the dot rule; tests confirm the output domain is `gmail.com`, not `googlemail.com`.
