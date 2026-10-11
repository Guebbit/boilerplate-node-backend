# Repository Root

Files with no directory above them. This is where the "what on earth is `orval.config.ts`"
questions live — every one of them is a tool's entry point, sitting at the root because the tool
looks for it there by name.

::: tip Also at the root, explained elsewhere
The REST and realtime specs, the client collections and the Spectral rulesets (now under
`shared/contracts/`) are on [Contracts](./contracts.md). The compose files and `.dockerignore`
are on [Ops & Assets](./ops.md), `docker-compose.backup-server.yml` (the second machine for
backups) included.
:::

---

## The way in

| File           | What it is                                                                                                                                                                                                                                               | Read next                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `README.md`    | The repository's front door: what this boilerplate is, the four commands that get it running, and where the docs live.                                                                                                                                   | [Getting Started](../getting-started.md)                                          |
| `.env-example` | The template for `.env`, one commented line per variable, grouped by concern. `.env` itself is git-ignored, so this file is the only record of which variables exist. Copy it before the first run or the app boots against defaults you did not choose. | [Runtime](../tools/runtime.md) · [Pairing & Ports](../tools/pairing-and-ports.md) |
| `LICENSE`      | The AGPL-3.0 text, verbatim from the FSF. `package.json` and the README both declare this licence; this is the copy they refer to. Byte-identical to the paired frontend's.                                                                              | —                                                                                 |
| `SECURITY.md`  | The vulnerability-reporting policy GitHub shows on the Security tab: report through private Security Advisories, not a public issue.                                                                                                                     | [Security](../tools/security.md#reporting-a-vulnerability)                        |
| `CLAUDE.md`    | The house rules an AI editor (and a human) follows: contract order, TypeScript, comments, tests, commits.                                                                                                                                                | [Documentation style](./documentation-style.md)                                   |

## Package and TypeScript

| File                 | What it is                                                                                                                                                                                                                             | Read next                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `package.json`       | Dependencies and the script surface. Every workflow in this repo is an `npm run` here — there are no undocumented commands.                                                                                                            | [Package Dependencies](../tools/package-dependencies.md) · [Package Scripts](../tools/package-scripts.md) |
| `package-lock.json`  | The resolved dependency tree, exact versions and integrity hashes. Committed so every machine and CI runner installs the same bytes. Never hand-edited; it is the output of `npm install`.                                             | [Package Dependencies](../tools/package-dependencies.md)                                                  |
| `tsconfig.json`      | The compiler settings and the `@app` / `@kernel` / `@modules` / `@infrastructure` / `@api` / `@tests` path aliases the whole codebase imports through.                                                                                 | [Architecture](../theory/architecture.md)                                                                 |
| `tsconfig.jest.json` | The same settings with `node16` module resolution and `verbatimModuleSyntax` off — what ts-jest needs to load `src/app.ts` and its subpath-export imports at all. Extends `tsconfig.json`, so a change there reaches the test run too. | [Unit Testing](../tools/unit-testing.md)                                                                  |
| `.nvmrc`             | The Node major the repo develops on (`24`); `package.json#engines` holds the exact floor.                                                                                                                                              | [Runtime](../tools/runtime.md)                                                                            |
| `.npmrc`             | `strict-allow-scripts` (an install script runs only if `package.json` `allowScripts` names it) and `engine-strict`, so an older npm refuses instead of ignoring the line.                                                              | [Package Dependencies](../tools/package-dependencies.md)                                                  |

## Lint and format

| File                                                                                                  | What it is                                                                                                                                                                                                                                                     | Read next                                                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `eslint.config.ts`                                                                                    | The flat config, and the largest of these files by far. It holds the four-tier import boundaries (`no-restricted-imports` per tier), the ban on double casts, and the repo's own rules from `scripts/eslint/`. The tiers are enforced here, not by convention. | [Architecture](../theory/architecture.md) · [Scripts & Hooks](./scripts.md) |
| `.prettierrc`                                                                                         | Formatting: four-space tabs, single quotes, semicolons, 100 columns, no trailing commas.                                                                                                                                                                       | [Package Scripts](../tools/package-scripts.md)                              |
| `.prettierignore`                                                                                     | What Prettier must not touch. Mostly generated artefacts whose bytes are asserted against a fresh run — reformatting `openapi.yaml` would fail a check on a file nobody edited.                                                                                | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md)      |
| `commitlint.config.cjs`                                                                               | Three lines: conventional commits, nothing custom. `.husky/commit-msg` runs it on every commit — including the 100-character header limit, which is the only subject-length rule there is.                                                                     | [Scripts & Hooks](./scripts.md)                                             |
| `.dependency-cruiser.cjs`<br>`.dependency-cruiser.modules.cjs`<br>`.dependency-cruiser.bootstrap.cjs` | The three `check:dependencies` cruises: the layer and module allow-lists (`module.yaml#dependsOn`), the per-module view, and the clean-checkout guard that keeps the contract bundler's static imports off `api/` before `gen:api` has run.                    | [Dependency graph](../tools/dependency-graph.md)                            |

### Comment links

`local/comment-links` checks the `.ts`/`.tsx` paths a comment names against the tracked files. It does
not check Markdown at all. `.gitignore` is the guard for that: a root-level plan or audit doc is
written for one change and deleted when it lands, so a comment naming one becomes a dangling
pointer. The stable Markdown targets are `docs/*` and the tracked root `CLAUDE.md`, `README.md` and
`SECURITY.md`. External URLs are exempt — a link to a library's own documentation is the thing the
third-party-comment convention asks for.

## Test runners

| File                                                | What it is                                                                                                                                                                                                                            | Read next                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `jest.config.js`                                    | The test runner's config. A `.js` file rather than JSON so its settings can carry their reasoning. Coverage is not measured: the mutation score is the test-quality number.                                                           | [Unit Testing](../tools/unit-testing.md) · [Testing (overview)](../tools/testing-and-docs.md) |
| `jest.config.mutation.js`                           | The same run with swc instead of ts-jest, used only by Stryker. ts-jest type-checks, which means it caches a TypeScript program that never gets evicted across thousands of mutants until the worker dies of it; swc only translates. | [Mutation Testing](../tools/mutation-testing.md)                                              |
| `stryker.json`                                      | Which files are mutated, the concurrency, and the collapse threshold. The per-file record lives in the baseline file the ratchet compares against, not here.                                                                          | [Mutation Testing](../tools/mutation-testing.md)                                              |
| `jest.config.cluster.js`<br>`jest.config.broker.js` | The runners behind `npm run test:cluster` and `npm run test:broker`: their own configs because the defaults in `jest.config.js` (setup files, rate-limit budgets, in-memory services) are wrong for a real cluster or a real broker.  | [Cluster Testing](../tools/cluster-testing.md) · [Broker Testing](../tools/broker-testing.md) |
| `mutation-baseline.json`                            | The committed per-file mutation baseline the ratchet compares against, refreshed with `npm run mutation:pull`.                                                                                                                        | [Mutation Testing](../tools/mutation-testing.md)                                              |

## Code generation and data

| File              | What it is                                                                                                                                                                                                                       | Read next                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `orval.config.ts` | Tells Orval to read `openapi.yaml` and write `api/models/` plus `api/schemas.zod.ts`. Only the `zod` client is generated: nothing in a backend consumes a generated HTTP caller, and that mode still emits the model interfaces. | [Regenerating After a Change](../api/regenerating.md) · [Contracts](./contracts.md) |

## Git

| File             | What it is                                                                                                                                                                                                                                    | Read next                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.gitignore`     | What never gets committed. Two entries carry real decisions: `.env*` with `!.env-example` negated, and `public/images/*` with `!public/images/seed/` negated — uploads are strangers' files, the seed fixtures are repository content.        | [Ops & Assets](./ops.md)                                               |
| `.gitattributes` | Marks every generated artefact `linguist-generated=true`, which collapses its diff on GitHub and keeps it out of the language breakdown. It is the only "do not hand-edit" marker that works on the JSON files, which cannot carry a comment. | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |
