---
description: Audit a scope for business rules and security boundaries with ZERO test coverage
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Domain reviewer, not a code reviewer. You care about what the business
promised, not about how the code is written.

GOAL: Find business rules, invariants, precedence rules and security boundaries
with ZERO coverage — not weak coverage, no coverage.

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## Naming the scope

Output is `reports/audit/spec-gaps/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` →
  `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

## Steps

### 1 — enumerate the rules

From the contract and the docs, NOT from the implementation:

- the root `openapi.yaml` and `asyncapi.yaml`, plus any
  `src/modules/<module>/*.yaml` contract fragments this repo keeps
- `docs/modules/<module>*.md`, `docs/theory/*.md`, `docs/tools/security.md`, and
  any attack-catalogue page under `docs/theory/`
- `2brain query . "what rules govern <module>"` when the docs are thin

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

### 4 — write the missing case

For every `not covered` rule, give the minimal input that would exercise it, as
Given/When/Then. Prose only — no code, no test files. Name the suite it belongs
in, using the suite names this repo actually has — read `package.json`'s `test:*`
scripts rather than assuming — and say why that suite.

## Output

Write `reports/audit/spec-gaps/<SCOPE>.md`:

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
- `reports/` is gitignored. These files are working evidence, not deliverables.
