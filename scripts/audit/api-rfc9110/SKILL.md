---
name: api-rfc9110
description: Audit this API's contract, handlers and docs against RFC 9110 HTTP semantics, reported only
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: HTTP-semantics reviewer: Spectral and the tests proved the shape, you judge the meaning.

GOAL: For every rule in `scripts/audit/api-standards.yaml` whose `standard` is `rfc9110`, give every
operation in scope one verdict per rule, each with a citation. Operations that share a verdict and its
cause share one row (see Output). The audit judges whether each operation's MEANING fits the method and the status codes it uses.
It reports against RFC 9110 HTTP semantics, plus the `house` clauses the registry pins to its rules.
When a precedence is given, a rule a higher standard overrides is listed once under **Superseded by a
higher standard**, not judged.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5). Empty means
`whole-repo`: the **whole contract**. A difference from a standard is rarely introduced by the change
that happens to surface it.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/api-rfc9110/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
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
4. Name the existing guard and move on for anything already guarded mechanically. Name each guard by
   file and function or test title, never by line. Here:
    - Spectral `shared/contracts/spectral.yaml` (security on every operation, no `nullable`, errors are
      `application/problem+json`, the 2xx body is an object, replace is PUT and update is PATCH,
      operationId shape, schema names, camelCase parameters, `maxLength`, `names-in-us-english-*`)
    - a bundler step (`scripts/contracts/openapi-bundle.ts`) adds `ETag`, `If-Match`, 412 and 304
    - `scripts/contracts/response-headers.ts` declares `Idempotent-Replayed` on 2xx only
    - a 201 carries its `Location` (indirectly, `requiredResponseHeaders` in `tests/support/spec-walk.ts`, read by the shared `afterEach` in `tests/support/response-contract.ts`; directly, `write-methods.test.ts`, the `a 201 names the new resource in Location` block)
    - 405 `Allow`: `methodNotAllowed` and its unit test. 401 `WWW-Authenticate` and 503 `Retry-After`: `rejectResponse` in `response.ts` and its tests
    - `tests/cross-cutting/api-standards.test.ts`, `tests/contract/route-spec-parity.test.ts`, `tests/integration/conditional-writes.test.ts`, `tests/fuzz/endpoints.fuzz.test.ts`
      A guarded rule gets one line ("guarded by X") and no verdict hunt.
5. If this audit is part of a run of several, the USER gives the order of precedence first
   ("RFC 9110 > Google AIP > Zalando"). Ask for it if you were not given one. Never pick it.

## Steps

1. List the operations in scope from the bundle, by rule:
    - `rfc9110-get-safe`: every GET (a plain read is judged once, at its shared surface)
    - `rfc9110-delete-no-body`: every DELETE
    - `rfc9110-created-means-created`: every POST answering 200 or 201
    - `rfc9110-conditional-requests`: every operation on a resource that sends an `ETag` (reads for
      `If-None-Match`, writes for `If-Match`)

    A sample module is enough when the scope is large, but SAY which and why.

2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it.
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

Write `tmp/reports/audit-<run>/api-rfc9110/<SCOPE>.md`: the bundle's mtime, the scope, then a table of

| # | rule id | operation | verdict | evidence (file:line) | section | fix side |

**One row per cause.** Same rule, same verdict, same cause: one row. The cause is the one place the
fix lands: a code path, a schema, a theory row.

- `operation`: the members and their count. List them, or give the selector that finds them (a
  JSONPath over the bundle, a mount line), so a reader can re-run it.
- `evidence`: the cause, why every member reaches it (the mount, the `$ref`), and the grep that found
  no member overriding it.
- Split the row the moment one member differs: its own override, a bypass, another verdict.
- `NOT-APPLICABLE`: one row per rule, naming the JSONPath checked and the count.
- Under the table, one totals line per rule: its rows' counts add up to the operations in scope (or the declared sample, where step 1 allows one).
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
