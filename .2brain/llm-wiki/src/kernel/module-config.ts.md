---
source: src/kernel/module-config.ts
sha256: ef5f2dd6c2d11dc4ee240f9e25310bf1deed90705eea615e6b200efb562f9298
generated_at: 2026-10-14T08:23:02.071717+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/module-config.ts

## Purpose

Boot-time configuration gate. It collects every required config slice across all enabled modules (plus caller-supplied app-level slices) and validates them in a single pass, so a misconfigured deployment reports every problem at once instead of failing one variable per restart.

## Key elements

- **`configSlicesOf(appModule)`** — Returns the `ConfigSlice[]` one module contributes: its declared `AppModule.config` slices plus a generated rate-limit budget slice (via `rateLimitBudgetConfig`) if the module declares `rateLimits`.
- **`moduleConfigSlices(appModules)`** — Flattens `configSlicesOf` across a module list, preserving declaration order.
- **`assertModuleConfig(appModules, appSlices)`** — The actual gate. Concatenates caller-supplied `appSlices` with all module slices and delegates to `assertConfig`. Throws a single `ConfigError` listing every shape, presence, or cross-field violation.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type (the shape of `config` and `rateLimits` fields consumed here).
- **`src/infrastructure/config/define.ts`** — Provides `assertConfig` and the `ConfigSlice` type; this file is a thin caller of that validation engine.
- **`src/infrastructure/http/config.ts`** — Provides `rateLimitBudgetConfig`, which turns a module's declared rate-limit data into a `ConfigSlice`.
- **`src/app/config.ts`** — The caller. It owns the "belongs to no module, but isn't the kernel's business" slices and passes them as `appSlices` into `assertModuleConfig`.
- **`tests/unit/kernel/module-config.test.ts`** — Direct unit tests for the three exports.
- Module-level tests (`src/modules/{orders,payments,products,webhooks}/tests/unit/…`) and `tests/unit/app/config.test.ts` exercise these functions indirectly through their respective module manifests.

## Notes

- Under `NODE_ENV=test` (i.e., Jest), **presence** and **cross-field** rules are skipped because each test suite builds its own environment. **Shape** rules still run.
- The demo profile has no special exemption; it satisfies the gate by setting every required variable (see `scenarios/run-server.ts` → `REQUIRED_DEFAULTS`).
- Rate-limit budget slices are *derived* from module data, not declared separately — deleting a module automatically removes its gate.
- The kernel deliberately does not name any adapter or app-level concern; those slices are injected by the caller to keep the kernel adapter-agnostic.
