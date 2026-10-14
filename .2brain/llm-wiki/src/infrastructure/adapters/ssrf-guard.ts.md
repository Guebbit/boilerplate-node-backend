---
source: src/infrastructure/adapters/ssrf-guard.ts
sha256: e3de7fcf538237a967e0c46db423c1a58fd643a7c7631861323ba1b45da35be2
generated_at: 2026-10-14T07:50:09.121492+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose

Prevents Server-Side Request Forgery (SSRF) for outbound requests this server initiates on a user's behalf. Enforces a strict **resolve → validate → pin** order so a second DNS lookup (the classic DNS-rebinding TOCTOU) can never swap the target after validation. Used by the webhook delivery pipeline and the OAuth avatar re-host. Lives in infrastructure (not `domain/`) because it performs DNS I/O.

## Key elements

- **`SsrfRefusalReason`** (type) — union of six refusal categories: `invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`, `unsafe-port`. Lets callers and tests branch on *why* a URL was refused.
- **`SsrfRefusedError`** (class) — carries a `reason: SsrfRefusalReason` alongside a human-readable message. Thrown (or rejected) on every failed check.
- **`SafeOutboundTarget`** (interface) — the success shape: `hostname`, `resolvedAddress`, and a `lookup` function (Node `LookupFunction`) that pins the TCP connection to the validated address.
- **`resolveSafeOutboundTarget`** (async, main export) — the public entry point. Accepts a URL string and an optional `AbortSignal`; always *rejects* (never throws synchronously) on refusal, returning `SafeOutboundTarget` on success. Fails closed: if *any* resolved address is unsafe, the whole hostname is refused.
- **`isAddressUnsafe`** (internal) — allowlist check via `ipaddr.js`: only `unicast` range passes. Unwraps IPv4-mapped IPv6. Explicitly refuses the deprecated `::/96` block that `ipaddr.js` misclassifies as unicast.
- **`isPortAllowed`** (internal) — permits 443 or ports listed in `outboundConfig().NODE_OUTBOUND_ALLOWED_PORTS`.
- **`parseOutboundUrl`** (internal) — no-I/O gates: requires `https:`, rejects embedded credentials. Relies on WHATWG `URL` parsing to normalize IPv4 literals (decimal, octal, hex) before the address check.
- **`resolveAllAddresses`** (internal) — queries `resolve4` and `resolve6` independently via `Promise.allSettled`; returns *all* addresses (not just the first). Supports literal IP passthrough.
- **`buildPinnedLookup`** (internal) — produces the `LookupFunction` stored on `SafeOutboundTarget.lookup`, ignoring the hostname and always returning the pre-validated address.
- **`rejectOnAbort` / `abortReason`** (internal) — race a promise against an `AbortSignal` (needed because `node:dns/promises` accepts no signal). Duck-types `signal.reason` on `.name`/`.message` to survive Jest's cross-realm `instanceof` mismatch.

## Relationships

- **`./ssrf-exemptions`** — imports `isSsrfExemptOrigin` to let operators whitelist specific origins from the address check (exemptions apply to the address gate only; scheme and credential rules have no exception).
- **`./config`** — imports `outboundConfig` to read `NODE_OUTBOUND_ALLOWED_PORTS` for the port allowlist.
- **`./pinned-https`** — downstream consumer; receives the `SafeOutboundTarget` (particularly its `lookup` function) to make the actual HTTPS request pinned to the validated IP.
- **`src/modules/webhooks/…`** (`subscriptions.ts`, `webhook-delivery.ts`) — the primary callers that invoke `resolveSafeOutboundTarget` before delivering a webhook.
- **Tests** — `ssrf-guard.test.ts` (unit), `ssrf-guard.fuzz.test.ts` (fuzz), `pinned-https.test.ts`, and `remote-image.test.ts` exercise the guard through its public API and integration points.

## Notes

- **All rejections, no synchronous throws.** The public function starts with `Promise.resolve().then(…)` so even the first-line URL-parse failure rejects rather than throws, keeping a single `.catch()` contract for callers.
- **Fail-closed on multi-answer DNS.** An attacker only needs one private IP among several to win; the guard validates *every* returned address and refuses the hostname if any one is unsafe.
- **`resolve4`/`resolve6` are independent.** A v4-only host legitimately returns `ENODATA` for `resolve6`; that is swallowed via `allSettled` and must not mask the valid v4 answer.
- **The `lookup` pin is the core TOCTOU defense.** Without it, Node re-resolves the hostname at `connect()` time, opening the window for a DNS-rebinding swap. Passing `SafeOutboundTarget.lookup` as `https.request`'s `lookup` option eliminates that second lookup.
- **Stryker annotations** disable specific mutators (`LogicalOperator`, `ObjectLiteral`, `BooleanLiteral`) where the mutated form is provably equivalent; these markers should be preserved when editing those lines.
- **The `::/96` special case** (IPv4-compatible IPv6, RFC 4291) is handled with an explicit CIDR match because `ipaddr.js` reports it as `unicast`.
