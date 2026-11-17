
## Changing a contract

Contracts are edited at the leaves and generated everywhere else. The order is not optional:

1. **Edit the module's own contract file** — `src/modules/<module>/openapi.yaml` or
   `asyncapi.yaml`, or `shared/contracts/*.root.yaml` / `asyncapi.workers.yaml` for what belongs to
   no module. Never hand-edit the root bundles: `openapi.yaml`, `asyncapi.yaml` and
   `asyncapi.public.yaml` at the repo root are generated artifacts, gitignored and rebuilt on
   install, and an edit there is overwritten on the next bundle.
2. **Bundle the root contract** from those fragments — `npm run contracts:bundle`.
3. **Generate from the root bundle**, not from the fragments — `npm run gen:api` (the typed client
   and the Zod schemas under `api/`, which the models themselves import) and `npm run gen:asyncapi`
   (`src/types/asyncapi.generated.ts`, including `WORKER_CHANNELS`).
4. **Hand the result to the paired frontend** — `npm run sync:frontend`.

`npm run regenerate` runs all four in the only order that works, plus every generated doc table,
the crontab and the scenario registries. Prefer it over the individual scripts; `npm run check`
verifies all of it. The pre-commit hook runs it with
`--no-sync`, so `npm run complete` only ever verifies — but a contract change is not finished until
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

Every rule in this section is machine-checked — `tseslint.configs.strictTypeChecked` plus the
project-local rules in `scripts/eslint/`. They are written out here because the reasoning matters
when you hit one, not because the doc is the guard.

- MUST use `strict: true` in all TypeScript code.
- MUST NOT use `any` — use `unknown` plus type narrowing.
- MUST NOT use `as unknown as X`, nor `as any as X`. A double cast launders `any`: the compiler
  stops checking and nothing else starts. `no-restricted-syntax` refuses both everywhere, tests
  included — the rule is in `eslint.config.ts`, not just here.
  - Fix the type at its source: a typed `.lean<T>()`, a typed factory, a type guard, or a Zod
    parse through the generated schemas under `api/`.
  - One sanctioned exception, for hand-built test stubs only: `asStub<T>()` from
    `tests/support/stub.ts`. The cast happens once, behind a name, instead of everywhere.
- `as X` only **narrows**: it names which type a value already can be, proven by a check the
  compiler cannot follow (`unknown` after a Zod parse, a union after a discriminant, an `Element`
  after a selector check). Say which check, in a comment.
- `as X` never **widens or claims**: no list item cast to a full record, no partial to a whole,
  no `{}` to `T`. Model it with a union, a separate type or a parse. (An object literal cast to a
  type is lint-enforced: `consistent-type-assertions`.)
- `!` likewise: allowed for a value already proven present by a guard the compiler cannot follow,
  never to quiet a type error.
- MUST NOT use `@ts-ignore`. `@ts-expect-error` only where the type error is itself the thing under
  test, always with a `--` description.
- Every `eslint-disable` carries a description of what it protects — a bare one is refused, on
  purpose: an exemption should be an argument, not a shrug.
- MUST use ESM imports only (`import`/`export`); no CommonJS (`require`, `module.exports`).

## Function design

- MUST apply SOLID principles.
- MUST keep functions focused — one responsibility each.
- MUST keep nesting ≤ 3 levels; extract a helper for anything deeper. `max-depth` enforces the
  block half of this (4 in tests, where an exhaustive table walk is the clearest form);
  `max-nested-callbacks` caps callbacks at 4 in production code — chain, or name the step.
- MUST prefer pure functions and shared abstractions over duplicated inline logic.
- MUST NOT extract a function, file or wrapper unless it hides real complexity, names a domain
  rule, is a boundary (port, adapter, third-party call), or has ≥ 2 callers today. A three-line
  helper with one caller stays inline.
- MUST NOT add a parameter, option, generic or interface for a caller that does not exist yet.
- The shapes, their names and the legitimate reasons to keep one:
  `scripts/audit/code-shape/SKILL.md`. Run it to find them.

## Dependencies — look before you build

Open source first. Before writing anything non-trivial, check whether it already exists:

1. **Already in the repo** — read `package.json` first. Half the "missing" utility is usually a
   dependency we already pay for.
2. **A maintained library** — search npm before designing. Judge it on support, not stars:
   released in the last ~12 months, open issues actually answered, typed (or has `@types/*`),
   a licence we can use, and a dependency tree that isn't a liability.
3. **Only then write it ourselves** — and say why in one line: nothing exists, everything that
   exists is unmaintained, or the fit is genuinely wrong.

Rules of thumb:

- MUST NOT reimplement crypto, auth, parsing, date maths, rate limiting or validation by hand.
- Prefer one well-supported library over three thin ones, and the standard library or the runtime
  over both — `node:crypto`, `Intl`, `URL`, `AbortSignal` cover more than people expect.
- A tiny, obvious helper is cheaper to own than a dependency. The line is roughly: if it fits in a
  well-tested function and has no edge cases we'd get wrong, write it.
- When a choice is close, present the options and the trade-off instead of silently picking.
- **Write it down in the same change.** A new dependency gets its group and purpose in
  `scripts/docs/dependency-groups.ts`; `npm run regenerate` rebuilds the page. A library only one
  module imports is that module's: its page under `docs/modules/` says why it was chosen. A new
  module gets its page, plus a `## Libraries` section if it brings one. The one exception is
  `example` (`group: example`): it has no page by design, because it exists only to be copied and
  its files carry their own headers. `docs/understand/modules.md#the-module-template` is where it is
  explained, so do not "fix" the missing page. Removing a module removes what it owned.

## Module barrels

Every module publishes a convenience barrel (`src/modules/<name>/index.ts`, one for every module,
not only the ones a sibling currently imports): `export *` from its services, domain rules, events
and emails, plus `export type *` from its model. See `docs/understand/strategic-ddd.md` §5.

- MUST NOT export a repository, a model's runtime value (the mongoose schema, its `toJSON`
  transform, the model object itself), a wiring file (`routes.ts`, `controllers/`, `module.ts`,
  `probes.ts`, `metrics.ts`, `analytics.ts`, `audit.ts`) or `factories.ts` from a barrel. A
  repository export is a write handle on a collection this module does not own once published; the
  service is the door. A `factories.ts` export is the same door left open from the test side: it
  writes past the domain rules a service enforces, so it stays reachable at
  `@modules/<name>/factories` — for tests, `scenarios/`, and a module's own `tests/factories.ts` —
  never from the barrel a production import goes through.
- MUST NOT export a step that runs behind a guarded door — the function that does the write after
  another one checked permissions, ownership or state (`payments`' `settlePayment`, `inventory`'s
  `applyTransition`). Mark it `@internal` with a one-line reason;
  `tests/cross-cutting/guarded-steps-stay-unpublished.test.ts` refuses a tagged step in any barrel.
- An export in a file the barrel publishes is the module's public surface. Never remove it because
  nothing imports it yet — unused is allowed on purpose, since the alternative is a developer (or
  an AI) copying the logic, redeclaring the type, or casting around the gap instead of adding the
  export it needed.
- MUST NOT import a module's own barrel from inside that module — reach the sibling file directly.
  A module's own files depending on its published surface is what makes the surface unsafe to
  narrow later, and risks a load-order cycle under `export *`.
- A module may import a sibling's `friends/<its own name>.ts` (lint: the file's name must be the
  importer's), and a friend uses only its friend object: `account` imports `accountUserService`
  from `users/friends/account`, never the public `userService`. A step exactly one module may call
  goes in that file, tagged `@internal`; the barrel never publishes it.
- A controller reaching a repository, a model or wiring for something the barrel won't publish
  belongs to the service instead — ask the module's service for it, or add the read there.

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

Placement is by scope, and `eslint-plugin-boundaries` enforces the line at the import.
See `docs/reference/tests.md`; fakes live outside `src/`: `docs/build/test-doubles.md`.

- A test about **one module's rules** lives in `src/modules/<module>/tests/`, and may run the real
  modules that module depends on (`dependsOn`) — through their barrel, or their
  `tests/factories.ts` for storage. When several modules qualify, the one highest in the
  dependency chain owns it. A test about the **system** — infrastructure, the kernel, a rule that
  holds across every module, or a flow no single module depends on all of — lives in `tests/`.
- Pick the suite by what the test needs: `unit` (one function, no database) · `cross-cutting` (a
  rule across every module) · `integration` (a real database, or the real app over HTTP) ·
  `contract` (HTTP against the spec) · `fuzz` (the spec, hostile).
- MUST ship tests in the same change as the behaviour. New branch in the code, new test.
- Pass rate is 100%, always — fix it or delete it. `jest/no-focused-tests` and
  `jest/no-disabled-tests` refuse a `.only` or a `.skip` outright.
- Assert through the public door (the route, the service, the repository), not on private
  internals. A test shaped like the implementation fails on every refactor and catches nothing.
- A 401, 403 or malformed-id answer is the app-wide sweeps' job; a module test checks one only
  when it checks more than the status. See: `docs/build/contract-testing.md`
- **A run that finds failures: fix them all, then re-run only what the fixes can affect.** That is
  the failed tests plus the ones that touch the same areas — never the whole suite by default. A
  long suite (the live e2e takes hours) is run in full once; a second full run is a deliberate
  choice, made when extra certainty is wanted after the fix pass is done.
- **Mutation score is the one test-quality number; coverage is not measured.** A line can be
  executed by a test that asserts nothing about it. Stryker marks every line no test ran as a
  `NoCoverage` mutant — `docs/build/coverage-and-confidence.md`.

## Comments

@docs/build/code-comments.md

## Asking vs. deciding

**Default to asking.** A short question costs a minute; a large wrong turn costs the afternoon.
When two readings of a request would produce materially different work, ask — do not pick the
likelier one and build it.

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

## Researching an open question (`card it`)

When the user says **"card it"** / **"card these"** about one question or a list of them, or a plan
raises a design choice the rules above don't settle, run this procedure. Don't answer from memory.

1. **One agent per question**, in parallel, read-only. Each one:
   - re-checks the code on current `main` in both repos (cite `file:line` and the sha);
   - looks the standard up on the web, in the house order: Solidus → Shopify → Stripe → RFCs / Google
     AIP / Zalando → EU law. Every row is marked `verified: <url>` or `from memory`;
   - writes one **card** (format below).
2. **A skeptic agent per card** tries to break it: wrong facts, a better option, a clash with
   another decision. The card is corrected, never just defended.
3. **File it by confidence after the skeptic.** FE-only cards sit 10 points lower: the FE is
   allowed to be more creative than the BE.

   | Outcome | BE (or BE + FE) | FE only | File | Built? |
   | --- | --- | --- | --- | --- |
   | decided | ≥ 90 % | ≥ 80 % | `DECIDED.md` | yes |
   | decided with doubts | 80–90 % | 70–80 % | `DECIDED_WITH_DOUBTS.md`, alternatives kept | yes; the user may overturn it |
   | asked | < 80 % | < 70 % | `QUESTIONS.md` | no, waits for the user |

   - Whatever the %, a card on money, auth, deletion, a new dependency or a contract is asked
     (§ Asking vs. deciding).
   - An answered card moves to `DECIDED.md` in its final wording, with `Decided by: user, <date>`.
     A pipeline decision carries `Decided by: <role>, <N %>`.

4. **Where cards live:** `.work/` (gitignored), one home for both repos, one folder per feature:
   `.work/features/<feature>/` holds `QUESTIONS.md`, `DECIDED.md`, `DECIDED_WITH_DOUBTS.md`.
   - Each file has one writer: the role that decided, or the vicemanager.
   - `QUESTIONS.md` opens with a quick table (id, what, suggestion, %, lane).
   - A decided card is its lane's build spec; its lane row in `.work/HANDOFF.md` says so.
   - When the feature is merged: fold the why and the rejected alternatives into the owning
     `docs/` page, then delete the feature's folder.
5. **"Prune" or "refute"**: one refuter agent per decided card. A refuted card goes back to
   QUESTIONS; a surviving one is permanent and gets its amendments appended to its card.

**The card** follows the MADR 4 template (https://adr.github.io/madr/), plus our extras (marked ⁺).
One card per `###` heading. Short lines, plain words:

```md
### <ID> · <the question, in plain words>

**Status:** proposed | accepted | rejected | superseded by <ID> · <date> · decision-makers: <user | role>
**Plain version⁺:** 3-5 lines of plain prose a non-specialist can answer from: what is being
decided, what changes for whom, and what the suggestion is.

#### Context and Problem Statement
- Background (from scratch): the terms, one bullet each.
- Today (main <sha>): at most ~8 bullets, with file:line.
- Why it matters: who is hurt, and how.

#### Decision Drivers
The standards and house rules that settle it.

#### Considered Options
| Option | What changes | Good | Bad | Cost (S/M/L · BE/FE · contract yes/no) |

#### Decision Outcome
Chosen option: <letter>, because <the one reason>.
- **Confidence⁺:** <N> % · raises: <…> · lowers: <…>
- **Skeptic⁺:** held / corrected: <what it changed>
- **Consequences:** Good, because <…> · Bad, because <…>
- **Confirmation:** the build list (files, contract, tests, docs), so a lane can build it without coming back.

#### What others do⁺
| Who | What they do | Source (verified / from memory) |

**Answer with⁺:** "<ID> <letter>" (QUESTIONS only).
```

- Status by file: `QUESTIONS.md` = proposed · `DECIDED.md` and `DECIDED_WITH_DOUBTS.md` = accepted ·
  overturned = superseded by the new card · an option dropped on purpose = rejected.
- MADR keeps one record per file; ours keep several per file, so the status is a line, not a
  front-matter block.

## Commits

Conventional Commits, enforced by commitlint on the `commit-msg` hook
(`@commitlint/config-conventional`).

- `type(scope): subject` — lowercase, imperative, no trailing full stop. Lengths are commitlint's
  business, not this file's; it will tell you.
- Types: `feat` `fix` `refactor` `perf` `test` `docs` `style` `build` `ci` `chore` `revert`.
- Scope is the module or area it lands in: `feat(antibot):`, `fix(rate-limit):`,
  `refactor(testing):`.
- The subject says what the change **does for the system**, not which files moved —
  `fix(rate-limit): log every refusal, since nothing downstream will`, not `update middleware`.
- One commit per lane by default: code, tests, docs and the FE half together. Every commit pays a
  full light gate.
  - Check slices cheaply (eslint, prettier, `npm run check`, tests by file); do not commit them.
  - A second commit only to keep a behaviour change apart from a mechanical pass. Follow-ups and
    review fixes are amended in.
  - Small unrelated items may share one commit: the header takes the type of the largest, the body
    lists each as `- type(scope): subject`.
- Breaking change: `!` after the scope plus a `BREAKING CHANGE:` footer.
- MUST stage explicit pathspecs. Never `git add -A` or `git add .`: another session may have
  untracked work in this worktree, and it is not yours to commit.
- MUST commit with the pathspec, `git commit -m "…" -- <paths>`, not bare `git commit` after `git add`.
  A commit the hook rejects leaves its files staged, and the retry then commits them together with
  whatever else got staged since. After a failed hook, run `git status` before retrying.
  - Untracking a file (`git rm --cached`) is the one exception: a pathspec commit re-adds the
    working-tree copy. Check `git diff --cached --name-status` shows only the deletions, then run a
    plain `git commit`.
- The container engine here is **podman** (rootless); there is no Docker. `docker` on this box is
  the podman shim, `CONTAINER_ENGINE` defaults to `podman`, and a hung `docker run` means the
  podman service is wedged, not that the image is missing.
- MUST NOT run research subagents that implement concurrently in the same working tree. A subagent
  investigates and reports; writing code is single-threaded. Two agents that cannot see each
  other's edits, reconciled by hand afterward, is exactly how a merged file ends up with defects
  that pass review and only surface under execution — the failure mode is silent, not a merge
  conflict.
- The pre-commit hook runs `regenerate --no-sync` on disk, then `check:generated` (refuses a commit
  whose committed generated files are stale: run `npm run regenerate` and stage them; the hook never
  stages anything itself), eslint + prettier on the staged files, then the light
  `complete:light:gates` (static checks + unit + cross-cutting; no integration, contract, fuzz or
  `docs:build`), then `test:staged`: every integration, contract or fuzz test file the commit adds
  or changes, run by file. That is the permanent commit gate.
- A lane merges on `complete:light`. The full `npm run complete` (no live e2e, no mutation) runs on
  main every 20 commits; CI on push is authoritative.
- Default: commit normally and let the hook run its light gate. Nothing more is required.
- Before the commit, run every test the hook does not run that the change touches: a new Cypress
  journey or live e2e, AND every existing one whose screen, flow or response shape the change
  alters, by file. If the stack cannot run it, the change does not merge until it has. The commit
  message names what ran; "not run here" is not allowed.
- **NEVER** use `--no-verify` unless a `complete` (regular or `:fix`) has been run right before, on
  the current tree, and finished with success (all green). Running it is not required to commit;
  it is only the price of skipping the hook. Targeted checks (eslint on a few files, one jest
  file, `tsc`) do not count.

<!-- 2brain:start — regenerate with: 2brain <repo-path> -->
Use the repository context generated by 2brain before proposing changes.
@.2brain/REPO_CONTEXT.md
<!-- 2brain:end -->
