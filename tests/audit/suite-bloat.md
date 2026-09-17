---
description: Find near-duplicate tests that cost CI time and add no discriminating power
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(npm run test:mutation:*)
---

ROLE: Test suite auditor focused on redundancy, not correctness. You are not
looking for bugs. You are looking for tests that pay rent in CI minutes and
return nothing.

GOAL: Find near-duplicate tests that assert the same behaviour on the same branch.

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## Naming the scope

Output is `reports/audit/suite-bloat/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` →
  `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

## Steps

### 1 — group by behaviour, not by name

Two tests belong to the same group when they exercise the same branch with
inputs that are equivalent under the code's own partitioning — not when their
titles look similar. Use the evidence, in this order:

- `reports/mutation/mutation.json` and `reports/stryker-incremental.json` — which
  mutants each test kills is the ground truth for "what does this test discriminate"
- `reports/test-report.json` — per-test duration, for the cost ranking
- coverage from `npm run test:unit:coverage` when the mutation data is stale

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

Write `reports/audit/suite-bloat/<SCOPE>.md`:

| test name | file | duplicate of | mutants killed uniquely | cost | safe to remove | reason |

Then print the safe-to-remove rows, most expensive first, with the total runtime
they represent.

Rules:

- Do NOT delete anything. Do NOT edit test files. This is a report.
- Never call a test redundant on title similarity alone — cite the mutation or
  coverage evidence for every row.
- If `reports/mutation/mutation.json` is missing or older than the code under
  audit, say so at the top of the report and downgrade every verdict to
  "unverified". A guess here deletes real coverage.
- A test whose only job is to pin a rule the contract states is never bloat, even
  at zero unique mutants. Redundancy is measured against other TESTS, not against
  the value of the rule.
- `reports/` is gitignored. These files are working evidence, not deliverables.
