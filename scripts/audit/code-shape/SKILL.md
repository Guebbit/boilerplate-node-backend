---
name: code-shape
description: Audit a scope for over-abstraction — shallow functions, pass-throughs, lazy files, speculative generality — and its two neighbours, dead code (knip) and copy-paste (jscpd)
---

ROLE: Design reviewer, not a bug hunter. You ask one question of every candidate: does this piece
of code earn its place, or would the code read better without it?

GOAL: Give every candidate the tools list a verdict a human can act on in one minute — inline,
merge, delete, extract, or keep with a reason.

SCOPE: the argument you were given — a module name (`orders`), a path, or `--diff` for modules
touched by the working tree. If empty, use `git status --porcelain` to pick the scope; if that is
empty too, the whole of `src scripts scenarios`, and say at the top of the report that it is large.

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

Output is `tmp/reports/audit/code-shape/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)
- the whole repo → `all`

## Steps

### 1 — run the counters

The tools count; you judge. Never count call sites or importers yourself — a text search misses
an import alias and a re-export, and a wrong count produces a wrong verdict.

Translate the scope to paths first: a module is `src/modules/<name>`.

```bash
npm run audit:shallow -- <paths>                                          # → tmp/reports/audit/code-shape/shallow.json
npm run -s audit:unused -- --reporter json > tmp/reports/audit/code-shape/knip.json
npm run audit:duplicates                                                  # → tmp/reports/audit/code-shape/jscpd/jscpd-report.json
```

knip and jscpd always scan the whole repo. Keep only the entries whose file falls inside the scope;
for a jscpd clone, keep it when EITHER side does.

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

| Verdict      | Means                                                                   | Used by |
| ------------ | ----------------------------------------------------------------------- | ------- |
| **INLINE**   | Put the body back at its one or two call sites and delete the function. | 1, 2, 4 |
| **MERGE**    | Move the contents into a named sibling file and delete this one.        | 3       |
| **UNEXPORT** | Used, but only inside its own file — drop the `export`.                 | 5       |
| **DELETE**   | Nothing uses it.                                                        | 4, 5    |
| **FIX**      | knip found a real defect: an unlisted dependency, an unresolved import. | 5       |
| **EXTRACT**  | Real duplication: name the shared function and where it goes.           | 6       |
| **KEEP**     | It earns its place. Give the reason code below.                         | all     |

KEEP reason codes — one per row, never "seems fine":

- `domain-name` — the name states a business rule the inlined expression would hide.
- `published` — barrel surface (`published: true`), unused on purpose: `CLAUDE.md` § Module
  barrels. Never INLINE or DELETE one.
- `boundary` — a port, an adapter, or the one wrapper around a third-party call.
- `seam` — a test replaces it (`jest.mock`, an injected dependency) — cite the test.
- `slot` — a self-registering extension point: `register*`, a registry entry.
- `layout` — the module layout asks for the file: `docs/theory/modules.md#what-a-module-contains`.
- `depth` — inlining would push nesting past `max-depth` or the caller past the comment caps.
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

## Output

Write `tmp/reports/audit/code-shape/<SCOPE>.md`:

- At the top, the counts: candidates per reviewer, and verdicts per kind.
- Then one table per reviewer: `| candidate | file:line | verdict | reason |`.
- Then **"Worth doing first"**: at most ten rows, ranked by how much code a reader stops reading.
  A deleted file beats a deleted function beats a dropped `export`.

## Rules

- Do NOT edit source, config or tests. This is a report; the human decides.
- Every row cites a `file:line` taken from the tool output, or — reviewer 4 only — the search that
  found it.
- Never call a function shallow from its name alone. Read its body and its callers.
- A `published: true` candidate is never INLINE or DELETE, whatever else it looks like.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
