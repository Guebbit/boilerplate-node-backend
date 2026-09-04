# Scripts & Hooks

`scripts/` is the repo's own tooling: every file here is the implementation behind an `npm run`
entry, and none of it ships in the image. `ops/` is the exception that proves it — scheduled jobs
that run against the production image, so they ship and `scripts/` does not. Alongside both,
`eslint/rules/` holds the two lint rules this codebase wrote for itself, and `.husky/` holds the
git hooks.

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
├── demo/                     the demo profile and the data it serves
├── mutation/                 the Stryker runs and the per-file ratchet
├── testing/                  everything else that runs or reads a test suite
└── docs/                     generators that write into docs/
```

The folder's word is not repeated in the filename: `scripts/mutation/run-tests.ts`, not
`run-mutation-tests.ts`. Deliberately NOT aligned with the `npm run` namespaces — those group by
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
| `reap-`     | deletes or scrubs expired data on a schedule — `ops/` only                     |
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

## Cross-repo pairing — `scripts/pairing/`

This backend and its frontend share a set of files byte-for-byte. These four keep that true.

| File                                      | What it is                                                                                                                                                                                                            | Read next                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/pairing/paired-frontend-path.ts` | Where the paired frontend is expected to be — a sibling checkout by default, overridable by environment. Mirrored on the other side.                                                                                  | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/spec-identity.ts`        | The cross-repo check itself: which files must be identical in both repos, and the comparison.                                                                                                                         | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/check-spec-identity.ts`  | Its CLI — `npm run check:spec-identity`. Wired into CI, which checks out the sibling first. Degrades to a warning locally when the sibling is not on disk, because a half-cloned pair should still be able to commit. | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/pairing/sync-to-frontend.ts`     | Copies every backend-owned shared file into the paired frontend — `npm run sync:frontend`. The write side of what the identity check only verifies.                                                                   | [Pairing & Ports](../tools/pairing-and-ports.md) |

## Demo and data — `scripts/demo/`

| File                                   | What it is                                                                                                                                                                     | Read next                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `scripts/demo/run-server.ts`           | The demo profile — the real API against an in-memory MongoDB, self-contained and disposable. What `npm run demo` boots, and what the paired frontend's e2e suite runs against. | [Demo profile](../tools/demo-profile.md)         |
| `scripts/demo/export-dataset.ts`       | Publishes the demo dataset as the API actually serves it — `npm run seed:export`, with a check mode as the gate.                                                               | [Data](./data.md)                                |
| `scripts/demo/generate-seed-images.ts` | Downloads one photo per catalogue role and runs it through the real upload pipeline — `npm run seed:images`. Network-using and one-off, deliberately outside `regenerate`.     | [Image processing](../tools/image-processing.md) |

## Mutation testing — `scripts/mutation/`

| File                                 | What it is                                                                                                                   | Read next                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/mutation/run-tests.ts`      | Runs Stryker — `npm run test:mutation`. A wrapper rather than a bare invocation, for the three jobs a JSON config cannot do. | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/baseline.ts`       | The per-file mutation ratchet: the recorded score for each file, and the comparison that fails when one drops.               | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/check-baseline.ts` | Its CLI — `npm run test:mutation:check` to compare, `npm run test:mutation:baseline` to record a new floor.                  | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation/run-diff.ts`       | The same Stryker run narrowed to the files a branch changed, then the ordinary ratchet — `npm run test:mutation:diff`.       | [Mutation Testing](../tools/mutation-testing.md) |

## Testing — `scripts/testing/`

Everything else that runs or reads a test suite. Neither is in the pre-commit gate.

| File                                      | What it is                                                                                                                                                           | Read next                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scripts/testing/run-prism-smoke-test.ts` | Boots Prism against `openapi.yaml` and proves it answers — `npm run test:prism`. A smoke test of the contract, not of the app: Prism serves the spec's own examples. | [Contract Testing (Response)](../tools/contract-testing.md) |
| `scripts/testing/report-results.ts`       | Turns a runner's JSON report into which **module** a failure belongs to and where the time went — `npm run test:report`.                                             | [Testing (overview)](../tools/testing-and-docs.md)          |

## Docs — `scripts/docs/`

| File                                    | What it is                                                                                                                                                                           | Read next                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `scripts/docs/generate-module-graph.ts` | Writes the module graph in `docs/modules/index.md` and one neighbourhood diagram per module page, read off the real import graph — `npm run docs:graph`. Its check mode is the gate. | [Modules](./src-modules.md) |

## Scheduled jobs — `ops/`

The one folder here that **ships in the production image** (`.docker/Dockerfile.production` copies
it alongside `src/` and `db/`), because these are meant to run against a live database from a cron
container rather than from a developer's terminal. Each one takes the `db/run-script.ts` wrapper,
which gives it an exit code, cleanup on the failure path, and a readable error.

| File                            | What it is                                                                                                                         | Read next                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ops/reap-quarantine.ts`        | Deletes quarantined uploads past the retention window — `npm run reap:quarantine`. Filesystem-only and safe to repeat.             | [Image processing](../tools/image-processing.md) |
| `ops/reap-inactive-accounts.ts` | The three-stage inactivity reaper — warn, soft delete, hard delete. Disabled by default; enabling it is the controller's decision. | [Ops](./ops.md)                                  |
| `ops/reap-orders.ts`            | Scrubs order PII once `anonymizeAfter` arrives — `npm run reap:orders`. Never deletes a row: an order is an invoice.               | [Ops](./ops.md)                                  |

## The repo's own lint rules

Both of these were tests once, and both were the same mistake: a rule enforced after the fact
instead of at the keystroke. As lint rules they report in the editor and fix on save.

| File                                          | What it is                                                                                                                                                                                        | Read next                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `eslint/rules/index.ts`                       | The plugin barrel `eslint.config.ts` imports.                                                                                                                                                     | [Repository Root](./root.md)              |
| `eslint/rules/controller-chain-must-catch.ts` | A promise chain started in a controller must end in a catch. Without it an unhandled rejection reaches the global handler, which answers a generic 500 instead of the status the operation meant. | [Request Flow](../theory/request-flow.md) |
| `eslint/rules/no-hardcoded-user-text.ts`      | User-facing copy comes from a dictionary, never from a literal at the call site — otherwise the string cannot be translated and the locale bundles quietly stop being the source of truth.        | [Modules](./src-modules.md)               |

## Git hooks

| File                | What it is                                                                    | Read next                                      |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `.husky/pre-commit` | Runs the full local gate before a commit is written.                          | [Package Scripts](../tools/package-scripts.md) |
| `.husky/commit-msg` | Runs commitlint, so every message is a conventional commit.                   | [Repository Root](./root.md)                   |
| `.husky/.gitignore` | Husky's own — keeps the shell wrappers husky generates out of the repository. | —                                              |
