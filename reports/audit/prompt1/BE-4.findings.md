# BE-4 — Payments: provider port, refunds, webhooks — findings

Expectations frozen blind in `reports/audit/prompt1/BE-4.expectations.md` (commit `e66243cc`,
"audit(prompt1): freeze BE-4 expectations"), before any file below was opened.

## Files read, in order

1. `src/modules/payments/tests/unit/providers.test.ts` (test file, scope)
2. `src/modules/payments/providers/card.ts` (implementation under test)
3. `src/modules/payments/providers/fake.ts` (implementation under test)
4. `src/modules/payments/providers/index.ts` (implementation under test)
5. `src/modules/payments/tests/unit/routes.test.ts` (test file, scope)
6. `src/modules/payments/routes.ts` (implementation under test)
7. `src/modules/payments/tests/integration/service.test.ts` (test file, scope)
8. `src/modules/payments/service.ts` (implementation under test)
9. `src/modules/orders/service.ts` (`cancelById`, lines 455-530 — implementation the "refund on
   cancel" tests drive, cross-module but necessary to check E20)
10. `src/modules/payments/module.ts` (the `ORDER_CANCELLED` listener the "refund on cancel" tests
    exercise)

Scope resolution: `src/modules/payments/tests/**` minus `tests/contract/api.contract.test.ts`
(different audit tier) and `tests/unit/schema-contract.test.ts` (belongs to BE-7). That leaves
exactly the three files above — `providers.test.ts`, `routes.test.ts`, `service.test.ts`. No test
file was edited; no `src/` file was edited.

## Audit note called out up front (see expectations E20/E21)

`orders/service.ts:471-475` implements the named invariant correctly: `const refund =
authContext?.admin ? (options.refund ?? true) : true;` — a non-admin caller's `options.refund` is
never read. **No test in this batch's scope actually calls `cancelById` (or drives the cancel
endpoint) as a non-admin while passing `refund: false`** to confirm the waiver attempt is ignored.
The two "refund on cancel" tests (rows 25-26) only exercise the default path (no `refund` option
passed at all), where the customer default and the ignored-admin-only-override happen to look the
same. This is a coverage gap on exactly the invariant this batch was primed to check, not a
`MISMATCH` on any single test — there is no test asserting the wrong thing, there is simply no test
that would catch this specific line breaking. Recorded as prose, not a table row, per the audit's
own rule that only real `it()`/`test()` calls get rows.

Also per E21: no `order.cancelled` (or any order/payment) AsyncAPI channel exists anywhere in the
contract. Every "event" in this batch's tests (`ORDER_CANCELLED`) is a same-process
`emitDomainEvent`/`onDomainEvent` pub-sub call (`kernel/events`), not a message broker channel —
there is no async transport here to line up against the named AsyncAPI source at all. This is not
a code defect; it just means E21 has no test to grade in this batch (no row below cites it).

## Findings table

| # | file | test name | expectation | spec-derived expectation | actual assertion | verdict | severity | why |
|---|------|-----------|-------------|--------------------------|-------------------|---------|----------|-----|
| 1 | providers.test.ts:13 | `cardLastFour` › keeps only the last four digits | E17 | Only the last 4 card digits may ever leave the module | `cardLastFour('4242424242424242')` → `'4242'` | OK | S1 | Matches the "only card digits a payment system may remember" rule verbatim. |
| 2 | providers.test.ts:17 | `cardLastFour` › strips spaces before slicing | E17 (+ E15 input shape) | Spec allows spaces in `cardNumber` (`^[\d ]+$`); the stored last-4 must still be 4 real digits | `cardLastFour('4242 4242 4242 4242')` → `'4242'` | OK | S1 | Necessary so a spec-legal spaced input never corrupts the one field the module is allowed to keep. |
| 3 | providers.test.ts:23 | `fakePaymentProvider.charge` › declines the documented magic number | E12 | `4000000000000002` must decline | `charge(...,{cardNumber: FAKE_DECLINE_CARD})` → `'declined'` | OK | S1 | Exact card cited in `payments/openapi.yaml:230`. |
| 4 | providers.test.ts:32 | `fakePaymentProvider.charge` › declines the decline card even with spaces | E12, E15 | Same decline card, spaced input still valid per pattern | `'4000 0000 0000 0002'` → `'declined'` | OK | S1 | Spec's `cardNumber` pattern permits spaces; decline must not be bypassable by formatting. |
| 5 | providers.test.ts:41 | `fakePaymentProvider.charge` › succeeds on any other card number | E12 | Every card but the one magic number succeeds | `'4242424242424242'` → `'succeeded'` | OK | S1 | Matches "accepts everything else". |
| 6 | providers.test.ts:52 | `fakePaymentProvider.refund` › always succeeds | none | Tier A never states the fake provider's refund always succeeds — only that a refund is "returned" at the endpoint level | `refund(...)` resolves `undefined` | SPEC-SILENT | S1 | Real behavior, but no openapi/asyncapi sentence asserts the fake PSP can't fail a refund; it's a module-doc (Tier B) claim only. |
| 7 | providers.test.ts:75 | `resolvePaymentProvider` › defaults to the fake provider when unset | none | `NODE_PAYMENT_PROVIDER` is not a contract concept | `resolvePaymentProvider().name === 'fake'` | SPEC-SILENT | S3 | Deployment/config detail, not in any contract file. |
| 8 | providers.test.ts:82 | `resolvePaymentProvider` › honours an explicit known provider | none | same as above | `.name === 'fake'` after setting env to `'fake'` | SPEC-SILENT | S3 | Same as row 7. |
| 9 | routes.test.ts:13 | mounts exactly the documented endpoints, in the documented order | E1,E6,E7,E11 (paths); no E for "order") | The four `payments/openapi.yaml` paths are `POST /intent`, `GET /order/{orderId}`, `POST /order/{orderId}/refund`, `POST /{id}/confirm`, listed in that order in the contract | `routeSignatures(router)` equals exactly those four, same order | OK | S3 | Path/method set matches the contract exactly. The registration-*order* half of the assertion is an Express-collision safety convention with no Tier A backing (see row 12) but happens to coincide with the contract's own listing order, so it doesn't contradict anything. |
| 10a | routes.test.ts:22 | `POST /intent requires a session` (it.each) | E22 | `/payments/intent` has `security: bearerAuth` | `guardsOn(...)` contains `'isAuth'` | OK | S1 | Direct match. |
| 10b | routes.test.ts:22 | `GET /order/:orderId requires a session` (it.each) | E22 | same, `getPaymentByOrder` | contains `'isAuth'` | OK | S1 | Direct match. |
| 10c | routes.test.ts:22 | `POST /order/:orderId/refund requires a session` (it.each) | E22 | same, `refundPaymentByOrder` | contains `'isAuth'` | OK | S1 | Direct match. |
| 10d | routes.test.ts:22 | `POST /:id/confirm requires a session` (it.each) | E22 | same, `confirmPayment` | contains `'isAuth'` | OK | S1 | Direct match. |
| 11 | routes.test.ts:26 | admin-guards the refund, and only the refund | E7 | Only `refundPaymentByOrder` documents a `403 Forbidden`; the other three ops list no 403 | `adminGuarded` array equals exactly `['POST /order/:orderId/refund']` | OK | S1 | Matches the contract's admin-only marking precisely, including the negative half ("only"). |
| 12 | routes.test.ts:36 | declares the refund before the bare /:id route | none | No Tier A source constrains Express route-registration order | `indexOf(refund) < indexOf(confirm)` | SPEC-SILENT | S3 | Internal collision-avoidance convention (the test's own comment says the two paths "cannot collide today"); nothing in the contract requires or even implies a mount order. |
| 13 | service.test.ts:67 | `createIntent` › freezes the order total into the intent | E1, E5 | Amount = order's own total; new intent starts `requires_confirmation` | `payment.amount === 50` (2×25), `payment.status === 'requires_confirmation'` | OK | S1 | Direct match. |
| 14 | service.test.ts:86 | `createIntent` › charges the total the order publishes, shipping included | E1 | Amount must equal `Order.totalPrice` (lines + shipping), not lines alone | `payment.amount === totalPrice === 115` (100 + 15 shipping) | OK | S1 | This is the exact under-charge scenario `payments/openapi.yaml:11` guards against ("cannot quote a different number than the order shows"). |
| 15 | service.test.ts:103 | `createIntent` › answers the same intent when asked twice | E2 | Re-asking refreshes the same intent; "one payment per order is a database fact" | `paymentRepository.count({})` resolves `1` after two calls | OK | S1 | Direct match, and it verifies the *database* invariant, not just the response shape. |
| 16 | service.test.ts:114 | `createIntent` › refuses an order that is not the caller's as absence, not as forbidden | E4 | Order not the caller's own → `404`, not `403` (no 403 is even documented for this op) | `status === 404` | OK | S1 | Prevents a stranger from learning an order id exists via a different status code. |
| 17 | service.test.ts:123 | `createIntent` › refuses a non-pending order with the stable code | E3 | `409`, `errors[0].code === 'PAYMENT_ORDER_NOT_PAYABLE'` | exact match | OK | S2 | Direct match to the documented error code. |
| 18 | service.test.ts:135 | `confirmPayment` › moves the order to paid and the payment to succeeded, in that dependency | E14, E17 | Success → order `paid`, payment `succeeded`; `cardLast4` stores only last 4 | `storedOrder.status === 'paid'`, `payment.status === 'succeeded'`, `payment.cardLast4 === '4242'` | OK | S1 | Matches both the state-machine and the data-minimization rule together. |
| 19 | service.test.ts:156 | `confirmPayment` › reports a decline with the stable code, leaves the order pending, and stays retryable | E12, E13(retry), E16 | `409` `PAYMENT_DECLINED`; order stays `pending`; same payment id confirms again with a good card | all three asserted, retry succeeds | OK | S2 | Matches "retryable" language and the specific decline code. |
| 20 | service.test.ts:184 | `confirmPayment` › refuses a payment that is not the caller's as absence | *(no numbered E — confirm's Tier A description doesn't restate the ownership rule the way intent's/get's do)* | General pattern from E4/E6: a caller only ever sees `404`, never `403`, for a resource that isn't theirs | `status === 404` | OK | S1 | Consistent with the contract's design (confirm's own paths list no 403), but note the gap: `payments/openapi.yaml`'s `confirmPayment` operation description never explicitly states the ownership check the way `createPaymentIntent`'s and `getPaymentByOrder`'s do — this expectation was not itself frozen as a numbered E. |
| 21 | service.test.ts:200 | `confirmPayment` › refuses a second confirm — the money already moved | E13 | Already-`succeeded` payment → `409` `PAYMENT_NOT_CONFIRMABLE` | exact match | OK | S1 | Direct match; prevents a double charge attempt from re-entering the charge path. |
| 22 | service.test.ts:217 | `confirmPayment` › refuses a new intent once the money moved | E3 | Paid order → `409` `PAYMENT_ORDER_NOT_PAYABLE` on a fresh `createIntent` | exact match | OK | S1 | Direct match. |
| 23 | service.test.ts:229 | `confirmPayment` › refunds a charge whose order slipped away between opening the intent and confirming | E11 | Charge first; conditional `paid` write loses to a cancelled order; charge refunded on the spot; `409` `PAYMENT_ORDER_NOT_PAYABLE` | `409`/`PAYMENT_ORDER_NOT_PAYABLE`; `refundSpy` called once with `{amount, currency}`; payment row stays `requires_confirmation` | OK | S1 | This is precisely the scenario `payments/openapi.yaml:102,123-125` describes, and the test proves the provider-level refund call happened (not just the error code), which is the money-safety part of the invariant. |
| 24 | service.test.ts:262 | `getForOrder` › answers the caller's own payment and a stranger's as absence | E6 | Caller's own → success; a stranger → `404` | `own.success === true`, stranger `status === 404` | OK | S1 | Direct match; prevents leaking a payment record to a non-owner. |
| 25 | service.test.ts:298 | `refund on cancel` › cancelling a paid order refunds its payment | E20 (default path only) | A customer (`auth(user)`, `admin:false`) cancelling a `paid` order must be refunded | `cancelled.success === true`, `payment.status === 'refunded'` | OK | S1 | Correctly exercises the customer-cancel-refunds path — but see the note above the table: no call in scope passes `refund:false` to prove the waiver is actually rejected, only that the untouched default behaves right. |
| 26 | service.test.ts:311 | `refund on cancel` › cancelling a never-paid order refunds nothing | E9/E19 | Only a `succeeded` payment is refundable; an intent that was never confirmed has nothing to return | `payment.status === 'requires_confirmation'` (unchanged) | OK | S1 | Direct match — the conditional `succeeded → refunded` write correctly no-ops here. |
| 27 | service.test.ts:360 | confirm commits held units › drops both counters together when the money lands | none (inventory `onHand`/`reserved` are not in the payments Tier A contract at all) | — | `{onHand: 7, reserved: 0}` after a paid confirm on `{onHand:10, reserved:3}` | SPEC-SILENT | S1 | Real, important behavior (stock), but nothing in `payments/openapi.yaml` or `asyncapi.yaml` documents inventory counters — that contract lives in a different module's spec, out of this batch's Tier A set. |
| 28 | service.test.ts:371 | confirm commits held units › leaves the hold alone when the card is declined | none | — | counters unchanged after a decline | SPEC-SILENT | S1 | Same as row 27. |
| 29 | service.test.ts:388 | confirm commits held units › commits once even if the confirm is replayed | none | — | `{onHand: 7, reserved: 0}` after two confirms on the same payment | SPEC-SILENT | S1 | Same as row 27; also a good idempotence test, just not one this batch's Tier A sources can grade. |
| 30 | service.test.ts:403 | `refundByOrder` › returns the money and leaves the order where it is | E8, E10 | Refund succeeds, payment → `refunded`, order status untouched (`paid`) | `payment.status === 'refunded'`, `order.status === 'paid'` (unchanged) | OK | S1 | Direct match to "Returns the money without touching the order's status". |
| 31 | service.test.ts:416 | `refundByOrder` › refuses the second attempt with 409 rather than paying twice | E9 | Double submit → `409` `PAYMENT_NOT_REFUNDABLE` | exact match | OK | S1 | Direct match; this is the at-most-once money guarantee. |
| 32 | service.test.ts:427 | `refundByOrder` › refuses a payment that never succeeded with 409 | E9 | "Nothing to return: the payment never succeeded" → `409` | `status === 409` (code not asserted here) | OK | S2 | Matches the documented case, though the test doesn't re-check `errors[0].code` here (row 31 does) — a minor thoroughness gap, not a mismatch. |
| 33 | service.test.ts:436 | `refundByOrder` › answers 404 when the order never had a payment | *(no numbered E — the refund endpoint's doc comment only spells out the 409 case, not this 404)* | `404` is a declared response on this operation (`payments/openapi.yaml:91`) | `status === 404` | OK | S2 | Consistent with the declared response even though the prose comment doesn't call this case out explicitly. |
| 34 | service.test.ts:446 | `getForOrder — what the caller may do` › offers the operator a refund on money that arrived, once | E19 | `refund` true while `succeeded`, false once `refunded` | `actions.refund` true then false | OK | S1 | Direct match, including the "once" (at-most-once) half. |
| 35 | service.test.ts:469 | never offers a customer the refund control | E19 (+ E7) | `refund` requires `authContext?.admin` — never true for a non-admin regardless of payment status | customer's own `succeeded` payment → `actions.refund === false` | OK | S1 | Direct match; a customer must never even see the control as available. |
| 36 | service.test.ts:486 | offers `pay` while the intent stands and the order can still reach paid | E18 | `pay` true when payment is confirmable and order can reach `paid` | `actions.pay === true` | OK | S2 | Direct match. |
| 37 | service.test.ts:497 | withdraws `pay` once the order is cancelled, even with the intent still open | E18 | `pay` requires BOTH halves — a retryable intent alone is not enough once the order can no longer reach `paid` | `actions.pay === false` after cancelling with the intent untouched | OK | S2 | Direct match to "Both halves of the question" — this is exactly the kind of two-field composition the schema doc warns a client not to decide alone. |

## Summary

- Expectations: 23 (E1–E23)
- Rows: 40 (37 `it()`/`test()` sites; row 10 is one `it.each` expanding to 4)
- Verdict counts: OK = 32, SPEC-SILENT = 8, MISMATCH-CODE = 0, MISMATCH-TEST = 0,
  MISMATCH-SPEC = 0, TAUTOLOGY = 0
- No S1 MISMATCH-CODE findings. The single most important observation is not a wrong test but a
  missing one: nothing in this batch's scope drives `cancelById` (or the cancel endpoint) as a
  non-admin while passing `refund: false`, so the "customer cannot waive the refund" line
  (`orders/openapi.yaml:277-278`) is enforced correctly by `orders/service.ts:475` but is only
  incidentally covered by the payments tests, never directly proven against an attempted waiver.
