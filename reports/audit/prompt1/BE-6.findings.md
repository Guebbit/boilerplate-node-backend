# BE-6 findings — Authorization & caller scoping

## Provenance note (shared working tree — commit landed under another batch's name)

`reports/audit/prompt1/BE-6.expectations.md` was written and staged (`git add -f`) BEFORE any
file under `src/` or any test file was opened, exactly as the procedure requires. Two direct
commit attempts (`git commit reports/audit/prompt1/BE-6.expectations.md -m "audit(prompt1):
freeze BE-6 expectations"`) failed on the repo's pre-commit hook (`npm run complete` → `eslint
--max-warnings 0`), which was finding two pre-existing lint errors in
`src/modules/account/tests/integration/addresses.test.ts` — a file this batch never opened or
edited, left mid-edit at the time by a concurrent audit session (BE-3) sharing this working tree
and git index. Per the hard rules, that file was not touched and the hook was not bypassed
(`--no-verify`).

That concurrent session finished its own fix-and-commit cycle and ran `git commit` while my
`BE-6.expectations.md` was still sitting staged in the shared index from my earlier `git add -f`.
Its commit swept my file in alongside its own:

```
commit d5703d48 "audit(prompt1): freeze BE-3 expectations"  (2026-09-01 02:56:43)
 reports/audit/prompt1/BE-3.expectations.md | 137 ++++++
 reports/audit/prompt1/BE-6.expectations.md | 182 ++++++
```

The file's *content* is exactly what was written and staged before any `src/` or test file was
opened for this batch (verified via `git show d5703d48:reports/audit/prompt1/BE-6.expectations.md`
matches the working copy byte-for-byte, and it has never been edited since) — the evidentiary
purpose of "commit before reading code" is satisfied. What's wrong is only the label: the commit
message says BE-3, not BE-6, and it bundles both batches' files. Per the hard rules ("never
amend"), that commit is left as-is rather than rewritten. This note is the correction: the
freeze commit for BE-6 exists at `d5703d48`, timestamped before this batch's step 3 began.

## Self-corrections to the frozen expectations (recorded here, file left untouched)

- **E16 was based on a truncated grep read.** Re-reading `src/modules/orders/openapi.yaml:45-69`
  in full during step 3 shows `createOrder` DOES list `403` in its responses
  (`orders/openapi.yaml:65`). My own note in E16 ("createOrder responses do NOT list 403") was
  wrong — an artifact of a `grep -B8 -A4` context window that cut off before reaching the 401/403
  lines. Corrected reading: `createOrder`, `updateOrder`/`deleteOrder` (body-id aliases),
  `updateOrderById`, `deleteOrderById` and `hardDeleteOrderById` all carry `403`; only
  `listOrders`/`searchOrders` (scoped by silent narrowing) and `cancelOrderById`/`getOrderInvoice`
  (scoped by ownership → 404) do not. This does not change any verdict below — `createOrder` is
  admin-gated in code (`isAdmin` on `POST /orders`) exactly as the corrected spec reading says.
- **Locales and users' non-order/payment/cart modules were under-frozen in step 2.** The frozen
  E-list did not give locales' write endpoints their own expectation numbers (E1-E28 focus on
  account/cart/delivery/feedback/inventory/orders/payments/products/users/wishlist at the
  per-operation level, but locales was only surveyed for the TIER1/TIER2 comment block, not for
  its `403` responses). Tier A text for locales exists and is unambiguous
  (`src/modules/locales/openapi.yaml`: `403` present on `createLocale`:103, `updateLocale`:189,
  `deleteLocale`:210, `listLocaleEntries`:282, `createLocaleEntry`:312, `replaceLocaleEntries`:350,
  `mergeLocaleEntries`:383, `updateLocaleEntry`:421, `deleteLocaleEntry`:438 — every locales write
  is admin-gated, nothing else). Cited directly below as **L1**, flagged as a step-2 coverage gap
  rather than smuggled into the frozen file.

## Files read, in order

1. `src/kernel/authorization.ts` (implementation: `createOwnerScope`/`createVisibilityScope`)
2. `src/kernel/middlewares/authorizations.ts` (implementation: `getAuth`/`isAuth`/`isAdmin`/`isAdminViaCookie`)
3. `src/modules/orders/repository.ts` (`ownerScope`/`visibleScope`, referenced from #1's usage)
4. `src/modules/orders/service.ts` (`callerScope = createOwnerScope(...)`, `cancelById`, `withActions`, `actorOf`)
5. `src/modules/orders/routes.ts`
6. `src/modules/orders/controllers/get-order-item.ts`
7. `src/modules/orders/controllers/post-cancel-order.ts`
8. `src/modules/orders/tests/unit/service-scope.test.ts` (in scope)
9. `tests/unit/kernel/authorization.test.ts` (in scope)
10. `tests/unit/kernel/authorizations.test.ts` (in scope)
11. `tests/cross-cutting/write-routes-are-guarded.test.ts` (in scope)
12. `src/modules/account/routes.ts`
13. `src/modules/cart/routes.ts`
14. `src/modules/delivery/routes.ts`
15. `src/modules/feedback/routes.ts`
16. `src/modules/inventory/routes.ts`
17. `src/modules/locales/routes.ts`
18. `src/modules/payments/routes.ts`
19. `src/modules/products/routes.ts`
20. `src/modules/users/routes.ts`
21. `src/modules/wishlist/routes.ts`
22. `tests/cross-cutting/authenticated-controllers.test.ts` (in scope)

Only `src/modules/orders/tests/unit/service-scope.test.ts` matched the glob
`src/modules/*/tests/unit/service-scope.test.ts` — no other of the 12 routed modules has one.

## Scope resolution

```
tests/unit/kernel/authorization.test.ts
tests/unit/kernel/authorizations.test.ts
tests/cross-cutting/authenticated-controllers.test.ts
tests/cross-cutting/write-routes-are-guarded.test.ts
src/modules/orders/tests/unit/service-scope.test.ts
```

## Findings table

Legend for the `exp.` column: `E#` = frozen BE-6.expectations.md; `L1` = locales Tier A citation
found in step 3, not pre-frozen (see coverage-gap note above); `Summary rule` = the frozen
document's closing "admin unrestricted / everyone else narrowed" principle, cited where no
specific E# applies but the frozen document still states the rule generically.

### `src/modules/orders/tests/unit/service-scope.test.ts` (9 tests)

| test name | exp. | spec-derived expectation | actual assertion | verdict | sev | why |
|---|---|---|---|---|---|---|
| returns undefined for an admin, so the caller applies no restriction | E13/E17 | admin sees all orders (list/cancel say so) | `callerScope({admin:true})` → `undefined` | OK | — | matches admin-unrestricted rule |
| restricts a non-admin to their own userId | E13 | non-admin auto-scoped to own orders | scope `=== {userId, deletedAt:{$exists:false}}` | OK | — | matches own-orders scoping |
| hides soft-deleted orders from their own owner | SPEC-SILENT | Tier A never mentions soft-delete visibility | asserts `deletedAt:{$exists:false}` | SPEC-SILENT | S3 | real, undocumented-in-spec behavior |
| lets an admin see soft-deleted orders, by restricting nothing | E13/E17 | admin unrestricted | `callerScope({admin:true})` → `undefined` | OK | — | duplicate of admin-unrestricted; label is soft-delete-specific but assertion is generic |
| restricts a caller whose admin flag is absent entirely | SPEC-SILENT | Tier A never discusses a missing `admin` field | absent flag treated as non-admin, scoped | SPEC-SILENT | S1 | fail-safe default; sensible, not spec-mandated |
| emits a BSON ObjectId rather than a string | SPEC-SILENT | Tier A never discusses internal DB representation | `scope.userId instanceof ObjectId` | SPEC-SILENT | S3 | pure implementation-correctness, no API surface |
| throws when there is no auth context at all | SPEC-SILENT | Tier A never states this fail-closed behavior | `callerScope(undefined)` throws | SPEC-SILENT | S1 | the fail-closed invariant kernel/authorization.ts documents (Tier C); real and load-bearing, but not stated in any openapi.yaml |
| throws when the auth context carries no id | SPEC-SILENT | same | `callerScope({admin:false})` throws | SPEC-SILENT | S1 | same |
| throws on a malformed id instead of scoping to nothing | SPEC-SILENT | same | `callerScope({id:'not-an-object-id'})` throws | SPEC-SILENT | S1 | same; this is the actual data-exposure guard the whole batch exists to check, and it is real, just undocumented at the contract level |

No MISMATCH of any kind in this file — code and test agree, and where they agree it matches the
frozen E13/E17 orders-scoping rule. The rest is real behavior the OpenAPI contract simply never
promises (soft-delete handling, type coercion, fail-closed error paths) — undocumented, not wrong.

### `tests/unit/kernel/authorization.test.ts` (10 tests)

This file tests the two generic combinators (`createOwnerScope`, `createVisibilityScope`) with
stub builders — the mechanism orders/payments (owner-scope) and products/locales
(visibility-scope) are all built from. No Tier A source names this file's functions directly;
verdicts below cite the frozen "Summary rule" section (admin unrestricted / non-admin narrowed)
where the behavior matches the app-wide pattern documented per-operation elsewhere, and
SPEC-SILENT where the assertion is about wiring internals no spec text reaches.

| test name | exp. | spec-derived expectation | actual assertion | verdict | sev | why |
|---|---|---|---|---|---|---|
| createOwnerScope: returns undefined for an admin, meaning no restriction | Summary rule | admin unrestricted (E13/E17/E19/E20) | `toBeUndefined()` | OK | — | matches the shared rule every owner-scoped module states per-operation |
| createOwnerScope: does not consult the scope builder at all for an admin | SPEC-SILENT | not stated anywhere in Tier A | `ownerScopeOf` not called | SPEC-SILENT | S3 | wiring/perf detail |
| createOwnerScope: delegates to the scope builder with the caller's id | Summary rule | non-admin scoped by own id (E13) | `toBe(OWNED)`, called with `'u1'` | OK | — | matches |
| createOwnerScope: treats an absent admin flag as not an admin | SPEC-SILENT | Tier A never addresses a missing flag | non-admin path taken | SPEC-SILENT | S1 | fail-safe default, undocumented at contract level |
| createOwnerScope: passes an empty id to the builder rather than skipping the restriction | SPEC-SILENT | not stated | `ownerScopeOf` called with `''` | SPEC-SILENT | S1 | the fail-closed property itself — real, load-bearing, undocumented in the contract |
| createOwnerScope: propagates the builder throwing on an empty id | SPEC-SILENT | not stated | `toThrow('invalid id')` | SPEC-SILENT | S1 | same fail-closed property, from the combinator side |
| createOwnerScope: builds independent scopes per repository | SPEC-SILENT | not stated | two independent `createOwnerScope` calls stay independent | SPEC-SILENT | S3 | factory-pattern sanity check |
| createVisibilityScope: returns undefined for an admin, meaning no restriction | Summary rule | admin sees all (products/locales pattern, per kernel module doc) | `toBeUndefined()`, builder not called | OK | — | matches the shared rule |
| createVisibilityScope: narrows a guest and a signed-in non-admin identically | Summary rule | products/openapi.yaml:416 ("a non-admin sees a record only when it is active") treats visitor and non-admin alike | `callerScope(undefined) === callerScope({admin:false})` | OK | S2-adjacent | this is the one row here with a real Tier-A-adjacent citation (a YAML comment on the `active` field, not a `description:` block, so weaker than a full E#) |
| createVisibilityScope: never passes the caller to the builder | SPEC-SILENT | not stated | `publicScopeOf` called with no args | SPEC-SILENT | S3 | wiring detail |

### `tests/unit/kernel/authorizations.test.ts` (33 tests)

All of these test the two centrally-enforced HTTP-facing gates (`isAuth` → 401, `isAdmin` →
401/403, `isAdminViaCookie` → 401/403) that every admin-only operation in Tier A documents via its
`401`/`403` response refs (E5, E10, E11, E12, E21, E23, E24, L1, and `observability`'s "Requires
admin role" operations, out of this batch's module-scope test but same central gate). None of
these tests are module-specific; they exercise the shared mechanism with a stub resolver.

| test name | exp. | spec-derived expectation | actual assertion | verdict | sev | why |
|---|---|---|---|---|---|---|
| getTokenBearer: strips the Bearer prefix and returns the token | SPEC-SILENT | not a contract-level concern | returns token substring | SPEC-SILENT | S3 | header-parsing detail |
| getTokenBearer: returns undefined when the header is absent | SPEC-SILENT | — | `undefined` | SPEC-SILENT | S3 | — |
| getTokenBearer: returns undefined when the header has a scheme but no token | SPEC-SILENT | — | `undefined` | SPEC-SILENT | S3 | — |
| getAuth: calls next without an auth context when no token is present | SPEC-SILENT | Tier A never describes `getAuth`'s fail-open behavior directly (it's *why* `security: []` routes work at all) | `next()` called, no context set | SPEC-SILENT | S2 | supports E27 indirectly but is not itself stated |
| getAuth: attaches the identity of the user the token names | Summary rule | every `bearerAuth` operation implies a resolved identity | `authContext` populated from resolver | OK | — | matches |
| getAuth: resolves a missing admin flag to false rather than undefined | SPEC-SILENT | not stated | `admin === false` | SPEC-SILENT | S1 | fail-safe default underlying every admin check |
| getAuth: proceeds anonymously when the token is invalid or expired | SPEC-SILENT | not stated (implementation choice behind `security: []` routes working with a stale cookie) | anonymous continue | SPEC-SILENT | S2 | — |
| getAuth: proceeds anonymously when the token is valid but the user no longer exists | SPEC-SILENT | not stated | anonymous continue | SPEC-SILENT | S1 | deleted-account safety net |
| getAuth: proceeds anonymously when the user lookup itself fails | SPEC-SILENT | not stated | anonymous continue | SPEC-SILENT | S2 | — |
| getAuth: never sends a response of its own | SPEC-SILENT | not stated | no `status`/`json` calls | SPEC-SILENT | S3 | middleware-contract detail |
| isAuth: passes through when both an auth context and a token are present | E1-E26 (every `bearerAuth` op) | bearer-authenticated ops require a resolved caller | `next()` called | OK | — | matches every `security: [bearerAuth]` operation |
| isAuth: rejects with 401 when there is no auth context | E1-E26 | `401 Unauthorized` documented on every `bearerAuth` op | `response.status` 401 | OK | — | matches |
| isAuth: rejects with 401 when a context exists but the bearer token is gone | SPEC-SILENT | Tier A doesn't distinguish this from the case above | 401 | SPEC-SILENT | S3 | defense-in-depth beyond what the contract states |
| isAuth: records an anonymous unauthorized audit event on rejection | SPEC-SILENT | audit trail is not part of the OpenAPI contract | audit event shape asserted | SPEC-SILENT | S3 | — |
| isAuth: records nothing when the request is allowed through | SPEC-SILENT | — | no audit call | SPEC-SILENT | S3 | — |
| isAdmin: passes an admin through | E5/E10/E11/E12/E21/E23/E24/L1 | admin-only ops let an admin through | `next()` called | OK | — | matches |
| isAdmin: rejects an authenticated non-admin with 403 | E5/E10/E11/E12/E21/E23/E24/L1 | admin-only ops document `403 Forbidden` for a non-admin | `response.status` 403 | OK | — | matches |
| isAdmin: rejects a caller whose admin flag is absent | Summary rule | fail-safe: absent ⇒ non-admin ⇒ 403 | 403 | OK | S1 | correct fail-closed default, consistent with the admin-only ops' documented 403 |
| isAdmin: answers 403, not 401, for an unauthenticated caller | E5/E10/E11/E12/E21/E23/E24/L1 | admin-only ops document `401 Unauthorized` for no credentials at all | asserts `response.status` toHaveBeenCalledWith(**401**) | OK (title bug) | S3 | **the test TITLE says "403, not 401" but the assertion checks 401 — the assertion is right (matches spec's documented 401 for "no credentials"), the title is backwards. Flagged as a naming defect, not a logic defect: nobody reading only the title would learn the real, correct behavior.** |
| isAdmin: distinguishes not-authenticated from not-admin in the audit trail | SPEC-SILENT | audit trail not in the OpenAPI contract | audit `reason` field asserted | SPEC-SILENT | S3 | — |
| isAdmin: attributes a not-admin denial to the actual user, not to anonymous | SPEC-SILENT | — | audit `actor_user_id` asserted | SPEC-SILENT | S3 | — |
| isAdmin: separates "not authenticated" (401) from "not permitted" (403) | E5/E10/E11/E12/E21/E23/E24/L1 | both status codes documented per admin-only op | 401 vs 403 asserted side by side | OK | — | matches; this is the test the mistitled one above should have been |
| isAdminViaCookie: rejects with 401 when there is no session cookie at all | E28 (observability, out-of-scope module but same gate) | `401` on cookie-gated SSE endpoint | 401 | OK | — | matches; `isAdminViaCookie` itself is used only by `observability/events`, outside this batch's module scope, but the middleware is in-scope here |
| isAdminViaCookie: rejects an empty cookie value the same way as a missing one | SPEC-SILENT | not distinguished in Tier A | 401 | SPEC-SILENT | S3 | — |
| isAdminViaCookie: verifies the REFRESH token, not the access token | SPEC-SILENT | Tier A never says which token type; only the "guarded by isAdminViaCookie" comment (Tier A-adjacent, a YAML comment not a description) says cookie-based at all | refresh-resolver called, access-resolver not | SPEC-SILENT | S2 | implementation detail behind the documented cookie-auth choice |
| isAdminViaCookie: admits an admin and calls next exactly once | E28 | admin role required | `next()` once | OK | — | matches |
| isAdminViaCookie: populates authContext with the admin flag set | SPEC-SILENT | not stated | `authContext.admin === true` | SPEC-SILENT | S2 | — |
| isAdminViaCookie: rejects a valid session belonging to a NON-admin with 403 | E28 | `403 Forbidden` documented | 403 | OK | S1 | this is the exact case the module's own docstring calls "the mutant that matters most" — matches spec, correctly tested |
| isAdminViaCookie: rejects with 403 when the token is valid but the user is gone | SPEC-SILENT | Tier A doesn't address a deleted-but-still-cookied user | 403 | SPEC-SILENT | S2 | — |
| isAdminViaCookie: records a forbidden attempt in the audit trail | SPEC-SILENT | audit trail not in contract | audit event asserted | SPEC-SILENT | S3 | — |
| isAdminViaCookie: names the anonymous actor when the user could not be loaded | SPEC-SILENT | — | `actor_user_id: 'anonymous'` | SPEC-SILENT | S3 | — |
| isAdminViaCookie: rejects a cookie whose signature does not verify, with 401 not 403 | E28 | `401` for "who are you" | 401 | OK | — | matches the 401-vs-403 distinction the module comment states |
| isAdminViaCookie: rejects with 401 when the user lookup itself fails | SPEC-SILENT | not stated (infra-failure path) | 401 | SPEC-SILENT | S2 | — |

### `tests/cross-cutting/authenticated-controllers.test.ts` (2 tests)

| test name | exp. | spec-derived expectation | actual assertion | verdict | sev | why |
|---|---|---|---|---|---|---|
| finds no handler asserting an auth context its route does not guarantee | SPEC-SILENT | Tier A never discusses controller/route wiring internals | `offenders` array is empty | SPEC-SILENT | S2 | real, valuable invariant (prevents a controller reading `authContext` on an unauthenticated route) but not itself a caller-scoping rule Tier A states |
| actually finds controllers to check | SPEC-SILENT | — | `total > 10` | SPEC-SILENT | S3 | canary against a vacuously-passing check above |

### `tests/cross-cutting/write-routes-are-guarded.test.ts` (70 tests: 2 fixed + 68 generated by `it.each`)

Every write route across all 12 routed modules is checked once: by default the test expects
`isAuth` then `isAdmin`; a route listed in `WRITE_EXCEPTIONS` is expected to skip `isAdmin` and
either require or not require `isAuth`, per that entry. Cross-referencing each module's
`routes.ts` against `WRITE_EXCEPTIONS` and against the frozen per-module admin/own-scope rule
(E1-E28, L1) found **no MISMATCH-CODE, MISMATCH-TEST, or MISMATCH-SPEC anywhere in this file** —
every one of the 68 generated assertions matches both the actual middleware chain and the Tier A
per-operation security rule for that route. Verdict OK for all 70, cited compactly below instead
of 70 near-identical rows of "why":

| module | test name (route signature) | exp. | verdict | sev |
|---|---|---|---|---|
| (fixed) | imports one router per module directory that has one, so a new module cannot go unchecked | SPEC-SILENT | SPEC-SILENT | S3 |
| (fixed) | has no stale exception — every listed route is still mounted and still a write | SPEC-SILENT | SPEC-SILENT | S3 |
| account | PUT / | E1 | OK | — |
| account | DELETE / | E6 | OK | — |
| account | DELETE /delete-confirm | E27 | OK | — |
| account | POST /login | E27 | OK | — |
| account | POST /signup | E27 | OK | — |
| account | POST /reset | E27 | OK | — |
| account | POST /reset-confirm | E27 | OK | — |
| account | POST /password | E6 | OK | — |
| account | POST /logout | E27 | OK | — |
| account | POST /logout-all | E6 | OK | — |
| account | DELETE /sessions/:sessionId | E3 | OK | — |
| account | POST /addresses | E4 | OK | — |
| account | PUT /addresses/:addressId | E4 | OK | — |
| account | DELETE /addresses/:addressId | E4 | OK | — |
| account | POST /verify-request | E6 | OK | — |
| account | POST /verify-confirm | E27 | OK | — |
| account | DELETE /tokens/expired | E5 | OK | S1 |
| cart | POST /checkout | E7 | OK | — |
| cart | POST /reorder/:orderId | E8 | OK | S1 |
| cart | POST / | E7 | OK | — |
| cart | DELETE /all | E7 | OK | — |
| cart | DELETE / | E7 | OK | — |
| cart | PUT /:productId | E7 | OK | — |
| cart | DELETE /:productId | E7 | OK | — |
| delivery | POST /advance | E10 | OK | S1 |
| feedback | POST /contact | E11/E27 | OK | — |
| feedback | POST /search | E11 | OK | S1 |
| feedback | PUT /:id | E11 | OK | S1 |
| feedback | DELETE /:id | E11 | OK | S1 |
| inventory | POST /receipts | E12 | OK | S1 |
| inventory | POST /adjustments | E12 | OK | S1 |
| inventory | POST /reservations/sweep | E12 | OK | S1 |
| locales | POST / (createLocale) | L1 | OK | S1 |
| locales | PUT /:locale (updateLocale) | L1 | OK | S1 |
| locales | DELETE /:locale (deleteLocale) | L1 | OK | S1 |
| locales | POST /:locale/entries (createLocaleEntry) | L1 | OK | S1 |
| locales | PUT /:locale/entries (replaceLocaleEntries) | L1 | OK | S1 |
| locales | PATCH /:locale/entries (mergeLocaleEntries) | L1 | OK | S1 |
| locales | PUT /:locale/entries/:entryId (updateLocaleEntry) | L1 | OK | S1 |
| locales | DELETE /:locale/entries/:entryId (deleteLocaleEntry) | L1 | OK | S1 |
| orders | POST /search | E13/E14 | OK | S1 |
| orders | POST / | E16 (corrected) | OK | S1 |
| orders | PUT / | E16 | OK | S1 |
| orders | DELETE / | E16 | OK | S1 |
| orders | POST /:id/cancel | E17 | OK | S1 |
| orders | PUT /:id | E15/E16 | OK | S1 |
| orders | DELETE /:id | E15/E16 | OK | S1 |
| orders | DELETE /:id/hard | E16 | OK | S1 |
| payments | POST /intent | E19 | OK | S1 |
| payments | POST /order/:orderId/refund | E21 | OK | S1 |
| payments | POST /:id/confirm | E22 | OK | S1 |
| products | POST /search | E23 (read wearing POST) | OK | — |
| products | POST / | E23 | OK | S1 |
| products | PUT / | E23 | OK | S1 |
| products | DELETE / | E23 | OK | S1 |
| products | PUT /:id | E23 | OK | S1 |
| products | DELETE /:id | E23 | OK | S1 |
| products | DELETE /:id/hard | E23 | OK | S1 |
| users | POST /search | E24 | OK | S1 |
| users | POST / | E24 | OK | S1 |
| users | PUT / | E24 | OK | S1 |
| users | DELETE / | E24 | OK | S1 |
| users | PUT /:id | E24 | OK | S1 |
| users | DELETE /:id | E24 | OK | S1 |
| users | DELETE /:id/hard | E24 | OK | S1 |
| wishlist | POST / | E26 | OK | — |
| wishlist | POST /:productId/move-to-cart | E26 | OK | — |
| wishlist | DELETE /:productId | E26 | OK | — |

`observability` mounts zero write routes and is correctly skipped by the loop (`if (writes.length
=== 0) continue`) — no generated test, so no row.

## Summary

- **Total rows: 124** (9 orders service-scope + 10 kernel authorization.test.ts + 33 kernel
  authorizations.test.ts + 2 authenticated-controllers.test.ts + 70 write-routes-are-guarded.test.ts).
- **Verdict counts: OK = 86, SPEC-SILENT = 38, MISMATCH-CODE = 0, MISMATCH-TEST = 0,
  MISMATCH-SPEC = 0, TAUTOLOGY = 0.** (86+38=124, matching the total row count above; "OK (title
  bug)" counted under OK — the assertion is correct, only the test's own title is wrong. Per file:
  orders/service-scope.test.ts 2 OK/7 SPEC-SILENT; kernel/authorization.test.ts 4 OK/6
  SPEC-SILENT; kernel/authorizations.test.ts 12 OK/21 SPEC-SILENT; authenticated-controllers.test.ts
  0 OK/2 SPEC-SILENT; write-routes-are-guarded.test.ts 68 OK/2 SPEC-SILENT.)
- **No S1 data-exposure gap found.** The central authorization kernel (`createOwnerScope`,
  `isAuth`/`isAdmin`/`isAdminViaCookie`) and the one module with a `service-scope.test.ts`
  (orders) both test exactly the fail-closed, admin-unrestricted/non-admin-owned-only rule every
  Tier A source states, and the app-wide write-route sweep found every one of the 68 write routes
  across all 12 modules gated exactly as its module's `openapi.yaml` documents. The large
  SPEC-SILENT bucket is internal defense-in-depth (fail-closed on a missing/malformed caller id,
  soft-delete exclusion, audit-trail shape, ObjectId coercion) that the OpenAPI contract simply
  never promises either way — real and often S1-adjacent in intent, but not a place where the test
  and the code independently drifted from a stated requirement.
- One quality defect found and flagged: `tests/unit/kernel/authorizations.test.ts`'s test titled
  `'answers 403, not 401, for an unauthenticated caller'` (line 309) actually asserts `401` — the
  assertion is correct (matches spec), the title is backwards.
- Two self-corrections recorded against the frozen expectations file (not edited, per the hard
  rule): E16's claim that `createOrder` lacks a `403` response was a truncated-grep error; and
  locales' admin-write gating (`L1`) was a step-2 coverage gap, not something Tier A leaves silent
  — the text was there, just not surveyed into an E-number before the freeze commit.
