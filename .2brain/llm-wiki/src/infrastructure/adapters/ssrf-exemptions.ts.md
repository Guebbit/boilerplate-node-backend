---
source: src/infrastructure/adapters/ssrf-exemptions.ts
sha256: 0c2bbf4d1092937ace1403a1209c46f9ca094b5f814ccc0159f384682c24cffe
generated_at: 2026-10-14T07:49:44.366354+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-exemptions.ts

## Purpose

A zero-import module that holds a `Set` of origins exempt from the SSRF guard's private-address check. It lives in its own file (with no dependencies) so that a dev/demo preload script or a Jest setup file can register an exemption *before* the application — and its DNS-related imports — load, avoiding load-order issues. In production the set is always empty; nothing under `src/` registers an entry.

## Key elements

- **`exemptOrigins`** (module-level, not exported) — a `Set<string>` of fully-qualified origins (`https://host:port`) that may resolve to a private address.
- **`registerSsrfExemptOrigin(origin: string): void`** — adds one origin to the set.
- **`clearSsrfExemptOrigins(): void`** — empties the set; intended as a test-seam teardown.
- **`isSsrfExemptOrigin(origin: string): boolean`** — membership check; the SSRF guard calls this to decide whether to skip its private-address rejection for that origin.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the guard consults `isSsrfExemptOrigin` to allow one origin through its private-IP block. The guard still enforces the `https:` scheme rule, credential stripping, URL parsing, and DNS resolution for exempt origins; only the "resolves to a private address" check is waived.
- **`scenarios/support/doubles/webhook-sink.ts`** — a development/demo double that calls `registerSsrfExemptOrigin` for its own listening origin *before* the application boots, so the guard does not reject its private-address webhook URL.
- **Test files** (`webhooks.test.ts`, `webhook-ssrf.fuzz.test.ts`, `ssrf-guard.fuzz.test.ts`, `webhooks-seed.test.ts`, `ssrf-guard.test.ts`, `webhook-sink.test.ts`) — register an exemption in setup and call `clearSsrfExemptOrigins` in teardown to isolate suites.

## Notes

- Exemptions are **per-origin** (host **and** port), not per-host. Registering `https://127.0.0.1:3070` does not open every port on `127.0.0.1`.
- The file intentionally has **zero imports**. If you add an import here, you break the "register before DNS loads" invariant that the dev preload and Jest setup rely on.
- `clearSsrfExemptOrigins` wipes *all* entries; there is no per-origin unregister. If two suites run in the same process, the second `clear` removes the first suite's exemption as well.
