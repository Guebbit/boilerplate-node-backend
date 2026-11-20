---
type: reference
audience: [anyone]
---

# Scripts & Hooks

`scripts/` is the repo's own tooling: every file here is the implementation behind an `npm run`
entry. Most of it never ships — `scripts/ops/` and `scripts/db/` are the two exceptions,
because those run against a live deployment rather than from a developer's terminal;
The `runtime` stage of `docker/Dockerfile` copies all of `scripts/ops/`, `scripts/run-script.ts`, `scripts/cli.ts` and four named
files from `scripts/db/` (`index-sync.ts`, `sync-indexes.ts`, `cache-clear.ts`,
`bootstrap-access.ts`) into the production image and nothing else under `scripts/`. `scripts/eslint/` holds the lint rules this codebase wrote for itself, `scripts/audit/`
holds the AI audit prompts beside the scripts they run, and `.husky/` holds the git hooks.

Every script's user-facing name and when to run it is on
[Package Scripts](package-scripts.md). This page says what each folder holds.

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
├── hooks/                    what the git hooks call, below
├── db/                       deploy-time database scripts — see [Data](./data.md)
├── ops/                      what runs against a deployment: the scheduled jobs and `reencrypt`
├── scaffold/                 adding and removing modules: `scaffold:module`, `demo:remove`
├── security/                 rebuilding the committed security data: the breached-password list
├── setup/                    `npm run setup`: a fresh clone to a filled-in `.env`
└── eslint/                   the repo's own lint rules, documented below
```

The demo profile and the data it serves live in `scenarios/`, outside `scripts/` entirely —
see [Data](./data.md) and [Demo profile](../build/demo-profile.md).

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

## The top of `scripts/`

| File                              | What it is                                                                                                                             | Read next                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `scripts/regenerate-artifacts.ts` | Runs every generator in the right order — `npm run regenerate`. The one command to reach for after editing anything a generator reads. | [Regenerating After a Change](../build/regenerating.md) |
| `scripts/run-script.ts`           | The entry wrapper for the one-shot scripts in `db/` and `ops/`: what a bare promise chain does not give them (see its header).         | [Data](./data.md)                                       |
| `scripts/cli.ts`                  | Reads a script's command line: `--flag value` and `--flag=value`. Ships in the production image beside `run-script.ts`.                | —                                                       |
| `scripts/fail-script.ts`          | The last-resort handler for a script's top-level promise: say what failed, exit non-zero.                                              | —                                                       |
| `scripts/git-base.ts`             | Which git base a diff-scoped script compares against.                                                                                  | —                                                       |
| `scripts/modules-on-disk.ts`      | Where the repo and its modules are on disk — the one place a script asks.                                                              | [Modules](../understand/modules.md)                     |

## The folders

| Folder                | What lives here                                                                                                                                                               | Read next                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/contracts/`  | The bundlers and generators: the OpenAPI and AsyncAPI bundles, the client collections, the error-code, upload and permission-vocabulary generators, the breaking-change check | [Contract fragmentation](../build/contract-fragmentation.md) · [Regenerating](../build/regenerating.md) |
| `scripts/pairing/`    | Keeping this repo and the paired frontend byte-identical where they share files, and handing the generated result across                                                      | [Pairing & ports](../build/pairing-and-ports.md)                                                        |
| `scripts/mutation/`   | The Stryker runs and the per-file ratchet against the committed baseline                                                                                                      | [Mutation testing](../build/mutation-testing.md)                                                        |
| `scripts/testing/`    | The runner every `npm run test:*` goes through, and the two instruments that read a run afterwards (in no gate)                                                               | [Testing and docs](../build/testing-and-docs.md)                                                        |
| `scripts/docs/`       | Generators that write the generated blocks into `docs/`, the jobs table and crontab, and the reference checker                                                                | [Writing these docs](../build/documentation-style.md)                                                   |
| `scripts/audit/`      | One folder per AI audit: a `SKILL.md` the AI follows and a `scripts/` folder for what it runs                                                                                 | [AI auditing](../build/ai-auditing.md)                                                                  |
| `scripts/hooks/`      | What the pre-commit hook calls: the check that committed generated files are fresh                                                                                            | [Testing and docs](../build/testing-and-docs.md)                                                        |
| `scripts/db/`         | Deploy-time database scripts, shipped in the production image: index sync, cache clear, access bootstrap                                                                      | [Data](./data.md)                                                                                       |
| `scripts/ops/`        | The scheduled jobs and the operator tools (`reencrypt`); ships whole in the production image                                                                                  | [Scheduled jobs](./ops.md#scheduled-jobs)                                                               |
| `scripts/scaffold/`   | Adding and removing modules: `scaffold:module`, `demo:remove`                                                                                                                 | [Module scaffolder](../build/module-scaffolder.md)                                                      |
| `scripts/setup/`      | `npm run setup`: a fresh clone to a filled-in `.env`                                                                                                                          | [Run it locally](../build/run-locally.md)                                                               |
| `scripts/security/`   | Rebuilding the committed security data: the breached-password list (run by hand, never shipped)                                                                               | [Authentication defences](../understand/defences/authentication.md)                                     |
| `.husky/` (repo root) | The git hooks: `pre-commit` (regenerate, formatting, the light gate), `pre-merge-commit` (the same script, on a conflict-free merge) and `commit-msg` (commitlint)            | [Testing and docs](../build/testing-and-docs.md)                                                        |
| `scripts/eslint/`     | The repo's own lint rules, written when a cross-cutting test turned out to be a rule                                                                                          | [Testing and docs](../build/testing-and-docs.md)                                                        |
| `scenarios/`          | Outside `scripts/`: the demo records and flows, with the runner that builds them                                                                                              | [Data](./data.md#the-demo-records) · [Demo profile](../build/demo-profile.md)                           |
