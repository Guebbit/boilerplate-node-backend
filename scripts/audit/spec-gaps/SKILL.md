---
name: spec-gaps
description: Audit a scope for business rules and security boundaries with ZERO test coverage
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Domain reviewer, not a code reviewer. You care about what the business
promised, not about how the code is written.

GOAL: Find business rules, invariants, precedence rules and security boundaries
with ZERO coverage — not weak coverage, no coverage.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`.

## Naming the scope

Report path and file names: RULES.md rules 4 and 5. A `whole-repo` run: see the next section.

### A whole-repo run

- **Slices:** module families whose rules depend on each other (orders+invoicing, cart+inventory,
  delivery+returns) plus one `SYS` slice. Every module is in exactly one slice (not `example`).
- **Map:** write the slice → modules map and the order at the top of `whole-repo.md` before the
  first slice. If the newest older `spec-gaps/whole-repo.md` has a map, start from it, and put a new
  module in its nearest family. Matching rows across runs is by rule text and source, never by
  slice.
- **SYS** owns every source in the read list that belongs to no module: `shared/**`,
  `shared/contracts/*.root.yaml`, `asyncapi.workers.yaml`, `authorization-keys.core.yaml`,
  `docs/understand/**/*.md`, `docs/{build,understand,operate,reference}/*.md`. SYS reads them in full. A family slice
  searches them for its modules' names, subjects, route segments and error codes, the same way a
  module run does.
- **Lead pass** first: grep the suite for every error code, event name and audit action the docs
  name. The zero-hit list goes to the slices as leads, never findings. The lead pass signs off no
  module on its own.
- **Order:** security slices first, then money and stock, then the rest.
- **Files:** each slice writes `whole-repo.<slice>.md` starting with its HEAD sha; `whole-repo.md`
  (method, map, totals, de-duplicated short list) is written last. A missing slice file makes the
  run PARTIAL.

## Steps

### 1 — enumerate the rules

From the contract and the docs, NOT from the implementation:

- Contracts:
    - the module's own `openapi*.yaml` and `asyncapi*.yaml` fragments;
    - `shared/contracts/*.root.yaml`, `asyncapi.workers.yaml` and `authorization-keys.core.yaml`;
    - every other YAML in `src/modules/<module>/`: `rules.yaml`, `authorization.yaml`, `module.yaml`.

    Cite these. Never cite the generated root bundles (`openapi.yaml`, `asyncapi*.yaml` at the repo
    root): they are gitignored, so their line numbers point nowhere.

- Docs: `docs/modules/<module>*.md`, `docs/understand/**/*.md` (including `defences/`),
  `docs/{build,understand,operate,reference}/*.md`.
- Shared: `shared/rules/*.yaml`, `shared/cases/*.cases.yaml`. Layout: `docs/understand/shared-rules.md`
  §3. A cases file counts as spec here, even though a test reads it.

A module or path run reads its own docs and YAML in full. For `shared/**` and `docs/{build,understand,operate,reference}/*.md` it
searches for the module name, its subjects, route segments and error codes, and reads only what
matches. A `whole-repo` run: see the section above.

When the docs are thin, search the read set above for the term: Grep, or
`rg -n '<term>' docs/ shared/ src/modules/<module>/*.yaml`. A hit counts only when re-found and
cited from its source file; a hit under `src/`, `tests/` or `.2brain/` is discarded.

List every rule as one testable sentence. Cover at least these families, and say
"none stated" where the spec is silent rather than inventing one:

- permission and ownership checks (who may read, who may mutate, cross-tenant)
- precedence when two rules collide (discount vs. minimum, reservation vs. stock)
- money: rounding direction, currency, totals that must reconcile
- state machines: which transitions are legal, which are terminal
- idempotency, retries, and duplicate delivery on the AsyncAPI channels
- limits: pagination bounds, payload size, rate limits, expiry and TTL

### 2 — hunt for coverage

For each rule, search the whole suite — `tests/**`, `src/modules/*/tests/**`.
Grep for the values and the endpoint, not for the rule's name; a test that
mentions the concept but asserts nothing about it is NOT coverage.

A zero-hit error code is a lead, never a finding. Before calling it uncovered, search for: the route
plus status; the app-wide sweeps (`tests/contract/`, `tests/cross-cutting/`) for the generic codes;
for a code no route raises, the observable outcome (state unchanged, no side effect). A test that
asserts the status (and the outcome) but not the code is `covered` when that status can carry only
that one code on the operation, and `partially covered — code not asserted` when it can carry two or
more. Read the operation's own `x-error-codes` first. When the operation has none, use the codes
its service raises at that status. If that still cannot be told, mark it `partially covered`.

**Search repo-wide, never batch-wide.** A rule is often covered by a test that
lives in another module's file set. "No test in scope" is not a finding — it is a
scoping artefact, and filing it as a gap is how this audit wastes someone's day.

### 3 — classify

For "partially", say precisely which half is missing.

| Verdict             | Means                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `covered`           | a test asserts the rule                                                                                                                                                                                                                       |
| `partially covered` | name the missing half                                                                                                                                                                                                                         |
| `not covered`       | passes all three tests of `docs/reference/tests.md#what-earns-a-test` (our own code enforces it today, a break would be silent, and someone is hurt), with a G/W/T; a security or money stop a dependency provides gets a learning-test G/W/T |
| `contradicted`      | the spec says X, the code or a test does not-X. Cite both sides by file:line, no G/W/T; list it first in the short list, marked "→ spec-drift Leads"                                                                                          |
| `holds by absence`  | true only because something does not exist, or a value is read back as stored. Name what is absent, or the stored field. No G/W/T                                                                                                             |
| `loud`              | a break would fail at once elsewhere; name where. No G/W/T                                                                                                                                                                                    |
| `no harm`           | fails the third criterion; say who is not hurt. No G/W/T                                                                                                                                                                                      |
| `deliberate`        | a gap left on purpose; cite the doc                                                                                                                                                                                                           |

Totals: one column per verdict.

### 3b — open the code before filing a row

For every row that is not `covered`, open the code that should enforce it and cite the line.

- No such line: `holds by absence`.
- The line does not-X: `contradicted`.
- The line enforces X: apply the three criteria (`not covered`, `loud`, `no harm`).
- If `tmp/reports/mutation/mutation.json` covers the file, name the mutant on that line (id and
  status).

Step 1 still takes rules from the spec only; this step only sorts them.

Under RULES.md rule 8: every earlier `not covered`, `partially covered` and `contradicted` row is
re-checked against HEAD. `carried` and `not re-checked` are not allowed for them. Before the lead
pass calls a module "fully covered", it checks that module's earlier open rows.

### 4 — write the missing case

For every `not covered` rule, give the minimal input that would exercise it, as
Given/When/Then. Prose only — no code, no test files. Name the suite it belongs
in, using the suite names this repo actually has — read `package.json`'s `test:*`
scripts rather than assuming — and say why that suite.

## Output

Write `tmp/reports/audit-<run>/spec-gaps/<SCOPE>.md`:

| id | risk | rule | source (file:line) | status | minimal case (G/W/T) | suite |

- `id`: `<CODE>-<n>`: the slice code in a `whole-repo` run (`ACC-12`), the scope's code otherwise. A
  de-duplicated rule keeps one id and lists the others (`CRT-9 = USR-28`). Ids hold within one run;
  to match a row from the previous run, compare the rule text and the source, not the id.
- `risk`: `security` (permission, ownership, tenant, auth), `money` (money and stock that must add
  up), `state` (state machine, precedence, invariant), `limits` (limits, TTL, the rest). A row in two
  families names both and sorts by the first.

Put the short list at the top of `<SCOPE>.md`, under `## Not covered`: every `not covered` row, in
the order security, money, state, limits. The full table follows it. End by printing the same short
list.

Rules:

- Every rule needs a spec citation. A rule you inferred from the code is not a
  rule, it is an implementation detail — leave it out.
- A gap that is deliberate needs to be recorded as deliberate, with the doc that
  says so, not silently dropped.
- A rule that is real but stated nowhere is its own finding: the fix is to write
  the contract text, not the test. Say which is missing.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
