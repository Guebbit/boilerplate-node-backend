---
source: src/infrastructure/adapters/antibot.ts
sha256: 4a9bb6e43ee926c07d811abf2f808bf88fa54d3076d28314df6590b68d8574ff
generated_at: 2026-11-08T03:17:33.604741+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot.ts

## Purpose

Rung 2 of the anti-automation ladder. Answers a single yes/no question—whether an email address passes the deployment's anti-disposable-inbox policy—and returns a `RungVerdict`. It does not enforce the verdict; each caller decides what `refused` means for its endpoint. Off by default because an aggressive blocklist can refuse legitimate forwarding-service users.

## Key elements

- **`EmailPolicy`** (type) — the three postures selectable via `NODE_ANTIBOT_EMAIL_POLICY`: `'off' | 'disposable' | 'mx'`.
- **`resolveEmailPolicy()`** — reads the active policy from `antibotConfig()` and throws on an invalid value rather than silently defaulting to `'off'`. Exported so the config endpoint can publish it.
- **`checkEmailPolicy(email)`** — the main entry point. Returns `Promise<RungVerdict>`. Under `'off'` always resolves `'ok'`; under `'disposable'` rejects known disposable domains plus any deployment-specific denylist additions; under `'mx'` additionally performs a DNS MX (with RFC 5321 A/AAAA fallback) lookup.
- **`mxResolver`** (internal) — a `Resolver` configured with `timeout: 2000, tries: 1` so a slow nameserver cannot stall a signup request.
- **`isNoDataError`** (internal) — distinguishes "no such data" (`ENOTFOUND`/`ENODATA`) from "lookup failed" (timeout, SERVFAIL, etc.). Only the former is treated as evidence of a non-mail domain.
- **`hasMxRecord`** (internal) — resolves `false` only on positive evidence of "no mail" (NXDOMAIN, null MX per RFC 7505, or no MX + no A/AAAA). Any failed lookup resolves `true` (fail-open) and logs a warning.
- **`hasAddressRecord`** (internal) — RFC 5321 §5.1 fallback: checks A and AAAA records when MX is absent.

## Relationships

- **`./antibot-verdict`** — imports the `RungVerdict` type used as the return type of `checkEmailPolicy`.
- **`./config`** — reads `NODE_ANTIBOT_EMAIL_POLICY`, `NODE_ANTIBOT_EMAIL_ALLOWLIST`, and `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` via `antibotConfig()`.
- **`./logger`** — logs warnings when MX or address lookups fail (fail-open path).
- **`modules/antibot/service`** — consumes `resolveEmailPolicy` to publish the active policy on `GET /config`.
- **`modules/account/services/signup`** — calls `checkEmailPolicy` as part of the signup flow; the doc comment notes its `.then`-chained style requires the throw to surface as a rejected promise.
- **`modules/tasks/service`** — another caller of `checkEmailPolicy`.
- **`tests/unit/infrastructure/adapters/antibot.test.ts`** — unit tests for this module.

## Notes

- **Fail-open by design.** A DNS timeout, SERVFAIL, or any non-NXDOMAIN/ENODATA error resolves to `true` (allow) with a logged warning. The module only *refuses* on positive evidence.
- **`resolveEmailPolicy` throws, but `checkEmailPolicy` wraps it in `Promise.resolve().then(…)`** so the throw becomes a rejected promise, matching the declared `Promise<RungVerdict>` return type and ensuring `.then`-chained callers (e.g. `signup`) catch it in their rejection path.
- **Allowlist short-circuits before denylist/disposable/MX checks.** A deployment can exempt specific domains (forwarding services, customer domains flagged by mistake) even under the `mx` policy.
- **`NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA`** is for deployment-specific abuse patterns not yet in the upstream `disposable-email-domains` list. Freshness of the upstream list is considered an upstream responsibility.
- **Null MX (RFC 7505)** is reported by Node as `exchange` being `''` or `'.'`; the code checks both.
- **Domain extraction** uses `email.slice(email.lastIndexOf('@') + 1)` and lower-cases for list membership; no shape validation is performed here (upstream's job).
