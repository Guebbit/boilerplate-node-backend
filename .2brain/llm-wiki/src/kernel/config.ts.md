---
source: src/kernel/config.ts
sha256: 981dde2ffd6ca05842d1de24051b6f6ea80c2933c2f153581ea9cca7d5f55725
generated_at: 2026-10-14T08:21:33.369202+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/config.ts

## Purpose

Defines the two kernel-level configuration groups that cross-cut all modules: the step-up (re-authentication) time windows enforced by `requireFreshAuth`, and the transactional outbox relay's retry/retention/lease policy. Kept at the kernel layer so that any module with a money or identity route can mount the guard without reaching into a sibling's config namespace.

## Key elements

- **`reauthConfig`** – A `defineConfig` block named `"reauthentication"` with two `int` fields:
  - `NODE_REAUTH_TIME_CRITICAL` (default 300 s, min 0) – freshness window for money/destructive actions.
  - `NODE_REAUTH_TIME_SENSITIVE` (default 900 s, min 0) – freshness window for identity/session actions.
- **`reauthWindowSeconds(tier: StepUpTier): number`** – Maps a tier (`"critical" | "sensitive"`) to its freshness window. Calls `reauthConfig()` on every invocation, so a long-lived guard always sees the current value rather than a snapshot taken at router-load time.
- **`outboxConfig`** – A `defineConfig` block named `"outbox"` with three `int` fields:
  - `NODE_OUTBOX_RETENTION_DAYS` (default 7, min 1)
  - `NODE_OUTBOX_MAX_ATTEMPTS` (default 10, min 1)
  - `NODE_OUTBOX_LEASE_SECONDS` (default 60, min 1)

## Relationships

- **`src/infrastructure/config/define.ts`** – Provides `defineConfig`, the factory used to build both config blocks with shape validation.
- **`src/infrastructure/config/fields.ts`** – Provides the `int` field descriptor (type + constraints) used for every entry in both shapes.
- **`src/kernel/permissions.ts`** – Source of the `StepUpTier` type that `reauthWindowSeconds` accepts as its parameter.
- **`src/kernel/middlewares/authorizations.ts`** – The `requireFreshAuth` middleware that calls `reauthWindowSeconds` to decide whether a session is still fresh enough.
- **`src/kernel/outbox.ts`** – Consumes `outboxConfig` to drive the relay's attempt cap, retention sweep, and lease-grant logic.
- **`src/app/config.ts`** – App-level composition layer that wires kernel configs into the boot-time config registry.
- **Contract / integration tests** (account, api-keys, delivery, orders) – Assert the default windows and retry counts exposed by these config blocks.

## Notes

- `reauthWindowSeconds` is intentionally *not* a constant lookup; it re-reads the config on every call. Caching the result at module scope would silently freeze the value to whatever was in effect when the router first loaded.
- Both config blocks use `min` bounds rather than `max`, so operators can raise the windows but not set them below the stated floor.
- The module doc comment points to `docs/tools/configuration.md` for the operator-facing reference; the code here is the source of truth for defaults and constraints.
