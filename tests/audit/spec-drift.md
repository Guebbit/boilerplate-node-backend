---
description: Audit tests for assertions that agree with the code but not the spec
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Independent test auditor. You did NOT write the implementation. Treat it as
hostile evidence, not as the definition of correct.

GOAL: Find tests that only prove "the test agrees with the code", not "the code
matches the actual requirement".

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## Naming the scope

Every output file is named `<SCOPE>`, derived one way only:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` →
  `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

Never invent a batch number. `orders.findings.md` tells the next reader what it
covers; `BE-1.findings.md` does not.

## The ordering is the method — do not collapse it

The whole value of this audit comes from deriving expectations **before** the
implementation can contaminate them. Two passes, two files, in this order.

### Pass 1 — spec only

Read ONLY, for everything in scope:

- the root `openapi.yaml` and `asyncapi.yaml`, plus any
  `src/modules/<module>/*.yaml` contract fragments this repo keeps
- `docs/modules/<module>*.md`, `docs/theory/*.md`, `docs/api/*.md`
- `2brain query . "<the rule you are unsure about>"` when the docs are thin

Do NOT open the implementation (except the contract YAMLs) and do NOT open the
test files yet.

Write what the behaviour SHOULD be to
`reports/audit/spec-drift/<SCOPE>.expectations.md`:
one row per observable behaviour — status codes, error envelope shape, precedence
between competing rules, rounding and money semantics, permission boundaries,
idempotency, ordering. Cite the spec line you derived each from.

Save that file before continuing. It is the control.

The freeze is procedural, not cryptographic — the file is gitignored and nothing stops you editing
it later. Do not. If a pass-1 row turns out to be wrong, add a pass-2 row saying so; rewriting the
control to match what pass 2 taught you destroys the only reason pass 2 was worth running.

### Pass 2 — code and tests

Now read the implementation and the tests. For each expectation from pass 1, find
the test that covers it and compare three things:

1. what the spec says (your frozen row)
2. what the code does
3. what the test asserts

Flag any test whose asserted expected value matches the CODE's output but not the
spec-derived expectation. That is the drift: implementation and test share one
wrong reading, and CI is green anyway.

Also flag the inverse — a spec rule with no test at all is NOT this audit's
finding, it belongs to `/audit:spec-gaps`. Note it in one line and move on.

## Output

Write `reports/audit/spec-drift/<SCOPE>.findings.md`, a table of:

| file | test name | spec-derived expectation | actual assertion | mismatch | why |

Then print only the `mismatch: yes` rows to the terminal, most severe first.

Rules:

- Do NOT change any test or implementation file. This is a report.
- A finding needs a spec citation. No citation, no finding — say "spec silent"
  instead, which is itself worth reporting.
- Prefer three real mismatches over thirty maybes.
- `reports/` is gitignored. These files are working evidence, not deliverables —
  the conclusions belong in a fixed test, a commit message, or a tracked issue.

## Read the SPEC-SILENT count as the headline

A row you could not grade is not a row that passed. Where the spec is silent,
code and test always agree — there is nothing to drift from — so those rows are
precisely where drift hides, and this method looks straight past them.

Report the answerable denominator, not the raw one: "N rows, M answerable, X
drifted" beats "1 defect in N rows". If SPEC-SILENT dominates, the finding is
that **the contract is the thin layer**, and saying so is worth more than the
individual mismatches.

## Priors worth using

- `reports/stryker-incremental.json` — a surviving mutant on a line whose rule the
  docs state explicitly is a strong candidate. Use it to order the work, never as
  a finding on its own.
- Tests whose expected value is produced by the system under test
  (`expect(f(x)).toEqual(g(x))` with `g` a sibling export, `SCHEMA.parse(actual)`
  compared to `actual`, an expectation imported from the module under test,
  snapshots over generated artifacts) are tautologies and belong in this report.
- A value generated FROM the contract (an orval/Modelina enum, a generated Zod
  schema) is an independent anchor, not a tautology. Check where the value is
  born before calling it one.
