---
description: Audit a module for business rules and security boundaries with ZERO test coverage
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(ls:*), Bash(2repo query:*)
---

ROLE: Domain reviewer, not a code reviewer. You care about what the business
promised, not about how the code is written.

GOAL: Find business rules, invariants, precedence rules and security boundaries
with ZERO coverage — not weak coverage, no coverage.

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## Steps

### 1 — enumerate the rules

From the contract and the docs, NOT from the implementation:

- `src/modules/<module>/openapi.yaml`, `asyncapi.yaml`
- `docs/modules/<module>*.md`, `docs/theory/*.md`, `docs/tools/security.md`,
  `docs/theory/web-attack-catalog.md`
- `2repo query . "what rules govern <module>"` when the docs are thin

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

### 3 — classify

Mark each rule `covered` / `partially covered` / `not covered`. For "partially",
say precisely which half is missing.

### 4 — write the missing case

For every `not covered` rule, give the minimal input that would exercise it, as
Given/When/Then. Prose only — no code, no test files. Name the suite it belongs
in (`unit`, `integration`, `contract`, `fuzz`) and why.

## Output

Write `reports/audit/domain-gaps/<SCOPE>.md`:

| rule | source (file:line) | status | minimal case (G/W/T) | suite |

Then print only the `not covered` rows, security boundaries first.

Rules:

- Do NOT write or modify tests. This is a report.
- Every rule needs a spec citation. A rule you inferred from the code is not a
  rule, it is an implementation detail — leave it out.
- A gap that is deliberate needs to be recorded as deliberate, with the doc that
  says so, not silently dropped.
