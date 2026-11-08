---
source: src/kernel/module-config.ts
sha256: ef5f2dd6c2d11dc4ee240f9e25310bf1deed90705eea615e6b200efb562f9298
generated_at: 2026-11-08T03:54:10.640093+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/module-config.ts

## Purpose

Boot-time configuration gate. It collects every config slice contributed by the enabled modules (their declared slices plus auto-generated rate-limit budgets) and the app-level slices handed in by the caller, then validates all of them in a single pass so a misconfigured deployment reports every problem at once instead of one per restart.

## Key elements

- **`configSlicesOf(appModule)`** — Returns one module's slices in declaration order: its `appModule.config` array, followed by a generated rate-limit budget slice (via `rateLimitBudgetConfig`) if `appModule.rateLimits` is non-empty.
- **`moduleConfigSlices(appModules)`** — Flattens `configSlicesOf` across a list of modules, preserving module order.
- **`assertModuleConfig(appModules, appSlices)`** — Public entry point. Combines caller-supplied `appSlices` with all module slices and delegates to `assertConfig`. Throws a single `ConfigError` enumerating every failure.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that all three functions operate on.
- **`src/infrastructure/config/define.ts`** — Provides `assertConfig` (the validation engine) and the `ConfigSlice` type; this file is a thin orchestration layer over it.
- **`src/infrastructure/http/config.ts`** — Provides `rateLimitBudgetConfig`, used to turn a module's `rateLimits` declaration into a config slice.
- **`src/app/config.ts`** — The caller that supplies `appSlices` (config belonging to neither a module nor the kernel).

## Notes

- Under `NODE_ENV=test`, presence and cross-field rules are skipped (Jest builds its own environment per suite), but **shape rules still run**.
- The demo profile receives no exemption; it satisfies the gate the same way any production deployment does, by setting every variable the slices require (`REQUIRED_DEFAULTS` in `scenarios/run-server.ts`).
- Rate-limit budget slices are *derived* from the module's declared `rateLimits`, not stored independently. Deleting a module therefore deletes its gate automatically.
- The kernel deliberately never names an adapter; app-level configuration that doesn't belong to any module is injected by the caller as `appSlices` rather than hardcoded here.
