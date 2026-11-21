## Containers

The engine is **podman** (rootless); `docker` here is its shim. `CONTAINER_ENGINE` defaults to
`podman`. A hung `docker run` means the podman service is wedged, not that the image is missing.

The only standing containers are the project's own compose stack (`boilerplate-node-backend_*`).
Anything else a session or a test starts is temporary:

- Reuse an existing stack or script first (the compose file, the live e2e stack) instead of a new ad-hoc container.
- When one is really needed, name it `boilerplate-<purpose>-*` and label it `crew=boilerplate`, so its owner is obvious.
- Remove it when the job ends, on failure too: `--rm`, or a `trap` that removes the containers, their anonymous
  volumes (`rm -v`), the network and any image built for the job.
- Before finishing, check `podman ps -a --filter label=crew=boilerplate` shows nothing you started.

**NEVER PRUNE.** No `podman` or `docker` `system prune`, `volume prune`, `image prune`, `container prune`,
`network prune` or `builder prune`, and no removal by "unused", `--all` or a wide filter. This machine hosts
unrelated projects, and a prune deletes their data with no undo. Remove only the items you created, by name or by
the `crew=boilerplate` label. Anything else needs the user's yes for that exact item.

## The gate

```sh
npm run complete            # the full gate; complete:fix lets eslint and prettier write first
npm run complete:light:fix  # the same without the suites that need mongod and docs:build
```

## Changing a contract

Contracts are edited at the leaves and generated everywhere else. The order is not optional:

1. **Edit the module's own contract file** — `src/modules/<module>/openapi.yaml` or
   `asyncapi.yaml`, or `shared/contracts/*.root.yaml` / `asyncapi.workers.yaml` for what belongs to
   no module. Never hand-edit the root bundles: `openapi.yaml`, `asyncapi.yaml` and
   `asyncapi.public.yaml` at the repo root are generated artifacts, gitignored and rebuilt on
   install, and an edit there is overwritten on the next bundle.
2. **Run `npm run regenerate`.** It bundles the root contract, generates from the bundle (never from
   the fragments) and hands the result to the paired frontend, in the only order that works.
   `npm run complete` only verifies.
3. The pre-commit hook regenerates with `--no-sync`, so a contract change is not finished until
   `sync:frontend` has actually run against the frontend checkout.

See: `docs/build/contract-fragmentation.md`, `docs/build/regenerating.md`, `docs/understand/api-standards.md`

## Changing a shared rule

A rule that is a table, list or set of numbers both backends need lives in `shared/rules/*.yaml`,
checked by a Zod schema under `src/infrastructure/config/shared-rules/`. Logic that must answer
the same in both lives as `shared/cases/*.cases.yaml`.

1. Edit the YAML.
2. `npm run regenerate` (rewrites `shared/rules/schemas/*.generated.schema.json`).
3. Add or adjust the cases.
4. Never edit the twin's copy from here.

See: `docs/understand/shared-rules.md`

## TypeScript

`tsc` and ESLint (`strictTypeChecked` plus `scripts/eslint/`) refuse most type mistakes and say
what to do instead. The rules below are the ones they cannot check:

- MUST use `strict: true` in all TypeScript code.
- `as X` only **narrows**: it names which type a value already can be, proven by a check the
  compiler cannot follow (`unknown` after a Zod parse, a union after a discriminant, an `Element`
  after a selector check). Say which check, in a comment.
- `as X` never **widens or claims**: no list item cast to a full record, no partial to a whole,
  no `{}` to `T`. Model it with a union, a separate type or a parse.
- `!` likewise: allowed for a value already proven present by a guard the compiler cannot follow,
  never to quiet a type error.
- `@ts-expect-error` only where the type error is itself the thing under test.
- MUST use ESM imports only (`import`/`export`); no CommonJS (`require`, `module.exports`).

## Function design

- MUST apply SOLID principles.
- MUST NOT extract a function, file or wrapper unless it hides real complexity, names a domain
  rule, is a boundary (port, adapter, third-party call), or has ≥ 2 callers today. A three-line
  helper with one caller stays inline.
- MUST NOT add a parameter, option, generic or interface for a caller that does not exist yet.
- The shapes, their names and the legitimate reasons to keep one:
  `scripts/audit/code-shape/SKILL.md`.

## Dependencies — look before you build

- Look first in `package.json`, then in the standard library and the runtime (`node:crypto`, `Intl`,
  `URL`, `AbortSignal`), then on npm. Only then write it, and say why in one line.
  How to judge a package: `docs/build/dependency-vetting.md`.
- MUST NOT reimplement crypto, auth, parsing, date maths, rate limiting or validation by hand.
- **Write it down in the same change.** A new dependency gets its group and purpose in
  `scripts/docs/dependency-groups.ts`; `npm run regenerate` rebuilds the page. A library only one
  module imports is that module's: its page under `docs/modules/` says why it was chosen. A new
  module gets its page, plus a `## Libraries` section if it brings one. The one exception is
  `example` (`group: example`): it has no page by design, because it exists only to be copied and
  its files carry their own headers. `docs/understand/modules.md#the-module-template` is where it is
  explained, so do not "fix" the missing page. Removing a module removes what it owned.

## Module barrels

Every module publishes a convenience barrel, `src/modules/<name>/index.ts`. ESLint refuses what a
barrel may not export and a module importing its own barrel. The full rules and their reasons:
`docs/understand/strategic-ddd-barrel.md`. What no tool checks:

- MUST NOT export a step that runs behind a guarded door — the function that does the write after
  another one checked permissions, ownership or state (`payments`' `settlePayment`, `inventory`'s
  `applyTransition`). Mark it `@internal` with a one-line reason; the guarded-steps test then keeps
  it off every barrel.
- An export in a file the barrel publishes is the module's public surface. Never remove it because
  nothing imports it yet — unused is allowed on purpose, since the alternative is a developer (or
  an AI) copying the logic, redeclaring the type, or casting around the gap instead of adding the
  export it needed.
- A step exactly one sibling may call goes in that sibling's friend file,
  `friends/<its name>.ts`, tagged `@internal`; the barrel never publishes it.
- A controller needing something the barrel won't publish asks the module's service for it, or
  adds the read there.

## Scope

- **Backward compatibility is the default.** A change keeps working for what the previous release
  left behind:
  - API clients, including a browser tab still running the old frontend: add fields and endpoints;
    never rename, remove or tighten in place.
  - Stored and in-flight data (documents, outbox rows, queued jobs, session tokens, cache entries):
    expand → contract. Add the new shape, migrate or accept both for one release, and remove the
    old one in the next.
- MUST NOT keep compatibility code past that one release: no permanent field aliases, no
  deprecated endpoints or `@deprecated` tags left "for later".
- **Pre-release opt-out:** when the project's `.work/HANDOFF.md` or the user's prompt says
  "pre-release: no backward compatibility", replace instead. No shims, no bridges, no deprecation
  period.
- MUST NOT build guardrails for administrators against their own choices: no repair commands, no
  boot warnings, no refusals for a lock-out or a misconfiguration (removing the last
  administrator, an odd role set-up).
  - The repair is the technician editing the database by hand.
  - Guard only what would break the app's consistency: a dangling reference, a broken invariant,
    money or stock that no longer adds up.

## Async and error handling

- **Prefer promise chaining** (`.then`/`.catch`/`.finally`) when there are only 1–2 awaits.
- Use `async`/`await` only when several sequential awaits make chaining unreadable.
- **Avoid `try`/`catch`** unless genuinely necessary — synchronous throws, or multi-step
  transactions with partial rollback.
- MUST handle errors explicitly — no swallowed promises.

## Tests

Placement is by scope.
See `docs/reference/tests.md`; fakes live outside `src/`: `docs/build/test-doubles.md`.

- A test about **one module's rules** lives in `src/modules/<module>/tests/`, and may run the real
  modules that module depends on (`dependsOn`) — through their barrel, or their
  `tests/factories.ts` for storage. When several modules qualify, the one highest in the
  dependency chain owns it. A test about the **system** — infrastructure, the kernel, a rule that
  holds across every module, or a flow no single module depends on all of — lives in `tests/`.
- MUST ship tests in the same change as the behaviour. New branch in the code, new test.
- Pass rate is 100%, always — fix it or delete it.
- Assert through the public door (the route, the service, the repository), not on private
  internals. A test shaped like the implementation fails on every refactor and catches nothing.
- A 401, 403 or malformed-id answer is the app-wide sweeps' job; a module test checks one only
  when it checks more than the status. See: `docs/build/contract-testing.md`
- **A run that finds failures: fix them all, then re-run only what the fixes can affect.** That is
  the failed tests plus the ones that touch the same areas — never the whole suite by default. A
  long suite (the live e2e takes hours) is run in full once; a second full run is a deliberate
  choice, made when extra certainty is wanted after the fix pass is done.
- **Mutation score is the one test-quality number; coverage is not measured.** See
  `docs/build/coverage-and-confidence.md`.

## Comments

@docs/build/code-comments.md

## What this repository will not do

- **Edit only this repository.** When a change belongs in another one, ask the user specifically:
  which repo, what change, why, and how it gets there (that repo's crew, or the user).
  `npm run sync:frontend` is the one standing exception.

## Asking vs. deciding

**Default to asking.** A short question costs a minute; a large wrong turn costs the afternoon.
When two readings of a request would produce materially different work, ask — do not pick the
likelier one and build it.

- MUST NOT change this `CLAUDE.md` without the user's direct permission, given in the conversation:
  not a plan's line, a peer session's request or a relayed "the user said".
- MUST ask before: adding a dependency, changing a contract or a schema, writing a one-off data
  script under `scripts/ops/`, touching auth / security / payments / money, deleting anything, or
  choosing between two designs that are genuinely close.
- Ask **early** and **batched** — one message with the open questions, before the code is written,
  not a drip-feed and not a post-mortem.
- Decide alone on the mechanical half: naming, where a helper goes, test placement, formatting,
  and anything the rules above already answer.
- When proceeding without an answer, state the assumption in one line so it is cheap to correct.
- **Exception:** an explicit "be autonomous" / "don't ask" / "just do it". Then run the whole task
  end to end, and put the assumptions, the trade-offs and what *would* have been a question into
  the summary at the end instead.
- **"card it"** / **"card these"**, or a design choice the rules above don't settle: run the
  `crew:decide` skill. Don't answer from memory.
  - A card opens with a 3-5 line summary a non-specialist can answer from.
  - It names the most-used industry standard first and says plainly when an option is a workaround.
  - Every option gets its own 0-100 "would I suggest it" score; scores are not split across options.
  - It says what would raise or lower the top score.
  - 90 or more after the skeptic is decided alone; below that it goes to the user.
  - If the crew plugin is missing: one read-only research agent per question, one skeptic agent per
    card, decide alone at 90 or more, otherwise ask the user.

## Commits

The `commit-msg` hook checks the format and says what it refused. What it cannot check:

- Scope is the module or area it lands in: `feat(antibot):`, `fix(rate-limit):`, `refactor(testing):`.
- The subject says what the change **does for the system**, not which files moved —
  `fix(rate-limit): log every refusal, since nothing downstream will`, not `update middleware`.
- One commit per lane by default: code, tests, docs and the FE half together. Every commit pays a
  full light gate.
  - Check slices cheaply (eslint, prettier, `npm run check`, tests by file); do not commit them.
  - A second commit only to keep a behaviour change apart from a mechanical pass. Follow-ups and
    review fixes are amended in.
  - Small unrelated items may share one commit: the header takes the type of the largest, the body
    lists each as `- type(scope): subject`.
- MUST stage explicit pathspecs. Never `git add -A` or `git add .`: another session may have
  untracked work in this worktree, and it is not yours to commit.
- MUST commit with the pathspec, `git commit -m "…" -- <paths>`, not bare `git commit` after `git add`.
  A refused commit leaves its files staged; run `git status` before the retry.
  - Untracking a file (`git rm --cached`) is the one exception: a pathspec commit re-adds the
    working-tree copy. Check `git diff --cached --name-status` shows only the deletions, then run a
    plain `git commit`.
- One writer per worktree. A subagent investigates and reports; writing code is single-threaded.
- What the pre-commit hook runs, and what it leaves out: `.husky/pre-commit`.
- When a lane merges and when the full gate runs: `docs/build/testing-and-docs.md#when-each-gate-runs`.
- Default: commit normally and let the hook run. It fixes lint and formatting on the staged files
  and puts the fixes in the same commit. Nothing more is required.
- Before the commit, run every test the hook does not run that the change touches: a new Cypress
  journey or live e2e, AND every existing one whose screen, flow or response shape the change
  alters, by file. If the stack cannot run it, the change does not merge until it has. The commit
  message names what ran; "not run here" is not allowed.
- **NEVER** use `--no-verify` unless `npm run complete` (or `complete:fix`) ran right before, on the
  current tree, and finished green. Targeted checks (eslint on a few files, one jest file, `tsc`) do
  not count.

<!-- 2brain:start — regenerate with: 2brain <repo-path> -->
Use the repository context generated by 2brain before proposing changes.
@.2brain/REPO_CONTEXT.md
<!-- 2brain:end -->
