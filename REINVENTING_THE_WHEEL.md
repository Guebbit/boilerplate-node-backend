# Reinventing the wheel: hand-rolled guards a standard tool already answers

Companion to `OVERENGINEERED.md`. That document asks whether a guard is worth having at all. This
one asks a narrower question about the guards that survive it:

> **Is this hand-written check answering a question a tool we already run answers better?**

"Better" is not a matter of taste here. A standard tool wins when it answers a _stronger_ question
than the hand-rolled version — transitively rather than directly, across the whole tree rather than
one module, at the offending line rather than as a diff of two sets. Where the tool answers a
_weaker_ question, or a different one, the hand-rolled version stays. Both cases are below, with
the evidence.

The related audit for utility functions — do we hand-roll things `lodash` does — is `LODASH.md`.
Same question, different layer.

---

## The tools already in play, and what each is for

| Tool                               | In `complete`?             | The question it answers                                                                 |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `tsc`                              | yes                        | Does this type-check? Does deleting a module break its importers?                       |
| `eslint-plugin-boundaries`         | yes (`lint`)               | May this file import that file? Reported in the editor, while writing.                  |
| `eslint/rules/*` (3 project-local) | yes (`lint`)               | Syntactic properties of one file's AST that no built-in rule expresses.                 |
| `dependency-cruiser`               | yes (`check:dependencies`) | Questions about the whole graph: reachability, cycles, and which folder may name which. |
| `jest`                             | yes (`test`)               | Behaviour, and properties of the source that are not import-shaped.                     |
| VitePress `docs:build`             | **no**                     | Dead links between documentation pages.                                                 |

The division between the middle two is stated in `.dependency-cruiser.cjs`'s own header and is
worth repeating, because it is the line most of the decisions below turn on:

- **ESLint sees one file's imports.** That makes it the right home for a wall, because it reports
  in the editor at the offending import, while the code is being written.
- **dependency-cruiser sees the graph.** That makes it the only thing that can answer _reachability_
  ("may this file REACH mongoose, through anything at all") and _cycles_, neither of which any
  per-file rule can see.

Two tools enforcing one property is one tool too many — they drift, and the second failure is
always the confusing one.

---

## Resolved: handed to the standard tool

### 1. `unit-layer-is-framework-free.test.ts` (58 lines) → `unit-layer-stays-database-free`

**What it did:** read every file under `tests/unit/` and `src/modules/*/tests/unit/` and text-matched
three strings — `setupTestDb`, `mongodb-memory-server`, `@tests/database`.

**Why the tool is stronger:** the rule is stated as reachability, so it catches the way the
violation actually arrives. Proven by probe — a unit test importing a helper that imports the
database, naming none of the three strings:

```
tests/unit/__probe/indirect.test.ts   →  import { boot } from './helper';
tests/unit/__probe/helper.ts          →  import { setupTestDb } from '@tests/database';
```

```
the text-scan test:   Tests: 2 passed, 2 total          ← missed it
dep-cruiser:          error unit-layer-stays-database-free:
                        tests/unit/__probe/indirect.test.ts → tests/support/database.ts
                        tests/unit/__probe/helper.ts        → tests/support/database.ts
```

This is exactly the failure mode the config's header predicts: _"nobody adds `import mongoose` to a
domain file, they add a helper that already had it."_

**Cost:** `check:dependencies` now cruises `src tests` rather than `src`, so the rule has the test
tree in scope.

### 2. `auth-surface.test.ts`'s second `describe` (~30 lines) → `module-internals-are-private`

**What it did:** swept every `.ts` under `src/` for a file outside `src/modules/account/` importing
past that module's barrel — for that one module, by regex.

**The near-miss worth recording.** This looked like a straight duplicate of
`eslint-plugin-boundaries` and I nearly deleted it as one. It is not. Probing a _module_ reaching a
sibling's internals gives the expected refusal:

```
src/modules/feedback/__probe.ts
  1:35  error  Import a sibling module through one of its two public paths […]  boundaries/dependencies
```

Probing `src/app/` — a tier that is not a module — reaching the same file:

```
$ npx eslint src/app/__probe.ts
exit=0
```

`eslint-plugin-boundaries` refuses a _module_ reaching a sibling's internals and is silent about
every tier that is not a module. The test was covering a real gap, for one module out of thirteen,
while justifying itself in its docblock by naming four directories — `src/middlewares/`,
`src/bootstrap/`, `src/jobs/`, `src/workers/` — that no longer exist.

So it was **promoted, not deleted**: the rule now covers all thirteen modules from every non-module
tier. The first `describe` stays in the test, because barrel _identity_ (`account[name]` is the same
object `./services/addresses` exports) is a runtime question no graph tool asks.

### 3. `dependsOn` + `context-map.test.ts` (217 lines) → `MODULE_EDGES`

**What it did:** a typed `{ module, as, because }` array on each manifest, reconciled against real
imports by a cross-cutting test, plus checks that `as` was one of four words and `because` ended in
a sentence.

**What survived the cut:** exactly one of its four properties had teeth — _an import crossing a
boundary that no edge declares_. Nothing else in the repo saw that; `eslint-plugin-boundaries` lets
any module import any sibling's barrel. `MODULE_EDGES` in `.dependency-cruiser.cjs` is a map of
thirteen entries generating thirteen rules. Verified both directions: passes on the tree as it
stands, and refuses an injected `feedback → products` at the import.

**What did NOT survive, and could not have:** the prose. `context-map.test.ts`'s first assertion was
_"no declared edge that nothing imports"_ — so a coupling that exists only through a shared
document, a metric name or a migration **could not be declared without failing the suite**. The
field could only ever record couplings already visible as imports: the ones you least need telling
about. That half is now prose in each `module.ts` docblock, under a `── Position ──` block, where
it has no such restriction. See `docs/modules/index.md` → _Not every coupling is an arrow_.

### 4. Historical: two cross-cutting tests → `eslint/rules/` (before this audit)

Recorded because it is the pattern the three above follow, and the repo got there first.
`controller-chain-must-catch` and `no-hardcoded-user-text` used to be tests: one grepped every
controller for the string `.catch(`, the other carried a 60-line hand-written tokenizer tracking
quote state, escape characters and paren depth to read one argument of one call. Both are lint rules
now — parsed AST for free, reported at the line, visible while writing. The tokenizer's failure
modes (a paren inside a template literal, a comment containing `.catch(`) simply stopped existing.

---

## Identified, not taken — and why

**Dead-code tooling for unused exports (`knip`, `ts-prune`).** This is what
`published-language.test.ts` (124 lines) and `published-repositories.test.ts` (245) were reaching
for, and a real tool would do it over the whole tree rather than thirteen `index.ts` files. Trialled
and **rejected**: an unconfigured run reports 44 unused exports, 87 unused exported types, 25 unused
files, 11 unused devDependencies and 12 unlisted dependencies — and most of the "unused files" are
the migrations and the probes, which are loaded dynamically or by path string. That is roughly 130
findings needing a config file and a triage pass before any of it is trustworthy, to police
something that is dead weight rather than a defect. The two tests were deleted outright; adding a
dependency is not owed as compensation for a deletion.

**dependency-cruiser's `orphan` rule.** Tested; **unreliable in this repo specifically**, for a
reason rooted in a deliberate config choice. `tsPreCompilationDeps` is off — correctly, because with
it on the cycle rule reports eight phantom type-only cycles — so a module reached only by
`import type` looks orphaned. `src/types/auth-context.ts` is flagged despite being re-exported by
`types/index.ts` and used by `globals.d.ts`. Turning it on to fix orphans breaks the cycle rule.
A real trade-off, not a free win.

It did surface one true orphan: the generated `analytics-events.frontend.ts`, consumed by _path
string_ and never imported — an instance of the very coupling class the warning box in
`docs/modules/index.md` describes. That file has since been deleted along with the catalogue it
published; the finding stands as the reason to look, not as a live one.

**dependency-cruiser's `required` rules.** The inverse of `forbidden`: every file matching X must
depend on something matching Y. Considered and declined, with the reasoning left in the config header
so the next reader knows the feature exists. Every candidate turned out to be a shape a reader can
see in one file, enforced by a tool that has to load the whole graph to say so.

**dependency-cruiser as the source of the module diagram.** `--output-type mermaid` with
`--exclude '/tests/' --collapse '^src/modules/[^/]+'` reproduces the graph in
`docs/modules/index.md` **exactly** — same 19 edges, verified programmatically. Worth doing if that
diagram ever drifts. Caveat: without excluding tests it reports 38 edges, because co-located specs
legitimately reach siblings, so the raw output is not the architecture.

**VitePress `docs:build` as a link checker.** It already is one — it caught a dead link I introduced
while writing that same page (`Found dead link ./../tools/events`) and failed the build. This is the
salvageable third of `docs-match-the-tree.test.ts` (297 lines), for free. **It is not in
`npm run complete` and not in CI**, which is the gap worth closing — one line, and the check exists
already.

**Context Mapper (`.cml`).** The standard DDD tool for a typed context map with exactly the four
relationship kinds this repo names. It is a separate modelling artifact rather than a field on
runtime code, which is the shape that would have avoided `dependsOn`'s problem. Not adopted — the
taxonomy lives as a table in `docs/theory/strategic-ddd.md` §2 and as prose per module — but it is
the thing to reach for if the map ever needs to be machine-readable again.

---

## Deliberately hand-rolled, and right to be

Not everything hand-written is a wheel. These were checked against the tools and stay:

**`eslint/rules/no-persistence-imports.ts`.** `no-restricted-imports` sees only the module
specifier, and dependency-cruiser sees only module-level edges. Neither can see that
`import { userRepository } from '@modules/users'` reached a repository, because the specifier is
innocent and only the _imported binding_ gives it away. Reading the named import is what the rule is
for.

**The content tests** — `metric-names`, `mail-copy`, `outbox-names`, `locale-parity`,
`locale-namespaces`, `credential-fields`, `seed-conformance`, the `contract-*` family. None of these
is a graph question. A metric name that three places agree on, an EJS variable a builder must
supply, a password hash that must not survive serialization: no dependency tool models any of them,
and each guards a failure that is silent.

**`buildMessageTree` and its collision guards** (`locales/services/keys.ts`). Flagged in `LODASH.md`
as superficially `_.set`-shaped, and explicitly marked **never replace**: the prototype-pollution
defence (`Object.create(null)`, rejected `__proto__`/`constructor`/`prototype` segments) and the
throw-on-collision behaviour are the entire point. `_.set` is a known prototype-pollution vector and
silently overwrites on conflict.

---

## The test to apply to the next guard

Before writing a check that reads the source tree, in this order:

1. **Would `tsc` already fail?** Deleting something another file imports is a compile error. Do not
   write a test for it.
2. **Is it "may this file import that file"?** → `eslint.config.ts`. Editor feedback beats CI
   feedback, and the plugin already has the element model.
3. **Does answering it need more than one file — reachability, a cycle, or which folder may name
   which?** → `.dependency-cruiser.cjs`. This is the boundary: if the honest form of the rule is
   "may this REACH that", ESLint structurally cannot answer it and a text sweep will miss the
   indirect case, as §1 above demonstrates.
4. **Is a standard tool for it already installed, or one line away?** The VitePress link check and
   `depcruise --output-type mermaid` both were. Weigh what a NEW dependency costs in findings you
   then have to triage — see the dead-code entry above for one that did not clear that bar.
5. **Only then, a test** — and only if the failure it catches is silent. `OVERENGINEERED.md` is the
   standard it has to clear.

And the check that applies to all five: if the hand-rolled version answers a _weaker_ question than
the tool — one module instead of thirteen, direct instead of transitive, a string match instead of a
resolved edge — that is not a reason to keep it alongside. It is the reason to replace it.
