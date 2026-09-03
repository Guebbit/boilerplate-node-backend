
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
`seed:export`. Prefer it over the individual scripts. The pre-commit hook runs it with `--no-sync`,
so `npm run complete` only ever verifies — but a contract change is not finished until
`sync:frontend` has actually run against the frontend checkout.

See: `docs/api/contract-fragmentation.md`, `docs/api/regenerating.md`

## TypeScript

- MUST use `strict: true` in all TypeScript code.
- MUST NOT use `any` — use `unknown` plus type narrowing.
- MUST use ESM imports only (`import`/`export`); no CommonJS (`require`, `module.exports`).

## Function design

- MUST apply SOLID principles.
- MUST keep functions focused — one responsibility each.
- MUST keep nesting ≤ 3 levels; extract a helper for anything deeper.
- MUST prefer pure functions and shared abstractions over duplicated inline logic.

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

## Comments

Every comment answers up to two questions, in this order, and nothing else:

1. **What does this do** — only if the name doesn't already say it.
2. **Why is it shaped this way** — the one non-obvious reason, or its place in the larger flow.

Hard caps. "Keep it short" wasn't specific enough, so:

- `@module` header: **3-6 lines, one paragraph.** No named sections, no code samples, no
  case-by-case walkthroughs.
- A declaration's comment: **1-4 lines.** Up to 8 only for something genuinely load-bearing
  (a money, security, or concurrency invariant). Longer than that belongs in `docs/` — link to it,
  don't inline it.
- **One idea per comment.** Mid-sentence "and also"? Split it, or cut the weaker half.
- Never restate what the code, or a well-named identifier, already says.
- A short `//` line inside a function body is fine, and encouraged, wherever a loop, branch or
  operation isn't self-evident from the code alone — same caps, same two questions, just attached
  to the line instead of the declaration.
- Never narrate history — no "this used to...", "previously...", "was renamed from...". A comment
  describes the code as it is now; git log is where the past lives.
- Never link to a `.md` file outside `docs/*` — a root-level plan, audit, or report doc is
  ephemeral; only `docs/` is a stable target for a comment to point at.

MUST: every exported function gets `@param`/`@returns`/`@throws` as needed, within the cap above.
MUST: every exported interface/type states its purpose and what each field means, within the cap.
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
