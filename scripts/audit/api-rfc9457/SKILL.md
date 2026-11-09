---
name: api-rfc9457
description: Audit this API's contract, handlers and docs against RFC 9457 problem details, reported only
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Error-contract reviewer: the lint proved the media type, you judge whether the body is true.

GOAL: For every rule in `scripts/audit/api-standards.yaml` whose `standard` is `rfc9457`, give one
verdict per rule per operation in scope, each with a citation. The audit judges whether every runtime error is a problem document with honest members.
It reports against RFC 9457 problem details ONLY. Other standards disagree with it in places; that is
not this audit's business.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5). Empty means
`whole-repo`: the **whole contract**. A difference from a standard is rarely introduced by the change
that happens to surface it.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/api-rfc9457/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Before you start

1. Read the root `openapi.yaml` (the bundle) and state its mtime in the report. Do NOT bundle it:
   the audit reads what a client reads. If it is missing, stop and say so.
2. Read the "Where we differ, and why" section of `docs/theory/api-standards.md`. A rule whose
   `difference` names a row there gets the verdict `KNOWN-DIFFERENCE` when the difference is what
   you found, with the row `id`.
3. Read the rules of this standard in `scripts/audit/api-standards.yaml`. Open each `source` and
   re-read the clause: the `rule` sentence is a summary, the standard is the authority.
4. Name the existing guard and move on for anything already guarded mechanically. Here:
    - Spectral `shared/contracts/spectral.yaml` (security on every operation, no `nullable`, errors are
      `application/problem+json`, the 2xx body is an object, replace is PUT and update is PATCH,
      operationId shape, schema names, camelCase parameters, `maxLength`, `names-in-us-english-*`)
    - Spectral: errors are `application/problem+json`; `x-not-problem` is the declared opt-out
    - `tests/cross-cutting/contract-error-declarations.test.ts` (every code is in `x-error-codes`)
    - `tests/fuzz/endpoints.fuzz.test.ts`
      A guarded rule gets one line ("guarded by X") and no verdict hunt.
5. If this audit is part of a run of several, the USER gives the order of precedence first
   ("RFC 9110 > Google AIP > Zalando"). Ask for it if you were not given one. Never pick it.

## Steps

1. List the operations in scope from the bundle (Grep for every place that answers an error without `rejectResponse` (`res.status(4`, `res.status(5`, `.sendStatus(`, `.json({ error`), then compare with the `x-not-problem` operations.)
2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it.
3. A doc that contradicts the code: say which side is wrong, and cite the section.
4. A finding a rule could catch mechanically: verdict `LINT-CANDIDATE` with the JSONPath. It is
   REPORTED only, never turned into a Spectral rule.

## Verdicts

| Verdict            | Means                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| `VIOLATION`        | the API contradicts the standard and no page says it does so on purpose         |
| `KNOWN-DIFFERENCE` | it differs, and a row on the theory page says why; still reported               |
| `LINT-CANDIDATE`   | mechanical: REPORTED only, never turned into a Spectral rule, with the JSONPath |
| `SATISFIED`        | checked, and it holds                                                           |
| `NOT-APPLICABLE`   | the rule does not touch this scope; one line saying what you checked            |

## Output

Write `tmp/reports/audit-<run>/api-rfc9457/<SCOPE>.md`: the bundle's mtime, the scope, then a table of

| rule id | operation | verdict | evidence (file:line) | section | fix side |

`fix side` is `contract`, `code`, `docs` or `standard` (the standard is the one that fits worse).
Then list the `VIOLATION` and `LINT-CANDIDATE` rows again, worst first.

No citation, no finding: an absence claim names the grep that found
nothing. Three real violations over thirty maybes. The report is disposable; see
`docs/tools/ai-auditing.md`.
