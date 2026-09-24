---
source: src/modules/webhooks/transport/webhook-signing.ts
sha256: 07bf2ec72cbd3ecad601db75a3db5c86a6c866afa1bf3d18eb62fcb477d03079
generated_at: 2026-09-23T19:46:11.821582+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-signing.ts

## Purpose

Implements Standard Webhooks (v1) outbound signing using `node:crypto` directly, avoiding a third-party dependency for a ~15-line HMAC routine. It produces the three required delivery headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) and supports a multi-secret "ring" for zero-downtime key rotation. This file signs only; no production verification path lives here.

## Key elements

- **`WebhookSignatureHeaders`** (exported interface) — the three-header shape returned to the caller.
- **`SignWebhookPayloadInput`** (exported interface) — `id`, optional `timestamp` (`Date` or unix-seconds `number`), raw `body` (`string | Buffer`), and a `secrets` array (plaintext, optionally `whsec_`-prefixed).
- **`signWebhookPayload`** (exported function) — resolves the timestamp, maps every secret through the HMAC pipeline, joins the resulting `v1,<base64>` values with spaces, and returns `{ headers: WebhookSignatureHeaders }`.
- **`computeV1Signature`** (internal) — builds `${id}.${timestampSeconds}.` as a string prefix via `hmac.update`, then appends the raw body bytes; returns `v1,<base64>`. Shared by the signing path (and conceptually by any verifier) so the signed-content format is written in exactly one place.
- **`decodeSecret`** (internal) — strips an optional `whsec_` prefix and base64-decodes the remainder into the raw HMAC key bytes.
- **`toUnixSeconds`** (internal) — normalises `Date | number | undefined` to integer unix seconds (`undefined` → now).

## Relationships

- **`src/modules/webhooks/transport/webhook-delivery.ts`** — the delivery layer that calls `signWebhookPayload` to obtain the headers it attaches to each outbound HTTP request.
- **`src/modules/webhooks/tests/unit/webhook-signing.test.ts`** — unit tests that assert byte-for-byte agreement with the Standard Webhooks spec's own published test vector (the `sign function works` fixture in the upstream JS library), not merely self-consistency.
- **`src/modules/payments/providers/webhook-signature.ts`** — a separate signing module in the payments domain; this file is the transport-level equivalent for the general webhook pipeline. They are parallel implementations, not imports of one another.

## Notes

- The body is never re-serialised here. Callers must pass the exact bytes (or string) that were/will be sent over the wire; JSON-ifying a second time would break the HMAC.
- `hmac.update` is called twice (prefix string, then body) specifically to avoid concatenating the body into a new string and forcing a re-encode when it is already a `Buffer`.
- Multiple space-separated `v1,…` values in `webhook-signature` are the spec's rotation mechanism: pass both old and new secrets only during the overlap window.
- The `whsec_` prefix is accepted but not required; it is stripped before base64 decoding. A secret generated here is wire-compatible with any Standard Webhooks–conformant library.
