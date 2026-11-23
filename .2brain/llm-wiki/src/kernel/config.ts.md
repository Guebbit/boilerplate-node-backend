---
source: src/kernel/config.ts
source_sha256: fd5d9c616cfa30a3befcb1ed03cd022d4027c50122004ca179efe632aacd0939
context_sha256: d6a8587a4e68d88f4dcf1684560f1fb95ac038ab69fd873b65a149e4a60563d4
generated_at: 2026-11-22T03:12:23.974792+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/config.ts

## Purpose
Defines the kernel-level configuration: the step-up (re-authentication) freshness windows that `requireFreshAuth` enforces, and the transactional outbox relay's retry/retention policy. It lives in the kernel rather than in `account` because any module with a money or identity route mounts `requireFreshAuth`, and modules may not reach into a sibling's config.

## Key elements
- `reauthConfig` — `defineConfig` block named `reauthentication` with two integer fields (min 0):
  - `NODE_REAUTH_TIME_CRITICAL`, default `stepUpWindowData.critical`
  - `NODE_REAUTH_TIME_SENSITIVE`, default `stepUpWindowData.sensitive`
- `reauthWindowSeconds(tier)` — returns the allowed seconds since the caller last proved themselves for a `StepUpTier`: `critical` (money, destructive) uses the critical value; any other tier uses the sensitive value. Reads config on each call, so guards built at router-load time see live settings.
- `outboxConfig` — `defineConfig` block named `outbox` with integer fields (min 1):
  - `NODE_OUTBOX_RETENTION_DAYS`, default `outboxRuleData.retentionDays`
  - `NODE_OUTBOX_MAX_ATTEMPTS`, default `outboxRuleData.maxAttempts`
  - `NODE_OUTBOX_LEASE_SECONDS`, default `outboxRuleData.leaseSeconds`

## Relationships
- Built on `defineConfig` from `src/infrastructure/config/define.ts` and the `int` field helper from `src/infrastructure/config/fields.ts`.
- Imports the `StepUpTier` type from `src/kernel/permissions.ts`.
- `src/kernel/middlewares/authorizations.ts` is the natural consumer of `reauthWindowSeconds` (the `requireFreshAuth` guard).
- `src/kernel/outbox.ts` is the outbox implementation that corresponds to `outboxConfig`.
- `src/app/config.ts` is a sibling config entry point in the app layer.
- Contract and integration tests (account, api-keys, delivery, orders, users) and `tests/support/http.ts` are linked in the graph, likely setting or relying on the reauth windows.

## Notes
- Defaults are not hard-coded here; they come from the generated data modules `./outbox.generated` and `./step-up.generated`, so change the source data rather than this file.
- The reauth window is resolved per call via `reauthConfig()`, not captured at module load.
- Unlike the outbox fields, reauth values allow `0` (min 0), while outbox values must be at least 1.
