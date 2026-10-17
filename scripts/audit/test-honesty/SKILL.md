---
name: test-honesty
description: Audit tests that pass without proving anything — coverage padding, mocked subjects, swallowed failures, lying titles, degenerate inputs — and, with --fix, repair the confirmed ones
---

ROLE: Sceptical test auditor. Read every test as if its author were paid per green test and per
covered line. A test is innocent only once it has been seen to fail.

GOAL: Find tests that stay green when the behaviour they claim to check is broken. Then, only when
asked, make each one honest — or say plainly that it cannot be.

SCOPE: the argument you were given — a module name (`orders`), a path, or `--diff` for modules
touched by the working tree. If empty, use `git status --porcelain` to pick the scope. A `--fix`
anywhere in the argument turns on step 5; without it this is a report.

## Naming the scope

Output is `tmp/reports/audit/test-honesty/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

## What this audit is not

Three neighbours already own a question. Note the finding in one line and route it:

| Question                                         | Owner                |
| ------------------------------------------------ | -------------------- |
| the test agrees with the code, not with the spec | `/audit-spec-drift`  |
| a rule has no test at all                        | `/audit-spec-gaps`   |
| two tests discriminate the same thing            | `/audit-suite-bloat` |

This audit asks one thing only: **could this test fail?** Not "is it right", not "is it needed".

## The shapes

Names come from Meszaros' _xUnit Test Patterns_, James Carr's TDD anti-pattern catalogue and the
test-smell catalogue at https://testsmells.org. Use them in the report, so a finding links to
literature instead of to taste.

| Shape                        | What it looks like                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Coverage padding**         | runs the code, asserts nothing that depends on it: `toBeDefined()`, `toBeTruthy()` on an object, only `not.toThrow()`, `expect(true)`                  |
| **The Mockery**              | the subject itself is mocked, or the only assertion is that a mock returned what the test told it to                                                   |
| **The Secret Catcher**       | `try`/`catch` or `if` around the `expect`, so the failing path skips the assertion; a missing `expect.assertions(n)`                                   |
| **The Free Ride**            | a floating promise — `.then(expect…)` neither returned nor awaited — so the assertion lands after the test ends                                        |
| **The Liar**                 | the title promises X, the body checks Y: "rejects a stranger" that asserts only the status of an admin call                                            |
| **Success Against All Odds** | an input that cannot discriminate: a sort on sorted data, a filter everything passes, a rounding test on whole numbers, a permission test run as admin |
| **Loose oracle**             | `expect.anything()` everywhere, `toMatchObject({})`, `toBeGreaterThanOrEqual(0)` on a count, a regex that matches anything                             |
| **Testing the platform**     | asserts what Jest, Mongoose, Zod, Express or TypeScript already guarantee, not what this repo decided                                                  |
| **Bent to fit**              | git history shows the expected value edited to match the code, with no spec or docs change in that commit                                              |
| **Dull**                     | a title that names nothing (`works`, `handles it`, `returns correctly`) — the reader cannot tell what would break it                                   |

"Dull" alone is never CONFIRMED by the oracle below. It is a naming finding, and it is cheap to fix.

## Steps

### 1 — candidates from the tools, not from reading

A text search is the deterministic first cut. Run it over the scope's test files
(`src/modules/<module>/tests/**`, or `tests/**` for a system scope):

```bash
rg -n "toBeDefined\(\)|toBeTruthy\(\)|not\.toThrow\(\)|expect\(true\)|expect\.anything\(\)|toMatchObject\(\{\}\)|toBeGreaterThanOrEqual\(0\)" <paths>
rg -n "^\s*(if|try|catch)\b" <paths>                    # conditional or caught assertions
rg -n "\.then\(" <paths>                                 # then read each: returned or awaited?
rg -n "jest\.(mock|spyOn)\(" <paths>                    # then ask: is the mocked thing the subject?
rg -c "\bexpect\(" <paths>                               # a file whose count is low for its it() count
```

Add the two priors, in this order:

- `tmp/reports/mutation/mutation.json` and `tmp/reports/stryker-incremental.json` — a test that
  covers a line whose mutants all **survive** is the strongest candidate there is. A survived
  mutant on a covered line is, by definition, a line some test runs and none checks.
- `git log -p --follow -- <test file>` — for **Bent to fit**: a commit that changes only an
  expected literal in the test, alongside a `src/` change, and no `docs/` or contract change.

Then read every remaining test in scope for **The Liar** and **Success Against All Odds**. Those
two need judgement, and no pattern finds them.

### 2 — for each candidate, write the sabotage first

Before running anything, write down, per candidate:

- the behaviour the test's **title** claims to pin
- the smallest edit to `src/` that breaks exactly that behaviour — the _sabotage_

Sabotages, by the claim they test:

| The title claims                   | Sabotage                                             |
| ---------------------------------- | ---------------------------------------------------- |
| a guard refuses (auth, validation) | delete the guard, or make it return early as allowed |
| a value is computed                | return a constant, or the input unchanged            |
| an order or precedence             | swap the two branches, or reverse the sort           |
| a side effect happens              | delete the call (the write, the emit, the mail)      |
| a boundary (`<` vs `<=`, expiry)   | move the boundary by one                             |

Write the sabotage from the title, not from the test body. A sabotage chosen by reading the
assertions only proves the assertions agree with themselves — it is how **The Liar** survives an
audit.

### 3 — run the oracle

The oracle is deterministic and reproducible: apply the sabotage, run that one test file, restore.

```bash
npx jest <test file> -t "<test name>"     # once on the real code: must pass
# apply the sabotage to src/
npx jest <test file> -t "<test name>"     # once sabotaged
# restore, then prove it:
git diff --quiet -- <sabotaged src file> && echo restored
```

- Integration, contract and fuzz files start the in-memory Mongo on their own — the same command
  works. `tests/load/` is k6, not Jest: mark those UNVERIFIED and move on.
- Other sessions may share this checkout. If `git worktree list` shows a peer working here, run the
  sabotage in a worktree of your own, never in theirs — and never leave a sabotage in place between
  two steps.
- Never sabotage with a `git stash`: it takes every peer's uncommitted work with it.

Verdicts:

| Verdict        | Means                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| **CONFIRMED**  | the test **passed** under the sabotage. It cannot fail for the reason its title gives.  |
| **CLEAN**      | the test failed under the sabotage. The candidate was a false alarm — drop it silently. |
| **UNVERIFIED** | the oracle could not run here (k6, a live stack, an external service). Say why.         |
| **DULL**       | a naming finding only — the oracle does not apply.                                      |

Only CONFIRMED and DULL rows are findings. CLEAN rows go in a one-line count, never a table row.

### 4 — write the report

`tmp/reports/audit/test-honesty/<SCOPE>.md`:

| file:line | test name | shape | claims | sabotage | result under sabotage | verdict | fix |

Then print the CONFIRMED rows to the terminal, security boundaries and money first, with one line
of totals: candidates, CONFIRMED, CLEAN, UNVERIFIED, DULL. A low CONFIRMED-to-candidate ratio is
good news, and worth saying.

### 5 — fix, only with `--fix`

Only CONFIRMED and DULL rows. One test at a time, in this order of preference:

1. **Make it check its title.** Add the assertion the sabotage proved missing, or change the input
   so it discriminates (an unsorted list, a stranger instead of an admin, a value that rounds).
2. **Make the title tell the truth**, when the body checks something real but different. A smaller
   honest claim beats a large false one.
3. **Propose deletion** — never apply it. `CLAUDE.md` § Asking vs. deciding says to ask before
   deleting anything. List it with the test that already kills the same sabotage, if one does.

Rules for every fix:

- The expected value comes from the spec — the root `openapi.yaml` and `asyncapi.yaml`, the module
  fragments, `docs/modules/<module>*.md`, `docs/theory/*.md` — or, where the spec is silent, from
  working the input out by hand in a one-line comment. **Never** run the code and paste its output
  into the assertion: that is **Bent to fit**, done by the auditor.
- A fixed test must pass on the real code **and** fail under the same sabotage. Run both and put
  both results in the report's `fix` column. A fix that skips the second run is not a fix.
- If the honest version **fails on the real code**, do not soften it. Revert that one test, mark
  the row `BUG?`, and stop to tell the user — the test was hiding a defect, and the decision is
  theirs. It belongs to `/audit-spec-drift` if a spec line backs it.
- Do not touch `src/`. This step edits test files only, and follows `CLAUDE.md` § Tests:
  placement, the public door, no `.only`/`.skip`, no double cast, `asStub<T>()` for stubs.
- Do not commit. Leave the diff for the human, and say which files it touches.

## Rules

- A finding needs the oracle's result. "It looks weak" is not a finding — the sabotage either let
  it through or it did not.
- Prefer three CONFIRMED rows over thirty candidates. A report full of guesses trains its reader to
  skip it.
- A short test is not a weak test. `expect(isRefundable(order)).toBe(false)` on a well-chosen order
  is honest; only the sabotage tells the difference.
- `tmp/reports/` is gitignored. The report is working evidence, not a deliverable — its conclusions
  belong in the fixed tests and the commit message.
