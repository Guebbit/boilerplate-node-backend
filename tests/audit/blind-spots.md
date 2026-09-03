---
description: Audit tests for correlated blind spots — assertions that agree with the code but not the spec
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(ls:*), Bash(2repo query:*)
---

ROLE: Independent test auditor. You did NOT write the implementation. Treat it as
hostile evidence, not as the definition of correct.

GOAL: Find tests that only prove "the test agrees with the code", not "the code
matches the actual requirement".

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## The ordering is the method — do not collapse it

The whole value of this audit comes from deriving expectations **before** the
implementation can contaminate them. Two passes, two files, in this order.

### Pass 1 — spec only

Read ONLY, for everything in scope:

- `src/modules/<module>/openapi.yaml` and `asyncapi.yaml`
- `docs/modules/<module>*.md`, `docs/theory/*.md`, `docs/api/*.md`
- the root `openapi.yaml` sections for the module's paths
- `2repo query . "<the rule you are unsure about>"` when the docs are thin

Do NOT open `src/modules/<module>/**/*.ts` (except the contract YAMLs) and do NOT
open the test files yet.

Write what the behaviour SHOULD be to
`reports/audit/correlated-blind-spots/<SCOPE>.expectations.md`:
one row per observable behaviour — status codes, error envelope shape, precedence
between competing rules, rounding and money semantics, permission boundaries,
idempotency, ordering. Cite the spec line you derived each from.

Save that file before continuing. It is the control.

### Pass 2 — code and tests

Now read the implementation and the tests. For each expectation from pass 1, find
the test that covers it and compare three things:

1. what the spec says (your frozen row)
2. what the code does
3. what the test asserts

Flag any test whose asserted expected value matches the CODE's output but not the
spec-derived expectation. That is the correlated blind spot: implementation and
test share one wrong reading, and CI is green anyway.

Also flag the inverse — a spec rule with no test at all is NOT this audit's
finding, it belongs to `/audit-domain-gaps`. Note it in one line and move on.

## Output

Write `reports/audit/correlated-blind-spots/<SCOPE>.findings.md`, a table of:

| file | test name | spec-derived expectation | actual assertion | mismatch | why |

Then print only the `mismatch: yes` rows to the terminal, most severe first.

Rules:

- Do NOT change any test or implementation file. This is a report.
- A finding needs a spec citation. No citation, no finding — say "spec silent"
  instead, which is itself worth reporting.
- Prefer three real mismatches over thirty maybes.

## Priors worth using

- `reports/stryker-incremental.json` — a surviving mutant on a line whose rule the
  docs state explicitly is a strong candidate. Use it to order the work, never as
  a finding on its own.
- Tests whose expected value is produced by the system under test
  (`expect(f(x)).toEqual(g(x))` with `g` a sibling export, `SCHEMA.parse(actual)`
  compared to `actual`, snapshots over generated artifacts) are tautologies and
  belong in this report.
