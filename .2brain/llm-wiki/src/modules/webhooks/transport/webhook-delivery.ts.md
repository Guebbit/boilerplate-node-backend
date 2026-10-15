---
source: src/modules/webhooks/transport/webhook-delivery.ts
sha256: d4453b0989d3428ab876b80b9194da03544b3dbc34b8526ac6f38246dfdaa2f9
generated_at: 2026-10-15T12:25:32.491279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-delivery.ts

## Purpose

Single outbound webhook delivery attempt: SSRF-check the URL, sign the payload, POST over pinned HTTPS with a hard timeout, and return a structured result. `deliverWebhook` **never rejects** — every failure path (SSRF refusal, DNS failure, timeout, non-2xx) resolves to a `WebhookDeliveryResult` with `success: false` and a human-readable `error`, so the calling worker can always write a delivery-log row without a try/catch.

## Key elements

- **`deliverWebhook(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryResult>`** — The sole functional export. Chained `.then`/`.catch` (not `async`/`await`) so that a synchronous throw from `JSON.stringify` on a circular payload is captured by the trailing `.catch`. Steps: serialize payload → sign → `pinnedHttpsRequest` POST → check status → return result. One `AbortSignal.timeout` covers DNS resolution *and* the full response.
- **`WebhookDeliveryAttempt`** (interface) — Input contract: `url`, `secrets[]` (plaintext, already decrypted by caller), `eventId`, `payload` (serialized here exactly once), optional `timeoutMs`.
- **`WebhookDeliveryResult`** (interface) — Output contract: `success`, optional `statusCode`, `durationMs`, optional `error`.
- **`describeDeliveryError(error)`** — Maps any rejection to a tenant-safe log line. SSRF refusals get a fixed string (`SSRF_REFUSED_TEXT`); details go to `logger.warn` only. Timeouts are detected by `.name` (`AbortError` or `TimeoutError`) rather than `instanceof` to survive cross-realm `DOMException` under Jest.
- **`errorName(error)`** — Safe `.name` reader that avoids requiring `instanceof Error`.

## Relationships

- **`pinned-https.ts`** — Provides `pinnedHttpsRequest`, the actual HTTPS call with a custom `lookup` for DNS pinning and no automatic redirect following. This file is its direct consumer for the POST.
- **`ssrf-guard.ts`** — Supplies `SsrfRefusedError` (caught and translated to a fixed tenant message) and enforces that only `https:` URLs reach this module. The guard's `rejectOnAbort` / `signal.reason` is the source of the `TimeoutError` name handled here.
- **`webhook-signing.ts`** — Provides `signWebhookPayload`, called with `{ id, body, secrets }` to produce the signature headers merged into the POST request.
- **`logger.ts`** — Used for a single `warn` call when the SSRF guard refuses a URL (reason and detail are logged; the tenant never sees them).
- **`attempt.ts` (services)** — The worker/service layer that calls `deliverWebhook` and writes the resulting log row.
- **`webhook-ssrf.fuzz.test.ts`** — Fuzz-tests the SSRF refusal path exercised by this file's error handling.
- **`generate-role-matrix.ts` (scripts/docs)** — Documentation generator that references this module's public API surface.

## Notes

- **No redirects, ever.** A 3xx response is recorded as a failed delivery (`"redirects are never followed"`). The file does not call `response`'s location or re-issue a request. This is what makes the SSRF guard's "refuse redirects" guarantee real.
- **Always TLS.** The SSRF guard rejects non-`https:` URLs upstream; this file assumes the URL is already `https:`.
- **Payload serialization is the file's responsibility.** The caller passes `payload: unknown`; `JSON.stringify` happens once here, and the exact bytes are both signed and sent.
- **Timeout is one signal for the whole attempt** (DNS + connect + response), not just the socket read. `AbortSignal.timeout` is created once and passed into `pinnedHttpsRequest`.
- **Response body is drained, not read.** `response.resume()` is called to prevent socket back-pressure from an endpoint that sends an unexpected body.
- **Cross-realm `instanceof` guard.** Under Jest's VM sandbox, a `DOMException` from `AbortSignal.timeout` fails `instanceof Error` in the test realm. The code reads `.name` instead; this is intentional and should not be "simplified" to `instanceof`.
