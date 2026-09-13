---
description: Audit this backend against the shared compliance registry's backend-responsibility rules
argument-hint: <module|path|--diff>  (default: the whole repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Compliance reviewer, not a security or code reviewer. You check what this backend
publishes, records and enforces against a cross-legal-domain rule list — not against this repo's
own docs' aspirations.

GOAL: For every rule in `tests/audit/compliance-rules.yaml` whose `responsibility` is `backend`
or `both`, decide whether it applies here, and if so whether it is met.

SCOPE: $1 — a module name (`orders`), a path, or `--diff` for modules touched by the working
tree. If empty, audit the **whole repo** — unlike the other audits, an empty scope here is NOT
"whatever `git status` touched": a compliance gap is almost never introduced by the change that
happens to surface it. The unsubscribe rule has been violated (harmlessly, today) since the first
transactional-only template, not since the last commit.

## Naming the scope

Every output file is named `<SCOPE>`, derived one way only:

- empty → `full`
- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

Never invent a batch number.

## Steps

1. Read `tests/audit/compliance-rules.yaml`. Parse the `rules:` list only — `suggested_rules:` is
   a staging area pending human approval and must never be evaluated or reported on.
2. Filter to `responsibility: backend` or `responsibility: both`.
3. If $1 named a module or path, further filter to rules whose `evidence.backend` hints fall
   inside that scope — EXCEPT rules whose evidence is inherently repo-wide (a published policy
   page, a security.txt route), which are always evaluated regardless of scope.
4. For each remaining rule, in this order:
    - Open every path/glob in `evidence.backend`; run every grep hint listed there.
    - Decide `applies_when` against what you actually found in THIS repo right now — not what the
      registry's own prose assumed when it was written, which may be stale.
    - Not applicable → verdict `NOT-APPLICABLE`, one line citing what you checked to conclude that.
    - Applicable → verdict `VIOLATION` or `SATISFIED`. Every verdict needs a citation: a
      `file:line`, or "confirmed absent via grep '<pattern>' across <paths>, no matches" — an
      absence claim needs the search that was run, not just an assertion.
    - `responsibility: both` rules: if this side's own evidence already fails the rule, verdict
      `VIOLATION` — that's actionable here regardless of the frontend. If this side is fine but the
      rule's overall intent cannot close without the frontend half, verdict `NEEDS-BOTH-SIDES` and
      note "frontend half: see /audit:compliance-frontend, same id". Never restate the rule's
      `rule:` text in the note — cite it by `id` only; the frontend prompt's report is meant to be
      read alongside this one, not duplicated into it.

## Output

Write `reports/audit/compliance-backend/<SCOPE>.findings.md`, a table of:

| id | title | applicability | verdict | evidence | severity | references |

Every `backend`/`both` rule in the registry appears as exactly one row — this is a complete pass
over the registry, never a cherry-picked subset. Then print `VIOLATION` and `NEEDS-BOTH-SIDES`
rows to the terminal, most severe first.

Rules:

- Do NOT change any file. This is a report.
- A finding needs a citation. No citation, no finding.
- `NOT-APPLICABLE` needs a reason too — silently skipping a rule is not allowed.
- `reports/` is gitignored. These files are working evidence, not deliverables — the conclusions
  belong in `docs/theory/data-protection.md`, a tracked issue, or a real fix commit.

## Reading the output

| Verdict              | Means                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **VIOLATION**        | The rule applies and this side's evidence fails it — including a `both` rule broken on this side alone.                             |
| **SATISFIED**        | The rule applies and this side's evidence meets it in full.                                                                         |
| **NOT-APPLICABLE**   | `applies_when` evaluates false for this app today, reason cited.                                                                    |
| **NEEDS-BOTH-SIDES** | A `both` rule whose own-side half is fine but whose closure depends on `/audit:compliance-frontend` — see that report by rule `id`. |
