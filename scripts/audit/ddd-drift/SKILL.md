---
name: ddd-drift
description: Audit whether the DDD the docs describe still matches the code — who drives whose state, named questions vs read tables, domain placement, subdomain depth, stale counts
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Context-map reviewer. Lint already holds the walls between modules. You judge what lint
cannot see: who drives whose state, where a rule lives, and whether the pages still describe the code.

GOAL: Find where the code and the DDD pages have drifted apart, and say which side is wrong. This
audit only reports. It never edits code, tests or documentation.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`. Drift is relational and is rarely introduced by the change that reveals it,
so `--diff` is a starting point, not a boundary: widen it as the steps below say, and say so in the report.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/ddd-drift/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

Copy the "What this audit is not" list into the report header.

## What this audit is not

Already machine-enforced, so skip it: a barrel bypass, an undeclared module edge, purity inside
`domain/`, what a barrel may export, a call to a non-friend member, a published `@internal` step,
the group walls, persistence imports, the one-layer rule for side effects, module descriptors,
contract refs that follow `dependsOn`, circular imports and the generated docs graph. The rules
behind them are in `eslint.config.ts`, `.dependency-cruiser.cjs` and `tests/cross-cutting/`.

Two neighbours own a question. Note the finding in one line and route it:

| Question                                           | Owner                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| a pass-through, a one-caller helper, a dead export | `/audit-code-shape` (D4 reports only the placement) |
| a guarded step that is not tagged `@internal`      | `/audit-reachability`                               |

Never propose a check, a test, a marker or a generator. Never propose relabelling a module or
adopting another tactical pattern. The house rule is a judgement the reader can still disagree
with, and a hand-kept fix is the whole point.

## The drift classes

Severity: **HIGH** a state, money or stock owner can be bypassed · **MED** a rule is known outside
its owner, or a doc contradicts the code · **LOW** placement or wording.

| #   | Class                               | It is drift when…                                                                                                                                                                                      | It is fine when…                                                                                                                                                                                 | Severity                                            |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| D1  | Doc claims vs code                  | a count, list, example or "only X" disagrees with disk; a `module.yaml` `# why` undersells an edge                                                                                                     | the wording is "for example", or it links to the generated map                                                                                                                                   | LOW; MED if a doc rule contradicts the code         |
| D2  | A sibling reads the table           | it imports the owner's transition table, or compares the owner's status literals to decide                                                                                                             | it reacts to a published event's `to`; it only displays; it is a single terminal-state guard                                                                                                     | MED                                                 |
| D3  | Driving through a third             | module A calls C's write on state that B owns, while B has (or should have) the door                                                                                                                   | the call goes through B's door                                                                                                                                                                   | HIGH                                                |
| D4  | Fake or misplaced domain            | a `domain.ts` _file_ (every domain guard keys on the `domain/` _folder_), or a domain file holding no rule                                                                                             | —                                                                                                                                                                                                | MED                                                 |
| D5  | Pure rule outside `domain/`         | an import-pure file with two or more callers, or a trap, sits in `session/`, `services/`…                                                                                                              | it is a config constant, an event/audit/analytics catalogue, a port, or a third-party wrapper                                                                                                    | LOW                                                 |
| D6  | Label vs depth                      | a subdomain label disagrees with the logic's complexity, or two theory pages disagree on what a label implies                                                                                          | —                                                                                                                                                                                                | MED if two pages contradict; LOW per label          |
| D7  | Shared-kernel or friend growth      | a friend file with no why in its header; a second shared-kernel edge; a one-caller write door left unrestricted                                                                                        | the friend file's header says why that module is the friend; a shared-kernel edge is argued in `docs/understand/strategic-ddd.md` §5                                                             | MED                                                 |
| D8  | Anemic or bloated services          | a branch that clears the `docs/understand/domain-layer.md` floor sits inline in a service, worst when it is copied                                                                                     | it is a transaction, a side-effect order, or a one-off with no trap                                                                                                                              | MED if copied; LOW otherwise                        |
| C1  | A client control with no capability | a write door refuses on a state or role rule (a 409 or 403 code) for a control a client offers, and the resource's `*Actions` has no flag for it; or the flag and the door compute the rule separately | the refusal is a race (a lost conditional write), or is about the caller's account, not the resource (a purchase hold, the open-order limit), or the flag exists and shares the door's predicate | MED; HIGH if the flag and the door already disagree |

C1 mirrors the frontend audit's F2 (`../boilerplate-vue-frontend/scripts/audit/ddd-drift/SKILL.md`):
one rule seen from each side. An FE ROUTE is the input to this class; the claim is
`docs/understand/tactical-ddd.md` §2 ("the server sends the answer", "one function, three doors").

D6 is judged against the standard in `docs/understand/strategic-ddd.md` §4: the label sets how much
modelling a module earns, the complexity of its logic picks the pattern, and a pure rule goes in
`domain/` whatever the label. If that page and `domain-layer.md` disagree, that is itself a D6 finding.

## Steps

### 1 — claims first, with the code closed

Read `docs/understand/{strategic-ddd,tactical-ddd,domain-layer,modules,module-lifecycle}.md`, the
in-scope `docs/modules/<module>.md`, the `module.ts` docblocks and the `module.yaml` comments.
**A `whole-repo` run.** The module pages do not fit one reader. Before you read a page, name the
slices at the top of `whole-repo.claims.md`: clusters of related modules (sub-pages go with their
module; `docs/modules/start.md` is read with the theory pages), sized so one reader finishes a slice
in one sitting. Read the theory pages once, yourself.

- Pass 1, per slice: a fresh read-only helper reads that slice's `docs/modules/*.md`, `module.ts`
  docblocks and `module.yaml` comments with the code closed, and returns claim rows. Take only claims
  a drift class can judge: who owns or writes what, who calls whose door, `dependsOn` edges,
  lifecycle states and edges, friend members, what sits in `domain/`, and any count, list, "only" or
  "never" about those. Skip routes, fields, configuration, libraries and permissions: other audits
  own them. Write each reply word for word under the slice's heading; a section is frozen once
  written. Helpers write nothing.
- Checking the claims (`code says | match`) may also go to one helper per slice; write its rows word
  for word into the report's claims table. The D2–D8 and C1 searches stay whole-repo.
- Solo (no helpers): write every slice's claims before step 2 opens any code. A slice you cannot
  read stays unread: name it in the header; the run is PARTIAL. A page first opened after code,
  because a candidate led there, is read for that candidate only; its rows go under a closing
  `## Read after code` heading, never into a frozen slice.

Write one row per checkable claim: a count, a list, an example, an "only", a "never" — and turn `tactical-ddd.md` §2 into one claim row per `*Actions` schema, plus one per resource whose 409 doors have no schema. Freeze the
table before you open any code, so the code cannot talk you into the doc's version.

### 2 — candidates from searches, not from memory

```bash
# D1 — counts and "only" claims in prose
rg -n "\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|[0-9]+) (modules|callers|reasons|states|edges|functions|places|transitions|counters|events|members|doors|moves)\b|\bthe only\b|\bthe one\b|\bonly \`" docs/understand docs/modules src/modules/*/module.ts .dependency-cruiser.cjs scripts/docs

# D2 — owners that publish a transition table, then who outside them reads it
rg -ln "_EVENTS|_STATUSES|_FROM\b|canTransition|defineLifecycle" src/modules/*/domain
rg -n "<TABLE>|<Status>\.\w+" src/modules --glob '!src/modules/<owner>/**' --glob '!**/tests/**'

# D3 — per dependsOn edge, which sibling writes are called
rg -n "<sibling>Service\.\w+\(" src/modules/<module>

# D4 and D5 — domain files, and import-pure files outside domain/
rg --files -g 'domain.ts' src/modules
rg -n "pure" src/modules/*/services     # judge each hit: a pure function inside an impure file

# D6 and D8 — a ranking only, never a finding by itself
rg -n "^subdomain:" src/modules/*/module.yaml
rg --files src/modules -g '**/services/**' -g '**/domain/**' -g '!**/tests/**' | xargs wc -l

# C1 — doors that refuse on state, against the *Actions schemas
rg -n "^\s+\w+Actions:" src/modules/*/openapi.yaml shared/contracts/*.yaml
rg -n "409|_NOT_[A-Z]+|_IN_PROGRESS|forced" src/modules/*/openapi.yaml

# D7 — read every friend file: src/modules/*/friends/*.ts
rg --files src/modules -g '**/friends/*.ts'
```

For D5, an import-pure file is one that imports only `@types`, `@domain-primitives`, `../domain`,
and `import type … from '@api/*'`.
Skip events, audit, analytics, config and token-type files.

For D7, read each friend file: it is fine when its header says why that module is the friend.
Flag a friend file with no why; a function in a friend file its friend never calls; an account-only
function (no checks, trusts the caller) left in the published object; an `account` production file
importing `userService` (lint should refuse it).

For D3, take the owner's own sentence ("only `orders` writes the hold") as the claim and check every
sibling that touches that state against it, including the documented exceptions.

### 3 — judge each candidate against the rule page

Cite the governing sentence by `file:line`. A sentence in a doc that argues for the shape makes it
**DELIBERATE** — quote it. A candidate you could not trace to both sides is **NOT-TRACED**: say what
you could not follow.

### 4 — name the wrong side

For every drift say whether the **code**, the **doc**, or **both** is wrong. A doc that the code
correctly outgrew is a doc fix, not a code fix. The smallest fix is prose, never code.

## Self-check

A `whole-repo` run on commit `20ac75dd5` reports at least: C1 Product restore / hardDelete (as drift or
DELIBERATE, per §2), D2 `delivery/services/progress.ts` `settleOrder`, D8 the reopen branch written
twice (`lost.ts`, `reship.ts`), D1 `docs/understand/modules.md` payments → inventory. Calibrate by running
on that commit (a worktree), not on main: later commits fix these. If a run finds none of them, it
was too loose.

## Output

`tmp/reports/audit-<run>/ddd-drift/<SCOPE>.md`, in this order:

- **Claims table** — `| claim (file:line) | code says (file:line) | match |`. Keep the rows that are
  false-positive controls (a search hit judged fine): they show the search was honest.
- **Findings** — `| class | where | rule broken (doc file:line) | drift / DELIBERATE / NOT-TRACED | wrong side | severity | smallest fix |`
- HIGH first, then one line of totals: claims checked, drift, DELIBERATE, NOT-TRACED. At `whole-repo`
  it names the slices read and unread, and says page claims outside the DDD kinds were not taken.
  `whole-repo.claims.md` holds the frozen claims of a `whole-repo` run.

Then print the HIGH and MED rows to the terminal. A low drift-to-candidate ratio is good news, and
worth saying.

## Rules

- **Report only.** Write nothing but the report under `tmp/reports/audit-<run>/ddd-drift/`. Do NOT edit
  source, tests, documentation, contracts or config. Do NOT commit, and never `git stash` — it
  takes every peer's uncommitted work with it.
- Every row cites the code and the doc, each by `file:line`. A row with one side missing is not a finding.
- DELIBERATE needs the sentence that argues for the shape. Without one, it is drift.
- Prefer three real drifts over thirty maybes. A report full of guesses trains its reader to skip it.
- The generated regions of `docs/modules/*.md` (between the `module-graph:*` and `module-list` markers)
  are rewritten by `npm run regenerate`. Judge them, but name the source of a wrong one, not the region.
- `tmp/reports/` is gitignored. The report is working evidence, not a deliverable — its conclusions
  belong in a fixed doc, a commit message or a tracked issue.
