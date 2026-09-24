---
source: src/modules/webhooks/tests/verify-signature.fixture.ts
sha256: 871e457c24640713f0cf9a881a0e4e4f13072bf3d32f24245084b0aae187f4ae
generated_at: 2026-09-23T19:45:43.666751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/verify-signature.fixture.ts

## Purpose

A test-only Standard Webhooks signature verifier. It intentionally does **not** reuse the production signer's private helpers (`../transport/webhook-signing.ts`); instead it implements the spec independently so a passing round-trip test demonstrates interop with the Standard Webhooks format, not merely self-consistency. The codebase only *sends* webhooks, so no production code depends on this module.

## Key elements

- **`VerifyWebhookSignatureInput`** (exported interface) — the full set of values needed for verification: `webhook-id`, `webhook-timestamp`, raw body, `webhook-signature` header, an array of accepted secrets (rotation ring), and optional `toleranceSeconds`.
- **`verifyWebhookSignatureForTest`** (exported function) — the public entry point. Checks the timestamp replay window, then tries every secret × every `v1,<base64>` entry in the header. Returns `true` on the first match.
- **`decodeSecret`** (internal) — strips the optional `whsec_` prefix and base64-decodes the result into raw HMAC key bytes.
- **`computeV1Signature`** (internal) — builds the signed payload string `"{id}.{timestampSeconds}."`, runs SHA-256 HMAC, and returns the `v1,<base64>` string.
- **`signatureEntryMatches`** (internal) — constant-time comparison via `timingSafeEqual`; checks buffer lengths first to avoid the exception `timingSafeEqual` throws on unequal lengths.
- **`toUnixSeconds`** (internal) — normalises a `Date` or unix-seconds value to integer seconds.
- **`DEFAULT_TOLERANCE_SECONDS`** — `300` (5 minutes), matching the production signer's default.

## Relationships

- **`src/modules/webhooks/tests/unit/webhook-signing.test.ts`** — imports `verifyWebhookSignatureForTest` for the sign → verify round-trip unit test.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — imports the same verifier to validate a real signed HTTP request in integration tests.
- **`src/modules/webhooks/transport/webhook-signing.ts`** (referenced in comments, not imported) — the production signer whose wire format this file independently re-implements.

## Notes

- The `whsec_` prefix is an optional decoration on the secret; the verifier strips it before decoding. Tests must pass secrets *with* that prefix to exercise the strip path.
- `timingSafeEqual` throws on unequal-length inputs rather than returning `false`. `signatureEntryMatches` guards against this with an explicit length check, so a length mismatch reads as "no match."
- The `secrets` array is treated as a rotation ring: a delivery signed with either the old or the new key must verify, which is why the function iterates over **all** secrets.
- The body must be the exact bytes received on the wire (string or `Buffer`). Re-serialising a parsed object will break the HMAC and cause a spurious verification failure.
