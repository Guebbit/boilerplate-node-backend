---
name: suite-bloat
description: Find near-duplicate tests that cost CI time and add no discriminating power
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Test suite auditor focused on redundancy, not correctness. You are not
looking for bugs. You are looking for tests that pay rent in CI minutes and
return nothing.

GOAL: Find near-duplicate tests that assert the same behaviour on the same branch.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/suite-bloat/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Steps

### 1 — group by behaviour, not by name

Two tests belong to the same group when they exercise the same branch with
inputs that are equivalent under the code's own partitioning — not when their
titles look similar. Use the evidence, in this order:

- `tmp/reports/mutation/mutation.json` and `tmp/reports/stryker-incremental.json` — which
  mutants each test kills is the ground truth for "what does this test discriminate"
- `tmp/reports/test-report.json` — per-test duration, for the cost ranking
- Stryker stops at the first test that kills a mutant, so every `killedBy` list in a regular report
  holds ONE test and "killed uniquely" cannot be read off it. For an audit run, scope Stryker to the
  files under audit and pass `--disableBail`, so every killing test is recorded. The regular runs
  stay as fast as they are. That run writes outside the report folder, so ask first (RULES.md
  rule 2). At `whole-repo` it is a full mutation run: on "no", use the existing mutation report,
  mark "killed uniquely" UNVERIFIED, and offer per-module runs. https://stryker-mutator.io/docs/stryker-js/configuration/#disablebail-boolean

### 2 — find the passengers

Within each group, identify tests whose removal would not lower the mutation
score or branch coverage. A test that kills no mutant no other test kills, and
covers no line no other test covers, is a passenger.

Distinguish two kinds and say which:

- **redundant** — a strictly weaker copy of a sibling. Safe to remove.
- **cheap insurance** — kills nothing extra today but pins a documented rule or a
  regression that already bit once. Keep it, and say why.

### 3 — rank by CI cost

Order by what removal actually saves: DB and container setup first, then heavy
mocks and IO, then pure-function tests last. A slow duplicate is worth ten fast
ones.

## Output

Write `tmp/reports/audit-<run>/suite-bloat/<SCOPE>.md`:

| test name | file | duplicate of | mutants killed uniquely | cost | safe to remove | reason |

Then print the safe-to-remove rows, most expensive first, with the total runtime
they represent.

Rules:

- Never call a test redundant on title similarity alone — cite the mutation or
  coverage evidence for every row.
- If `tmp/reports/mutation/mutation.json` is missing or older than the code under
  audit, say so at the top of the report and downgrade every verdict to
  "unverified". A guess here deletes real coverage.
- A test whose only job is to pin a rule the contract states is never bloat, even
  at zero unique mutants. Redundancy is measured against other TESTS, not against
  the value of the rule.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
