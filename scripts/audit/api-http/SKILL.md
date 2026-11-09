---
name: api-http
description: Audit this API's contract, handlers and docs against the eight HTTP web standards (RFC 9110, 9111, 9457, 5789, 7396, 6585 and the RateLimit and Idempotency-Key drafts), reported only
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: HTTP reviewer: Spectral and the tests proved the shape, you judge the meaning against the
web's own rules.

GOAL: For every rule in `scripts/audit/api-standards.yaml` whose `standard` is one of the eight below,
give every operation in scope one verdict per rule, each with a citation. Operations that share a
verdict and its cause share one row (see Output). It reports against these standards ONLY, plus the
`house` clauses the registry pins to their rules. The style guides (Zalando, Google AIP) are
`api-style`'s business, never this audit's.

The eight are written to fit together; they do not contradict each other. Two places overlap, and
each is one finding, not two:

- a 304: `rfc9110-conditional-requests` and `rfc9111-validators-and-304`
- a 429: `rfc6585-429-retry-after` and `ratelimit-declared-in-contract`

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo`
(`scripts/audit/RULES.md` rule 5). Empty means `whole-repo`: the **whole contract**. A difference
from a standard is rarely introduced by the change that happens to surface it.

## Errors: RFC 9457 unless the API chose Google's

Every rule below applies by default. One exception: if the API's errors are `google.rpc.Status`
(`code`, `message`, `details`) and not `application/problem+json`, ask the user: "Errors follow
Google AIP, not RFC 9457. Skip the RFC 9457 rules?" On a yes, the four `rfc9457-*` rules get one
`NOT-APPLICABLE` row each: "errors follow Google AIP, judged by `api-style`". Not answered: judge
them.

## The four parts

| Part | Theme                    | Standards and rules                                           |
| ---- | ------------------------ | ------------------------------------------------------------- |
| A    | Methods and status codes | `rfc9110` (all but `rfc9110-conditional-requests`), `rfc6585` |
| B    | Caching and conditions   | `rfc9111`, plus `rfc9110-conditional-requests`                |
| C    | Writes                   | `rfc5789`, `rfc7396`, `idempotency-key`                       |
| D    | Errors and limits        | `rfc9457`, `ratelimit-headers`                                |

- A module, a path or `--diff`: one pass, all four parts, by you.
- `whole-repo`: one helper agent per part, in parallel. 260-odd operations times every rule is
  more than one pass judges reliably. Give each helper this file, its part letter, the run folder
  and RULES.md rules 1, 2 and 7. Each writes `whole-repo.part-<A|B|C|D>.md`; you merge them into
  `whole-repo.md` (see Output).

## Naming the scope

Output goes to `tmp/reports/audit-<run>/api-http/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Before you start

1. Read the root `openapi.yaml` (the bundle) and state its mtime in the report. Do NOT bundle it:
   the audit reads what a client reads. If it is missing, stop and say so.
2. Read the "Where we differ, and why" section of `docs/theory/api-standards.md`. A rule whose
   `difference` names a row there gets the verdict `KNOWN-DIFFERENCE` when the difference is what
   you found, with the row `id`.
3. Read the rules of your part(s) in `scripts/audit/api-standards.yaml`. Open each `source` and
   re-read the clause: the `rule` sentence is a summary, the standard is the authority. Check `house`
   as well; its docs page is the authority for it.
4. The two drafts move. Part C opens
   `https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/` and part D opens
   `https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/`; each writes down the
   draft's number, date and state (Internet-Draft or RFC). The latest draft wins over the registry,
   and its state says how much weight to give it against practice.
5. Name the existing guard and move on for anything already guarded mechanically. Name each guard by
   file and function or test title, never by line. A guarded rule gets one line ("guarded by X") and
   no verdict hunt.
    - Every part: Spectral `shared/contracts/spectral.yaml` (security on every operation, no
      `nullable`, errors are `application/problem+json` with `x-not-problem` as the declared opt-out,
      the 2xx body is an object, replace is PUT and update is PATCH, operationId shape, schema names,
      camelCase parameters, `maxLength`, `names-in-us-english-*`), `tests/fuzz/endpoints.fuzz.test.ts`.
    - Part A:
        - a 201 carries its `Location`: indirectly, `requiredResponseHeaders` in
          `tests/support/spec-walk.ts`, read by the shared `afterEach` in
          `tests/support/response-contract.ts`; directly, `write-methods.test.ts`, the
          `a 201 names the new resource in Location` block
        - 405 `Allow`: `methodNotAllowed` and its unit test. 401 `WWW-Authenticate` and 503
          `Retry-After`: `rejectResponse` in `response.ts` and its tests
        - `tests/cross-cutting/api-standards.test.ts`, `tests/contract/route-spec-parity.test.ts`
        - `tests/cross-cutting/rate-limit-budgets.test.ts`,
          `tests/cross-cutting/rate-limit-keys-conformance.test.ts`
        - `tests/integration/conditional-writes.test.ts` (428 and 412)
    - Part B:
        - a bundler step (`scripts/contracts/openapi-bundle.ts`) adds `ETag`, `If-Match`, 412 and 304;
          `tests/integration/conditional-writes.test.ts`
        - `tests/cross-cutting/cache-policy-declared.test.ts`: each module's `x-cache` GETs (except
          `no-store`, declared only) equal the routes that mount `setCache`/`privateNoCache`, and
          every value is a known spelling. It does not see the root contract (`/config`, covered by
          the contract test in `tests/contract/write-methods.test.ts`), reads left on the app
          default, or whether a declared 304 is really sent.
        - `cache.test.ts` and the cookie-mode integration tests guard the `setCache` branch of
          `rfc9111-personal-is-private` only: check `noStore` routes, inline `Cache-Control` writers
          and cookies set after `setCache` by hand.
        - `tests/cross-cutting/security-headers-conformance.test.ts`: only that every answer varies
          on `Origin`, the CORS half of `rfc9111-read-declares-cache`. Nothing on `Cache-Control`,
          nor on `Authorization`, `Accept-Language` or `Cookie` in `Vary`.
    - Part C:
        - `tests/cross-cutting/replace-patch-parity.test.ts`, `tests/contract/request-contract.test.ts`
          (merge-patch and `null` payloads from the contract), `tests/contract/request-sources.test.ts`
        - `tests/contract/write-methods.test.ts` and `tests/integration/bad-bodies.test.ts` (the 415
          on an undeclared type); `scripts/contracts/generate-request-content-types.ts` (the declared
          request media types) and the 415 guard `src/infrastructure/http/middlewares/content-type.ts`
        - `tests/cross-cutting/contract-responses-never-null.test.ts` (a response never carries null;
          a request may)
        - `tests/contract/idempotency.test.ts` (the middleware's own behaviour, and the test "replays
          a refusal as the problem it was…", the proof that a replay carries the header);
          `scripts/contracts/response-headers.ts` declares `Idempotent-Replayed` on 2xx only, so
          non-2xx is still yours to check
    - Part D:
        - `tests/cross-cutting/contract-error-declarations.test.ts` (every code is in `x-error-codes`)
        - `tests/cross-cutting/request-headers-conformance.test.ts` and
          `tests/cross-cutting/rate-limit-budgets.test.ts`
        - `scripts/contracts/response-headers.ts` (declares both RateLimit fields on every response)

## Steps

1. List the operations in scope from the bundle, by part:
    - Part A:
        - `rfc9110-get-safe`: every GET (a plain read is judged once, at its shared surface)
        - `rfc9110-delete-no-body`: every DELETE
        - `rfc9110-created-means-created`: every POST answering 200 or 201
        - `rfc6585-*`: start from `src/infrastructure/http/middlewares/rate-limit.ts` and
          `src/infrastructure/http/preconditions.ts`, then grep for each of 428, 429, 431, 511
    - Part B: start from `src/infrastructure/http/middlewares/cache.ts` and
      `docs/theory/defences/http-and-caches.md`, then walk the GETs. `rfc9110-conditional-requests`:
      every operation on a resource that sends an `ETag` (reads for `If-None-Match`, writes for
      `If-Match`)
    - Part C:
        - `rfc5789-*`: every `patch` operation; read each handler and its service. The body parsers:
          `JSON_BODY_TYPES` (`src/infrastructure/http/middlewares/json-depth.ts`, mounted in
          `src/app/security.ts`), and `upload.image()` in the module's `routes.ts` on a multipart PATCH
        - `rfc7396-*`: the `patch` operations that declare `application/merge-patch+json`; read the
          service of each
        - `idempotency-key-*`: every POST or PATCH that moves money, stock or an account. The house
          rule is a MINIMUM (`docs/tools/idempotency.md`, "Named exceptions"): a create with no key
          that no exception names is a finding only if a retry does real harm
    - Part D: grep for every place that answers an error without `rejectResponse` (`res.status(4`,
      `res.status(5`, `.sendStatus(`, `.json({ error`), then compare with the `x-not-problem`
      operations. For the RateLimit fields, start from `rate-limit.ts` and `response.ts`.
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

Write `tmp/reports/audit-<run>/api-http/<SCOPE>.md`: the bundle's mtime, the scope, whether the
RFC 9457 rules ran, the draft numbers from step 4, then one section per part, each with a table of

| # | rule id | operation | verdict | evidence (file:line) | section | fix side |

**One row per cause.** Same rule, same verdict, same cause: one row. The cause is the one place the
fix lands: a code path, a schema, a theory row. Where the two overlaps above meet one cause, one row
names both rule ids.

- `operation`: the members and their count. List them, or give the selector that finds them (a
  JSONPath over the bundle, a mount line), so a reader can re-run it.
- `evidence`: the cause, why every member reaches it (the mount, the `$ref`), and the grep that found
  no member overriding it.
- Split the row the moment one member differs: its own override, a bypass, another verdict.
- `NOT-APPLICABLE`: one row per rule, naming the JSONPath checked and the count.
- Under each table, one totals line per rule: its rows' counts add up to the operations in scope (or
  the declared sample, where a step allows one).
- A `whole-repo` run adds an appendix: every operation, one column per rule, each cell the `#` of the
  row that judged it.

`fix side` is `contract`, `code`, `docs` or `standard` (the standard is the one that fits worse).

After the parts, one list for the whole report: the `VIOLATION` and `LINT-CANDIDATE` rows again,
worst first, by impact. On a tie: MUST, then house, then SHOULD. A row is one rule, one side (a
standard clause or `house`), one verdict and one cause; the per-rule totals give house apart
(`VIOLATION 4 (house 3)`).

Merging a `whole-repo` run: keep each part's section as written, number the rows `A1`, `B1`…, join
a 429 found in both A and D into one row, and write the one worst-first list. Keep the part files.

No citation, no finding: an absence claim names the grep that found
nothing. Three real violations over thirty maybes. The report is disposable; see
`docs/tools/ai-auditing.md`.
