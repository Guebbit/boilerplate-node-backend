---
name: api-style
description: Audit this API's contract, handlers and docs against one style guide, Zalando unless the API clearly leans Google AIP, reported only
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Guideline reviewer: you read the API against ONE style guide's rules, and you do not decide.

GOAL: Pick the guide (see "Which guide"). For every rule in `scripts/audit/api-standards.yaml`
whose `standard` is that guide, give every operation in scope one verdict per rule, each with a
citation. Operations that share a verdict and its cause share one row
(see Output). The audit judges where names, enums, paging, methods, money and errors differ from the
guide, and whether each difference is written down.
It reports against the chosen guide, plus the `house` clauses the registry pins to its rules.

The other guide is never read, judged or named in the report. The API took one road; the road it
did not take is not a finding.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo`
(`scripts/audit/RULES.md` rule 5). Empty means `whole-repo`: the **whole contract**. A difference
from a standard is rarely introduced by the change that happens to surface it.

## Which guide

Zalando, unless the API clearly leans Google. Nobody has to tell you; you look.

Google signals, read off the bundle:

- errors are `google.rpc.Status`-shaped (`code`, `message`, `details`), not `application/problem+json`
- custom methods as `:verb` paths (`POST /things/{id}:archive`)
- paging by `page_token` / `next_page_token`
- partial updates with a field mask (`update_mask`)

`camelCase` names alone are NOT a lean: plenty of non-Google APIs use them.

- Zero or one signal: Zalando. Say so in one line, with the signals you checked.
- Two or more: STOP and ask the user, naming the signals found: "This API leans Google AIP. Audit
  against Google AIP instead of Zalando?" Go on with their answer. Not answered: Zalando.

Write the guide and why at the top of the report. `api-http` checks the first signal on its own,
since it decides whether the RFC 9457 rules run.

## The web rules come first

The eight HTTP standards (`api-http`) outrank the style guide. A guide rule, or half of one, that a
web rule already decides is not judged here: it is listed once under **Decided by the web rules**.
Example: AIP-216's 400 for a refused state change, where RFC 9110 defines 409.

No exception: the error format is never judged here, under either guide. `api-http` owns it
(RFC 9457 first); its own question decides whether its RFC 9457 rules are skipped.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/api-style/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Before you start

1. Read the root `openapi.yaml` (the bundle) and state its mtime in the report. Do NOT bundle it:
   the audit reads what a client reads. If it is missing, stop and say so.
2. Read the "Where we differ, and why" section of `docs/theory/api-standards.md`. A rule whose
   `difference` names a row there gets the verdict `KNOWN-DIFFERENCE` when the difference is what
   you found, with the row `id`.
3. Read the chosen guide's rules in `scripts/audit/api-standards.yaml`. Open each `source` and
   re-read the clause: the `rule` sentence is a summary, the guide is the authority. Check `house`
   as well; its docs page is the authority for it.
    - Zalando: the text is `https://opensource.zalando.com/restful-api-guidelines/`; the registry's
      `section` number is the anchor (`#173`).
    - Google AIP: `https://google.aip.dev/<number>`.
4. Name the existing guard and move on for anything already guarded mechanically. Name each guard by
   file and function or test title, never by line. A guarded rule gets one line ("guarded by X") and
   no verdict hunt.
    - Spectral `shared/contracts/spectral.yaml` (security on every operation, no `nullable`, errors are
      `application/problem+json`, the 2xx body is an object, replace is PUT and update is PATCH,
      operationId shape, schema names, camelCase parameters, `maxLength`, `names-in-us-english-*`,
      the last also AIP-190)
    - `tests/cross-cutting/paginated-sort-is-total.test.ts`, `tests/contract/unknown-query-params.test.ts`

## Steps

1. List the operations in scope from the bundle.
2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it.
    - `zalando-money`: scan every amount in each response, starting from the `DecimalAmount` and
      `NonNegativeDecimalAmount` schemas. Each one needs a `currency` on its own object or on an
      ancestor in the same answer. Name the scan. A miss is a `VIOLATION` with fix side `contract`,
      not a `LINT-CANDIDATE`: the rule is `lint: no`. Responses only: a request amount takes the
      target's currency.
    - Google AIP: most differences are already rows on the theory page. A hit on one is
      `KNOWN-DIFFERENCE`, not a violation.
3. A doc that contradicts the code: say which side is wrong, and cite the section.
4. A finding a rule could catch mechanically: verdict `LINT-CANDIDATE` with the JSONPath. It is
   REPORTED only, never turned into a Spectral rule.

## Verdicts

| Verdict            | Means                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `VIOLATION`        | the API contradicts the guide, and no theory row named by the rule says why           |
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

Write `tmp/reports/audit-<run>/api-style/<SCOPE>.md`: the bundle's mtime, the scope, the guide
and the signals that picked it, then a table of

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

### Decided by the web rules

One row per guide rule (or half of one) a web rule decides:
`| rule id | decided by (standard · clause) | theory row | why |`, no verdict column. None: write
"none".
