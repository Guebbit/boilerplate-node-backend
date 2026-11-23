---
source: shared/cases/rate-limit-keys.cases.yaml
source_sha256: 21eb2f7d8d1c547cd71ef4c2f1bcccc8e68e7bc23bd4a3ef946c183e864ffa17
context_sha256: 32253ad8052a46dea0ce14c076e7241d3597d570d1677bf8348abdeb27167703
generated_at: 2026-11-22T02:22:06.211673+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/rate-limit-keys.cases.yaml

## Purpose

A shared, data-driven test-case table describing how a request is bucketed by a rate-limit budget. Each entry gives inputs (IP, optional request body, optional pseudonym root) and the expected bucket key, so any implementation can be checked against the same expectations.

## Key elements

All entries live under a top-level `cases:` list. Each has a `name`, a `kind`, inputs, and the expected `key`.

- **`kind: address`**: plain address key. IPv4 is used as is. IPv6 is masked to its `/56` (the express-rate-limit default). An IPv4-mapped IPv6 address is unwrapped first.
- **`kind: block`**: wider block key. IPv4 maps to `/24` and IPv6 to `/48`. IPv4-mapped addresses are unwrapped first, including the hex spelling (`::ffff:cb00:7105`). A request with no `ip` yields the stable key `unknown`.
- **`kind: identity`**: a budget keyed on a submitted email. Inputs are `root`, `ip` and `body`. The key is a keyed HMAC (64 hex chars) of the normalised address under the `rate-limit` purpose. Otherwise it is `anon:<block>`.
  - `email` and `username` give the same key (lowercased and trimmed).
  - `email` wins over `username`.
  - A non-string, blank, `{}` or missing body falls back to `anon:<block>`.
  - A blank `email` still wins over `username`, so it names nobody and does not fall through.
- `root` is the pseudonym root, a test-only public value: `shared-cases-root-secret-do-not-use-in-production-0001`.

## Relationships

- Sits alongside `shared/cases/crypto.cases.yaml` and `shared/cases/normalize-email.cases.yaml` in the shared cases set. The identity cases depend on their behaviours: the keyed HMAC and `rate-limit` purpose (crypto) and the lowercase/trim normalisation (normalize-email). The expected hash values here are not derived in this file.

## Notes

- The `root` secret is intentionally public and must never be used in production.
- The expected identity hash is the same for the three cases that name `ada@example.com` (`'  Ada@Example.com '`, `ADA@example.com`, and `email` plus a different `username`).
- Several `address` and `block` cases check bucket boundaries: two addresses in one `/56` share a key, adjacent `/24`s differ, and different `/48`s differ.
