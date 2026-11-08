---
source: src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts
sha256: c5e0a062b5ce8e77d6c8f78272239f4657dc59bc3982def3db1bc46e67ed242d
generated_at: 2026-11-08T09:08:09.891868+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts

## Purpose

Fuzz-style tests for `deliverWebhook`'s own SSRF-adjacent behaviours: that the total timeout budget covers DNS resolution, that 3xx redirects are refused rather than followed, that the exempted demo host is still https-only, that non-443 ports are blocked before any connection, and that `durationMs` uses a monotonic clock. It deliberately does **not** re-test the generic SSRF guard (covered by `ssrf-guard.fuzz.test.ts`) because the guard is infrastructure, not webhook-owned.

## Key elements

- **`mockDns(v4, v6)`** — configures the mocked `resolve4`/`resolve6` to either resolve to address arrays or reject with an `Error`, making DNS deterministic.
- **`jest.mock('node:dns/promises', …)`** — replaces the real resolver so no test depends on a live DNS server.
- **`jest.mock('node:https', …)`** — replaces the real HTTP client so simulated 3xx / 200 responses never need a real server.
- **`describe("total timeout covers DNS resolution too")`** — feeds a never-settling DNS promise and asserts the 50 ms budget is exhausted before `httpsRequest` is ever called.
- **`describe("a redirect is a failed delivery, never followed")`** — simulates a 302 via an `EventEmitter`-based mock and asserts exactly one `httpsRequest` call, `success: false`, and a `/redirect/i` error.
- **`describe("the exempted demo host is still https-only")`** — registers `https://127.0.0.1:8443` and `http://127.0.0.1:8080` via `registerSsrfExemptOrigin`; verifies the https URL delivers and the http URL is refused with no connection.
- **`describe("a port other than 443 is refused")`** — `it.each([22, 5432, 6379])` confirms no `httpsRequest` call for common service ports.
- **`describe("durationMs is measured on a monotonic clock")`** — steps `Date.now` backwards on each read and asserts `durationMs >= 0` and is an integer.

## Relationships

- **`src/modules/webhooks/transport/webhook-delivery.ts`** — the system under test; this file imports `deliverWebhook` and drives it end-to-end (minus the real socket) to exercise its timeout, redirect, and port logic.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — imported for `registerSsrfExemptOrigin` (to whitelist the demo origin before a test) and `clearSsrfExemptOrigins` (to reset between tests); the exemption mechanism is what allows the private-address delivery test to pass.

## Notes

- `EventEmitter` (not `EventTarget`) is used to mock `IncomingMessage`/`ClientRequest` because `webhook-delivery.ts` calls Node's EventEmitter-based HTTP API; an `EventTarget` double would not match.
- The redirect and exempt-host tests cast `httpsRequest` to `jest.Mock` to configure per-test behaviour while preserving the real export's type signature.
- `beforeEach` resets the DNS mocks; the exemption tests use `afterEach` to call `clearSsrfExemptOrigins`, preventing cross-test contamination.
- The timeout test's "slow DNS" is a promise that never settles (`new Promise(() => undefined)`), not a timed delay, so the test is fast and deterministic.
