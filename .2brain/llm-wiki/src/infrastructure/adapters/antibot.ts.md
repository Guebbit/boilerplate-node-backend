---
source: src/infrastructure/adapters/antibot.ts
sha256: e8253a34fa607b1a91077fa91666a984734c739e7950bbbd6b16575d08cb3562
generated_at: 2026-09-27T14:04:45.091910+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot.ts

## Purpose

Rung 2 of the anti-automation ladder: answers a yes/no question — "is this email domain acceptable?" — by checking it against a disposable-email blocklist and (optionally) the domain's MX records. It does **not** decide what a refusal means for any particular endpoint; each caller interprets the `refused` verdict itself. Off by default to avoid false-positive blocks on legitimate forwarding services.

## Key elements

- **`EmailPolicy`** — union type `'off' | 'disposable' | 'mx'` selecting the enforcement posture.
- **`isEmailPolicy(value)`** — type guard over the closed set; exported so `kernel/required-config.ts` can validate at boot without importing the throwing resolver.
- **`resolveEmailPolicy()`** — reads `NODE_ANTIBOT_EMAIL_POLICY` fresh per call (no caching). Throws on an unrecognized value rather than silently falling back to `off`.
- **`checkEmailPolicy(email): Promise<RungVerdict>`** — the main entry point. Returns `'ok'` or `'refused'`. Always resolves *or* rejects (never throws synchronously) so `.then`-chained callers like signup/feedback handle it as a promise.
- **`hasMxRecord(domain)`** (private) — single-try, 2-second DNS MX lookup. NXDOMAIN, timeout, and empty record set all resolve to `false` (i.e. "refuse").
- **`domainSetFrom(value)`** (private) — parses a comma-separated env string into a lower-cased `Set<string>` (same convention as `NODE_CORS_ORIGIN`).

## Relationships

- **`antibot-verdict.ts`** — provides the `RungVerdict` type (`'ok' | 'refused'`) returned by `checkEmailPolicy`.
- **`authentication.ts`** — calls `checkEmailPolicy` during signup/login to gate accounts behind a known email domain.
- **`feedback/service.ts`** — calls `checkEmailPolicy` before accepting a feedback submission, treating a `refused` verdict as a rejection.
- **`get-antibot-config.ts`** — calls `resolveEmailPolicy` (and `isEmailPolicy`) to publish the active rung-2 posture in `GET /antibot/config`.
- **`module.ts`** — wires the adapter into the module graph / DI container for the other callers above.
- **`antibot.test.ts`** — unit-tests `isEmailPolicy`, `resolveEmailPolicy`, and `checkEmailPolicy` under all three policies plus allow/deny-list edge cases.

## Notes

- `checkEmailPolicy` deliberately wraps `resolveEmailPolicy()` inside `Promise.resolve().then(…)` so an invalid env value surfaces as a **rejected promise**, not a synchronous throw. Callers using `.then()` without a `.catch()` will get an unhandled rejection rather than a caught exception.
- The MX resolver (`new Resolver({ timeout: 2000, tries: 1 })`) is intentionally strict: the default `resolveMx` can retry for tens of seconds inside a signup request.
- `NODE_ANTIBOT_EMAIL_ALLOWLIST` is checked **before** the deny-list and the upstream `disposable-email-domains-js` lookup, so a deployment can always exempt a domain.
- The disposable-domain list comes from the community-maintained `disposable-email-domains` project (~3 500 entries). `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` is for abuse a deployment sees that hasn't been upstreamed yet.
- A commercial verification API (Kickbox, ZeroBounce, …) would catch brand-new disposable services faster, but this rung deliberately avoids a paid third-party call.
