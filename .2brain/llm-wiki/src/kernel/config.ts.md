---
source: src/kernel/config.ts
sha256: c1328e70b16f4cf0406183a2666b315e8196acfa15a48beb2b3335d1351a3591
generated_at: 2026-11-08T03:52:58.123900+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/config.ts

## Purpose

Defines the kernel-level runtime configuration for two cross-cutting concerns: the step-up reauthentication freshness windows (`reauthConfig`) and the transactional outbox relay policy (`outboxConfig`). It lives in the kernel rather than any module so that every module mounting `requireFreshAuth` or reading outbox rules gets its values from a single, module-agnostic source.

## Key elements

- **`reauthConfig`** — A `defineConfig` instance named `"reauthentication"` exposing two integer settings: `NODE_REAUTH_TIME_CRITICAL` and `NODE_REAUTH_TIME_SENSITIVE` (both `min: 0`). Defaults come from `step-up.generated`.
- **`reauthWindowSeconds(tier)`** — Given a `StepUpTier` (`"critical"` | `"sensitive"`), returns the corresponding freshness window in seconds by reading `reauthConfig()` at call time, so the value is always live.
- **`outboxConfig`** — A `defineConfig` instance named `"outbox"` exposing `NODE_OUTBOX_RETENTION_DAYS`, `NODE_OUTBOX_MAX_ATTEMPTS`, and `NODE_OUTBOX_LEASE_SECONDS` (all `min: 1`). Defaults come from `outbox.generated`.

## Relationships

- **`src/infrastructure/config/define.ts`** / **`src/infrastructure/config/fields.ts`** — Provides the `defineConfig` factory and the `int` field descriptor used to declare both config shapes.
- **`src/kernel/permissions.ts`** — Exports the `StepUpTier` type that `reauthWindowSeconds` accepts.
- **`src/kernel/middlewares/authorizations.ts`** — The `requireFreshAuth` middleware reads `reauthWindowSeconds` to decide whether a caller's session is still fresh enough for the requested tier.
- **`src/kernel/outbox.ts`** — Consumes `outboxConfig` for the relay's retention, max-attempt, and lease-seconds behavior.
- **`src/app/config.ts`** — The app-level config layer that can override or layer on top of these kernel defaults.
- **`tests/support/http.ts`** and the module contract/integration test files — Exercise the behaviors governed by these settings (reauth windows, outbox retry limits) through the public HTTP surface.

## Notes

- Defaults are sourced from generated files (`step-up.generated`, `outbox.generated`), not hard-coded. Change the generated source, not the literals here.
- `reauthWindowSeconds` calls `reauthConfig()` on every invocation, so the value reflects the current environment/runtime setting rather than a value captured at router-build time. Do not "optimize" this into a module-level constant.
- Both configs use `name` strings (`"reauthentication"`, `"outbox"`) that must match any external config-store or override mechanism keyed by those names.
