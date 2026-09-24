---
source: src/infrastructure/adapters/ssrf-guard.ts
sha256: 72c813cbba40f3f026f7f066a6a0e6c231235e4e0170bb5cd7ad4c650f1b150d
generated_at: 2026-09-23T17:42:00.020530+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-guard.ts

## Purpose

Prevents Server-Side Request Forgery on outbound requests this server initiates on a caller's behalf. It enforces a strict **resolve → validate → pin** sequence so that a second DNS lookup at connect time cannot return a different (internal) address — the DNS-rebinding TOCTOU. Generic and caller-agnostic; `webhooks` is the only consumer today. Lives in `infrastructure` (not `domain/`) because it performs DNS I/O.

## Key elements

- **`SsrfRefusalReason`** — union of five refusal codes (`invalid-url`, `insecure-scheme`, `credentials-in-url`, `dns-resolution-failed`, `unsafe-address`) so callers and tests can branch on *why*.
- **`SsrfRefusedError`** — `Error` subclass carrying the `reason` code; the single error type thrown for every refusal.
- **`SafeOutboundTarget`** — the success shape: `hostname`, `resolvedAddress`, and a `lookup: LookupFunction` ready to pass as `https.request`'s `lookup` option to pin the TCP connection to the validated address.
- **`resolveSafeOutboundTarget(rawUrl, options?)`** — the main exported entry point. Parses the URL, resolves all A/AAAA records, validates every address against refused ranges, and returns a `SafeOutboundTarget`. Accepts an optional `exemptHostname` (bypasses only the `https:` and unsafe-address checks) and an `AbortSignal` for timeout. Always rejects (never throws synchronously) via a `Promise.resolve().then(...)` wrapper.
- **`isAddressUnsafe(address)`** — internal; returns `true` for private, loopback, link-local, unspecified, multicast, CGNAT, broadcast, 6to4, Teredo, and IPv4-compatible (`::/96`) ranges. Recursively re-checks embedded IPv4 in 6to4/Teredo/IPv4-compatible forms.
- **`resolveAllAddresses(hostname, signal?)`** — internal; queries `resolve4` and `resolve6` independently via `Promise.allSettled`, collecting *all* addresses (not just the first).
- **`buildPinnedLookup(address)`** — internal; returns a `LookupFunction` that ignores the hostname and always answers with the pre-validated address, handling both `all: true` and single-address callback shapes.
- **`rejectOnAbort(signal)` / `abortReason(signal)`** — internal helpers that let the DNS lookup honour an `AbortSignal` (since `node:dns/promises` APIs accept no signal option) and safely extract a cross-realm-safe `Error` from `signal.reason`.

## Relationships

- **`src/modules/webhooks/transport/webhook-delivery.ts`** — the sole production caller. Invokes `resolveSafeOutboundTarget` before opening an outbound webhook connection and passes the returned `lookup` into the `https.request` options to pin the connection.
- **`tests/fuzz/ssrf-guard.fuzz.test.ts`** — fuzz-tests the guard's URL parsing and address-validation logic, exercising edge-case IP encodings and malformed inputs.

## Notes

- **Fails closed on multi-answer DNS responses.** If *any* resolved address is unsafe, the entire hostname is refused — not just the offending record. This is deliberate: an attacker who controls one A/AAAA record in a set must not be able to ride on a benign sibling.
- **All refusals are async rejections**, never synchronous throws. The top-level `Promise.resolve().then(...)` wrapper guarantees a single `.catch()` path for callers regardless of which internal check fires first.
- **Credentials in the URL are rejected outright, never stripped.** The rationale: a URL embedding credentials is a misconfiguration, and silently dropping them would deliver to a URL the owner did not intend.
- **`exemptHostname` is narrow.** It bypasses only the `https:` requirement and the unsafe-address check. Parsing, credentials, and DNS resolution still run in full. It is case-sensitive; callers are expected to pass an already-lowercased host.
- **IPv6 encodings are normalized by `new URL()`.** Decimal, octal, and hex IPv4 literals (e.g. `2130706433`) are canonicalized to dotted-decimal by the WHATWG parser before `.hostname` is read, so they reach `isAddressUnsafe` as `127.0.0.1`.
- **`AbortSignal.reason` is duck-typed** (checking `.name`/`.message` rather than `instanceof Error`) because under Jest's VM sandboxing the `DOMException` minted by `AbortSignal.timeout` fails cross-realm `instanceof` checks.
- **`resolve4`/`resolve6` are queried separately and independently** (`Promise.allSettled`), not via `dns.promises.lookup`. A v4-only host's `ENODATA` on the AAAA query is expected and must not suppress the v4 answer (and vice versa).
