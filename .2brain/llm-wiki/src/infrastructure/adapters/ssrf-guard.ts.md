---
source: src/infrastructure/adapters/ssrf-guard.ts
sha256: f95aadda2b7fd6db62f2734038628e4091a688dd0a39b399fa5f0be7d9c5cf9d
generated_at: 2026-11-14T17:55:37.748032+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose

SSRF guard for outbound requests this server initiates on a user's behalf (webhook delivery, OAuth avatar re-host). It resolves a URL's DNS, validates **every** resolved address against an allowlist, and returns a target pinned to the validated address so a second DNS lookup at connect time cannot answer differently (DNS-rebinding TOCTOU). Lives in `infrastructure` because it performs DNS I/O.

## Key elements

- **`resolveSafeOutboundTarget`** (exported) — public API: takes a raw URL string (and optional `AbortSignal`), runs all checks, returns a `SafeOutboundTarget` or rejects with `SsrfRefusedError`.
- **`SafeOutboundTarget`** (exported interface) — `{ hostname, resolvedAddress, lookup }`; `lookup` is a `node:net` `LookupFunction` that always answers with the pre-validated address, to be passed as `https.request`'s `lookup` option.
- **`SsrfRefusedError`** (exported) — error subclass carrying a `reason: SsrfRefusalReason` so callers and tests can branch on *why* a URL was refused.
- **`SsrfRefusalReason`** (exported type) — six-literal union: `invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`, `unsafe-port`.
- **`isAddressUnsafe`** (internal) — allowlist via `ipaddr.js`: only `range() === 'unicast'` passes; manually refuses `::/96` (RFC 4291) which `ipaddr.js` misclassifies; unwraps IPv4-mapped IPv6.
- **`resolveAllAddresses`** (internal) — queries A and AAAA independently with `Promise.allSettled`; a literal IP short-circuits. Returns *all* addresses so every one is validated.
- **`buildPinnedLookup`** (internal) — fabricates the `LookupFunction` that ignores the hostname and always returns the single validated address (handles both `all: true` and single-address callback shapes).
- **`rejectOnAbort` / `abortReason`** (internal) — races a promise against an `AbortSignal` because `node:dns/promises` `resolve4`/`resolve6` accept no signal; duck-types `signal.reason` to survive Jest cross-realm `instanceof` failures.

## Relationships

- **`./ssrf-exemptions`** — imports `isSsrfExemptOrigin`; an exempt origin skips the address-safety check (but *not* the scheme or credentials checks).
- **`./config`** — imports `outboundConfig` to read `NODE_OUTBOUND_ALLOWED_PORTS` for the port gate.
- **`pinned-https.ts`** — related outbound adapter in the same directory; appears in the dependency graph as a sibling consumer of this guard's output.
- **`src/modules/webhooks/transport/webhook-delivery.ts`** and **`src/modules/webhooks/services/subscriptions.ts`** — callers that invoke the guard before delivering a webhook to a user-supplied URL.
- **`tests/unit/infrastructure/adapters/ssrf-guard.test.ts`** — unit tests covering each refusal reason and the happy path.
- **`tests/fuzz/ssrf-guard.fuzz.test.ts`** — fuzz-testing of the guard with arbitrary/malformed URLs and DNS answers.
- **`tests/cross-cutting/ssrf-conformance.test.ts`** — cross-cutting conformance suite verifying the guard's behaviour against a shared spec.
- **`tests/unit/infrastructure/adapters/remote-image.test.ts`** — tests for the OAuth avatar re-host path (the other named caller in the module docblock).
- **`tests/unit/infrastructure/adapters/pinned-https.test.ts`** — unit tests for the pinned-https adapter, exercising the guard's output in context.

## Notes

- **Fails closed on multi-address answers.** If *any* resolved address is non-unicast, the entire hostname is refused — returning "the first address" would be the naive bypass this module exists to prevent.
- **All refusals are async.** Even the synchronous URL-parse step is wrapped in `Promise.resolve().then(…)` so callers can uniformly `.catch()`; a sync throw from line 1 would skip that handler.
- **`ipaddr.js` is used as an allowlist, not a blocklist.** Only `unicast` is accepted; benchmarking, NAT64, 6to4, Teredo, site-local, and any unregistered range are all refused by default.
- **WHATWG URL parsing does work for this guard.** Decimal (`2130706433`), octal, and hex IPv4 literals are normalised to dotted-decimal by `new URL()` *before* `.hostname` is read, so they reach `isAddressUnsafe` in canonical form.
- **The `lookup` pin is the security-critical output.** Without passing it to `https.request`, Node re-resolves the hostname at connect time, reopening the TOCTOU window.
