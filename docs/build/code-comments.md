---
type: reference
audience: [developer]
---

# Code comments

The rules for every comment in this repository, and for the docblocks the linter checks. Short
lines, one idea per line, the "why" before the "how". `CLAUDE.md` imports this page, so an AI
editor reads the same rules a developer does.

## The form, at a glance

| Rule                     | What it says                                                                                                                                                                                                           | Enforced by                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Which comments are JSDoc | Every function's comment, whatever its size, and every comment longer than one line. A one-line `//` inside a body stays a `//`. Declarations (top-level, class members, object members, options bags) get a docblock. | `jsdoc/require-jsdoc` on every top-level declaration; the rest is the comments audit |
| Tags                     | As needed: write a tag when it says what the type cannot (a unit, a range, what `undefined` means, a side effect, what it throws). `@param id the id` is noise.                                                        | `jsdoc/check-param-names`, `check-tag-names`, `require-throws`, `informative-docs`   |
| Link to a page           | `@see docs/<page>.md#<anchor>`, one tag per target, after the prose and before the other block tags. Never the prose `See:` in a JS/TS comment (`.env-example` and YAML keep `# See:`).                                | `check-references` sweeps the target and its anchor, and refuses a `@see` with none  |
| A page owns the topic    | Link it, do not retell it.                                                                                                                                                                                             | The comments audit (a report-only skill)                                             |

## Prose budget and shape

Every comment answers up to two questions, in this order, and nothing else:

1. **What does this do** — only if the name doesn't already say it.
2. **Why is it shaped this way** — the one non-obvious reason, or its place in the larger flow.

**The budget is prose, and structure is nearly free.** This is the whole rule, and it is not about
brevity — a comment that needs more room is allowed it. What is capped is the FORM that room takes.
A seventh consecutive sentence is where a reader loses the thread; a seventh labelled row is still
scannable. So running out of budget means **change form**, never delete the content.

Count the PROSE only. A list item, a `Label:` row and its indented continuations, a table rule, a
fenced block and a JSDoc tag are all nearly free:

|                                | prose lines |
| ------------------------------ | ----------- |
| `@module` header               | 6           |
| any other declaration          | 8           |
| total lines, whatever the form | 24          |

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
- Never reference an untracked `.md` file, by link OR by name — a plan, audit or report doc under
  `.work/` is gitignored and deleted when its change lands, so a comment naming one is dangling
  for everyone but its author. Stable targets: `docs/*` and the tracked root `CLAUDE.md`, `README.md`,
  `SECURITY.md` and `INSTALL.md`. Nothing enforces this beyond `.gitignore`: `local/comment-links` checks `.ts`
  references only.

MUST: every top-level declaration (a function, class, variable, interface, type, enum, and a class's
members) carries a docblock — `jsdoc/require-jsdoc`, in every linted file, tests and scripts
included. `jsdoc/informative-docs` refuses a description that only repeats the name it describes.
An interface says its purpose and what each field means; a function adds `@param`/`@returns`/
`@throws` **as needed**. "As needed" is yours to judge, but a tag you do write is checked:
`jsdoc/check-param-names` refuses a name that is not in the signature, and the `*-description`
rules refuse an empty one.
MUST: docs describing flow, architecture or process include Mermaid diagrams — that detail belongs
there, not in a comment. How a docs page is shaped: `docs/build/documentation-style.md`.

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

The blank line is linted (`@stylistic/padding-line-between-statements`, `jest/padding-around-*`):
the linter checks the file's top level and class bodies; factory bodies and `setup()` are left to
review.

```ts
/**
 * Rows currently visible after the active filter.
 */
const visibleRows = computed(() => rows.value.filter(isVisible));

/**
 * Reloads the table, discarding any optimistic edits.
 * @throws {FetchError}
 */
const reload = () => fetchRows().then(applyRows);
```

## Nesting depth

Nesting stays at three levels in production code (four in a spec, where walking a table
exhaustively is the clearest form). A helper takes anything deeper.

- `local/max-depth-through-closures` counts the levels `if`, loops, `switch` and `try` open. A
  callback does not restart the count, so a `.then` chain cannot hide a fourth level.
- A function declaration, a class member and an object-literal method start again at zero.
- `max-nested-callbacks` caps callbacks at four in production code; specs have no cap. Chain, or
  name the step.

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
sharp(buffer).resize(1200, 630, { fit: 'contain', background: '#00000000' });
```

All of it ADHD-friendly: short lines, one idea per line, plain language, the "why" before the
"how". No paragraphs, no restating the code.
