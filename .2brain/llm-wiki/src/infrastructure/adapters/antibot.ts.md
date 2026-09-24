---
source: src/infrastructure/adapters/antibot.ts
sha256: 9ab00e4b8acfcc567eefacf6c1f4f605a000c226b5c3316c1c0e57c87338cb33
generated_at: 2026-09-23T17:38:05.388596+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot.ts

## Purpose

Rung 2 of the anti-automation ladder: a pure yes/no gate that checks whether a submitted email domain is a known disposable inbox (or, under the `mx` policy, lacks an MX record). It is intentionally policy-agnostic — it returns a `RungVerdict` and leaves the consequence of `refused` to each caller. Off by default to avoid false-positives on legitimate forwarding services.

## Key elements

- **`EmailPolicy`** (type) — closed union `'off' | 'disposable' | 'mx'`, selected via `NODE_ANTIBOT_EMAIL_POLICY`.
- **`isEmailPolicy`** — type-guard for the three valid policy strings; exported so `kernel/required-config.ts` can validate at boot without triggering `resolveEmailPolicy`'s throw.
- **`resolveEmailPolicy()`** — reads the env var, returns the active policy, or **throws** on an unrecognized value (silent fallback to `off` is deliberately avoided).
- **`checkEmailPolicy(email)`** — the public entry point. Returns `Promise<RungVerdict>` (`'ok'` or `'refused'`). Checks allowlist → deployment denylist extra → `disposable-email-domains-js` list → (mx policy only) MX record lookup.
- **`domainSetFrom`** (internal) — parses a comma-separated env string into a lower-cased `Set<string>`, same convention as `app/security.ts` for `NODE_CORS_ORIGIN`.
- **`hasMxRecord`** (internal) — wraps `resolveMx`; resolves `false` (i.e. "refuse") on NXDOMAIN, timeout, or empty record set.

## Relationships

- **`./antibot-verdict.ts`** — imports the `RungVerdict` type that `checkEmailPolicy` returns.
- **`src/modules/account/services/authentication.ts`** — a caller that chains `.then` on the returned promise (hence the `Promise.resolve().then(...)` wrapper to keep `resolveEmailPolicy`'s throw in the async lane).
- **`src/modules/antibot/controllers/get-antibot-config.ts`** — calls `resolveEmailPolicy()` to publish the active policy alongside other rung config.
- **`src/modules/antibot/module.ts`** — registers the endpoint(s) that depend on this adapter.
- **`src/modules/feedback/service.ts`** — another caller that invokes `checkEmailPolicy` before accepting a feedback email.
- **`tests/unit/infrastructure/adapters/antibot.test.ts`** — unit tests covering each policy branch, allowlist/denylist parsing, and the MX path.

## Notes

- `resolveEmailPolicy()` is read **per call** (no caching), mirroring the pattern in `payments/config.ts`'s `defaultCurrency`. This means a deployment can flip the policy at runtime without a restart.
- The env var `NODE_ANTIBOT_EMAIL_ALLOWLIST` is checked **before** the disposable list, so a deployment can un-block a domain that the upstream list flags in error.
- `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` is for domains the deployment has already observed in abuse but that are not yet in the community list; it is a complement, not a replacement.
- The `mx` policy does **not** treat DNS failure as "unknown" — it treats it as "refuse." This is intentional: a domain that cannot be resolved is more likely disposable than transiently unavailable.
- No commercial email-verification API is called here by design; that is a separate, opt-in concern.
