# Scripts & Hooks

`scripts/` is the repo's own tooling: every file here is the implementation behind an `npm run`
entry. Most of it never ships — `scripts/ops/` and `scripts/db/` are the two exceptions,
because those run against a live deployment rather than from a developer's terminal;
`docker/Dockerfile.production` copies both into the production image and nothing else under
`scripts/`. `scripts/eslint/` holds the lint rules this codebase wrote for itself, and
`.husky/` holds the git hooks.

Every script's user-facing name and when to run it is on
[Package Scripts](../tools/package-scripts.md). This page says what each _file_ is.

## How these are organised

**The folder says the subject. The filename says the action.** One folder per problem this repo has
tooling for, so `ls scripts/` reads as a list of problems rather than a list of verbs, and
`scripts/mutation/` is the whole answer to "how does mutation testing work here" instead of four
files scattered through an alphabetical listing.

```
scripts/
├── regenerate-artifacts.ts   the one orchestrator that spans every folder below
├── contracts/                the documents this repo publishes, and the types read off them
├── pairing/                  keeping this repo and the paired frontend in step
├── mutation/                 the Stryker runs and the per-file ratchet
├── testing/                  everything else that runs or reads a test suite
├── docs/                     generators that write into docs/
├── db/                       deploy-time database scripts — see [Data](./data.md)
├── ops/                      the scheduled `reap:*`/`sweep:*` jobs, documented below
└── eslint/                   the repo's own lint rules, documented below
```

The demo profile and the data it serves live in `scenarios/`, outside `scripts/` entirely —
see [Data](./data.md) and [Demo profile](../tools/demo-profile.md).

The folder's word is not repeated in the filename: `scripts/mutation/run-diff.ts`, not a
mutation-prefixed name. Deliberately NOT aligned with the `npm run` namespaces — those group by
_when you run a thing_ (`check:*` is the list `npm run complete` reads), these group by _what it is
about_, and forcing the two together would cost the gate its readability.

## How these are named

| Prefix      | The file                                                                       |
| ----------- | ------------------------------------------------------------------------------ |
| `check-`    | verifies and writes nothing — the exit code is the whole answer                |
| `generate-` | produces an artifact, committed or not — `.gitignore` is where that is decided |
| `run-`      | starts a process or drives a tool                                              |
| `report-`   | turns machine output into a human summary, and never fails                     |
| `export-`   | writes a data file                                                             |
| `sync-`     | writes into the paired repo                                                    |
| `sweep-`    | re-drives work a previous run left unfinished — `scripts/ops/` only            |
| `reap-`     | deletes or scrubs expired data on a schedule — `scripts/ops/` only             |
| `refresh-`  | rebuilds a committed data file from an upstream source                         |
| _(no verb)_ | a library — imported by the above, never invoked                               |

`generate-` used to be split from a `build-` prefix on whether the output was committed. Three of
the four files broke the rule the day it was written — `openapi.yaml` and the client collections
are gitignored, `docs/modules/*.md` and the seed images are not — and the distinction was answering
a question `.gitignore` already answers better.

**An executable carries a shebang and leads with a verb. A library carries neither.** Both halves,
so the split is greppable rather than a naming habit: `head -1` says which a file is.

The same words are used in the paired frontend, whose `scripts/` carries these folders plus an
`e2e/` for the Cypress runner, and in `boilerplate-php-laravel-backend`, whose Artisan command
classes are the StudlyCase spelling of these names. Abbreviations are a lint error
(`unicorn/prevent-abbreviations` checks filenames too), so write `directory`, not `dir`.

---

## The orchestrator

| File                              | What it is                                                                                                                             | Read next                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `scripts/regenerate-artifacts.ts` | Runs every generator in the right order — `npm run regenerate`. The one command to reach for after editing anything a generator reads. | [Regenerating After a Change](../api/regenerating.md) |

The only file at the top of `scripts/`, because it is the only one that spans every folder below.

## Contracts — `scripts/contracts/`

The bundler is split by output, with one shared engine underneath.

| File                                             | What it is                                                                                                                                                                              | Read next                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/contracts/build-bundles.ts`             | The CLI — `npm run contracts:bundle`, and a check mode for the CI gate that fails when a committed bundle disagrees with a fresh run.                                                   | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |
| `scripts/contracts/bundle-registry.ts`           | The catalogue of every document this repo produces from sources it owns, and which of them are guarded.                                                                                 | [Contracts](./contracts.md)                                            |
| `scripts/contracts/bundle-kinds.ts`              | What a bundle IS — the two kinds, compiled from authored sources or generated from a committed document, and the staleness comparison every one of them answers. Builds nothing itself. | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |
| `scripts/contracts/openapi-bundle.ts`            | Compiles `openapi.yaml` from the root preamble and each module's standalone OpenAPI document.                                                                                           | [OpenAPI Workflow](../api/openapi-workflow.md)                         |
| `scripts/contracts/asyncapi-bundles.ts`          | Compiles both async bundles — the full `asyncapi.yaml` and the `asyncapi.public.yaml` the frontend receives — from one set of sources.                                                  | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |
| `scripts/contracts/client-collections-bundle.ts` | Writes the four client collections from `openapi.yaml` — one request at a time, with auth, bodies and example responses.                                                                | [Contracts](./contracts.md)                                            |
| `scripts/contracts/generate-asyncapi-types.ts`   | Generates `src/types/asyncapi.generated.ts` from `asyncapi.yaml`. Its check mode is the gate. Byte-identical to the frontend's copy.                                                    | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |
| `scripts/contracts/validate-asyncapi.ts`         | The CLI — `npm run lint:asyncapi`. Validates a document against `@asyncapi/parser`'s default ruleset; the replacement for `asyncapi validate` now that `@asyncapi/cli` is gone.         | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |
| `scripts/contracts/check-asyncapi-breaking.ts`   | The CLI — `npm run check:asyncapi-breaking`. Fails when `asyncapi.public.yaml` drops or narrows something since `origin/main`, via `@asyncapi/diff`. PR-only in CI.                     | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |

## Cross-repo pairing — `scripts/pairing/`

This backend and its frontend share a set of files byte-for-byte. These four keep that true.

| File                                      | What it is                                                                                                                                                                                                            | Read next                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/pairing/paired-frontend-path.ts` | Where the paired frontend is expected to be — a sibling checkout by default, overridable by environment. Mirrored on the other side.                                                                                  | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/spec-identity.ts`        | The cross-repo check itself: which files must be identical in both repos, and the comparison.                                                                                                                         | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/check-spec-identity.ts`  | Its CLI — `npm run check:spec-identity`. Wired into CI, which checks out the sibling first. Degrades to a warning locally when the sibling is not on disk, because a half-cloned pair should still be able to commit. | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/sync-to-frontend.ts`     | Copies every backend-owned shared file into the paired frontend — `npm run sync:frontend`. The write side of what the identity check only verifies.                                                                   | [Pairing & Ports](../tools/pairing-and-ports.md) |

## Demo and data — `scenarios/`

Outside `scripts/` entirely, alongside the records it builds from — see
[Data](./data.md#the-demo-records).

| File                                      | What it is                                                                                                                                                                     | Read next                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `scenarios/run-server.ts`                 | The demo profile — the real API against an in-memory MongoDB, self-contained and disposable. What `npm run demo` boots, and what the paired frontend's e2e suite runs against. | [Demo profile](../tools/demo-profile.md)         |
| `scenarios/tools/generate-seed-images.ts` | Downloads one photo per catalogue role and runs it through the real upload pipeline — `npm run scenario:images`. Network-using and one-off, deliberately outside `regenerate`. | [Image processing](../tools/image-processing.md) |

## Mutation testing — `scripts/mutation/`

| File                                 | What it is                                                                                                                                                       | Read next                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/mutation/stryker-run.ts`    | One Stryker invocation, sized for this machine — concurrency, the per-worker heap cap, the scratch sweep, the OOM-loop abort. Shared by both entry points below. | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/run-diff.ts`       | Mutation testing scoped to the files a branch changed, then the ordinary ratchet — `npm run mutation`.                                                           | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/run-shards.ts`     | The whole scope, one shard at a time, resumable across evenings, folding into the baseline once every shard has a report — `npm run mutation:full`.              | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/local-policy.ts`   | Which shards a local sweep runs next, given what previous evenings already recorded — the pure half of `run-shards.ts`.                                          | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/mutate-scope.ts`   | The real mutate scope, read off the tree rather than hand-copied — every `.ts` file `stryker.json` declares mutable, with its line count.                        | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/sharding.ts`       | Bin-packing by line count — the weekly CI matrix and a local sweep both size their shards from this.                                                             | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/shard-plan.ts`     | CLI wrapper: walks the real `mutate` scope, prints the weekly matrix as a GitHub Actions job output.                                                             | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/baseline.ts`       | The per-file mutation ratchet: the recorded score for each file, and the comparison that fails when one drops.                                                   | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/check-baseline.ts` | Its CLI — `npm run mutation:check` to compare, `-- --update` to record a new floor, `-- --merge --merge-dir=<dir>` to fold a sharded sweep in.                   | [Mutation Testing](../tools/mutation-testing.md) |

## Testing — `scripts/testing/`

The runner every `npm run test:*` goes through, and the two instruments that read a run
afterwards — neither of those is in any gate.

| File                                      | What it is                                                                                                                                                                                         | Read next                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scripts/testing/run-suite.ts`            | Runs one test layer as a series of sequential jest processes — what every `npm run test:*` invokes. A wrapper rather than a bare `jest`, to bound how much memory a layer may hold at once.        | [Weak machines](../tools/weak-machines.md)                  |
| `scripts/testing/machine-budget.ts`       | How hard the runners may push THIS machine, in one place: worker counts, per-process heap caps, shard counts — read off `MemAvailable`, and beaten by an explicit environment variable every time. | [Weak machines](../tools/weak-machines.md)                  |
| `scripts/testing/run-prism-smoke-test.ts` | Boots Prism against `openapi.yaml` and proves it answers — `npm run test:prism`. A smoke test of the contract, not of the app: Prism serves the spec's own examples.                               | [Contract Testing (Response)](../tools/contract-testing.md) |
| `scripts/testing/report-results.ts`       | Turns a runner's JSON report into which **module** a failure belongs to and where the time went — `npm run test:report`.                                                                           | [Testing (overview)](../tools/testing-and-docs.md)          |

## Docs — `scripts/docs/`

| File                                          | What it is                                                                                                                                                                                                                                                                                                                                                                   | Read next                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `scripts/docs/generate-module-graph.ts`       | Writes the module graph in `docs/modules/index.md` and one neighbourhood diagram per module page, read off the real import graph — `npm run docs:graph`. Its check mode is the gate.                                                                                                                                                                                         | [Modules](./src-modules.md)                              |
| `scripts/docs/generate-role-matrix.ts`        | Writes the effective role matrix in `docs/demo-ecommerce/index.md` — what `holdsKey` answers per role per module, after `manage` expansion and the `guest` floor — asked of the evaluator rather than typed out. What each role DECLARES is prose on that page, from `shared/authorization-roles.yaml`'s own descriptions. `npm run docs:roles`; its check mode is the gate. | [Authorization](../theory/authorization.md)              |
| `scripts/docs/generate-dependency-map.ts`     | Writes the two tables in `docs/tools/package-dependencies.md` — every `package.json` dependency, grouped by `dependency-groups.ts` or, failing that, by the single module that imports it, read off the real source tree rather than typed out. `npm run docs:dependencies`; its check mode is the gate.                                                                     | [Package Dependencies](../tools/package-dependencies.md) |
| `scripts/docs/generate-rate-limit-budgets.ts` | Writes the rate-limit budget table in `docs/tools/security.md` — every module manifest's `RateLimitBudget` plus the infrastructure limits, so a default, window or env var changing in code cannot go stale here. `npm run docs:rate-limits`; its check mode is the gate.                                                                                                    | [Security](../tools/security.md)                         |
| `scripts/docs/check-references.ts`            | Sweeps every inline code span in `docs/` for a file path it claims exists, and fails on one that does not — the guard against a page naming a file a rename or a move left behind. `npm run check:docs-references`.                                                                                                                                                          | —                                                        |

The three libraries underneath them:

| File                                | What it is                                                                                                                                                                                                 | Read next                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `scripts/docs/dependency-groups.ts` | The hand-kept half of the dependency page: which family a package belongs to and why. Everything else on that page is derived, and would drift the moment it were typed here too.                          | [Package Dependencies](../tools/package-dependencies.md) |
| `scripts/docs/module-descriptor.ts` | One typed reader for a module's `module.yaml`, shared by the graph generator and the test that proves every descriptor is well-formed — a second hand-rolled parse of the same file drifts.                | [Strategic DDD](../theory/strategic-ddd.md)              |
| `scripts/docs/repo-references.ts`   | Whether a path a comment cites still exists — the machinery `check-references.ts` and the `comment-links` lint rule share, so the two agree on what counts as a real path instead of each growing its own. | [Repository Root](./root.md)                             |

## Scheduled jobs — `scripts/ops/`

One of the two subtrees that **ship in the production image** — see the intro above. These run
against a live database from a cron container rather than from a developer's terminal. Each one
takes the `scripts/db/run-script.ts` wrapper, which gives it an exit code, cleanup on the failure
path, and a readable error.

| File                                        | What it is                                                                                                                                                                                                                                                                                | Read next                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `scripts/ops/reap-quarantine.ts`            | Deletes quarantined uploads past the retention window — `npm run reap:quarantine`. Filesystem-only and safe to repeat.                                                                                                                                                                    | [Image processing](../tools/image-processing.md)                |
| `scripts/ops/reap-inactive-accounts.ts`     | The three-stage inactivity reaper — warn, soft delete, hard delete. Disabled by default; enabling it is the controller's decision.                                                                                                                                                        | [Ops](./ops.md)                                                 |
| `scripts/ops/reap-orders.ts`                | Scrubs order PII once `anonymizeAfter` arrives — `npm run reap:orders`. Never deletes a row: an order is an invoice.                                                                                                                                                                      | [Ops](./ops.md)                                                 |
| `scripts/ops/reap-payments.ts`              | Deletes abandoned payment attempts — `npm run reap:payments`. Deletes, unlike the orders reaper: an attempt that never settled was never money, so there is no invoice to keep.                                                                                                           | [Payments](../modules/payments.md)                              |
| `scripts/ops/reap-invoices.ts`              | Sweeps the invoice CACHE — `npm run reap:invoices`. Orphans and expiry together, since both are cheap and both belong to the same directory.                                                                                                                                              | [Ops](./ops.md)                                                 |
| `scripts/ops/reap-mail-spool.ts`            | Sweeps the mail spool — `npm run reap:mail-spool`. A spooled file outlives its job only when a send died mid-flight; this is the backstop for the rest.                                                                                                                                   | [Email & rendering](../tools/email-and-rendering.md)            |
| `scripts/ops/sweep-order-effects.ts`        | Retries the refund a cancel announced but could not guarantee — `npm run sweep:order-effects`. Registers the modules first, since it works by re-emitting.                                                                                                                                | [Ops](./ops.md)                                                 |
| `scripts/ops/sweep-webhook-retries.ts`      | Enqueues every webhook delivery whose retry is due — `npm run sweep:webhook-retries`. Per-minute, and idempotent: each due row is claimed atomically before it is published.                                                                                                              | [Webhooks](../modules/webhooks.md)                              |
| `scripts/ops/refresh-breached-passwords.ts` | Rebuilds the bundled breached-password list from SecLists, filtered through the contract's own password pattern — `npm run refresh:breached-passwords`. The one file here no scheduler runs: a top-N breach list changes on the order of years, and the trigger is that pattern changing. | [Authentication defences](../theory/defences/authentication.md) |

## Lint rules — `scripts/eslint/`

A rule enforced after the fact instead of at the keystroke is the same mistake twice over —
`controller-chain-must-catch` and `no-hardcoded-user-text` were cross-cutting tests once. As lint
rules they report in the editor and fix on save.

| File                                            | What it is                                                                                                                                                                                              | Read next                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `scripts/eslint/index.ts`                       | The plugin barrel `eslint.config.ts` imports.                                                                                                                                                           | [Repository Root](./root.md)                |
| `scripts/eslint/controller-chain-must-catch.ts` | A promise chain started in a controller must end in a catch. Without it an unhandled rejection reaches the global handler, which answers a generic 500 instead of the status the operation meant.       | [Request Flow](../theory/request-flow.md)   |
| `scripts/eslint/no-hardcoded-user-text.ts`      | User-facing copy comes from a dictionary, never from a literal at the call site — otherwise the string cannot be translated and the locale bundles quietly stop being the source of truth.              | [Modules](./src-modules.md)                 |
| `scripts/eslint/barrel-allowed-sources.ts`      | What a module's barrel may publish: services, domain rules, events and emails as values, its model as types only — never a repository, a model's runtime value, or a wiring file, in any export form.   | [Strategic DDD](../theory/strategic-ddd.md) |
| `scripts/eslint/no-persistence-imports.ts`      | Persistence stays behind the repository, and the import is where that stops being true — caught by name (through a barrel) and by path (a reach into `model.ts`), because neither route sees the other. | [Modules](./src-modules.md)                 |
| `scripts/eslint/comment-links.ts`               | A comment citing a `.ts`/`.tsx` file is checked against the files that actually exist — the source-comment half of what `check-references.ts` does for `docs/*.md`, sharing its machinery.              | [Repository Root](./root.md)                |

## Git hooks

| File                | What it is                                                                    | Read next                                      |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `.husky/pre-commit` | Runs the full local gate before a commit is written.                          | [Package Scripts](../tools/package-scripts.md) |
| `.husky/commit-msg` | Runs commitlint, so every message is a conventional commit.                   | [Repository Root](./root.md)                   |
| `.husky/.gitignore` | Husky's own — keeps the shell wrappers husky generates out of the repository. | —                                              |
