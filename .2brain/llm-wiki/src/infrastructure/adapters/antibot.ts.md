---
source: src/infrastructure/adapters/antibot.ts
sha256: ee77a9e0cae1a7df9958a4c58b4d9630b1e1c5d0288cf511d09f58d294fd4cb0
generated_at: 2026-10-01T12:46:51.698300+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot.ts

## Purpose

Rung 2 of the anti-automation ladder: a pure yes/no gate that refuses an email address whose domain appears in a disposable-inbox blocklist, or (under the stricter `mx` policy) whose domain has no MX record. Off by default via `NODE_ANTIBOT_EMAIL_POLICY`; the module only returns a verdict and leaves the caller to decide what refusal means for its endpoint.

## Key elements

- **`EmailPolicy`** (type) — the closed set `'off' | 'disposable' | 'mx'`.
- **`resolveEmailPolicy()`** — reads the policy from `antibotConfig()`; **throws** on an unrecognised value rather than silently falling back to `off`. Exported so the config endpoint can publish it.
- **`checkEmailPolicy(email: string): Promise<RungVerdict>`** — the single public entry point. Extracts the domain, checks the deployment allowlist, then the deployment denylist + community disposable list, then (if policy is `mx`) the MX lookup. Always resolves; never rejects.
- **`mxResolver`** (module-level) — a `dns/promises` Resolver configured with `timeout: 2000, tries: 1` to keep a slow nameserver from stalling a signup request.
- **`hasMxRecord(domain): Promise<boolean>`** (internal) — wraps `resolveMx`; resolves `false` for NXDOMAIN, timeout, or empty result. Never rejects.

## Relationships

- **`antibot-verdict.ts`** — imports the `RungVerdict` type; `checkEmailPolicy` resolves `'ok'` or `'refused'`, both members of that union.
- **`config.ts`** — imports `antibotConfig()` to read `NODE_ANTIBOT_EMAIL_POLICY`, `NODE_ANTIBOT_EMAIL_ALLOWLIST`, and `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` on every call (no caching).
- **`authentication.ts`** — calls `checkEmailPolicy` in the signup flow; the comment notes it is a `.then`-chained caller, which is why the throw in `resolveEmailPolicy` is deferred into the promise.
- **`get-antibot-config.ts`** — imports `resolveEmailPolicy` to include the active policy in `GET /antibot/config`.
- **`feedback/service.ts`** — another consumer of `checkEmailPolicy` for the feedback endpoint.
- **`tests/unit/infrastructure/adapters/antibot.test.ts`** — unit tests covering the three policy postures, allowlist short-circuit, and MX-failure handling.

## Notes

- **Throw is intentional and deferred.** `resolveEmailPolicy` throws on a typo'd env value (e.g. `'disabable'`). Because the call sits inside `Promise.resolve().then(…)`, the throw becomes a *rejection*, not a synchronous exception — a deliberate choice so `.then`-chained callers don't miss it, and the return type stays `Promise<RungVerdict>`.
- **Allowlist is checked before deny/disposable.** A deployment can exempt a domain the community list flags (e.g. a customer's alias service) without removing it from the denylist.
- **MX failures are refusals, not unknowns.** NXDOMAIN, timeout, and "no MX" all resolve `false` → `'refused'`. There is no "unknown" path; the design treats inability to verify as a negative.
- **No commercial verification API is called here.** The disposable check relies on the ~3,500-domain `disposable-email-domains` list plus the deployment's own `DENYLIST_EXTRA`. A per-signup API call (Kickbox, ZeroBounce, etc.) is explicitly out of scope for this rung.
