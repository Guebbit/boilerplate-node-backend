---
name: api-rfc6585
description: Audit this API's contract, handlers and docs against RFC 6585, reported only
---

ROLE: Status-code reviewer: you judge whether 428, 429, 431 and 511 mean what the RFC says here.

GOAL: For every rule in `scripts/audit/api-standards.yaml` whose `standard` is `rfc6585`, give one
verdict per rule per operation in scope, each with a citation. The audit judges whether each of these four statuses is answered only for its defined reason.
It reports against RFC 6585 ONLY. Other standards disagree with it in places; that is
not this audit's business.

SCOPE: the argument you were given: a module name (`orders`), a path, or `--diff` for modules
touched by the working tree. If empty, audit the **whole contract**. A difference from a standard is
rarely introduced by the change that happens to surface it, so an empty scope is NOT "whatever
`git status` touched".

## Naming the scope

Output is `tmp/reports/audit/api-rfc6585/<SCOPE>.md`, where `<SCOPE>` is:

- empty → `full`
- a module → the module name (`orders`)
- a path → the path slugged, `src/` dropped (`src/infrastructure/http` → `infrastructure-http`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

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
    - `tests/cross-cutting/rate-limit-budgets.test.ts`, `tests/cross-cutting/rate-limit-keys-conformance.test.ts`
    - `tests/integration/conditional-writes.test.ts` (428 and 412)
      A guarded rule gets one line ("guarded by X") and no verdict hunt.
5. If this audit is part of a run of several, the USER gives the order of precedence first
   ("RFC 9110 > Google AIP > Zalando"). Ask for it if you were not given one. Never pick it.

## Steps

1. List the operations in scope from the bundle (Start from `src/infrastructure/http/middlewares/rate-limit.ts` and `src/infrastructure/http/preconditions.ts`, then grep for each status.)
2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it.
3. A doc that contradicts the code: say which side is wrong, and cite the section.
4. A finding a rule could catch mechanically: verdict `LINT-CANDIDATE` with the JSONPath. It is
   REPORTED only, never turned into a Spectral rule, and you change no file.

## Verdicts

| Verdict            | Means                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| `VIOLATION`        | the API contradicts the standard and no page says it does so on purpose         |
| `KNOWN-DIFFERENCE` | it differs, and a row on the theory page says why; still reported               |
| `LINT-CANDIDATE`   | mechanical: REPORTED only, never turned into a Spectral rule, with the JSONPath |
| `SATISFIED`        | checked, and it holds                                                           |
| `NOT-APPLICABLE`   | the rule does not touch this scope; one line saying what you checked            |

## Output

Write `tmp/reports/audit/api-rfc6585/<SCOPE>.md`: the bundle's mtime, the scope, then a table of

| rule id | operation | verdict | evidence (file:line) | section | fix side |

`fix side` is `contract`, `code`, `docs` or `standard` (the standard is the one that fits worse).
Then list the `VIOLATION` and `LINT-CANDIDATE` rows again, worst first.

Do NOT change any file. No citation, no finding: an absence claim names the grep that found
nothing. Three real violations over thirty maybes. The report is disposable; see
`docs/tools/ai-auditing.md`.
