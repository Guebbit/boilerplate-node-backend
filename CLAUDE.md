
## Changing a contract

Contracts are edited at the leaves and generated everywhere else. The order is not optional:

1. **Edit the module's own contract file** — `src/modules/<module>/openapi.yaml` or
   `asyncapi.yaml`, or `shared/contracts/*.root.yaml` / `asyncapi.workers.yaml` for what belongs to
   no module. Never hand-edit the root bundles: `openapi.yaml`, `asyncapi.yaml` and
   `asyncapi.public.yaml` at the repo root are generated artifacts, and an edit there is overwritten
   on the next bundle.
2. **Bundle the root contract** from those fragments — `npm run contracts:bundle`.
3. **Generate from the root bundle**, not from the fragments — `npm run gen:api` (the typed client
   and the Zod schemas under `api/`, which the models themselves import) and `npm run gen:asyncapi`
   (`src/types/asyncapi.generated.ts`, including `WORKER_CHANNELS`).
4. **Hand the result to the paired frontend** — `npm run sync:frontend`.

`npm run regenerate` runs all four in the only order that works, plus `docs:graph` and
`docs:roles`. Prefer it over the individual scripts. The pre-commit hook runs it with `--no-sync`,
so `npm run complete` only ever verifies — but a contract change is not finished until
`sync:frontend` has actually run against the frontend checkout.

See: `docs/api/contract-fragmentation.md`, `docs/api/regenerating.md`

## TypeScript

Every rule in this section is machine-checked — `tseslint.configs.strictTypeChecked` plus the
project-local rules in `eslint/rules/`. They are written out here because the reasoning matters
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
- A single `as X` is fine where it narrows something the compiler cannot see into — say why in a
  comment. `!` likewise: allowed for a value already proven present by a guard the compiler cannot
  follow, never to quiet a type error.
- MUST NOT use `@ts-ignore`. `@ts-expect-error` only where the type error is itself the thing under
  test, always with a `--` description.
- Every `eslint-disable` carries a description of what it protects — a bare one is refused, on
  purpose: an exemption should be an argument, not a shrug.
- MUST use ESM imports only (`import`/`export`); no CommonJS (`require`, `module.exports`).

## Function design

- MUST apply SOLID principles.
- MUST keep functions focused — one responsibility each.
- MUST keep nesting ≤ 3 levels; extract a helper for anything deeper. `max-depth` enforces the
  block half of this (4 in tests, where an exhaustive table walk is the clearest form). Nested
  callbacks are not counted by a rule — chain, or name the step.
- MUST prefer pure functions and shared abstractions over duplicated inline logic.

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

## Scope

- MUST NOT preserve backward compatibility (old field names, deprecated endpoints, legacy code
  paths, dual-write transitions) unless the user explicitly asks for it. Replace, don't shim.
- MUST NOT leave deprecated code in place — no `@deprecated` tag kept "for later." When a change
  supersedes something, remove it in the same change.

## Async and error handling

- **Prefer promise chaining** (`.then`/`.catch`/`.finally`) when there are only 1–2 awaits.
- Use `async`/`await` only when several sequential awaits make chaining unreadable.
- **Avoid `try`/`catch`** unless genuinely necessary — synchronous throws, or multi-step
  transactions with partial rollback.
- MUST handle errors explicitly — no swallowed promises.

## Tests

Placement is by scope, and `eslint-plugin-boundaries` enforces the line at the import.
See `docs/reference/tests.md`.

- A test about **one module** lives in `src/modules/<module>/tests/`. A test about the **system** —
  infrastructure, the kernel, or a rule that holds across every module — lives in `tests/`.
- Pick the suite by what the test needs: `unit` (one function, no database) · `cross-cutting` (a
  rule across every module) · `integration` (a real database, or the real app over HTTP) ·
  `contract` (HTTP against the spec) · `fuzz` (the spec, hostile).
- MUST ship tests in the same change as the behaviour. New branch in the code, new test.
- Pass rate is 100%, always — fix it or delete it. `jest/no-focused-tests` and
  `jest/no-disabled-tests` refuse a `.only` or a `.skip` outright.
- Assert through the public door (the route, the service, the repository), not on private
  internals. A test shaped like the implementation fails on every refactor and catches nothing.
- **Mutation score is the signal; coverage is the proxy.** A line can be executed by a test that
  asserts nothing about it. Where the two disagree, Stryker is the one telling the truth —
  `docs/tools/coverage-and-confidence.md`.
- Coverage floors are a ratchet recording where the code *is*, not a target, and they are not in
  the commit gate. Run `npm run test:unit:coverage` by hand when the number matters.

## Comments

Every comment answers up to two questions, in this order, and nothing else:

1. **What does this do** — only if the name doesn't already say it.
2. **Why is it shaped this way** — the one non-obvious reason, or its place in the larger flow.

**The budget is prose, and structure is nearly free.** This is the whole rule, and it is not about
brevity — a comment that needs more room is allowed it. What is capped is the FORM that room takes.
A seventh consecutive sentence is where a reader loses the thread; a seventh labelled row is still
scannable. So running out of budget means **change form**, never delete the content.

Count the PROSE only. A list item, a `Label:` row and its indented continuations, a table rule, a
fenced block and a JSDoc tag are all nearly free:

| | prose lines |
| --- | --- |
| `@module` header | 6 |
| any other declaration | 8 |
| total lines, whatever the form | 24 |

No rule enforces this — it is a judgement about shape, and a linter that guesses at it costs more
than it catches. Needing more than six lines of prose is the signal to go schematic:

```ts
/**
 * Authentication and the account lifecycle: signup, login, refresh, password reset, logout
 * everywhere, and the two-step account deletion.
 *
 * Owns:        the address book, outright.
 * Shares:      the User document with `users` — the repo's one shared kernel.
 * Reaches far: `POST /account/export`. A data export is inherently cross-cutting.
 */
```

Short lines. One idea per line. Plain language. The "why" before the "how". A table, a list or a
set of labelled rows beats the paragraph that says the same thing — always. Past 24 lines no form
rescues it: that belongs on a page under `docs/`, where it can carry a diagram, with a link left
behind.

Structure earns its keep by being TRUE. Never hand-maintain a labelled row that restates something
already generated and checked elsewhere — an import list, a route table, a coverage number. That is
a published number with no guard behind it, and it goes stale silently.

The rest:

- **One idea per comment.** Mid-sentence "and also"? Split it, or cut the weaker half.
- Never restate what the code, or a well-named identifier, already says.
- A short `//` line inside a function body is fine, and encouraged, wherever a loop, branch or
  operation isn't self-evident from the code alone — same caps, same two questions, just attached
  to the line instead of the declaration.
- Never narrate history — no "this used to...", "previously...", "was renamed from...". A comment
  describes the code as it is now; git log is where the past lives.
- Never link to a `.md` file outside `docs/*` — a root-level plan, audit, or report doc is
  ephemeral; only `docs/` is a stable target. `local/comment-links` refuses it; external URLs are
  exempt.

MUST: every exported function, interface, type and enum carries a docblock — `jsdoc/require-jsdoc`.
An interface says its purpose and what each field means; a function adds `@param`/`@returns`/
`@throws` **as needed**. "As needed" is yours to judge, but a tag you do write is checked:
`jsdoc/check-param-names` refuses a name that is not in the signature, and the `*-description`
rules refuse an empty one.
MUST: docs describing flow, architecture or process include Mermaid diagrams — that detail belongs
there, not in a comment.

Comments are **not** a replacement for `docs/`. They orient a reader already in the file; the
reasoning, the alternatives, the diagrams live in `docs/` — a comment points there, it does not
reproduce it.

## Code layout

Orderly, scannable files. Two rules, always:

- **Every top-level declaration gets a comment**, within the caps above. Top-level means the
  outermost body of the file — and also the outermost body of whatever construct owns most of the
  file (a composable, a store definition, a factory, a class body, a `setup()`). Constants, types,
  helpers, refs, computeds, actions, exported and internal alike: each one carries its own block.
- **One blank line between them.** Every top-level declaration is separated from its neighbours by
  a single empty line — Prettier's formatting has no way to preserve more than one, so this is the
  enforced ceiling, not just the floor — so the comment visually belongs to the thing below it.
  Inside a declaration, blank lines are fine as needed.

```ts
/**
 * Rows currently visible after the active filter.
 */
const visibleRows = computed(() => rows.value.filter(isVisible))

/**
 * Reloads the table, discarding any optimistic edits.
 * @throws {FetchError}
 */
const reload = () => fetchRows().then(applyRows)
```

## Commenting third-party / unowned code

Every call into code you didn't write — a library, a framework, a generated client — gets a
comment, even where it looks obvious today. State, in 1-3 lines:

- what the call does,
- what each non-obvious parameter means (magic numbers, bare booleans, option objects,
  positional args whose meaning only comes from that library's docs — skip the self-evident ones),
- a link to the relevant doc page, when one exists.
- Prefer more comments over fewer. When in doubt, write it.

Link out for anything longer. Don't paraphrase the library's own docs into the comment.

```ts
/**
 * Sharp: resize to a fixed box, letterboxed rather than cropped.
 * https://sharp.pixelplumbing.com/api-resize
 */
sharp(buffer).resize(1200, 630, { fit: 'contain', background: '#00000000' })
```

All of it ADHD-friendly: short lines, one idea per line, plain language, the "why" before the
"how". No paragraphs, no restating the code.

## Asking vs. deciding

**Default to asking.** A short question costs a minute; a large wrong turn costs the afternoon.
When two readings of a request would produce materially different work, ask — do not pick the
likelier one and build it.

- MUST ask before: adding a dependency, changing a contract or a schema, writing a one-off data
  script under `ops/`, touching auth / security / payments / money, deleting anything, or choosing
  between two designs that are genuinely close.
- Ask **early** and **batched** — one message with the open questions, before the code is written,
  not a drip-feed and not a post-mortem.
- Decide alone on the mechanical half: naming, where a helper goes, test placement, formatting,
  and anything the rules above already answer.
- When proceeding without an answer, state the assumption in one line so it is cheap to correct.
- **Exception:** an explicit "be autonomous" / "don't ask" / "just do it". Then run the whole task
  end to end, and put the assumptions, the trade-offs and what *would* have been a question into
  the summary at the end instead.

## Commits

Conventional Commits, enforced by commitlint on the `commit-msg` hook
(`@commitlint/config-conventional`).

- `type(scope): subject` — lowercase, imperative, no trailing full stop. Lengths are commitlint's
  business, not this file's; it will tell you.
- Types: `feat` `fix` `refactor` `perf` `test` `docs` `build` `ci` `chore` `revert`.
- Scope is the module or area it lands in: `feat(antibot):`, `fix(rate-limit):`,
  `refactor(testing):`.
- The subject says what the change **does for the system**, not which files moved —
  `fix(rate-limit): log every refusal, since nothing downstream will`, not `update middleware`.
- One logical change per commit. If the subject needs an "and", it is two commits.
- Breaking change: `!` after the scope plus a `BREAKING CHANGE:` footer — and a `CHANGELOG.md`
  entry whenever a generated client cannot absorb it without being regenerated.
- MUST stage explicit pathspecs. Never `git add -A` or `git add .`: another session may have
  untracked work in this worktree, and it is not yours to commit.
- MUST NOT run research subagents that implement concurrently in the same working tree. A subagent
  investigates and reports; writing code is single-threaded. Two agents that cannot see each
  other's edits, reconciled by hand afterward, is exactly how a merged file ends up with defects
  that pass review and only surface under execution — the failure mode is silent, not a merge
  conflict.
- The pre-commit hook runs `regenerate` plus the full `complete` gate, so allow ~10 minutes. If
  `ts-check`, `lint` and the tests have already passed by hand in this session, `--no-verify`
  rather than paying for the same gate twice.
