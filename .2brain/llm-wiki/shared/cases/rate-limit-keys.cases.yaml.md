---
source: shared/cases/rate-limit-keys.cases.yaml
sha256: 21eb2f7d8d1c547cd71ef4c2f1bcccc8e68e7bc23bd4a3ef946c183e864ffa17
generated_at: 2026-11-08T03:06:05.749861+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/rate-limit-keys.cases.yaml

## Purpose

Declares the expected bucketing keys a rate-limiter assigns to a request across three tiers—`address` (per-connection), `block` (per-subnet), and `identity` (per-user). It pins down the exact masking, unwrapping, pseudonymisation, and fallback rules so that any reimplementation or refactoring stays compatible with the documented behavior.

## Key elements

- **`kind: address`** — Asserts the per-connection key. IPv4 is used verbatim; IPv6 is masked to /56 (express-rate-limit default); IPv4-mapped IPv6 (`::ffff:a.b.c.d` and hex `::ffff:xxxx:xxxx`) is unwrapped to the bare IPv4.
- **`kind: block`** — Asserts the per-subnet key. IPv4 → /24, IPv6 → /48, mapped → unwrapped then /24. A request with no address yields the literal key `unknown`.
- **`kind: identity`** — Asserts the per-user key. A non-blank, string `email` (or `username`) is normalised (lower-cased, trimmed) and HMAC-pseudonymised under the `rate-limit` purpose using the supplied `root`. Priority: `email` > `username`; a present-but-blank field *wins* and yields `anon:<block>` rather than falling through. Non-string values (e.g. `42`) are treated as absent.
- **`root`** — A fixed test-only HMAC secret (`shared-cases-root-secret-…`) used to derive the expected pseudonym hash in `identity` cases.

## Relationships

- **shared/cases/crypto.cases.yaml** — The `identity` cases depend on the HMAC-pseudonymisation function (purpose `rate-limit`) whose behaviour is specified there. The `key` values in this file are the expected outputs of that function.
- **shared/cases/normalize-email.cases.yaml** — The lower-casing and trimming applied before hashing in `identity` cases is the normalisation contract defined in that file.

## Notes

- `root` is explicitly test-only; the value is visible in the file and must never appear in production configuration.
- A blank `email` (`'  '`) takes precedence over a valid `username`—it does **not** fall through. This is a deliberate design choice, not a bug.
- IPv4-mapped IPv6 must be recognised in **both** dotted-decimal (`::ffff:203.0.113.5`) and hex (`::ffff:cb00:7105`) spellings; both forms must unwrap to the same IPv4 key.
- The /56 and /48 masks follow `express-rate-limit` conventions; changing the mask width without updating these cases will silently break rate-limit bucketing.
