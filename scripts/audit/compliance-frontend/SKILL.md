---
name: compliance-frontend
description: Audit the paired frontend against the shared compliance registry's frontend-responsibility rules
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Compliance reviewer, not a security or code reviewer. You check what the paired frontend
publishes, renders and enforces against a cross-legal-domain rule list — not against either
repo's own docs' aspirations.

GOAL: For every rule in `scripts/audit/compliance-rules.yaml` whose `responsibility` is `frontend`
or `both`, decide whether it applies, and if so whether it is met.

REPO: this prompt reads the registry from this repo (`boilerplate-node-backend`) but evaluates
evidence against the sibling checkout at `../boilerplate-vue-frontend`. If that checkout is not
present at that path, stop and say so — do not guess at a different location.

SCOPE: the argument you were given: an area (`checkout`, `account`), a path inside the frontend repo,
`--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5). Empty means `whole-repo`: the **whole frontend repo**. A compliance gap is
almost never introduced by the change that happens to surface it. `--diff` is read in the frontend
repo (its `git status` and its `main`).

## Naming the scope

Output goes to `tmp/reports/audit-<run>/compliance-frontend/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.
For `--diff` the branch is the frontend repo's (`git -C ../boilerplate-vue-frontend branch --show-current`).

## Steps

1. Read `scripts/audit/compliance-rules.yaml` (from this repo). Parse the `rules:` list only —
   `suggested_rules:` is a staging area pending human approval and must never be evaluated or
   reported on.
2. Filter to `responsibility: frontend` or `responsibility: both`.
3. If the scope named an area or path, further filter to rules whose `evidence.frontend` hints fall
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
      note "backend half: see the `compliance-backend` audit's report
      (`scripts/audit/compliance-backend/`), same id". Never restate the rule's `rule:`
      text in the note — cite it by `id` only; the backend prompt's report is meant to be read
      alongside this one, not duplicated into it.

## Output

Write `tmp/reports/audit-<run>/compliance-frontend/<SCOPE>.findings.md` (in THIS repo — the report is
audit tooling output, kept with the other audit reports regardless of which repo it inspected), a
table of:

| id | title | applicability | verdict | evidence | severity | references |

Every `frontend`/`both` rule in the registry appears as exactly one row — this is a complete pass
over the registry, never a cherry-picked subset. Then print `VIOLATION` and `NEEDS-BOTH-SIDES`
rows to the terminal, most severe first.

Rules:

- A finding needs a citation. No citation, no finding.
- `NOT-APPLICABLE` needs a reason too — silently skipping a rule is not allowed.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables — the conclusions
  belong in the frontend repo's own compliance doc (if one exists), a tracked issue, or a real fix
  commit there.

## Reading the output

| Verdict              | Means                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **VIOLATION**        | The rule applies and this side's evidence fails it — including a `both` rule broken on this side alone.                               |
| **SATISFIED**        | The rule applies and this side's evidence meets it in full.                                                                           |
| **NOT-APPLICABLE**   | `applies_when` evaluates false for this app today, reason cited.                                                                      |
| **NEEDS-BOTH-SIDES** | A `both` rule whose own-side half is fine but whose closure depends on the `compliance-backend` audit — see that report by rule `id`. |

## Never carry

Every in-scope rule is judged fresh, so `carried` is not used. A rule out of this run's scope is
`not re-checked`. In _Since the previous run_ (RULES.md rule 8) the _why_ is one of: a fix sha, new
code, rule text changed (`git diff <prev-sha> -- scripts/audit/compliance-rules.yaml`), or a
re-judgement. A re-judgement (evidence paths unchanged since the previous sha) names the registry
text that caused it, so the rule can be tightened.
