---
source: src/infrastructure/adapters/ssrf-guard.ts
generated_at: 2026-11-22T02:43:01.971200+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose
SSRF guard for outbound requests the server makes on someone else's behalf (currently webhooks and the OAuth avatar re-host). It follows resolve → validate → pin, so a second DNS lookup can't return a different answer after a target is approved (DNS-rebinding TOCTOU). It lives in infrastructure rather than `domain/` because it performs DNS I/O. Range rationale and what is left to callers (redirects, timeouts) are documented in the project's SSRF defence documentation, referenced from the module docblock.

## Key elements
- `SsrfRefusalReason`: union of refusal causes: `invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`, `unsafe-port`.
- `SsrfRefusedError`: `Error` subclass carrying a `reason`, so callers and tests can branch on why a URL was refused.
- `SafeOutboundTarget`: result shape with `hostname`, `resolvedAddress` (the single validated address), and `lookup`, a `LookupFunction` to pass to `https.request` so the connection uses the validated address instead of re-resolving.
- `parseOutboundUrl` (internal): runs the no-I/O checks first. It requires `https:` and rejects embedded credentials, with no exemptions for either. It relies on WHATWG `new URL()` normalizing decimal/octal/hex IPv4 literals to dotted-decimal.
- `isPortAllowed` (internal): allows 443 (or an omitted port) plus any port in `outboundConfig().NODE_OUTBOUND_ALLOWED_PORTS`.
- `isAddressUnsafe` (internal): allowlist check. It returns true unless the `ipaddr.js` library classifies the address as `unicast`. It unwraps IPv4-mapped IPv6, treats non-IP strings as unsafe, and refuses the deprecated `::/96` block by CIDR.
- `resolveAllAddresses` (internal): a literal IP resolves to itself. A hostname is looked up with `resolve4` and `resolve6` via `Promise.allSettled`, and it fails with `dns-resolution-failed` only if neither returns anything. An optional `AbortSignal` is raced against the lookup.
- `abortReason` / `rejectOnAbort` (internal): turn an abort signal into a rejected `Error`. `abortReason` duck-types `name`/`message` rather than using `instanceof`, because of Jest cross-realm `DOMException` mismatches. `rejectOnAbort` is needed because `resolve4`/`resolve6` accept no signal.
- `buildPinnedLookup` (internal): a `lookup` that ignores the hostname and always returns the validated address. It handles both the `all: true` and single-address callback shapes.
- `resolveSafeOutboundTarget`: the main entry point. It resolves a URL, validates every resolved address, and returns a pinned `SafeOutboundTarget`. It fails closed: any unsafe address refuses the whole hostname. Every refusal, including parse errors, is a rejected promise rather than a synchronous throw. The rest of its implementation is not shown here.

## Relationships
- `src/infrastructure/adapters/config.ts`: provides `outboundConfig()`, whose `NODE_OUTBOUND_ALLOWED_PORTS` drives the port allowlist.
- `src/infrastructure/adapters/ssrf-exemptions.ts`: provides `isSsrfExemptOrigin`, which is imported here. Per the comments, an exemption (such as the demo host) only ever covers the address check, never scheme or credentials.
- `src/infrastructure/adapters/pinned-https.ts`: a related adapter. It is presumably where the pinned `lookup` gets used for the actual request, but that is not visible in this file.
- `src/modules/webhooks/services/subscriptions.ts` and `src/modules/webhooks/transport/webhook-delivery.ts`: webhook callers, per the module docblock.
- `tests/unit/infrastructure/adapters/remote-image.test.ts` covers the OAuth avatar re-host, the other caller named in the docblock.
- Tests: `tests/unit/infrastructure/adapters/ssrf-guard.test.ts` (unit), `tests/fuzz/ssrf-guard.fuzz.test.ts` (fuzz), `tests/cross-cutting/ssrf-conformance.test.ts` (cross-cutting), `tests/unit/infrastructure/adapters/pinned-https.test.ts` and `tests/unit/infrastructure/adapters/remote-image.test.ts`.

## Notes
- Redirects and timeouts are deliberately left to the caller.
- Address checking is an allowlist (`unicast` only), so unlisted special-purpose ranges are refused by default.
- Every resolved address is validated, not just the first, because an attacker needs only one private answer.
- Stryker mutation-testing disable comments mark a few equivalent mutants.
