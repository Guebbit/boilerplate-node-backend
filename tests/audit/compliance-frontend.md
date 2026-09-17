---
description: Audit the paired frontend against the shared compliance registry's frontend-responsibility rules
argument-hint: <area|path|--diff>  (default: the whole frontend repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Compliance reviewer, not a security or code reviewer. You check what the paired frontend
publishes, renders and enforces against a cross-legal-domain rule list — not against either
repo's own docs' aspirations.

GOAL: For every rule in `tests/audit/compliance-rules.yaml` whose `responsibility` is `frontend`
or `both`, decide whether it applies, and if so whether it is met.

REPO: this prompt reads the registry from this repo (`boilerplate-node-backend`) but evaluates
evidence against the sibling checkout at `../boilerplate-vue-frontend`. If that checkout is not
present at that path, stop and say so — do not guess at a different location.

SCOPE: $1 — an area (`checkout`, `account`), a path inside the frontend repo, or `--diff` for
areas the frontend's working tree touched. If empty, audit the **whole frontend repo** — unlike
the other audits, an empty scope here is NOT "whatever `git status` touched": a compliance gap is
almost never introduced by the change that happens to surface it.

## Naming the scope

Every output file is named `<SCOPE>`, derived one way only:

- empty → `full`
- an area → the area name (`checkout`)
- a path → the path slugged, `src/` dropped
- `--diff` → the frontend repo's current branch name slugged (`git -C ../boilerplate-vue-frontend branch --show-current`)

Never invent a batch number.

## Steps

1. Read `tests/audit/compliance-rules.yaml` (from this repo). Parse the `rules:` list only —
   `suggested_rules:` is a staging area pending human approval and must never be evaluated or
   reported on.
2. Filter to `responsibility: frontend` or `responsibility: both`.
3. If $1 named an area or path, further filter to rules whose `evidence.frontend` hints fall
   inside that scope — EXCEPT rules whose evidence is inherently sitewide (a published policy
   page, a global consent banner), which are always evaluated regardless of scope.
4. For each remaining rule, in this order:
    - Open every path/glob in `evidence.frontend`, inside `../boilerplate-vue-frontend`; run every
      grep hint listed there.
    - Decide `applies_when` against what you actually found in the frontend repo right now — not
      what the registry's own prose assumed when it was written, which may be stale.
    - Not applicable → verdict `NOT-APPLICABLE`, one line citing what you checked to conclude that.
    - Applicable → verdict `VIOLATION` or `SATISFIED`. Every verdict needs a citation: a
      `file:line` inside the frontend repo, or "confirmed absent via grep '<pattern>' across
      <paths>, no matches" — an absence claim needs the search that was run, not just an assertion.
    - `responsibility: both` rules: if this side's own evidence already fails the rule, verdict
      `VIOLATION` — that's actionable here regardless of the backend. If this side is fine but the
      rule's overall intent cannot close without the backend half, verdict `NEEDS-BOTH-SIDES` and
      note "backend half: see /audit:compliance-backend, same id". Never restate the rule's `rule:`
      text in the note — cite it by `id` only; the backend prompt's report is meant to be read
      alongside this one, not duplicated into it.

## Output

Write `reports/audit/compliance-frontend/<SCOPE>.findings.md` (in THIS repo — the report is
audit tooling output, kept with the other audit reports regardless of which repo it inspected), a
table of:

| id | title | applicability | verdict | evidence | severity | references |

Every `frontend`/`both` rule in the registry appears as exactly one row — this is a complete pass
over the registry, never a cherry-picked subset. Then print `VIOLATION` and `NEEDS-BOTH-SIDES`
rows to the terminal, most severe first.

Rules:

- Do NOT change any file, in either repo. This is a report.
- A finding needs a citation. No citation, no finding.
- `NOT-APPLICABLE` needs a reason too — silently skipping a rule is not allowed.
- `reports/` is gitignored. These files are working evidence, not deliverables — the conclusions
  belong in the frontend repo's own compliance doc (if one exists), a tracked issue, or a real fix
  commit there.

## Reading the output

| Verdict              | Means                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **VIOLATION**        | The rule applies and this side's evidence fails it — including a `both` rule broken on this side alone.                            |
| **SATISFIED**        | The rule applies and this side's evidence meets it in full.                                                                        |
| **NOT-APPLICABLE**   | `applies_when` evaluates false for this app today, reason cited.                                                                   |
| **NEEDS-BOTH-SIDES** | A `both` rule whose own-side half is fine but whose closure depends on `/audit:compliance-backend` — see that report by rule `id`. |
