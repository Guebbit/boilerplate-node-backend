# Scripts & Hooks

`scripts/` is the repo's own tooling: every file here is the implementation behind an `npm run`
entry, and none of it ships in the image. Alongside it, `eslint/rules/` holds the two lint rules
this codebase wrote for itself, and `.husky/` holds the git hooks.

Every script's user-facing name and when to run it is on
[Package Scripts](../tools/package-scripts.md). This page says what each _file_ is.

## How these are named

The filename says what the file does to what, in the same words its `npm run` entry uses. A file
that executes leads with a verb; a file that is only ever imported is a noun phrase, so the two are
distinguishable in a directory listing without opening either.

| Prefix      | The file                                                        |
| ----------- | --------------------------------------------------------------- |
| `check-`    | verifies and writes nothing — the exit code is the whole answer |
| `build-`    | produces a **committed** artifact                               |
| `generate-` | produces a **gitignored** artifact                              |
| `run-`      | starts a process or drives a tool                               |
| `report-`   | turns machine output into a human summary, and never fails      |
| `export-`   | writes a data file                                              |
| `sync-`     | writes into the paired repo                                     |
| _(no verb)_ | a library — imported by the above, never invoked                |

The same words are used in the paired frontend and in `boilerplate-php-laravel-backend`, whose
Artisan command classes are the StudlyCase spelling of these names. Abbreviations are a lint error
(`unicorn/prevent-abbreviations` checks filenames too), so write `directory`, not `dir`.

---

## Contract generation

The bundler is split by output, with one shared engine underneath.

| File                                             | What it is                                                                                                                                                                              | Read next                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/build-contract-bundles.ts`              | The CLI — `npm run contracts:bundle`, and a check mode for the CI gate that fails when a committed bundle disagrees with a fresh run.                                                   | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |
| `scripts/contracts/bundle-registry.ts`           | The catalogue of every document this repo produces from sources it owns, and which of them are guarded.                                                                                 | [Contracts](./contracts.md)                                            |
| `scripts/contracts/bundle-kinds.ts`              | What a bundle IS — the two kinds, compiled from authored sources or generated from a committed document, and the staleness comparison every one of them answers. Builds nothing itself. | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |
| `scripts/contracts/openapi-bundle.ts`            | Compiles `openapi.yaml` from the root preamble and each module's standalone OpenAPI document.                                                                                           | [OpenAPI Workflow](../api/openapi-workflow.md)                         |
| `scripts/contracts/asyncapi-bundles.ts`          | Compiles both async bundles — the full `asyncapi.yaml` and the `asyncapi.public.yaml` the frontend receives — from one set of sources.                                                  | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |
| `scripts/contracts/analytics-events-bundle.ts`   | Builds the analytics event-name contract: the module-owned names plus the client-only ones, published to the paired frontend.                                                           | [Product Analytics](../tools/analytics.md)                             |
| `scripts/contracts/client-collections-bundle.ts` | Writes the four client collections from `openapi.yaml` — one request at a time, with auth, bodies and example responses.                                                                | [Contracts](./contracts.md)                                            |
| `scripts/generate-asyncapi-types.ts`             | Generates `src/types/asyncapi.generated.ts` from `asyncapi.yaml`. Its check mode is the gate. Byte-identical to the frontend's copy.                                                    | [AsyncAPI Workflow](../api/asyncapi-workflow.md)                       |
| `scripts/regenerate-artifacts.ts`                | Runs every generator in the right order — `npm run regenerate`. The one command to reach for after editing anything a generator reads.                                                  | [Regenerating After a Change](../api/regenerating.md)                  |

## Cross-repo pairing

This backend and its frontend share a set of files byte-for-byte. These four keep that true.

| File                                       | What it is                                                                                                                                                                                                            | Read next                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/paired-frontend-path.ts`          | Where the paired frontend is expected to be — a sibling checkout by default, overridable by environment. Mirrored on the other side.                                                                                  | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/spec-identity.ts`                 | The cross-repo check itself: which files must be identical in both repos, and the comparison.                                                                                                                         | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/check-spec-identity.ts`           | Its CLI — `npm run check:spec-identity`. Wired into CI, which checks out the sibling first. Degrades to a warning locally when the sibling is not on disk, because a half-cloned pair should still be able to commit. | [Pairing & Ports](../tools/pairing-and-ports.md) |
| `scripts/sync-shared-files-to-frontend.ts` | Copies every backend-owned shared file into the paired frontend — `npm run sync:frontend`. The write side of what the identity check only verifies.                                                                   | [Pairing & Ports](../tools/pairing-and-ports.md) |

## Data and demo

| File                             | What it is                                                                                                                                                                     | Read next                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `scripts/run-demo-server.ts`     | The demo profile — the real API against an in-memory MongoDB, self-contained and disposable. What `npm run demo` boots, and what the paired frontend's e2e suite runs against. | [Demo profile](../tools/demo-profile.md) |
| `scripts/export-demo-dataset.ts` | Publishes the demo dataset as the API actually serves it — `npm run seed:export`, with a check mode as the gate.                                                               | [Data](./data.md)                        |

## Checks

| File                              | What it is                                                                                                                                                           | Read next                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scripts/run-prism-smoke-test.ts` | Boots Prism against `openapi.yaml` and proves it answers — `npm run test:prism`. A smoke test of the contract, not of the app: Prism serves the spec's own examples. | [Contract Testing (Response)](../tools/contract-testing.md) |

## Mutation testing

| File                                 | What it is                                                                                                                   | Read next                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scripts/run-mutation-tests.ts`      | Runs Stryker — `npm run test:mutation`. A wrapper rather than a bare invocation, for the three jobs a JSON config cannot do. | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/mutation-baseline.ts`       | The per-file mutation ratchet: the recorded score for each file, and the comparison that fails when one drops.               | [Mutation Testing](../tools/mutation-testing.md) |
| `scripts/check-mutation-baseline.ts` | Its CLI — `npm run test:mutation:check` to compare, `npm run test:mutation:baseline` to record a new floor.                  | [Mutation Testing](../tools/mutation-testing.md) |

## Diagnostics

Not part of any gate. Reach for these when a run misbehaves.

| File                               | What it is                                                                                                                                                    | Read next                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `scripts/report-test-results.ts`   | Turns a runner's JSON report into which **module** a failure belongs to and where the time went — `npm run test:report`.                                      | [Testing (overview)](../tools/testing-and-docs.md) |
| `scripts/report-heap-summary.ts`   | Summarises a V8 heap snapshot by object kind. The first tool to reach for when a worker dies of memory rather than of a failing assertion.                    | [Mutation Testing](../tools/mutation-testing.md)   |
| `scripts/report-heap-retainers.ts` | Answers "who is holding these?" for one kind of object — the question the summary cannot, because it aggregates nodes and never reads the edges between them. | [Mutation Testing](../tools/mutation-testing.md)   |

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
