# Dependency docs — who owns each library, and a map that cannot rot

One plan, one category. Asked on 2026-09-11:

- every module is a DDD bounded context — so where does a library **only one module** uses belong?
- write that down on the module pages
- one page listing the dependencies, grouped by what they are for
- a `CLAUDE.md` rule to keep all of it current when a module or a dependency is added

## What exists today

Measured 2026-09-11.

| Fact                                                                                               | Evidence                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| the page already exists: `docs/tools/package-dependencies.md`, grouped by purpose, runtime and dev | hand-written tables                                                                                                                    |
| **it misses 32 of the 99 packages**                                                                | e.g. `@casl/*`, `otplib`, `sharp`, `altcha-lib`, `rate-limit-redis`, `supertest`, `fast-check`, `@stryker-mutator/*`, `orval`, `husky` |
| it lists three that are gone                                                                       | `mime-types`, `eslint-plugin-oxlint`, `openapi-typescript-codegen`                                                                     |
| module pages almost never name their libraries                                                     | only `antibot.md:58` compares ALTCHA to its alternatives — the shape worth copying                                                     |
| nothing says where a module-specific library belongs                                               | `docs/theory/modules.md`, `module-lifecycle.md` — no section                                                                           |
| the repo already generates doc tables between markers, with `--check` in `complete`                | `docs:roles`, `docs:graph` (`scripts/docs/generate-role-matrix.ts:1-9`)                                                                |

Who imports each runtime dependency today, outside tests:

| Owner                                   | Packages                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| one module — `account`                  | `otplib` (2FA), `jsonwebtoken` (sessions)                                                             |
| the shared kernel — `account` + `users` | `bcrypt`                                                                                              |
| `kernel`                                | `@casl/ability`, `@casl/mongoose`                                                                     |
| `app`                                   | `helmet`, `cors`, `cookie-parser`                                                                     |
| `infrastructure`                        | the rest: OpenTelemetry, `redis`, `amqplib`, `nodemailer`, `puppeteer-core`, `sharp`, `altcha-lib`, … |
| everywhere                              | `express`, `mongoose`, `zod`, `prom-client`                                                           |

The page was hand-written, and a third of it has already drifted. A hand-kept list plus a
`CLAUDE.md` reminder would drift again. `CLAUDE.md` itself says so: never hand-maintain a table
that restates something already recorded elsewhere — here, `package.json` and the imports.

## Decided

| Question                     | Decision                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hand-written or generated    | **generated**, the `docs:roles` shape: markers in `package-dependencies.md`, the prose around them untouched, `docs:dependencies` in `regenerate`, `--check` in `complete` |
| what is derived              | the package, runtime or dev, and **who imports it** — scanned from `src/`, `scenarios/`, `scripts/`, `tests/` and the config files. Always true                            |
| what is hand-kept            | the group and a one-line purpose, in `scripts/docs/dependency-groups.ts`. Patterns first (`@opentelemetry/*`, `@types/*`, `eslint-*`), names for the exceptions            |
| a package with no group      | lands in an "Ungrouped" table on the page — visible, **not** a failure. Nothing breaks without a description, so nothing refuses the commit                                |
| versions on the page         | no — every `ncu` bump would churn the page, and `package.json` already says it                                                                                             |
| module-owned, how decided    | derived: a runtime package that exactly one module imports is listed under that module                                                                                     |
| a lint rule keeping it there | no. A second module importing it breaks nothing, and the generated page shows the move. Per "less policing"                                                                |
| module pages                 | a `## Libraries` section **only** on pages whose module owns one: why this library, what was rejected, a link. The list itself stays on the generated page                 |

### Groups, by objective

| Runtime                         | Dev                                                                     |
| ------------------------------- | ----------------------------------------------------------------------- |
| HTTP core                       | TypeScript toolchain                                                    |
| security and auth               | type definitions                                                        |
| persistence                     | testing — jest, swc, supertest, `mongodb-memory-server`, `jest-openapi` |
| cache and messaging             | deeper testing — Stryker, `fast-check`, `autocannon`                    |
| email, rendering, media         | linting and formatting                                                  |
| observability                   | architecture — `dependency-cruiser`, `eslint-plugin-boundaries`         |
| i18n                            | commit hygiene — `husky`, commitlint                                    |
| **owned by a module** (derived) | contracts and codegen — AsyncAPI, Stoplight, Redocly, `orval`           |
|                                 | docs site — VitePress, Mermaid                                          |
|                                 | maintenance — `npm-check-updates`, `cross-env`                          |

### The ownership rule, for `docs/theory/modules.md`

A new section, "Libraries a module owns":

- **The owner is whoever imports it.** One module → that module. Several → `infrastructure`,
  behind an adapter, or the kernel.
- **Another module needing it asks the owner's public `index.ts`**, not the library. If two modules
  genuinely need the library itself, it moves down to `infrastructure` behind a port.
- **Deleting a module removes the libraries it owned** from `package.json` — a new step in
  `module-lifecycle.md#removing-a-module`. The generated page shows which.
- **Adding one** runs the [vetting rules](docs/tools/dependency-vetting.md) first, as today.

### The `CLAUDE.md` rule

Under "Dependencies — look before you build", one new item:

> **Write it down in the same change.** A new dependency gets its group and purpose in
> `scripts/docs/dependency-groups.ts`; `npm run regenerate` rebuilds the page. A library only one
> module imports is that module's: its page under `docs/modules/` says why it was chosen. A new
> module gets its page, plus a `## Libraries` section if it brings one. Removing a module removes
> what it owned.

And the `regenerate` line gains `docs:dependencies` — the same line
[SCENARIOS_NEXT 3](SCENARIOS_NEXT_3_BOOTSTRAP_DATASET.md) edits. One edit, whichever lands first.

## Found along the way — check while doing this

- `mongodb` is a runtime dependency imported only as a type, in one test
  (`tests/integration/db/data-changelog.test.ts:9`). If it is there to pin the driver `mongoose`
  uses, the page says so. If not, it goes.
- `@guebbit/openapi-runnable-collections` is a runtime dependency imported by three modules'
  `probes.ts`. If the probes run only from `scripts/`, it belongs in dev dependencies and out of the
  production image.

Out of scope: the paired frontend could use the same page. Its own plan, if wanted.

## Work

- [x] `scripts/docs/generate-dependency-map.ts` + `dependency-groups.ts`; `docs:dependencies`, `check:docs-dependencies`
- [x] wire both into `regenerate` and `complete`, as `docs:roles` is — plus the CI `docs` job,
      which `tests/cross-cutting/ci-covers-the-gate.test.ts` caught as missing
- [x] `docs/tools/package-dependencies.md`: markers; keep "Quick take" and the `@asyncapi/cli` note
- [x] `docs/theory/modules.md`: "Libraries a module owns"; `module-lifecycle.md`: the add and remove steps
- [x] `## Libraries` on `account-two-factor.md` (`otplib`), `account-sessions.md` (`jsonwebtoken`).
      `users.md` gets a note instead of a table — `bcrypt` is shared with `account`, so it stays a
      hand-kept row on the generated page rather than a module-specific alternatives table
- [x] `payments.md` gets `ibantools` when [OFFLINE_PAYMENTS 2](OFFLINE_PAYMENTS_2_BANK_TRANSFER.md) lands — landed 2026-09-12, with no hand-kept row needed: single-module ownership put it straight on the generated page
- [x] the two findings above — `mongodb`'s type-only pin is now explained on the page;
      `@guebbit/openapi-runnable-collections` moved to `devDependencies`
- [x] `CLAUDE.md`, per the rule above
- [x] `docs/reference/scripts.md` and `docs/tools/package-scripts.md`: the two new scripts

## Verify

- [x] `npm run docs:dependencies`, then `git diff` the page: every `package.json` entry appears once
- [x] `npm run check:docs-dependencies` passes
- [x] `npm run check:docs-references` — the new anchors resolve
- [x] `npm run complete`'s full chain — ts-check, lint, prettier, `check:dependencies`, docs build,
      and all five test suites (unit, cross-cutting, integration, contract, fuzz) — green

## Answer

- [x] Generated page, derived ownership, no lint rule — decided 2026-09-11
- [ ] Veto any row under `## Decided` — none yet
