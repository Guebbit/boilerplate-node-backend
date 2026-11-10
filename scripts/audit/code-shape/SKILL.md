---
name: code-shape
description: Audit a scope for over-abstraction — shallow functions, pass-throughs, lazy files, speculative generality — and its two neighbours, dead code (knip) and copy-paste (jscpd)
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Design reviewer, not a bug hunter. You ask one question of every candidate: does this piece
of code earn its place, or would the code read better without it?

GOAL: Give every candidate the tools list a verdict a human can act on in one minute — inline,
merge, delete, extract, or keep with a reason.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`: the paths `.jscpd.json` lists. Say at the top of the report that it is large.

## The rules this audit enforces

The same rules `CLAUDE.md` § Function design states in short. A piece of code earns its place by
doing one of these:

- **Hiding real complexity** behind a smaller interface — Ousterhout's _deep module_.
- **Naming a domain rule** — `isRefundable(order)` is a one-liner whose name is the documentation.
- **Being shared** — two or more callers today, not one caller and a hope.
- **Being a boundary** — a port, an adapter, the one place a third-party call is isolated
  (`docs/theory/layers.md`).

Anything else is a candidate. The shapes, with the names the literature gives them:

| Shape                      | What it looks like                                        | Source                                           |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| **Lazy Element**           | a 1–3 line function with one or two callers               | Fowler, _Refactoring_ — fix: _Inline Function_   |
| **Middle Man**             | a function whose body only forwards to another            | Fowler; Ousterhout's _pass-through method_       |
| **Classitis** (file-level) | a file with one or two exports and one or two importers   | Ousterhout, _A Philosophy of Software Design_    |
| **Speculative Generality** | a parameter, option, generic or interface no caller needs | Fowler — fix: _Remove Parameter_, _Inline Class_ |
| **Dead Code**              | an unused file, export, type or dependency                | Fowler — fix: delete it                          |
| **Duplicated Code**        | the same logic pasted twice or more                       | Fowler — fix: _Extract Function_                 |

The first four say "too much structure". The last says "too little". Both directions are judged in
one audit so the report can never tell you to inline a helper and extract the same thing back.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/code-shape/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Steps

### 0 — the previous run (RULES.md rules 4 and 8)

Read the newest older `tmp/reports/audit-*/code-shape/` folder, of any scope. Never move, rename or
write to it. Carry a KEEP only when all four hold:

- (a) that run's header names a sha on a clean tree;
- (b) `git diff <prev-sha> -- scripts/audit/code-shape/ knip.config.ts .jscpd.json` is empty;
- (c) this run's fresh counter row matches the previous one (callers or importers, `published`,
  lines);
- (d) `git diff <prev-sha> -- <candidate file>` is empty.

Everything else is re-judged. Report every previous row under RULES.md rule 8, with its five
statuses. A House ruling overrides a carried verdict: the row is listed as `verdict changed`, why =
`House ruling CS-n`. Condition (b) makes this automatic for any run after a ruling is added.

### 1 — run the counters

The tools count; you judge. Never count call sites or importers yourself — a text search misses
an import alias and a re-export, and a wrong count produces a wrong verdict.

Translate the scope to paths first: a module is `src/modules/<name>`.

```bash
OUT=tmp/reports/audit-<run>/code-shape
npm run audit:shallow -- --out $OUT <paths>                    # → $OUT/shallow.json
npm run -s audit:unused -- --reporter json > $OUT/knip.json
npm run audit:duplicates -- --output $OUT/jscpd                # → $OUT/jscpd/jscpd-report.json
```

knip and jscpd always scan the whole repo. Keep only the entries whose file falls inside the scope;
for a jscpd clone, keep it when EITHER side does. jscpd reports absolute paths: strip the repo root
before matching a clone against the scope.

### 2 — one reviewer per shape, in parallel

Hand each list to its own reviewer: a sub-agent where your tool has them, otherwise one after
another in a fresh pass each. A reviewer reads the code around every candidate it is given, and
nothing else.

| #   | Reviewer               | Its input                                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------ |
| 1   | Lazy Element           | `shallow.json` → `smallAndRare`                                                |
| 2   | Middle Man             | `shallow.json` → `passThroughs`                                                |
| 3   | Classitis              | `shallow.json` → `lazyFiles`                                                   |
| 4   | Speculative Generality | `shallow.json` → `optionalNeverPassed`, plus its own read of the scope (below) |
| 5   | Dead Code              | `knip.json`                                                                    |
| 6   | Duplicated Code        | `jscpd-report.json` — `kind: exact` and `kind: similar` (near-miss) both       |

Reviewer 4 is the only one allowed to find candidates no tool listed, because no tool counts them:
an interface with one implementation, a generic parameter only ever given one type, a config key
nothing sets to anything but its default. Each such row says how it was found — the search and its
count — so the reader can repeat it.

### 3 — the verdicts

| Verdict      | Means                                                                                                                 | Used by |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ------- |
| **INLINE**   | Put the body back at its one or two call sites and delete the function.                                               | 1, 2, 4 |
| **MERGE**    | Move the contents into a named sibling file and delete this one.                                                      | 3       |
| **UNEXPORT** | Used, but only inside its own file — drop the `export`. Runtime values; a type only when nothing exported reaches it. | 5       |
| **DELETE**   | Nothing uses it.                                                                                                      | 4, 5    |
| **FIX**      | knip found a real defect: an unlisted dependency, an unresolved import.                                               | 5       |
| **EXTRACT**  | Real duplication: name the shared function and where it goes.                                                         | 6       |
| **KEEP**     | It earns its place. Give the reason code below.                                                                       | all     |

KEEP reason codes — one per row, never "seems fine":

- `domain-name` — the name states a business rule the inlined expression would hide.
- `published` — barrel surface (`published: true`), unused on purpose: `CLAUDE.md` § Module
  barrels. Never INLINE or DELETE one. Published means reachable from
  `src/modules/<name>/index.ts` through re-exports; any other `index.ts` is an internal barrel and
  its unused re-export is DELETE.
- `shape` — a type an exported declaration reaches (field, parameter, return, base, generic,
  `typeof` member), or a re-exported type in the signature of another re-export that stays. Never
  UNEXPORT one while that holds.
- `boundary` — a port, an adapter, or the one wrapper around a third-party call.
- `seam` — a test replaces it (`jest.mock`, an injected dependency) — cite the test.
- `slot` — a self-registering extension point: `register*`, a registry entry.
- `layout` — the module layout asks for the file: `docs/theory/modules.md#what-a-module-contains`.
- `depth` — inlining would push nesting past `max-depth` or the caller past the comment caps.
- `shared` — two or more references today (same file counts; a name passed to `.then` counts).
- `door` — an exported getter, the one access to private module state: another file or a test
  reads it.
- `lookalike` — (jscpd) two blocks shaped alike by the contract or a test table, not by shared
  logic; changing one would not mean changing the other.
- `false-positive` — (knip) the tool cannot see the use; say what uses it. If it will recur, say so:
  the fix is an entry in `knip.config.ts`, which the human decides on.

### 4 — reconcile

Before writing, read the six result sets together:

- A function marked INLINE that sits inside a jscpd clone: the clone wins — drop the INLINE, the
  shared code is the right shape.
- An EXTRACT whose extracted function would itself be a Lazy Element (three lines or fewer, one
  idea, no domain name): downgrade it to KEEP `lookalike`.
- Two copies: EXTRACT only when they must change together. Three or more: EXTRACT. That is Fowler's
  Rule of Three.

## House rulings

The user's decisions on the shape questions that kept flipping between runs. They override a
carried verdict (step 0) and apply to every reviewer.

| Ruling                  | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Source     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Published               | An export is published when it is reachable from `src/modules/<name>/index.ts` through `export *` or a named re-export, directly or transitively. A named re-export publishes that name only. Published exports are never INLINE, DELETE or UNEXPORT for being unused.                                                                                                                                                                                                                                          | CS-4       |
| Internal barrel         | Every other `index.ts` (a sub-barrel no module barrel re-exports, a port index, an infrastructure facade, `src/types`) is an internal barrel. An unused re-export there is DELETE. KEEP `slot` and KEEP `published` protect the declaration in its own file, never a second re-export.                                                                                                                                                                                                                          | CS-4       |
| Type in a shape         | A type an exported declaration reaches (field, parameter, return, base, generic argument, `typeof` member) keeps its `export`: KEEP `shape`. A re-exported type that another kept re-export of the same barrel reaches is KEEP `shape` too. UNEXPORT is for runtime values.                                                                                                                                                                                                                                     | CS-5       |
| Config getter           | An exported getter, wherever it lives, is KEEP `door`: another file or a test reads it. An unexported getter whose body is only `slice().KEY` (optionally times a unit constant) with one caller is INLINE; its docblock becomes a `//` line on the reading line.                                                                                                                                                                                                                                               | CS-7       |
| Reject factory          | A function returning `ResponseReject` is a Lazy Element like any other. KEEP when it has two or more references (a name passed to `.then` counts), a barrel publishes it, or it computes (takes a parameter, reads more than literals and `t()`). INLINE a no-argument, one-reference one. Never KEEP one as `domain-name`: `ERROR_CODES.X` and the message key already name the refusal. Enumerate with the `(): ResponseReject` grep and count references with `grep -w` across `src/`, minus the definition. | CS-8       |
| A docblock is no reason | A docblock alone never keeps a one-caller wrapper; its why moves to a `//` comment at the call. Keep it only when it is shared (two or more references), published, a seam, computes something, or its name states a rule the inlined code hides.                                                                                                                                                                                                                                                               | CS-7, CS-8 |
| Lookalike               | Two domains that merely look alike stay apart: `camelCaseOf` (lodash is not a dependency; `package.json` lists it only as an override).                                                                                                                                                                                                                                                                                                                                                                         | CS-10      |
| Small shared helper     | A helper of three lines or fewer with one idea and no domain name is KEEP even across three copies: the Lazy Element downgrade in reconcile applies before the Rule of Three (`adapters/pdf.ts`, `adapters/queue.ts`, `kernel/outbox.ts`; `account/services/export.ts` is a different shape). Cite the downgrade, not `lookalike`'s definition: these copies do share logic.                                                                                                                                    | CS-11      |

Also, when the report is written:

- An INLINE whose name is declared in another file is checked as a copy first (EXTRACT, reuse), not
  inlined blind.
- An INLINE that drops a function a test calls directly lists that test, to be re-pointed.

## Output

Write `tmp/reports/audit-<run>/code-shape/<SCOPE>.md`:

- At the top, the counts: candidates per reviewer, and verdicts per kind.
- Then one table per reviewer: `| candidate | file:line | verdict | reason |`.
- Then **"Worth doing first"**: at most ten rows, ranked by how much code a reader stops reading.
  A deleted file beats a deleted function beats a dropped `export`.

## Rules

- Every row cites a `file:line` taken from the tool output, or — reviewer 4 only — the search that
  found it.
- Never call a function shallow from its name alone. Read its body and its callers.
- A `published: true` candidate is never INLINE or DELETE, whatever else it looks like.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
