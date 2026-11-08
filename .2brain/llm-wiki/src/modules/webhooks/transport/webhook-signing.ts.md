---
source: src/modules/webhooks/transport/webhook-signing.ts
sha256: 07bf2ec72cbd3ecad601db75a3db5c86a6c866afa1bf3d18eb62fcb477d03079
generated_at: 2026-11-08T09:11:31.733172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-signing.ts

## Purpose

Implements Standard Webhooks (spec: standardwebhooks.com) **signing only**, hand-rolled over `node:crypto` to avoid a dependency for what is ~12 lines of HMAC. Produces the three outgoing headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) that `webhook-delivery.ts` attaches to each delivery. There is no production verifier in this codebase — the sender never receives signed webhooks.

## Key elements

- **`WebhookSignatureHeaders`** (interface) — the three headers and their shapes; the return type's `headers` field.
- **`SignWebhookPayloadInput`** (interface) — what `signWebhookPayload` accepts: `id`, optional `timestamp` (`Date` or unix seconds), `body` (the already-serialized bytes, `string | Buffer`), and `secrets` (array of plaintext ring secrets).
- **`signWebhookPayload`** (export) — signs the payload against every secret in the ring, joins the resulting `v1,…` values with spaces, and returns `{ headers: WebhookSignatureHeaders }`.
- **`computeV1Signature`** (internal) — single-responsibility step: `v1,<base64(hmac-sha256)>` for one secret over `${id}.${timestamp}.${body}`. Shared by both signing and (hypothetical) verification paths.
- **`decodeSecret`** (internal) — strips the optional `whsec_` prefix, then base64-decodes the remainder into raw HMAC key bytes.
- **`toUnixSeconds`** (internal) — resolves `Date | number | undefined` to a unix-seconds integer (`undefined` → now).

## Relationships

- **`webhook-delivery.ts`** — direct consumer: calls `signWebhookPayload` to obtain the three headers it sends with each delivery.
- **`webhook-signing.test.ts`** — unit tests for this file; assert byte-for-byte against the spec's own published example (the `sign function works` fixture in the standard-webhooks JS library), not merely self-consistency.
- **`fields.ts`** (config) — source of the secret ring values that callers pass as the `secrets` array into `signWebhookPayload`.

## Notes

- **Body is never re-serialized here.** Callers must pass the exact bytes (string or `Buffer`) that were or will be sent on the wire. Re-serializing JSON upstream would produce a different signature.
- **Secret encoding is base64, not plain text.** The decoded bytes are the HMAC key. This matches the ecosystem's on-wire shape, so a secret generated here verifies in any Standard Webhooks-compatible library and vice versa. The `whsec_` prefix is optional and stripped before decoding.
- **Rotation = multiple signatures, one header.** Every secret in the array produces a `v1,…` entry; they are space-separated in a single `webhook-signature` header. Pass more than one secret only during a rotation overlap.
- **Signing-only file.** A verifier exists solely in `tests/verify-signature.fixture.ts` for asserting both sides of the spec agree. Do not look for a `verify*` export here.
