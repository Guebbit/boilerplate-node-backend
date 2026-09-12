# Scenarios next — 5. One registry, one prelude, one vocabulary

Back to the [index](SCENARIOS_NEXT.md).

> **Status, re-verified at `aaf4789c` on 2026-09-11: decided, not started.** Only one row is done:
> `assembleDemoDataset` / `exportSeeded*` went with the dataset (`d4506845`). The evidence below
> was re-checked after `d4506845` deleted `export-dataset.ts` and `assemble.ts`.
>
> **Amended 2026-09-12: the peer's WIP landed** (`c9c67811`), so there is nothing to coordinate any
> more — `src/kernel/access/tenant.ts` is committed and `seed.ts` re-exports `DEMO_TENANT_ID` from
> it. It also did part of this plan's work already: `bootstrapAccessModel` (the shop + the presets)
> is now split from `seedAccessModel` (that plus the demo memberships), which is the split the
> "moves" table asks for — what is left is moving the memberships into `seedShop`/`seedBlank`.
>
> **Amended 2026-09-12: item 4 is also built** (`worktree-scenarios-next`, merged to `main`), so the
> blocking dependency below is clear.
>
> **Built, 2026-09-12: everything below.** The registry (`SCENARIOS`, `ScenarioName`), every move
> and every rename landed. Two small deviations from the sketch, both for the better:
>
> - `SCENARIOS`'s entries return `Promise<SeedOutcome[]>`, not the sketch's `Promise<void>` —
>   `scenario:apply`'s created/skipped count still comes from the same call, and TypeScript's
>   void-return covariance would have accepted either.
> - `demoModuleFor`'s `Partial<>` view idea is gone: `findUnmetGuarantees`/`assertScenarioGuarantees`
>   take `modules` as a parameter instead, which is what actually made the no-checker branch
>   testable — `tests/integration/scenarios/check.test.ts` and the new
>   `tests/integration/kernel/access.test.ts` pass `shopModules` explicitly.
>
> `seedAccessModel` (the memberships) moved to `scenarios/accounts.ts`, alongside the ids it
> assigns roles to, not inlined into `seedShop`/`seedBlank` separately — one function, called by
> both, rather than the same five `assignRole` calls twice. `src/kernel/access/seed.ts` keeps only
> `bootstrapAccessModel`/`seedPresetRoles`/`DEPLOYMENT_TENANT_SLUG`, read by `db/bootstrap-access.ts`
> for a production deploy.

**Question:** approve the registry shape, the renames and the moves below?

**Blocks:** [7](SCENARIOS_NEXT_7_GUARANTEES_FRONTEND.md) needs the registry to know which scenario
is loaded; [OFFLINE_PAYMENTS 3](OFFLINE_PAYMENTS_3_REALISTIC_HISTORY.md) builds its flow runner on
it.

**My recommendation:** one `SCENARIOS = { shop, blank }` table where each entry owns its whole
seed, the access model included. Move the scenario-only code out of `src/`. Rename every identifier
that still says "demo" about data.

Do this **after item 4** (built, `84206c6f`/`0aaee347`/`3d212b81`/`3847ad6e`): it moves the files 4
edited. The restore fixes and [3](SCENARIOS_NEXT_3_BOOTSTRAP_DATASET.md) already landed.

## Problems

### DRY

| Repeated                                                 | Where                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| the scenario names — a type, a ternary, a guard          | `src/app/demo.ts:23`, `:35-37`, `:85-86`                                                                                   |
| `setTranslatables(resolveTranslatables(enabledModules))` | `src/app.ts:196`, `scenarios/apply.ts:42` — each with its own paragraph                                                    |
| `seedAccessModel()`, then the modules                    | `apply.ts:74`, `src/app/demo.ts:38`, `scenarios/blank.ts:22`                                                               |
| `isTranslationPlan`                                      | `scenarios/products.ts:296`, `src/modules/products/service.ts:389`                                                         |
| the `MONGOMS_SYSTEM_BINARY` block                        | `tests/support/setup.ts:160-166` only. `run-server.ts` lacks it, so `npm run demo` never reuses the pre-installed binary   |
| the guarantee names                                      | `src/modules/products/module.ts:53` and `scenarios/products.ts:370-376` — see [7](SCENARIOS_NEXT_7_GUARANTEES_FRONTEND.md) |

### SOLID and KISS

| Problem                                                                                                                                                        | Where                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `blank` is a special-case file; `shop` has no function of its own — it is "the table, walked"                                                                  | `scenarios/blank.ts`, `scenarios/index.ts:103`          |
| `scenario:apply` takes no scenario                                                                                                                             | `package.json:61,63`, `scenarios/apply.ts:44`           |
| `restoreScenario(reset: boolean, …)`: a bare flag, and each caller passes a constant (boot `false`, route `true`)                                              | `src/app/demo.ts:75`                                    |
| `checkGuarantees()` takes no scenario, though the manifest keys guarantees by scenario                                                                         | `scenarios/index.ts:36` vs `src/kernel/registry.ts:189` |
| `demoModuleFor` exists only because `demoModules` is `Record<string, …>`; `registry.ts` solves the same with `Record<string, X \| undefined>` — two techniques | `scenarios/check.ts:17-18`                              |
| `findUnmetGuarantees` takes the scenario now, but still reads `enabledModules` directly, so its no-checker branch cannot be tested                             | `scenarios/check.ts:30-53`                              |
| `src/kernel/access/seed.ts` does two jobs: deployment bootstrap (presets, tenant) and the demo memberships                                                     | `:80-88`                                                |
| a unit test `require()`s every `scenarios/*.ts` except `apply.ts` — which now includes `check.ts` and the whole module graph                                   | `tests/unit/db/scenario-images.test.ts:59`              |

### Scenario-only code still in `src/`

Importers re-verified 2026-09-11.

| File                                       | Imported by                                                                 | Why it matters                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/persistence/seed.ts`   | 10 `scenarios/*.ts` files, its own unit test. **Nothing in `src/`**         | ships in the production image for nothing                                                                   |
| `src/kernel/seed-accounts.ts`              | `kernel/access/seed.ts` (the memberships only), the scenario files, 2 tests | ships the demo fallback passwords in the production image (`docker/Dockerfile.production:124` copies `src`) |
| the memberships in `kernel/access/seed.ts` | `seedAccessModel`, called only by scenario runners                          | demo data in the kernel                                                                                     |

What **cannot** move: `DEMO_TENANT_SLUG` is read on the production request path
(`src/modules/users/service.ts:39`, `src/modules/account/module.ts:22`).

Adjacent, not changed here: production **does** create the tenant and the preset roles now —
`db/bootstrap-access.ts`, run by `docker-compose.production.yml`'s one-shot `setup` service
(`c3e1e745`). It calls `bootstrapAccessModel`, which is `seedAccessModel` minus the demo
memberships, so the move below has one fewer thing to be careful about than this plan first said.

## Proposal

### The registry

```ts
// scenarios/index.ts
export const SCENARIOS = {
    shop: seedShop, // access model + every module's records
    blank: seedBlank // access model + named accounts + locales
} satisfies Record<string, () => Promise<void>>;

export type ScenarioName = keyof typeof SCENARIOS;
```

- `src/app/demo.ts` validates with `Object.hasOwn(SCENARIOS, name)` after its dynamic import. The
  type, ternary and guard go.
- `scenario:apply [scenario]` takes the name; default `shop`.
- `restoreScenario(name)` always empties first — free on a fresh in-memory database. The flag goes.
- One `prepareSeeding()` does the translatables setup for the runners. It lives in the runner tier:
  data files cannot reach the composition root.

### The moves

| From                                      | To                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/infrastructure/persistence/seed.ts`  | `scenarios/seed.ts`                                                                        |
| `src/kernel/seed-accounts.ts`             | `scenarios/accounts.ts`                                                                    |
| the memberships in `seedAccessModel`      | `seedShop` / `seedBlank`, which call the kernel's `seedPresetRoles` + `ensureTenant` first |
| `scenarios/build/run-server.ts`           | `scenarios/run-server.ts` — it is the profile's runtime, not a build step                  |
| `scenarios/build/generate-seed-images.ts` | `scenarios/tools/generate-seed-images.ts` — a one-off network tool                         |
| `tests/unit/db/scenario-images.test.ts`   | `tests/unit/scenarios/`                                                                    |

The kernel keeps `seedPresetRoles`, `ensureTenant` and the tenant slug.
`eslint.config.ts` names the moved runner paths (e.g. `:898`) — update them with the move.

### The renames

| Now                                                 | Proposed                                      | Why                                                                   |
| --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `DemoModule` / `demoModules` / `seedAllDemoModules` | `ScenarioModule` / `shopModules` / `seedShop` | they are the `shop` scenario, not the demo profile                    |
| `seedBlankScenario`                                 | `seedBlank`                                   | pairs with `seedShop`                                                 |
| `demoModuleFor`                                     | deleted                                       | a `Partial<>` view replaces it                                        |
| `demo-catalog.ts`                                   | `products-filler.ts`                          | what it holds                                                         |
| `demoCustomerId`, `demoOrderId`, `DEMO_WEBHOOK_*`   | drop "demo"                                   | data, not the profile                                                 |
| `upsertById` / `upsertByOwner`                      | `insertIfAbsent` / `insertIfAbsentForOwner`   | they never update                                                     |
| `seed:images`                                       | `scenario:images`                             | "seed" means the database write; the `public/images/seed/` path stays |
| `DEMO_TENANT_SLUG`, "The Demo Shop"                 | `DEPLOYMENT_TENANT_SLUG`, a neutral name      | read on the production request path                                   |
| `assembleDemoDataset`, `exportSeeded*`, "export"    | **done** — deleted in `d4506845`              | —                                                                     |

Kept, on purpose: `src/app/demo.ts`, `installDemo`, `isDemoMode`, `npm run demo`. They **are** the
demo profile.

### Small fixes riding along

- `isTranslationPlan` → one guard exported from `@infrastructure/i18n`, next to `planTranslations`.
- `MONGOMS_SYSTEM_BINARY` → one helper, used by `run-server.ts` and `tests/support/setup.ts`.
- `findUnmetGuarantees(scenario, modules)` takes the modules as a parameter, like
  `registry.resolve*`. That makes the no-checker branch testable.
- `scenario-images.test.ts` skips the non-data files by role, not by name.

## Verify

`npm run ts-check && npm run lint` — boundaries refuse a tier moved wrong. Then `npm test`.

## Answer

Decided 2026-09-11.

- [x] The registry shape — yes
- [x] The moves out of `src/` — yes
- [x] The renames — all, with one narrowing: `DEMO_TENANT_SLUG` → `DEPLOYMENT_TENANT_SLUG` renames the
      identifier only. Its value `'shop'` and the display name "The Demo Shop" are persisted data —
      left to `TENANT_1_CODE_AUDIT.md`
- [x] Move `run-server.ts` and `generate-seed-images.ts` out of `build/` — yes
