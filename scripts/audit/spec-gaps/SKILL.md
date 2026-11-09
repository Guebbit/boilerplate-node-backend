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

Output goes to `tmp/reports/audit-<run>/spec-gaps/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Steps

### 1 — enumerate the rules

From the contract and the docs, NOT from the implementation:

- the root `openapi.yaml` and `asyncapi.yaml`, plus any
  `src/modules/<module>/*.yaml` contract fragments this repo keeps
- `docs/modules/<module>*.md`, `docs/theory/*.md`, `docs/tools/security.md`, and
  any attack-catalogue page under `docs/theory/`

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

**Search repo-wide, never batch-wide.** A rule is often covered by a test that
lives in another module's file set. "No test in scope" is not a finding — it is a
scoping artefact, and filing it as a gap is how this audit wastes someone's day.

### 3 — classify

Mark each rule `covered` / `partially covered` / `not covered`. For "partially",
say precisely which half is missing.

File a rule as `not covered` only when it passes the three tests of
`docs/reference/tests.md#what-earns-a-test`: our own code enforces it today, a break would be
silent, and someone is hurt. Otherwise the verdict is `holds by absence` (true only because
something does not exist, or because the value is read back as stored) or `loud` (a break fails
at once elsewhere). Neither gets a Given/When/Then.

### 4 — write the missing case

For every `not covered` rule, give the minimal input that would exercise it, as
Given/When/Then. Prose only — no code, no test files. Name the suite it belongs
in, using the suite names this repo actually has — read `package.json`'s `test:*`
scripts rather than assuming — and say why that suite.

## Output

Write `tmp/reports/audit-<run>/spec-gaps/<SCOPE>.md`:

| rule | source (file:line) | status | minimal case (G/W/T) | suite |

Then print only the `not covered` rows, security boundaries first.

Rules:

- Do NOT write or modify tests. This is a report.
- Every rule needs a spec citation. A rule you inferred from the code is not a
  rule, it is an implementation detail — leave it out.
- A gap that is deliberate needs to be recorded as deliberate, with the doc that
  says so, not silently dropped.
- A rule that is real but stated nowhere is its own finding: the fix is to write
  the contract text, not the test. Say which is missing.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
