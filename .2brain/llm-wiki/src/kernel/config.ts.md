---
source: src/kernel/config.ts
sha256: c1328e70b16f4cf0406183a2666b315e8196acfa15a48beb2b3335d1351a3591
generated_at: 2026-10-29T02:19:04.498029+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/config.ts

## Purpose

Kernel-level configuration for cross-cutting concerns: the step-up re-authentication freshness windows and the transactional outbox retry policy. It exists so that any module with money or identity routes can mount `requireFreshAuth` without reaching into a sibling module's config.

## Key elements

- **`reauthConfig`** – `defineConfig` instance (`name: 'reauthentication'`) exposing two integer fields:
  - `NODE_REAUTH_TIME_CRITICAL` (min 0, default from `step-up.generated`)
  - `NODE_REAUTH_TIME_SENSITIVE` (min 0, default from `step-up.generated`)
- **`reauthWindowSeconds(tier: StepUpTier): number`** – reads the live config per call and returns the allowed seconds since last proof for the given tier (`'critical'` or `'sensitive'`). Because it calls `reauthConfig()` inside, a guard created at router-load time still sees the current value.
- **`outboxConfig`** – `defineConfig` instance (`name: 'outbox'`) exposing three integer fields (all min 1, defaults from `outbox.generated`):
  - `NODE_OUTBOX_RETENTION_DAYS`
  - `NODE_OUTBOX_MAX_ATTEMPTS`
  - `NODE_OUTBOX_LEASE_SECONDS`

## Relationships

- **`src/infrastructure/config/define.ts` / `fields.ts`** – provides `defineConfig` and the `int` field validator used to declare both config objects.
- **`src/kernel/permissions.ts`** – source of the `StepUpTier` type that `reauthWindowSeconds` accepts.
- **`src/kernel/step-up.generated.ts`** – supplies default window values for the reauth config.
- **`src/kernel/outbox.generated.ts`** – supplies default retention, attempt, and lease values for the outbox config.
- **`src/kernel/middlewares/authorizations.ts`** – consumes `reauthWindowSeconds` to enforce freshness checks on protected routes.
- **`src/app/config.ts`** – app-level config that registers or merges these kernel configs into the application's runtime config.
- **Contract/integration tests** (account, api-keys, delivery, orders) – reference these config values or the `reauthWindowSeconds` behavior to assert that step-up and outbox retry semantics match the declared policy.

## Notes

- Defaults are **not** hard-coded; they come from the `.generated.ts` files (`step-up.generated.ts`, `outbox.generated.ts`), meaning the source of truth is wherever the generator reads from.
- `reauthWindowSeconds` calls `reauthConfig()` on every invocation rather than caching the object at module load, so runtime config changes (e.g. via a config store) are picked up without a restart.
- All fields are constrained with `min` (0 for reauth, 1 for outbox) — setting a value below those will fail validation at config-load time.
