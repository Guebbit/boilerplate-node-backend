---
source: src/modules/webhooks/transport/webhook-delivery.ts
sha256: 307476af23de3240346bbe5f956fc40cfb6df68a2f7bd2b61cca67dd906c1d7a
generated_at: 2026-11-14T22:52:19.459027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-delivery.ts

## Purpose

Implements a single outbound webhook delivery attempt: SSRF-check, payload signing, HTTPS POST, and timeout — all wrapped so the caller (`attempt.ts` worker) always receives a resolved `WebhookDeliveryResult` and never a rejection. It exists as the one function a worker calls to turn a queued delivery into an HTTP request and a loggable outcome.

## Key elements

- **`deliverWebhook(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryResult>`** — The sole public function. Serializes the payload, signs it, issues a pinned HTTPS POST with a single `AbortSignal` covering DNS + response, and maps every outcome (2xx, 3xx, 4xx/5xx, timeout, network error, SSRF refusal) into a result object.
- **`WebhookDeliveryAttempt`** (interface) — Input: `url`, `secrets` (plaintext, caller-decrypted), `eventId`, `payload`, optional `timeoutMs`.
- **`WebhookDeliveryResult`** (interface) — Output: `success`, optional `statusCode`, `durationMs`, optional `error`.
- **`describeDeliveryError(error)`** — Maps a rejection to a tenant-safe string; logs the real reason for SSRF refusals; identifies timeouts by `.name` (`AbortError` / `TimeoutError`).
- **`errorName(error)`** — Safe `.name` extraction that avoids `instanceof Error` (Jest cross-realm issue).
- **`elapsedMs(startedAt)`** — Monotonic duration via `performance.now()`, rounded to integer ms.
- **`SSRF_REFUSED_TEXT`** — Fixed tenant-facing message; the actual reason is log-only.
- **`DEFAULT_TIMEOUT_MS`** — 10 000 ms hard budget for the whole attempt.

## Relationships

- **`src/infrastructure/adapters/pinned-https.ts`** — Provides `pinnedHttpsRequest`, the actual POST primitive (custom DNS `lookup`, no auto-redirect).
- **`src/infrastructure/adapters/ssrf-guard.ts`** — Source of `SsrfRefusedError` (caught for tenant messaging) and the upstream DNS-pinning/URL-refusal guarantee this file relies on.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called on SSRF refusal to record the refusal reason and detail for operational debugging.
- **`src/modules/webhooks/transport/webhook-signing.ts`** — `signWebhookPayload` produces the signature headers attached to the request.
- **`src/modules/webhooks/services/attempt.ts`** — The calling service; invokes `deliverWebhook` per queued attempt and writes the returned result into the delivery log.
- **`src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts`** — Fuzz-tests the SSRF-refusal path exercised through this module.

## Notes

- **Never rejects.** Every failure path resolves to `{ success: false, error: … }`. Callers can unconditionally write a log row.
- **No redirects, ever.** 3xx is read as a failed delivery; `pinnedHttpsRequest` does not follow them. This is why `node:https` was chosen over a higher-level client.
- **Chained promises, not `async`/`await`.** `JSON.stringify` runs inside the first `.then` so a circular-payload throw becomes a rejection the trailing `.catch` handles — no separate `try`/`catch` needed.
- **Single `AbortSignal`** covers DNS resolution *and* the POST. The DNS-phase timeout surfaces as `TimeoutError` (from `AbortSignal.timeout`); the POST-phase timeout surfaces as `AbortError`. Both are mapped to the same "Delivery timed out" string.
- **`response.resume()`** drains the body without reading it, preventing socket back-pressure on endpoints that send large unsolicited bodies.
- **Cross-realm `instanceof` pitfall.** Under Jest's VM sandbox a `DOMException` fails `instanceof Error` in the test realm; `errorName` reads `.name` via duck-typing to sidestep this.
- **Always TLS.** `ssrf-guard.ts` refuses every non-`https:` URL before this code runs.
