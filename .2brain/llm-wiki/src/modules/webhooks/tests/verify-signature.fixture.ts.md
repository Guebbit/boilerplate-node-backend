---
source: src/modules/webhooks/tests/verify-signature.fixture.ts
sha256: 871e457c24640713f0cf9a881a0e4e4f13072bf3d32f24245084b0aae187f4ae
generated_at: 2026-11-08T09:11:02.022614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/verify-signature.fixture.ts

## Purpose

Test-only helper that verifies a Standard Webhooks–signed delivery. It is written independently of the production signer (`webhook-signing.ts`) so that a passing round-trip test proves conformance to the [Standard Webhooks spec](https://www.standardwebhooks.com), not merely that one function inverts itself. The codebase only ever *sends* webhooks; this fixture simulates the receiving side for tests.

## Key elements

- **`VerifyWebhookSignatureInput`** (exported interface) — the full set of parameters needed for verification: `id`, `timestamp` (Date or unix seconds), raw `body`, the `webhook-signature` header, a ring of accepted `secrets`, and optional `toleranceSeconds`.
- **`verifyWebhookSignatureForTest`** (exported function) — the single public entry point. Checks the replay window, then tests every secret in the ring against every `v1,<base64>` entry in the signature header. Returns `true` if any secret/entry pair matches and the timestamp is within tolerance.
- **`toUnixSeconds`** — normalises a `Date` or number to integer unix seconds.
- **`decodeSecret`** — strips an optional `whsec_` prefix and base64-decodes the secret into HMAC key bytes.
- **`computeV1Signature`** — computes the `v1,<base64>` HMAC-SHA256 digest over `id.timestampSeconds.body` using `node:crypto`.
- **`signatureEntryMatches`** — constant-time comparison of two `v1,<base64>` entries via `timingSafeEqual`, with a length check first (because `timingSafeEqual` throws on unequal-length buffers).
- **`DEFAULT_TOLERANCE_SECONDS`** — 300 s replay window, matching the production default.
- **`SECRET_PREFIX`** — the `whsec_` literal stripped before base64 decoding.

## Relationships

- **`src/modules/webhooks/tests/unit/webhook-signing.test.ts`** — primary consumer; exercises the sign/verify round trip.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — secondary consumer; verifies a real signed request end-to-end.
- **`src/modules/webhooks/transport/webhook-signing.ts`** — the production signer this fixture deliberately does *not* import. The fixture re-implements the spec independently to avoid a self-referential test.

## Notes

- **Independence is intentional.** Do not refactor this file to call `signWebhookPayload` or share its helpers; that would turn a spec-conformance test into a tautology.
- **`timingSafeEqual` throws on length mismatch.** The code guards with an explicit length check so a mismatch reads as "no match" rather than an uncaught exception.
- **Body must be the raw received bytes** (`string | Buffer`), never a re-serialised object, or the HMAC will not match.
- **Multi-secret ring.** The `secrets` array models key rotation: a delivery signed under either the old or the new secret must verify.
- **Not part of the production module surface.** Nothing outside tests should import from this file.
