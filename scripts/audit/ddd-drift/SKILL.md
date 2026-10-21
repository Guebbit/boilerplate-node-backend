---
name: ddd-drift
description: Audit whether the DDD the docs describe still matches the code — who drives whose state, named questions vs read tables, domain placement, subdomain depth, stale counts
---

ROLE: Context-map reviewer. Lint already holds the walls between modules. You judge what lint
cannot see: who drives whose state, where a rule lives, and whether the pages still describe the code.

GOAL: Find where the code and the DDD pages have drifted apart, and say which side is wrong. This
audit only reports. It never edits code, tests or documentation.

SCOPE: the argument you were given — a module name (`orders`), a path, or `--diff` for the branch's
changes. If empty, the scope is the whole repo (`all`). Drift is relational and is rarely introduced
by the change that reveals it, so `--diff` is a starting point, not a boundary.

## Naming the scope

Output is `tmp/reports/audit/ddd-drift/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)
- empty → `all`

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

| #   | Class                          | It is drift when…                                                                                               | It is fine when…                                                                              | Severity                                    |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| D1  | Doc claims vs code             | a count, list, example or "only X" disagrees with disk; a `module.yaml` `# why` undersells an edge              | the wording is "for example", or it links to the generated map                                | LOW; MED if a doc rule contradicts the code |
| D2  | A sibling reads the table      | it imports the owner's transition table, or compares the owner's status literals to decide                      | it reacts to a published event's `to`; it only displays; it is a single terminal-state guard  | MED                                         |
| D3  | Driving through a third        | module A calls C's write on state that B owns, while B has (or should have) the door                            | the call goes through B's door                                                                | HIGH                                        |
| D4  | Fake or misplaced domain       | a `domain.ts` _file_ (every domain guard keys on the `domain/` _folder_), or a domain file holding no rule      | —                                                                                             | MED                                         |
| D5  | Pure rule outside `domain/`    | an import-pure file with two or more callers, or a trap, sits in `session/`, `services/`…                       | it is a config constant, an event/audit/analytics catalogue, a port, or a third-party wrapper | LOW                                         |
| D6  | Label vs depth                 | a subdomain label disagrees with the logic's complexity, or two theory pages disagree on what a label implies   | —                                                                                             | MED if two pages contradict; LOW per label  |
| D7  | Shared-kernel or friend growth | friend members added without a doc line; a second shared-kernel edge; a one-caller write door left unrestricted | it is listed and argued in `docs/theory/strategic-ddd.md` §5                                  | MED                                         |
| D8  | Anemic or bloated services     | a branch that clears the `docs/theory/domain-layer.md` floor sits inline in a service, worst when it is copied  | it is a transaction, a side-effect order, or a one-off with no trap                           | MED if copied; LOW otherwise                |

D6 is judged against the standard in `docs/theory/strategic-ddd.md` §4: the label sets how much
modelling a module earns, the complexity of its logic picks the pattern, and a pure rule goes in
`domain/` whatever the label. If that page and `domain-layer.md` disagree, that is itself a D6 finding.

## Steps

### 1 — claims first, with the code closed

Read `docs/theory/{strategic-ddd,tactical-ddd,domain-layer,modules,module-lifecycle}.md`, the
in-scope `docs/modules/<module>.md`, the `module.ts` docblocks and the `module.yaml` comments.
Write one row per checkable claim: a count, a list, an example, an "only", a "never". Freeze the
table before you open any code, so the code cannot talk you into the doc's version.

### 2 — candidates from searches, not from memory

```bash
# D1 — counts and "only" claims in prose
rg -n "\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|[0-9]+) (modules|callers|reasons|states|edges|functions)\b|\bthe only\b|\bonly \`" docs/theory docs/modules src/modules/*/module.ts .dependency-cruiser.cjs scripts/docs

# D2 — owners that publish a transition table, then who outside them reads it
rg -ln "_EVENTS|canTransition" src/modules/*/domain
rg -n "<TABLE>|<Status>\.\w+" src/modules --glob '!src/modules/<owner>/**' --glob '!**/tests/**'

# D3 — per dependsOn edge, which sibling writes are called
rg -n "<sibling>Service\.\w+\(" src/modules/<module>

# D4 and D5 — domain files, and import-pure files outside domain/
rg --files -g 'domain.ts' src/modules

# D6 and D8 — a ranking only, never a finding by itself
rg -n "^subdomain:" src/modules/*/module.yaml
wc -l src/modules/*/services/*.ts src/modules/*/domain/*.ts

# D7 — friend lists as they grew, and each users barrel door against its callers
git log -p -- eslint.config.ts | rg -n "members:|friends:"
```

For D5, an import-pure file is one that imports only `@types`, `@domain-primitives` and `../domain`.
Skip events, audit, analytics, config and token-type files.

For D3, take the owner's own sentence ("only `orders` writes the hold") as the claim and check every
sibling that touches that state against it, including the documented exceptions.

### 3 — judge each candidate against the rule page

Cite the governing sentence by `file:line`. A sentence in a doc that argues for the shape makes it
**DELIBERATE** — quote it. A candidate you could not trace to both sides is **NOT-TRACED**: say what
you could not follow.

### 4 — name the wrong side

For every drift say whether the **code**, the **doc**, or **both** is wrong. A doc that the code
correctly outgrew is a doc fix, not a code fix. The smallest fix is prose, never code.

## Output

`tmp/reports/audit/ddd-drift/<SCOPE>.md`, in this order:

- **Claims table** — `| claim (file:line) | code says (file:line) | match |`
- **Findings** — `| class | where | rule broken (doc file:line) | drift / DELIBERATE / NOT-TRACED | wrong side | severity | smallest fix |`
- HIGH first, then one line of totals: claims checked, drift, DELIBERATE, NOT-TRACED.

Then print the HIGH and MED rows to the terminal. A low drift-to-candidate ratio is good news, and
worth saying.

## Rules

- **Report only.** Write nothing but the report under `tmp/reports/audit/ddd-drift/`. Do NOT edit
  source, tests, documentation, contracts or config. Do NOT commit, and never `git stash` — it
  takes every peer's uncommitted work with it.
- Every row cites the code and the doc, each by `file:line`. A row with one side missing is not a finding.
- DELIBERATE needs the sentence that argues for the shape. Without one, it is drift.
- Prefer three real drifts over thirty maybes. A report full of guesses trains its reader to skip it.
- The generated regions of `docs/modules/*.md` (between the `module-graph:*` and `module-list` markers)
  are rewritten by `npm run regenerate`. Judge them, but name the source of a wrong one, not the region.
- `tmp/reports/` is gitignored. The report is working evidence, not a deliverable — its conclusions
  belong in a fixed doc, a commit message or a tracked issue.
