---
name: api-ratelimit-headers
description: Audit this API's contract, handlers and docs against the IETF RateLimit headers draft, reported only
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Header-syntax reviewer: you check the fields against the draft as it stands today.

GOAL: For every rule in `scripts/audit/api-standards.yaml` whose `standard` is `ratelimit-headers`, give every
operation in scope one verdict per rule, each with a citation. Operations that share a verdict and its
cause share one row (see Output). The audit judges whether `RateLimit` and `RateLimit-Policy` are well-formed and named after real budgets.
It reports against the IETF RateLimit headers draft, plus the `house` clauses the registry pins to its rules.
When a precedence is given, a rule a higher standard overrides is listed once under **Superseded by a
higher standard**, not judged.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5). Empty means
`whole-repo`: the **whole contract**. A difference from a standard is rarely introduced by the change
that happens to surface it.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/api-ratelimit-headers/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Before you start

1. Read the root `openapi.yaml` (the bundle) and state its mtime in the report. Do NOT bundle it:
   the audit reads what a client reads. If it is missing, stop and say so.
2. Read the "Where we differ, and why" section of `docs/theory/api-standards.md`. A rule whose
   `difference` names a row there gets the verdict `KNOWN-DIFFERENCE` when the difference is what
   you found, with the row `id`.
3. Read the rules of this standard in `scripts/audit/api-standards.yaml`. Open each `source` and
   re-read the clause: the `rule` sentence is a summary, the standard is the authority. Check `house`
   as well; its docs page is the authority for it.
4. Name the existing guard and move on for anything already guarded mechanically. Here:
    - Spectral `shared/contracts/spectral.yaml` (security on every operation, no `nullable`, errors are
      `application/problem+json`, the 2xx body is an object, replace is PUT and update is PATCH,
      operationId shape, schema names, camelCase parameters, `maxLength`, `names-in-us-english-*`)
    - `tests/cross-cutting/request-headers-conformance.test.ts`
    - `tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts`: the syntax every
      `buildRateLimiter` budget writes (named items, `q`/`w`/`r`/`t`, no `pk`, no `X-RateLimit-*`,
      stacked budgets all shown, a skipped limiter adds nothing, its own 429 names it with `r=0`). It
      does not see budgets charged by hand (`chargeBudget`, `mail-recipient`'s doors), cooldowns or
      the 2FA lock.
    - `tests/cross-cutting/rate-limit-budgets.test.ts`: the budget set (unique names, env vars and
      namespaces, one declaration each, only the global brake passes a store outage).
    - `scripts/contracts/response-headers.ts` (declares both fields on every response)
      A guarded rule gets one line ("guarded by X") and no verdict hunt.
5. If this audit is part of a run of several, the USER gives the order of precedence first
   ("RFC 9110 > Google AIP > Zalando"). Ask for it if you were not given one. Never pick it.

## Steps

0. FIRST open the draft (`https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/`) and
   write down its number and date. The registry says draft-11 (expires 2026-11-24) when it was
   written; the latest draft wins.
1. List the operations in scope from the bundle.
2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it. Start where the gaps were:
    - `grep -rnE '\b429\b' src`: every 429 goes through `generateRateLimited`, not
      `generateReject(429`. Hand-made ones: `chargeBudget` callers, `resendTooSoon`, `rejectLocked`,
      `refuseRateLimited`.
    - On a 429, `t` equals `Retry-After`.
    - Every budget with `escalation`: check `w` and `t` against the escalated wait.
    - What a public-cacheable response carries: advisory fields only, no `pk`; the draft's §7.3
      caching line is in the docs.
3. A doc that contradicts the code: say which side is wrong, and cite the section.
4. A finding a rule could catch mechanically: verdict `LINT-CANDIDATE` with the JSONPath. It is
   REPORTED only, never turned into a Spectral rule.

## Verdicts

| Verdict            | Means                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `VIOLATION`        | the API contradicts the standard, and no theory row named by the rule says why        |
| `KNOWN-DIFFERENCE` | it differs, and the theory row the rule's `difference` names says why; still reported |
| `LINT-CANDIDATE`   | mechanical: REPORTED only, never turned into a Spectral rule, with the JSONPath       |
| `SATISFIED`        | checked, and it holds                                                                 |
| `NOT-APPLICABLE`   | the rule does not touch this scope; one line saying what you checked                  |

A missed `house` clause is a `VIOLATION` with `section` = `house`; the evidence cites the docs page and
the fix side is `code`, `contract` or `docs` (withdraw the promise), never `standard`. A MAY in `rule`
never yields a `VIOLATION`.

A difference explained only on another page, or by a theory row the rule does not name, is still a
`VIOLATION`: fix side `docs`, the evidence cites that page, and the fix is a theory row linking to it,
named in the rule's `difference`.

## Output

Write `tmp/reports/audit-<run>/api-ratelimit-headers/<SCOPE>.md`: the bundle's mtime, the scope, then a table of

| # | rule id | operation | verdict | evidence (file:line) | section | fix side |

**One row per cause.** Same rule, same verdict, same cause: one row. The cause is the one place the
fix lands: a code path, a schema, a theory row.

- `operation`: the members and their count. List them, or give the selector that finds them (a
  JSONPath over the bundle, a mount line), so a reader can re-run it.
- `evidence`: the cause, why every member reaches it (the mount, the `$ref`), and the grep that found
  no member overriding it.
- Split the row the moment one member differs: its own override, a bypass, another verdict.
- `NOT-APPLICABLE`: one row per rule, naming the JSONPath checked and the count.
- Under the table, one totals line per rule: its rows' counts add up to the operations in scope.
- A `whole-repo` run adds an appendix: every operation, one column per rule, each cell the `#` of the
  row that judged it.

`fix side` is `contract`, `code`, `docs` or `standard` (the standard is the one that fits worse).
Then list the `VIOLATION` and `LINT-CANDIDATE` rows again, worst first, by impact. On a tie: MUST,
then house, then SHOULD. A row is one rule, one side (a standard clause or `house`), one verdict and
one cause; the per-rule totals give house apart (`VIOLATION 4 (house 3)`).

No citation, no finding: an absence claim names the grep that found
nothing. Three real violations over thirty maybes. The report is disposable; see
`docs/tools/ai-auditing.md`.

### Outside the rules

One line per finding no rule judges: a clause of the standard no rule covers, or a doc, contract or
code text found on the way that disagrees with another. Each line: what, file:line, fix side
(`contract`, `code`, `docs`, or `registry` = a clause that needs a rule). A finding that belongs to
another standard's audit names that audit. No verdict, and not in the per-rule totals. Write "None."
when empty.

### Superseded by a higher standard

Required. `| rule id | yields to (standard · clause) | theory row | why |`, no verdict column. If
empty, write "none: no precedence given" or "none: no higher standard in the given precedence
overrides a rule of this one".
