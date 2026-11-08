---
source: src/modules/webhooks/transport/webhook-delivery.ts
sha256: aad0defcc0871da585be18b82fffc865cd686a26fed733cf5502ebb48f5e626d
generated_at: 2026-11-08T09:11:17.577684+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/transport/webhook-delivery.ts

## Purpose

Implements a single outbound webhook delivery attempt — SSRF-check, sign, POST, time out — behind one function (`deliverWebhook`) that a worker calls to turn a queued delivery into an HTTP request and a recorded outcome. The function never rejects; every failure path resolves to a `WebhookDeliveryResult` with `success: false`, so a worker can always write a delivery-log row without crashing.

## Key elements

- **`WebhookDeliveryAttempt`** (exported interface) — input contract: `url`, `secrets` (plaintext, already decrypted by caller), `eventId`, `payload`, optional `timeoutMs`.
- **`WebhookDeliveryResult`** (exported interface) — output contract: `success`, `statusCode?`, `durationMs`, `error?`.
- **`deliverWebhook`** (exported function) — signs the payload via `signWebhookPayload`, POSTs via `pinnedHttpsRequest` with a shared `AbortSignal.timeout`, and maps every outcome (2xx, non-2xx, redirect, timeout, network error, SSRF refusal) into a `WebhookDeliveryResult`. Chained with `.then/.catch` rather than `async/await` so that a synchronous `JSON.stringify` throw on a circular payload is caught by the trailing `.catch`.
- **`describeDeliveryError`** (internal) — maps a rejection to a tenant-facing string. SSRF refusals return a fixed message (details go to the logger); `AbortError`/`TimeoutError` map to "Delivery timed out"; other `Error`s pass their `.message` through.
- **`errorName`** (internal) — safely reads `.name` from an unknown without `instanceof Error`, avoiding cross-realm mismatches under Jest's VM sandboxing.
- **`elapsedMs`** (internal) — computes whole-millisecond duration from a `performance.now()` start using monotonic clock.
- **`DEFAULT_TIMEOUT_MS`** — 10 000 ms hard budget covering DNS through last response byte.

## Relationships

- **`src/infrastructure/adapters/pinned-https.ts`** — provides `pinnedHttpsRequest`, the actual HTTPS POST. Chosen over a client library to support custom DNS lookup and to suppress automatic redirect following.
- **`src/infrastructure/adapters/ssrf-guard.ts`** — provides `SsrfRefusedError` (caught in `describeDeliveryError`). URL validation/pinning happens upstream; this file only sees the refusal error type.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called when an SSRF refusal occurs, recording the guard's `reason` and `detail` that are intentionally withheld from the tenant.
- **`./webhook-signing.ts`** — provides `signWebhookPayload`, called with the event id, serialized body, and secret ring to produce the signature headers.
- **`src/modules/webhooks/services/attempt.ts`** — the worker/caller that invokes `deliverWebhook` and persists the resulting `WebhookDeliveryResult` as a delivery-log row.
- **`src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts`** — fuzz tests that exercise the SSRF-refusal and timeout paths of this module.

## Notes

- **Never rejects.** The trailing `.catch` guarantees a resolved `WebhookDeliveryResult`; callers never need a `try/catch`.
- **Redirects are a failure, not a follow.** A 3xx status produces `success: false` with an explanatory message. No redirect following is ever performed, which is the enforcement mechanism behind `ssrf-guard.ts`'s "refuse redirects" guarantee.
- **Always HTTPS.** `ssrf-guard.ts` refuses non-`https:` URLs before they reach this function; there is no HTTP code path here.
- **Response body is drained, not read.** `response.resume()` is called to keep the socket from backing up; only `statusCode` is inspected.
- **Tenant-facing error is fixed for SSRF.** The delivery log shows `'This URL cannot receive webhooks.'`; the actual reason (resolved IP, blocked range) appears only in the server log.
- **Timing is monotonic.** `performance.now()` is used so `durationMs` is always ≥ 0 even if the wall clock steps.
