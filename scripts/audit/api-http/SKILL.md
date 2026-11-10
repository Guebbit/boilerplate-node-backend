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
- a 429: `rfc6585-429-retry-after` and `ratelimit-server-behavior`

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
        - `tests/cross-cutting/replace-patch-parity.test.ts`, `tests/contract/request-sources.test.ts`
        - `tests/contract/request-contract.test.ts`, the cases "… accepts null for the nullable …":
          every top-level body field whose type lists `'null'` is ACCEPTED (no 415/422, no 5xx) under
          each declared media type. Not a guard for what `null` then does, for `null` refused on a
          field that may not be cleared, or for `null` inside a nested map: `rfc7396-null-deletes` is
          still hunted.
        - `tests/contract/write-methods.test.ts` and `tests/integration/bad-bodies.test.ts` (the 415
          on an undeclared type); `scripts/contracts/generate-request-content-types.ts` (the declared
          request media types) and the 415 guard `src/infrastructure/http/middlewares/content-type.ts`
        - `tests/cross-cutting/contract-responses-never-null.test.ts` (a response never carries null;
          a request may)
        - `tests/contract/idempotency.test.ts` (the middleware's own behaviour, and the test "replays
          a refusal as the problem it was…", the proof that a replay carries the header);
          `scripts/contracts/response-headers.ts` declares `Idempotent-Replayed` on every response of
          a keyed operation except a 429, which the ledger never sees; a stored answer replays no
          `Retry-After`. The 429 half is held by
          `tests/cross-cutting/limiters-before-the-idempotency-key.test.ts` (every limiter runs
          before the key is claimed, so no 429 is ever stored)
        - Settled by reading, not a guard: a top-level body that is not an object (RFC 7396 §2: it
          would replace the whole resource; §5 lets the server refuse it). `express.json` (strict,
          `src/app/security.ts`) refuses a scalar or `null` as 400 `entity.parse.failed`; an array
          reaches the route's generated Zod object or record schema and is a 422. Re-check only if a
          route parses its own body or the parser loses `strict`. No rule, no row.
    - Part D:
        - Spectral: a 4xx/5xx that declares content declares only `application/problem+json`
          (`x-not-problem` is the opt-out). Spectral sees only responses that declare `content`: a
          bodiless 4xx/5xx is not seen
        - `tests/support/response-contract.ts`: every Jest error answer with a JSON body is
          `application/problem+json` and matches its schema; no code check
        - `tests/cross-cutting/contract-error-declarations.test.ts`: a path id implies a declared 404
        - `tests/fuzz/endpoints.fuzz.test.ts`: never a 5xx, every status documented (statuses, not
          codes)
        - `tests/cross-cutting/request-headers-conformance.test.ts`
        - `tests/unit/infrastructure/http/middlewares/rate-limit-build.test.ts`: the syntax every
          `buildRateLimiter` budget writes (named items, `q`/`w`/`r`/`t`, no `pk`, no `X-RateLimit-*`,
          stacked budgets all shown, a skipped limiter adds nothing, its own 429 names it with
          `r=0`). It does not see budgets charged by hand (`chargeBudget`, `mail-recipient`'s doors),
          cooldowns or the 2FA lock
        - `tests/cross-cutting/rate-limit-budgets.test.ts`: the budget set (unique names, env vars and
          namespaces, one declaration each, only the global brake passes a store outage)
        - `scripts/contracts/response-headers.ts` (declares both RateLimit fields on every response)
        - A 429 and the idempotency ledger: `scripts/contracts/response-headers.ts` declares
          `Idempotent-Replayed` on every response of a keyed operation except a 429, which the ledger
          never sees; a stored answer replays no `Retry-After`. Held by
          `tests/cross-cutting/limiters-before-the-idempotency-key.test.ts`

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
    - Part D:
        - Find every answer not built by `rejectResponse` (`src/infrastructure/http/response.ts`):
          grep `\.(status|sendStatus|writeHead)\(|\.statusCode\s*=[^=]` over `src/**/*.ts`, tests
          excluded, minus `response.ts`; judge each hit by hand (a computed status like `/readyz`, an
          untyped `.send(` like the metrics 500). Compare the hits with the responses marked
          `x-not-problem`.
        - Check `src/app/` for a `clientError` listener; without one, Node answers 400/408/413/431
          itself with no body.
        - Sweep the no-`scope` catalogue codes listed on no operation; for a guard-made code
          (`deniedCode`, `stepUp`, `requireFreshAuth*`), check every mount of that guard.
        - For the RateLimit fields, start from `rate-limit.ts` and `response.ts`.
2. For each rule, check three sources and reach ONE verdict: the contract (the operation, its
   responses, its headers), the handler (controller, then service, never only the route), and the
   docs page that describes it.
    - `rfc7396-null-deletes`: a body whose schema is generic (the translations door's `string|null`
      fields, which serve every registered entity) is judged per registered entity: against the rules
      that entity hands `locales` (its `translatables` entry in `module.ts`, typed by
      `TranslatableTarget`), not against the door's schema. Name the entities checked.
    - Part D, start where the gaps were: `grep -rnE '\b429\b' src`: every 429 goes through
      `generateRateLimited`, not `generateReject(429`; hand-made ones are `chargeBudget` callers,
      `resendTooSoon`, `rejectLocked`, `refuseRateLimited`. On a 429, `t` equals `Retry-After`. Every
      budget with `escalation`: check `w` and `t` against the escalated wait. What a public-cacheable
      response carries: advisory fields only, no `pk`; the draft's §7.3 caching line is in the docs.
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

### Outside the rules

One line per finding no rule judges: a clause of the standard no rule covers, or a doc, contract or
code text found on the way that disagrees with another. Each line: what, file:line, fix side
(`contract`, `code`, `docs`, or `registry` = a clause that needs a rule). A finding that belongs to
`api-style` or another audit names that audit. No verdict, and not in the per-rule totals. Write
"None." when empty.

### Superseded by a higher standard

Required. `| rule id | yields to (standard · clause) | theory row | why |`, no verdict column. The web
rules rank above the style guides, so a style guide never supersedes one. Write "none: no higher
standard in the given precedence overrides a rule of this one", or the rows the user's precedence
produces.
