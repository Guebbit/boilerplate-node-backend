# Scripts & Hooks

`scripts/` is the repo's own tooling: every file here is the implementation behind an `npm run`
entry. Most of it never ships — `scripts/ops/` and `scripts/db/` are the two exceptions,
because those run against a live deployment rather than from a developer's terminal;
`docker/Dockerfile.production` copies both into the production image and nothing else under
`scripts/`. `scripts/eslint/` holds the lint rules this codebase wrote for itself, `scripts/audit/`
holds the AI audit prompts beside the scripts they run, and `.husky/` holds the git hooks.

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
├── audit/                    AI audit prompts, each with the scripts it runs, documented below
├── docker/                   generators that write into docker/
├── db/                       deploy-time database scripts — see [Data](./data.md)
├── ops/                      what runs against a deployment: the scheduled jobs and `reencrypt`
├── scaffold/                 adding and removing modules: `scaffold:module`, `demo:remove`
├── security/                 rebuilding the committed security data: the breached-password list
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
| `refresh-`  | rebuilds a committed data file from an upstream source                         |
| _(no verb)_ | a library — imported by the above, never invoked                               |

**An executable carries a shebang and leads with a verb. A library carries neither.** Both halves,
so the split is greppable rather than a naming habit: `head -1` says which a file is.

The same words are used in the paired frontend, whose `scripts/` carries these folders plus an
`e2e/` for the Cypress runner, and in `boilerplate-php-laravel-backend`, whose Artisan command
classes are the StudlyCase spelling of these names. Abbreviations are a lint error
(`unicorn/name-replacements` checks filenames too), so write `directory`, not `dir`.

---

## The orchestrator

| File                              | What it is                                                                                                                             | Read next                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `scripts/regenerate-artifacts.ts` | Runs every generator in the right order — `npm run regenerate`. The one command to reach for after editing anything a generator reads. | [Regenerating After a Change](../api/regenerating.md) |

The only file at the top of `scripts/`, because it is the only one that spans every folder below.

## Contracts — `scripts/contracts/`

The bundler is split by output, with one shared engine underneath.

| File                                                                                                   | What it is                                                                                                                                                                                                 | Read next                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `scripts/contracts/build-bundles.ts`                                                                   | The CLI — `npm run contracts:bundle`, and a check mode for the CI gate that fails when a committed bundle disagrees with a fresh run.                                                                      | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/bundle-registry.ts`                                                                 | The catalogue of every document this repo produces from sources it owns, and which of them are guarded.                                                                                                    | [Contracts](./contracts.md)                                                                   |
| `scripts/contracts/bundle-kinds.ts`                                                                    | What a bundle IS — the two kinds, compiled from authored sources or generated from a committed document, and the staleness comparison every one of them answers. Builds nothing itself.                    | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/openapi-bundle.ts`                                                                  | Compiles `openapi.yaml` from the root preamble and each module's standalone OpenAPI document.                                                                                                              | [OpenAPI Workflow](../api/openapi-workflow.md)                                                |
| `scripts/contracts/asyncapi-bundles.ts`                                                                | Compiles both async bundles — the full `asyncapi.yaml` and the `asyncapi.public.yaml` the frontend receives — from one set of sources.                                                                     | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                                              |
| `scripts/contracts/client-collections-bundle.ts`                                                       | Writes the four client collections from `openapi.yaml` — one request at a time, with auth, bodies and example responses.                                                                                   | [Contracts](./contracts.md)                                                                   |
| `scripts/contracts/generate-asyncapi-types.ts`                                                         | Generates `src/types/asyncapi.generated.ts` from `asyncapi.yaml`. Its check mode is the gate. The frontend has its own copy of the script, held to the same machinery by hand, not by a check.             | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                                              |
| `scripts/contracts/validate-asyncapi.ts`                                                               | The CLI — `npm run lint:asyncapi`. Validates a document against `@asyncapi/parser`'s default ruleset; the replacement for `asyncapi validate` now that `@asyncapi/cli` is gone.                            | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                                              |
| `scripts/contracts/check-asyncapi-breaking.ts`                                                         | The CLI — `npm run check:asyncapi-breaking`. Fails when `asyncapi.public.yaml` drops or narrows something since `origin/main`, via `@asyncapi/diff`. PR-only in CI.                                        | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                                              |
| `scripts/contracts/asyncapi-breaking.ts`                                                               | The classification half of the breaking-change check (the `/info/version` override), apart from the CLI so a test can reach it.                                                                            | [AsyncAPI Workflow](../api/asyncapi-workflow.md#breaking-change-gate-on-the-public-catalogue) |
| `scripts/contracts/section-order.ts`                                                                   | The order a bundle lists its per-module sections in: a preference, never a registry, so an absent module just drops out.                                                                                   | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/root-assembly.ts`                                                                   | Completes the root OpenAPI document from what the modules ship: a module's paths and tags are in the contract from its own `openapi.yaml` alone.                                                           | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/personal-data-assembly.ts`                                                          | Assembles the data export's `AccountExportResponse` from the `x-personal-data` section each module declares in its own `openapi.yaml`.                                                                     | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/prune-unused.ts`                                                                    | The last OpenAPI bundle step: drops components nothing references, unused security schemes and unused tags.                                                                                                | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)                        |
| `scripts/contracts/authorization-bundle.ts`                                                            | Assembles `shared/authorization-keys.yaml` from each module's `authorization.yaml` plus a root residual file — `npm run authorization:bundle`, with a check mode.                                          | [Authorization](../theory/authorization.md)                                                   |
| `scripts/contracts/generate-error-codes.ts`<br>`scripts/contracts/generate-request-content-types.ts`   | Generate `api/error-codes.ts` (from the contract's `x-error-codes`) and `api/request-content-types.ts` (the media types each write accepts, which the 415 guard reads). Both run inside `npm run gen:api`. | [Write Methods](../api/write-methods.md#content-type-415)                                     |
| `scripts/contracts/generate-permission-actions.ts`<br>`scripts/contracts/permission-actions-render.ts` | Generate `api/permission-actions.ts` from `shared/authorization-keys.yaml`'s `actions:` — the runtime array and the union type. The render half is pure.                                                   | [Permission Actions](../tools/permission-actions.md)                                          |
| `scripts/contracts/generated-file.ts`                                                                  | The write-or-verify tail every contract generator ends with, in one place.                                                                                                                                 | —                                                                                             |

## Cross-repo pairing — `scripts/pairing/`

This backend and its frontend share a set of files byte-for-byte. These five keep that true.

| File                                      | What it is                                                                                                                                                                                                            | Read next                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/pairing/paired-frontend-path.ts` | Where the paired frontend is expected to be — a sibling checkout by default, overridable by the shell or `.env`. Every pairing script asks it. Mirrored on the other side.                                            | [Pairing & Ports](../tools/pairing-and-ports.md#which-frontend-a-script-means)      |
| `scripts/pairing/spec-identity.ts`        | The cross-repo check itself: which files must be identical in both repos, and the comparison.                                                                                                                         | [Pairing & Ports](../tools/pairing-and-ports.md)                                    |
| `scripts/pairing/check-spec-identity.ts`  | Its CLI — `npm run check:spec-identity`. Wired into CI, which checks out the sibling first. Degrades to a warning locally when the sibling is not on disk, because a half-cloned pair should still be able to commit. | [Pairing & Ports](../tools/pairing-and-ports.md)                                    |
| `scripts/pairing/sync-to-frontend.ts`     | Copies every backend-owned shared file into the paired frontend — `npm run sync:frontend`. The write side of what the identity check only verifies. Refuses to write into frontend main from a linked worktree.       | [Pairing & Ports](../tools/pairing-and-ports.md#worktrees-sync-into-their-own-pair) |
| `scripts/pairing/linked-worktree.ts`      | Tells a linked `git worktree` from a main checkout, for the sync's refusal above.                                                                                                                                     | [Pairing & Ports](../tools/pairing-and-ports.md#worktrees-sync-into-their-own-pair) |

## Demo and data — `scenarios/`

Outside `scripts/` entirely, alongside the records it builds from — see
[Data](./data.md#the-demo-records).

| File                                      | What it is                                                                                                                                                                     | Read next                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `scenarios/run-server.ts`                 | The demo profile — the real API against an in-memory MongoDB, self-contained and disposable. What `npm run demo` boots, and what the paired frontend's e2e suite runs against. | [Demo profile](../tools/demo-profile.md)         |
| `scenarios/tools/generate-seed-images.ts` | Downloads one photo per catalogue role and runs it through the real upload pipeline — `npm run scenario:images`. Network-using and one-off, deliberately outside `regenerate`. | [Image processing](../tools/image-processing.md) |

## Mutation testing — `scripts/mutation/`

| File                                                                          | What it is                                                                                                                                                            | Read next                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/mutation/stryker-run.ts`                                             | One Stryker invocation, sized for this machine — concurrency, the per-worker heap cap, the scratch sweep, the OOM-loop abort. Shared by both entry points below.      | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/run-diff.ts`                                                | Mutation testing scoped to the files a branch changed, then the ordinary ratchet — `npm run mutation`.                                                                | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/run-shards.ts`                                              | The whole scope, one shard at a time, resumable across evenings, folding into the baseline once every shard has a report — `npm run mutation:full`.                   | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/local-policy.ts`                                            | Which shards a local sweep runs next, given what previous evenings already recorded — the pure half of `run-shards.ts`.                                               | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/mutate-scope.ts`                                            | The real mutate scope, read off the tree rather than hand-copied — every `.ts` file `stryker.json` declares mutable, with its line count.                             | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/sharding.ts`                                                | Bin-packing by line count — how `npm run mutation:full` sizes its shards.                                                                                             | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/ci/`                                                        | The GitHub sweep only: the wave planner, the line-slice Stryker plugin, the report merge, and the CLI `mutation.yml` calls.                                           | [Mutation Testing](../tools/mutation-testing.md#the-github-sweep) |
| `scripts/mutation/baseline.ts`                                                | The per-file mutation ratchet: the recorded score for each file, and the comparison that fails when one drops.                                                        | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/check-baseline.ts`                                          | Its CLI — `npm run mutation:check` to compare, `-- --update` to record a new floor, `-- --merge --merge-dir=<dir>` to fold a sharded sweep in.                        | [Mutation Testing](../tools/mutation-testing.md)                  |
| `scripts/mutation/pull-baseline.ts`<br>`scripts/mutation/github-artifacts.ts` | `npm run mutation:pull` fetches the newest baseline the GitHub sweep uploaded as an artifact (the sweep cannot commit); the second file picks which artifact, purely. | [Mutation Testing](../tools/mutation-testing.md#the-github-sweep) |

## Testing — `scripts/testing/`

The runner every `npm run test:*` goes through, and the two instruments that read a run
afterwards — neither of those is in any gate.

| File                                                                                                                                                            | What it is                                                                                                                                                                                                                                                              | Read next                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scripts/testing/run-suite.ts`                                                                                                                                  | Runs one test layer as a series of sequential jest processes — what every `npm run test:*` invokes. A wrapper rather than a bare `jest`, to bound how much memory a layer may hold at once.                                                                             | [Weak machines](../tools/weak-machines.md)                  |
| `scripts/testing/machine-budget.ts`                                                                                                                             | How hard the runners may push THIS machine, in one place: worker counts, per-process heap caps, shard counts — read off `MemAvailable`, and beaten by an explicit environment variable every time.                                                                      | [Weak machines](../tools/weak-machines.md)                  |
| `scripts/testing/run-prism-smoke-test.ts`                                                                                                                       | Boots Prism against `openapi.yaml` and proves it answers — `npm run test:prism`. A smoke test of the contract, not of the app: Prism serves the spec's own examples.                                                                                                    | [Contract Testing (Response)](../tools/contract-testing.md) |
| `scripts/testing/report-results.ts`                                                                                                                             | Turns a runner's JSON report into which **module** a failure belongs to and where the time went — `npm run test:report`.                                                                                                                                                | [Testing (overview)](../tools/testing-and-docs.md)          |
| `scripts/testing/scratch-copy.ts`<br>`scripts/testing/measure-scaffold.ts`<br>`scripts/testing/measure-demo-strip.ts`<br>`scripts/testing/demo-module-names.ts` | The `measure:*` family: a scratch copy of the checkout is wrecked on purpose (a module scaffolded, the shop stripped) and the repo's own checks are run against what is left. `measure:scaffold` is report-only; `measure:demo-strip` is CI's `demo-strip-measure` job. | [Module scaffolder](../tools/module-scaffolder.md)          |

## AI audits — `scripts/audit/`

One folder per audit, in the [Agent Skills](https://agentskills.io) layout: a `SKILL.md` an AI reads
and follows, and a `scripts/` folder for what it runs. The folder is the audit's subject, so the
skill's own `scripts/` is the one place a filename repeats a folder's word.

| File                                                              | What it is                                                                                                                                                               | Read next                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `scripts/audit/*/SKILL.md`                                        | The eight audit prompts. Each is registered with Claude Code by a pointer under `.claude/skills/`.                                                                       | [AI Auditing](../tools/ai-auditing.md)                                             |
| `scripts/audit/compliance-rules.yaml`                             | The compliance registry both compliance prompts read, one rule per backend or frontend responsibility.                                                                   | [AI Auditing](../tools/ai-auditing.md)                                             |
| `scripts/audit/code-shape/scripts/shallow-candidates.ts`          | Counts, through the TypeScript checker, what the `code-shape` audit judges: small functions with 1–2 users, pass-throughs, optional parameters never passed, lazy files. | [AI Auditing](../tools/ai-auditing.md#code-shape-the-tools-count-the-model-judges) |
| `scripts/audit/code-shape/scripts/generate-shallow-candidates.ts` | Its CLI — `npm run audit:shallow -- <paths>`. Writes `tmp/reports/audit/code-shape/shallow.json`.                                                                        | [AI Auditing](../tools/ai-auditing.md#code-shape-the-tools-count-the-model-judges) |

## Docs — `scripts/docs/`

| File                                          | What it is                                                                                                                                                                                                                                                                                                                                                                   | Read next                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `scripts/docs/generate-module-graph.ts`       | Writes the module graph in `docs/modules/index.md` and one neighbourhood diagram per module page, read off the real import graph — `npm run docs:graph`. Its check mode is the gate.                                                                                                                                                                                         | [Modules](./src-modules.md)                              |
| `scripts/docs/generate-role-matrix.ts`        | Writes the effective role matrix in `docs/demo-ecommerce/index.md` — what `holdsKey` answers per role per module, after `manage` expansion and the `guest` floor — asked of the evaluator rather than typed out. What each role DECLARES is prose on that page, from `shared/authorization-roles.yaml`'s own descriptions. `npm run docs:roles`; its check mode is the gate. | [Authorization](../theory/authorization.md)              |
| `scripts/docs/generate-dependency-map.ts`     | Writes the two tables in `docs/tools/package-dependencies.md` — every `package.json` dependency, grouped by `dependency-groups.ts` or, failing that, by the single module that imports it, read off the real source tree rather than typed out. `npm run docs:dependencies`; its check mode is the gate.                                                                     | [Package Dependencies](../tools/package-dependencies.md) |
| `scripts/docs/generate-rate-limit-budgets.ts` | Writes the rate-limit budget table in `docs/tools/security.md` — every module manifest's `RateLimitBudget` plus the infrastructure limits, so a default, window or env var changing in code cannot go stale here. `npm run docs:rate-limits`; its check mode is the gate.                                                                                                    | [Security](../tools/security.md)                         |
| `scripts/docs/check-references.ts`            | Sweeps every inline code span in `docs/` for a file path it claims exists, and fails on one that does not — the guard against a page naming a file a rename or a move left behind. `npm run check:docs-references`.                                                                                                                                                          | —                                                        |
| `scripts/docs/generate-audit-actions.ts`      | Writes the audit action reference table in `docs/tools/winston.md` between its markers — `npm run docs:audit-actions`.                                                                                                                                                                                                                                                       | [Winston & Audit Logs](../tools/winston.md)              |

The three libraries underneath them:

| File                                | What it is                                                                                                                                                                                                 | Read next                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `scripts/docs/dependency-groups.ts` | The hand-kept half of the dependency page: which family a package belongs to and why. Everything else on that page is derived, and would drift the moment it were typed here too.                          | [Package Dependencies](../tools/package-dependencies.md) |
| `scripts/docs/module-descriptor.ts` | One typed reader for a module's `module.yaml`, shared by the graph generator and the test that proves every descriptor is well-formed — a second hand-rolled parse of the same file drifts.                | [Strategic DDD](../theory/strategic-ddd.md)              |
| `scripts/docs/repo-references.ts`   | Whether a path a comment cites still exists — the machinery `check-references.ts` and the `comment-links` lint rule share, so the two agree on what counts as a real path instead of each growing its own. | [Repository Root](./root.md)                             |
| `scripts/docs/marker-block.ts`      | The write-or-report logic every doc generator shares for a generated block between `<!-- name:start -->` / `<!-- name:end -->` markers inside a hand-written page.                                         | —                                                        |
| `scripts/docs/module-catalogue.ts`  | Every module's place in the docs, derived from its `module.yaml#group`: feeds the module index and the `/modules/` sidebar.                                                                                | [Modules](../modules/index.md)                           |

## Docker — `scripts/docker/`

| File                                                 | What it is                                                                                                                                                                                                                                                                                                          | Read next |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `scripts/docker/generate-dockerfile-dockerignore.ts` | Writes `docker/Dockerfile.dockerignore` from the root `.dockerignore`, `.git` kept IN — Docker/Buildah use a per-Dockerfile ignore file INSTEAD of the root one, not merged with it, so a hand-kept second copy drifts the moment the root list changes. `npm run docker:dockerignore`; its check mode is the gate. | —         |

The shell scripts that live beside the images (`docker/boot-check.sh`, `docker/backup/`) are not under `scripts/`, but one
has an npm entry: `npm run backup:drill` runs `docker/backup/drill.sh`, the end-to-end proof of the backup system
(see [Backups](../tools/backups.md#the-restore-drill)).

## Scheduled jobs — `scripts/ops/`

One of the two subtrees that **ship in the production image**, whole — see the intro above. These
run against a live deployment, from the cron container or, for `reencrypt`, by an operator, never
from a developer's terminal. A developer tool belongs in another folder. Each one
takes the `scripts/run-script.ts` wrapper, which gives it an exit code, cleanup on the failure
path, and a readable error.

| File                       | What it is                                                                                                                                                                                                                                                                    | Read next                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `scripts/ops/run-job.ts`   | The one runner for every scheduled job — `npm run <name>`, e.g. `npm run reap:orders`. Each job is declared on its module's manifest (`AppModule.jobs`) or in `src/app/jobs.ts`; `npm run jobs:generate` writes `docker/crontab` and the npm scripts from those declarations. | [Scheduled jobs](./ops.md#scheduled-jobs)                             |
| `scripts/ops/reencrypt.ts` | Re-encrypts every stored secret onto the newest key of its ring, so a rotation can retire the old key — `npm run reencrypt`.                                                                                                                                                  | [Security](../tools/security.md#database-credential-and-key-rotation) |

## Setup and scaffolding — `scripts/setup/`, `scripts/scaffold/`

| File                                                                     | What it is                                                                                                                                                                                                                                                                                           | Read next                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `scripts/setup/`                                                         | `npm run setup`: from a fresh clone to a filled-in `.env`. Copies `.env-example` if there is no `.env`, fills only placeholder lines (every secret the boot gate requires), never overwrites a value.                                                                                                | [First run](../tools/configuration.md#first-run-npm-run-setup) |
| `scripts/scaffold/`                                                      | `npm run scaffold:module -- <name>`: a working module from the template cut from the example module, written as a pure plan then applied, followed by `regenerate --no-sync`.                                                                                                                        | [Module scaffolder](../tools/module-scaffolder.md)             |
| `scripts/scaffold/demo-remove.ts`<br>`scripts/scaffold/demo-remove-*.ts` | `npm run demo:remove`: deletes every `group: shop` and `group: example` module folder, the shop's scenario files, and rewrites `src/modules.ts` and the generated scenario registries. It deletes; it never patches a file by matching its text. `measure:demo-strip` is its twin on a scratch copy. | [Adding & Removing a Module](../theory/module-lifecycle.md)    |

## Security data — `scripts/security/`

Developer tools that rebuild a committed security data file. Run by hand; never shipped.

| File                                             | What it is                                                                                                                                                                                                                                                                                                                     | See                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `scripts/security/refresh-breached-passwords.ts` | Rebuilds the bundled breached-password list from a pinned SecLists commit, SHA-256 checked before use, filtered through the contract's own password pattern — `npm run refresh:breached-passwords`. Run by hand, never scheduled: a top-N breach list changes on the order of years, and the trigger is that pattern changing. | [Authentication defences](../theory/defences/authentication.md) |
| `scripts/security/corpus-digest.ts`              | The SHA-256 integrity check for a downloaded corpus, apart from `refresh-breached-passwords.ts` so a test needs no network.                                                                                                                                                                                                    | —                                                               |

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

| File                | What it is                                                                                        | Read next                                      |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `.husky/pre-commit` | Runs lint-staged, then the light local gate (`complete:light:gates`), before a commit is written. | [Package Scripts](../tools/package-scripts.md) |
| `.husky/commit-msg` | Runs commitlint, so every message is a conventional commit.                                       | [Repository Root](./root.md)                   |
| `.husky/.gitignore` | Husky's own — keeps the shell wrappers husky generates out of the repository.                     | —                                              |
