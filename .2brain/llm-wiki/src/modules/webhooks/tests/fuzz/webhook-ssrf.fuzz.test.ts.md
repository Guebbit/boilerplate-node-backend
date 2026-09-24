---
source: src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts
sha256: 8c39fdb068d39c35fee33f813a077209b44b34092bc64c339b9d9a75db057b7b
generated_at: 2026-09-23T19:43:54.030279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts

## Purpose

Fuzz tests for the SSRF-adjacent behaviors that live inside `deliverWebhook` itself — the shared timeout budget (DNS + POST), the hard refusal of 3xx redirects, and the single plain-HTTP exemption path. It deliberately does **not** re-test the generic SSRF guard; that hostile-URL table belongs to `tests/fuzz/ssrf-guard.fuzz.test.ts` so that deleting the `webhooks` module never deletes the guard's only coverage.

## Key elements

- **Mocked `node:dns/promises`** (`resolve4`, `resolve6`) — makes DNS resolution deterministic; the `mockDns(v4, v6)` helper sets both to resolve or reject per test.
- **Mocked `node:https` / `node:http`** (`request`) — replaces the real socket layer so redirect and plain-HTTP cases need no live server.
- **`describe` – timeout covers DNS** — asserts that a never-settling `resolve4`/`resolve6` exhausts the `timeoutMs` budget and that `httpsRequest` is never called.
- **`describe` – redirect refusal** — drives a simulated `302` response (via `EventEmitter` standing in for `IncomingMessage`) and asserts exactly one request is made, the result is `success: false`, and the error matches `/redirect/i`.
- **`describe` – plain-HTTP exemption** — passes `allowedInsecureHost: '127.0.0.1'` with an `http://` URL; asserts `httpRequest` is called once and `httpsRequest` is never called.

## Relationships

- **Imports & exercises** `deliverWebhook` from `src/modules/webhooks/transport/webhook-delivery.ts` — the sole production code under test. Every assertion is about that function's return shape (`success`, `error`, `statusCode`) and which Node `request` it delegates to.
- **Sibling test file** `tests/fuzz/ssrf-guard.fuzz.test.ts` (referenced in the file header comment) owns the generic guard's hostile-URL table; this file assumes the guard already passed and tests only what happens *after* the guard lets a request through.

## Notes

- DNS is fully mocked; the suite must never depend on a real resolver.
- `require('node:dns/promises')` is used post-`jest.mock` to obtain the `jest.Mock` handles for per-test configuration (hence the `eslint-disable` for `no-require-imports`).
- HTTP response doubles are built on `EventEmitter`, not `EventTarget`, because `webhook-delivery.ts` calls the Node `IncomingMessage`/`ClientRequest` EventEmitter API — an `EventTarget` substitute would not match.
- The plain-HTTP path is only reachable when the caller supplies `allowedInsecureHost` that exactly matches the target hostname; the guard blocks every other `http://` target before it reaches `node:http`.
