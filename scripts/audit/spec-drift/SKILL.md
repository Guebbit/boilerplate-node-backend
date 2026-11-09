---
name: spec-drift
description: Audit tests for assertions that agree with the code but not the spec
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Independent test auditor. You did NOT write the implementation. Treat it as
hostile evidence, not as the definition of correct.

GOAL: Find tests that only prove "the test agrees with the code", not "the code
matches the actual requirement".

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`: every module plus `tests/`.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/spec-drift/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

### A `whole-repo` run

- Slices: clusters of related modules, plus two system slices over `tests/` (HTTP surface;
  infrastructure and kernel). Name them at the top of `whole-repo.expectations.md` before pass 1.
- One control, `whole-repo.expectations.md`, one section per slice, frozen when appended.
- Blind pass 1: a fresh read-only agent per slice. Solo, write every slice's pass 1 before any
  pass 2.
- The orchestrator writes every agent's reply word for word (pass-1 sections into the control,
  pass-2 tables into the slice file). Agents write nothing.
- Pass 2: one table per slice, `whole-repo.<slice>.grading.md`; `whole-repo.findings.md` rolls up
  under one denominator.
- A slice left ungraded is named in the header and the run is PARTIAL.

## The ordering is the method — do not collapse it

The whole value of this audit comes from deriving expectations **before** the
implementation can contaminate them. Two passes, two files, in this order.

### Pass 1 — spec only

Read ONLY, for everything in scope:

- Contracts: the module's own `openapi.yaml` / `asyncapi*.yaml` fragments,
  `shared/contracts/*.root.yaml` and `asyncapi.workers.yaml`. Cite these, never the generated root
  bundles. Plus every other YAML in `src/modules/<module>/`: `rules.yaml`, `authorization.yaml`,
  `module.yaml`.
- Docs: `docs/modules/<module>*.md`, `docs/theory/**/*.md` (including `defences/`),
  `docs/api/*.md`, `docs/tools/*.md`.
- Shared: `shared/rules/*.yaml`, `shared/cases/*.cases.yaml`,
  `shared/authorization-{roles,conformance}.yaml`, `shared/contracts/authorization-keys.core.yaml`.
  Layout: `docs/theory/shared-rules.md` §3.

Under `whole-repo`, each slice follows the module rule; the system slice reads `shared/**`,
`docs/theory/defences/` and the `docs/tools/*.md` pages that state rules in full. A module or path
run reads its own docs and YAML in full and searches `shared/**` and `docs/tools/*.md` for scope
terms.

A cases or conformance file counts as spec here, even though a test reads it. Where two spec files
disagree, record both sides.

When the docs are thin, search the read set above for the term: Grep, or
`rg -n '<term>' docs/ shared/ src/modules/<module>/*.yaml`. A hit counts only when re-found and
cited from its source file; a hit under `src/`, `tests/` or `.2brain/` is discarded.

Write what the behaviour SHOULD be to
`tmp/reports/audit-<run>/spec-drift/<SCOPE>.expectations.md`:
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
finding, it belongs to `/audit:spec-gaps`. The row gets `NOT-COVERED`; a code divergence seen on it
goes to Leads.

## Verdicts

One verdict per control row. A row covered by several tests takes the worst; the findings row names
the test(s). A row pass 2 corrects is graded against the correction and marked as corrected.

| Verdict         | Means                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| `MISMATCH-CODE` | spec says X, code does Y, the test asserts Y. A finding                        |
| `TAUTOLOGY`     | the expected value comes from the code under test. A finding                   |
| `SPEC-CONFLICT` | two spec sources disagree: name both and the side code and test took. Beats OK |
| `SPEC-SILENT`   | no spec line decides it                                                        |
| `NOT-COVERED`   | no test; belongs to `/audit:spec-gaps`                                         |
| `OK`            | they agree. A count, never a row                                               |

`fix side` is `contract`, `docs`, `shared` (`shared/**` YAML), `code` or `test`.

## Output

Write `tmp/reports/audit-<run>/spec-drift/<SCOPE>.findings.md`, a table of:

| file | test name | spec-derived expectation (file:line) | actual assertion | verdict | fix side | why |

Then print the `MISMATCH-CODE` and `TAUTOLOGY` rows to the terminal, worst first, and one totals
line per verdict. The totals equal the control's row count, per slice and in a `whole-repo` roll-up.

### Leads

A Lead is a code-vs-spec divergence no test asserts, whether or not a pass-1 row names it. One line
each: file:line, fix side, and the audit that owns it (`spec-gaps`, `reachability`, `api-http`…).
Leads are not verdicts. This is where spec-gaps' `contradicted` rows land; do not hand them back.

### Hand-offs

A code the code sends (seen in pass 2, asserted by a test or not) that its operation's
`x-error-codes` does not list is not drift: it is `rfc9457-errors-extension`, owned by
`/audit-api-http`. The omission alone never makes a row SPEC-CONFLICT. Grade the row on its other
merits and note the code in one line (operation, status, code, file:line).

Rules:

- A finding needs a spec citation. No citation, no finding: the verdict is `SPEC-SILENT`, which
  is itself worth reporting.
- Prefer three real mismatches over thirty maybes.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables —
  the conclusions belong in a fixed test, a commit message, or a tracked issue.

## Read the SPEC-SILENT and SPEC-CONFLICT counts as the headline

A row you could not grade is not a row that passed. Where the spec is silent,
code and test always agree — there is nothing to drift from — so those rows are
precisely where drift hides, and this method looks straight past them.

Report the denominators in order: rows, answerable (minus `SPEC-SILENT`), tested (minus
`NOT-COVERED`), drifted (`MISMATCH-CODE` + `TAUTOLOGY`). "N rows, M answerable, X drifted" beats "1
defect in N rows". If `SPEC-SILENT` dominates, the finding is that **the contract is the thin
layer**; if `SPEC-CONFLICT` dominates, that **prose is the stale layer**. Either is worth more than
the individual mismatches.

## Priors worth using

- `tmp/reports/mutation/mutation.json`, see `docs/tools/mutation-testing.md#which-file-is-what`.
  A surviving mutant on a line whose rule the docs state explicitly is a strong candidate. Use it to
  order the work, never as a finding on its own. Never read `stryker-incremental.json`: it is
  Stryker's cache, not a result. Other `tmp/reports/mutation*/**/mutation.json` files: same
  staleness rule per file, hints only.
    - A file's entry is stale when that source changed after the report was written
      (`git log -1 --format=%cI -- <file>` against the report's date). An entry for a file that no
      longer exists is stale too.
    - Missing or stale for the scope: say so in one line at the top of the findings ("no mutation
      prior, work ordered by spec risk; `npm run mutation:pull` fixes it") and carry on. Do not mark
      the run partial for this: no finding here rests on a mutant. (PARTIAL differs on purpose from
      test-honesty and suite-bloat, where the report is the oracle.)
- Tests whose expected value is produced by the system under test
  (`expect(f(x)).toEqual(g(x))` with `g` a sibling export, `SCHEMA.parse(actual)`
  compared to `actual`, an expectation imported from the module under test,
  snapshots over generated artifacts) are tautologies and belong in this report.
- A value generated FROM the contract (an orval/Modelina enum, a generated Zod
  schema) is an independent anchor, not a tautology. Check where the value is
  born before calling it one.
