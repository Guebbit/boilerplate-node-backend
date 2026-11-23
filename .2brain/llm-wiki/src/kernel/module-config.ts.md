---
source: src/kernel/module-config.ts
source_sha256: 7e4ce0b66e14409b8b48616d97ee50fbb23e86378c0eb123eb7c35fa8dd6ba04
context_sha256: b6a6ba1dd58ceed39249312d2120a945f63baa5aa57c7eeccb4b62981d379b99
generated_at: 2026-11-22T03:13:29.181758+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/module-config.ts

## Purpose
The boot-time configuration gate. It collects every config slice the application requires (from modules and from the caller) and validates them in a single pass, so a misconfigured deployment reports all its problems at once rather than one per restart. It lets the kernel stay adapter-agnostic: modules declare their own slices, and anything else is passed in by the caller.

## Key elements
- `configSlicesOf(appModule)`: returns one module's slices: its declared `appModule.config` (if any), plus a generated rate-limit budget slice named `<module name>-rate-limits` when the module declares `rateLimits`.
- `moduleConfigSlices(appModules)`: flat-maps `configSlicesOf` over the module list, preserving module order.
- `assertModuleConfig(appModules, appSlices)`: runs `assertConfig` over `appSlices` followed by all module slices. It throws a single `ConfigError` listing every problem.

## Relationships
- `src/kernel/registry.ts`: provides the `AppModule` type, whose `config`, `rateLimits` and `name` fields are read here.
- `src/infrastructure/config/define.ts`: provides `assertConfig` (the validator) and the `ConfigSlice` type.
- `src/infrastructure/http/config.ts`: provides `rateLimitBudgetConfig`, used to turn a module's `rateLimits` into a slice.
- `src/app/config.ts`: the caller that supplies `appSlices`, meaning the config that belongs to no module and that the kernel must not name.
- Tests: `tests/unit/kernel/module-config.test.ts` covers this file directly. Module tests (account, orders, payments, products, shop, webhooks), `tests/unit/app/config.test.ts` and `tests/unit/scripts/setup/first-run.test.ts` are related through the dependency graph.

## Notes
- Under `NODE_ENV=test`, presence and cross-field rules are skipped, but shape rules still apply.
- The demo profile has no exemption. It must set every variable that a slice asks for.
- Because rate-limit slices are generated from the module's own declarations, removing a module also removes its config gate.
- App-level slices come first in the validated list, followed by module slices.
