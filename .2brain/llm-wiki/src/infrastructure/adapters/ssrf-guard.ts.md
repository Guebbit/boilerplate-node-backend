---
source: src/infrastructure/adapters/ssrf-guard.ts
sha256: e3de7fcf538237a967e0c46db423c1a58fd643a7c7631861323ba1b45da35be2
generated_at: 2026-11-08T03:24:18.427670+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose

Prevents Server-Side Request Forgery on outbound requests the server makes on a user's behalf. Enforces the resolve → validate → pin sequence so that a second DNS lookup at connect time cannot return a different (private) address than the one that was validated — closing the DNS-rebinding TOCTOU window. Callers today are the webhooks delivery path and the OAuth avatar re-host.

## Key elements

- **`SsrfRefusalReason`** (type) — Union of the six ways a URL can be refused: `invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`, `unsafe-port`.
- **`SsrfRefusedError`** (class) — Extends `Error`; carries a `reason: SsrfRefusalReason` so callers and tests can branch on *why* a URL was rejected.
- **`SafeOutboundTarget`** (interface) — Returned on success. Contains `hostname`, `resolvedAddress`, and a `lookup: LookupFunction` that pins the TCP connection to the validated address.
- **`resolveSafeOutboundTarget`** (async) — The public entry point. Parses the URL, resolves all A/AAAA records, validates every resolved address, checks the port, and returns a `SafeOutboundTarget`. Always rejects (never synchronously throws). Accepts an `AbortSignal` for a caller-supplied time budget.
- **`buildPinnedLookup`** (internal) — Produces the `LookupFunction` that ignores the hostname argument and always returns the single pre-validated address, handling both `all: true` and single-address callback shapes.
- **`isAddressUnsafe`** (internal) — Allowlist check via `ipaddr.js`: only `unicast` range passes. Unwraps IPv4-mapped IPv6, and explicitly refuses the `::/96` IPv4-compatible block (which `ipaddr.js` mislabels as unicast).
- **`isPortAllowed`** (internal) — Permits port 443 or any port listed in `NODE_OUTBOUND_ALLOWED_PORTS` from `outboundConfig()`.
- **`resolveAllAddresses`** (internal) — Queries `resolve4` and `resolve6` independently via `Promise.allSettled`; a literal IP short-circuits. Returns *every* resolved address so none can be skipped.
- **`rejectOnAbort` / `abortReason`** (internal) — Races a DNS promise against an `AbortSignal` (node's `resolve4/6` accept no signal). `abortReason` duck-types `signal.reason` as an `Error` to survive Jest's cross-realm VM boundary.

## Relationships

- **`config.ts`** — Imports `outboundConfig()` to read `NODE_OUTBOUND_ALLOWED_PORTS` for the port allowlist.
- **`ssrf-exemptions.ts`** — Imports `isSsrfExemptOrigin` for per-origin address-check exemptions (exemptions never bypass scheme or credential checks).
- **`pinned-https.ts`** — Consumes the `lookup` function from `SafeOutboundTarget` to pin the actual TLS connection.
- **`webhook-delivery.ts` / `subscriptions.ts`** — Primary production callers; invoke `resolveSafeOutboundTarget` before delivering a webhook.
- **Tests** — Covered by `ssrf-guard.test.ts` (unit), `ssrf-conformance.test.ts` (cross-cutting), and `ssrf-guard.fuzz.test.ts` (fuzz). `pinned-https.test.ts` and `remote-image.test.ts` exercise the guard indirectly through their callers.

## Notes

- **Fails closed on multi-answer DNS:** if *any* resolved address is non-unicast, the entire hostname is refused. This is deliberate — an attacker who controls only one of several returned A/AAAA records would otherwise succeed.
- **Always rejects, never throws:** the public API starts with `Promise.resolve().then(…)` so even synchronous parse errors land in the caller's `.catch()` chain rather than escaping as an unhandled throw.
- **`new URL()` as a normaliser:** WHATWG host-parsing converts decimal/octal/hex IPv4 encodings to dotted-decimal *before* `.hostname` is read, so they reach `isAddressUnsafe` in canonical form rather than looking like opaque hostnames.
- **Exemptions are narrow:** `isSsrfExemptOrigin` can only waive the address check. Scheme and credential refusals are unconditional.
- **Jest cross-realm quirk:** `abortReason` avoids `instanceof Error` because Jest's VM makes `AbortSignal.timeout`'s `DOMException` fail cross-realm identity checks; duck-typing on `.name`/`.message` is the workaround.
- **Stryker suppressions** are present on lines where mutation testing confirms the alternative is functionally equivalent (e.g., the `stripBrackets` logical-operator, the `rejectOnAbort` abort-listener shape).
