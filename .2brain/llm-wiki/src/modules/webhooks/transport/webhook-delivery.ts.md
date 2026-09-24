---
source: src/modules/webhooks/transport/webhook-delivery.ts
sha256: 9ca53b805e17f542ee6f232fc1597928c84679049f3f49d1a1ac1696420f0957
generated_at: 2026-09-23T19:46:00.868109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-delivery.ts

## Purpose

Implements a single outbound webhook delivery attempt — SSRF-validate the target, sign the payload, POST it over HTTP/HTTPS, and enforce a hard timeout. It is the one function a worker calls to turn a queued delivery into an HTTP request and a recorded outcome. It never rejects; every failure path resolves to a `WebhookDeliveryResult` with `success: false`, so a caller can always write a delivery-log row without a `try/catch`.

## Key elements

- **`deliverWebhook`** (exported) — Entry point. Accepts a `WebhookDeliveryAttempt`, runs `resolveSafeOutboundTarget` → `signWebhookPayload` → `postSignedPayload` in a promise chain, and returns a `Promise<WebhookDeliveryResult>`. Uses one shared `AbortSignal.timeout` for the entire attempt (DNS + request).
- **`WebhookDeliveryAttempt`** (exported interface) — Input shape: `url`, `secrets` (plaintext ring), `eventId`, `payload`, optional `timeoutMs` and `allowedInsecureHost`.
- **`WebhookDeliveryResult`** (exported interface) — Output shape: `success`, `statusCode?`, `durationMs`, `error?`. Directly mappable to a delivery-log row.
- **`postSignedPayload`** (internal) — Wraps `node:http`/`node:https` `request` in a promise. Sets `lookup` from the SSRF guard, pins the port, passes the abort signal. Drains the response body (`resume()`) and resolves with only `{ statusCode }`.
- **`describeDeliveryError`** (internal) — Maps any rejection (`SsrfRefusedError`, `AbortError`/`TimeoutError`, generic `Error`) to a single human-readable string for the log.
- **`errorName`** (internal) — Safely reads `.name` off an unknown rejection value without `instanceof Error` (avoids cross-realm issues under Jest).
- **`DEFAULT_TIMEOUT_MS`** — `10_000` ms; the hard budget covering DNS resolution through the last response byte.

## Relationships

- **`@infrastructure/adapters/ssrf-guard`** — Imports `resolveSafeOutboundTarget`, `SsrfRefusedError`, and `SafeOutboundTarget`. The guard performs SSRF validation and DNS pinning; this file passes the resulting `lookup` function into the `node:https`/`node:http` request options so the socket connects to the already-validated IP.
- **`./webhook-signing`** — Imports `signWebhookPayload` and `WebhookSignatureHeaders`. Calls it with the serialized body, event ID, and secret ring to obtain the three `webhook-*` headers that are sent alongside the POST.
- **`src/modules/webhooks/services/attempt.ts`** — Consumer of `deliverWebhook`; the service layer that queues deliveries and calls this function to execute one, then persists the `WebhookDeliveryResult`.
- **`src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts`** — Fuzz-tests the SSRF-guard interaction surfaced through `deliverWebhook` (malformed URLs, redirect attempts, etc.).

## Notes

- **Redirects are a hard failure.** A 3xx status is returned as `success: false` with a specific error message. No `Location` header is ever read or followed.
- **`hostname` vs. `lookup`.** The request options keep the _original_ hostname (for TLS SNI / cert verification) while `lookup` is overridden with the SSRF guard's pinned resolver. These are independent: the socket connects to the pinned IP, but the certificate is checked against the configured name.
- **`node:http` is reachable only for the SSRF guard's one exempted demo host.** Every other `http:` URL is refused by `resolveSafeOutboundTarget` before a request module is selected.
- **Promise chain, not `async/await`.** Deliberate: moving `JSON.stringify` inside the first `.then` converts a synchronous throw (e.g. circular payload) into a rejection that the trailing `.catch` already handles.
- **Cross-realm `instanceof` pitfall.** Under Jest's VM sandbox a `DOMException` (used as `AbortSignal.timeout`'s rejection reason) fails `instanceof Error` against this file's realm. `errorName` sidesteps this by reading `.name` duck-typed.
- **Response body is drained, never parsed.** `incomingResponse.resume()` prevents socket back-pressure from an endpoint that sends an unsolicited body; only `statusCode` is retained.
