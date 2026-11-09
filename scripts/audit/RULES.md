# Rules every audit follows

Every `scripts/audit/*/SKILL.md` starts with "read this file and follow it".
Where a skill and this file disagree, this file wins.
A rule that holds for only some audits is copied into those skills instead.
The paired frontend keeps its own copy, the same text except the report root (`reports/`, not
`tmp/reports/`).

## 1. Read-only

- The audit changes nothing in either repo: no source, test, doc, contract, generated file,
  plan file, git state, lockfile, baseline or other report.
- One exception: this run's own report folder (rule 4).
- Tool output the audit needs (a `shallow.json`, a `knip.json`, an `expectations.md`) goes in that
  folder too.
- An audit that starts helper agents gives each one this rule and rules 2 and 7.

## 2. Ask before a command that writes elsewhere

- Examples: `npm run mutation`, `npm run regenerate`, Stryker, Cypress, a build, an e2e capture.
- Do not start until the user says yes, or says to go on without it ("I already ran it").
- Never run these, even when asked mid-audit: `mutation:pull`, `mutation:full`,
  `test:mutation:pull`, `test:mutation:baseline`. They write the tracked baseline, which is a
  separate job.

## 3. End with a plan suggestion

- If any finding needs work, the report ends with: "Suggest writing a root
  `AUDIT_<NAME>_<MMDD>.md` plan with the findings that need intervention."
- The audit never writes that plan.

## 4. Report folder

- Folder: `tmp/reports/audit-<YYYY-MM-DD-HHmm>/<audit>/<SCOPE>…`.
- One timestamp per run. A caller that runs several audits picks one and passes it on; a single
  audit uses its own start time.
- "Previous run" = the newest `audit-*` folder older than this run's that holds `<audit>/`.
  Nothing is moved by hand.
- `<SCOPE>` is derived one way only:
    - a module → the module name (`orders`)
    - a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
    - `--diff` → the current branch name slugged (`git branch --show-current`)
    - `whole-repo` → `whole-repo`
- Never invent a batch number: `orders.findings.md` tells the next reader what it covers.

## 5. Scope

- The argument is a module, a path, `--diff` or `whole-repo`.
- An empty argument means `whole-repo`, for every audit.
- `--diff` = the modules touched by `git status --porcelain` plus `git diff --name-only main...HEAD`
  (three dots: from the merge base). Run both in the repo under audit.
- On `main` itself the branch half is empty, so `--diff` is the working tree alone.
- An empty `--diff` stops with "nothing changed". It never becomes `whole-repo`.
- A skill may widen a non-empty diff by its own stated rule, and says so in the report.
- A `whole-repo` run states its size and slicing at the top of the report.
- A skill keeps its own definition of "whole" (its SCOPE line says what it covers).
- A skill that takes no scope argument skips this rule.

## 6. Tripwire

- First: `npm run audit:check-clean -- snapshot <run folder>`.
- Last: `npm run audit:check-clean -- compare <run folder>`.
- Put the result at the top of the report: "Tripwire: clean" or "Tripwire: CHANGED: <paths>".
- It reports a write after the fact; it does not stop one. A peer session in the same worktree
  shows up as a change: list the paths, the reader judges.

## 7. Refused a file write

- Running as a helper agent that cannot write files: return the full report as the final message.
- The caller saves it.
