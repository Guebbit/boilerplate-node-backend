---
source: src/infrastructure/adapters/ssrf-guard.ts
sha256: c7cebe646de828c34ba829230396bb6667f6dff298b7cac1027be9c3d330f266
generated_at: 2026-09-27T14:08:28.842666+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose

Prevents Server-Side Request Forgery when this server initiates an outbound HTTP(S) request on a user's behalf. It follows a **resolve → validate → pin** sequence: resolves the hostname, rejects the target if *any* resolved address is non-public, and returns a `lookup` function that pins the subsequent TCP connection to the validated address — closing the DNS-rebinding TOCTOU window that a second resolution at connect time would open. Lives in `infrastructure` (not `domain/`) because it performs DNS I/O.

## Key elements

- **`SsrfRefusalReason`** — discriminated union (`invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`) so callers and tests can branch on *why* a target was refused.
- **`SsrfRefusedError`** — `Error` subclass carrying a `reason: SsrfRefusalReason`; every refusal path throws/rejects this.
- **`SafeOutboundTarget`** — the validated result: `hostname`, `resolvedAddress`, and a `lookup: LookupFunction` to pass as `https.request`'s `lookup` option.
- **`resolveSafeOutboundTarget(rawUrl, exemptHostname?, signal?)`** — the sole public entry point. Parses/gates the URL, resolves all A + AAAA records, validates every address, and returns a pinned target. Always rejects (never synchronously throws) so callers chain a single `.catch`.
- **`parseOutboundUrl`** — enforces `https:` scheme and rejects embedded credentials; runs before any DNS I/O.
- **`isAddressUnsafe`** — allowlist check via `ipaddr.js`: only `range() === 'unicast'` passes. Unwraps IPv4-mapped IPv6 literals first.
- **`resolveAllAddresses`** — queries `resolve4` and `resolve6` independently (`Promise.allSettled`), collects *all* addresses, and races against an optional `AbortSignal`.
- **`buildPinnedLookup(address)`** — returns a `LookupFunction` that ignores the hostname and always answers with the pre-validated address (handles both `all: true` and single-address callback shapes).
- **`rejectOnAbort` / `abortReason`** — utility pair to race a DNS lookup against a caller-supplied `AbortSignal` (since `node:dns/promises` accepts no signal option).

## Relationships

- **`src/modules/webhooks/transport/webhook-delivery.ts`** — the sole caller today. Invokes `resolveSafeOutboundTarget` before issuing the delivery `https.request`, using the returned `lookup` to pin the connection.
- **`tests/fuzz/ssrf-guard.fuzz.test.ts`** — fuzz-tests the guard's URL-parsing and address-validation paths (e.g., non-canonical IPv4 encodings, multi-answer responses, malformed DNS data).

## Notes

- **Fails closed on multi-answer responses:** if *any* resolved address is unsafe, the entire hostname is refused — not just the offending address. This is deliberate: an attacker needs only one bad record among several.
- **Allowlist, not blocklist:** only IANA `unicast` range passes. Reserved, benchmarking, NAT64, 6to4, Teredo, site-local, etc. are all refused by default.
- **`exemptHostname` is narrow:** it waives only the `https:` and private-address checks. URL parsing, credential rejection, and DNS resolution still run in full. Never exempts credentials-in-URL.
- **All refusals are async rejections.** `resolveSafeOutboundTarget` wraps its body in `Promise.resolve().then(…)` so even the first-line parse error rejects rather than throws synchronously, keeping a single `.catch` path for callers.
- **Cross-realm `instanceof` pitfall:** `abortReason` duck-types on `.name`/`.message` rather than using `instanceof Error`, because Jest's VM sandbox produces a `DOMException` that fails `instanceof` checks across realm boundaries.
- **IPv4 normalization is free:** `new URL()` applies the WHATWG IPv4 parser, so decimal/octal/hex encodings (e.g. `0x7f000001`) are canonicalised to `127.0.0.1` *before* `isAddressUnsafe` sees them.
