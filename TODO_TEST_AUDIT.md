# TODO — test audit follow-ups (backend)

What survives from the spec-vs-test audit, the tautology sweep and the cross-repo differential
against `boilerplate-vue-frontend`. Every row was re-verified against the current tree on
**2026-09-04**; most of the original finding list had quietly been fixed and is listed at the bottom
so nobody re-opens it.

Method and prompts: [`docs/tools/ai-auditing.md`](docs/tools/ai-auditing.md).

## 1. The bundle is stale — `PasswordNew` lost its complexity pattern

**Do this one first.** `npm run check:contracts-bundle` currently reports:

```
[contracts] STALE — these do not match what they are built from:
  openapi.yaml
```

What drifted:

| Where                                | `PasswordNew` pattern              |
| ------------------------------------ | ---------------------------------- |
| `shared/contracts/openapi.root.yaml` | present                            |
| `openapi.yaml` (this repo's bundle)  | **missing**                        |
| `api/schemas.zod.ts` (generated)     | **no password regex at all**       |
| the frontend's `openapi.yaml`        | present — the paired repo is ahead |

So the bundle promises complexity in its `description` while carrying no `pattern:` to enforce it,
and the generated Zod consequently validates nothing. The rule survives at runtime **only** because
`zodUserSchema` re-states it by hand as four `.refine()`s (`src/modules/users/model.ts:227-241`),
which every password-setting flow routes through. Enforcement is real; the contract-derived half of
it is not.

Fix: `npm run contracts:bundle`, then copy the result to the frontend and confirm the two bundles are
byte-identical.

> Worth doing promptly for a second reason: the pre-commit gate regenerates and checks the **whole
> tree**, not just staged files, so a stale `openapi.yaml` can block an unrelated commit.

## 2. `reservation.expired` has no AsyncAPI channel

The test side is closed — `src/modules/cart/tests/integration/stock.test.ts:442` drives
`runReservationSweep()` and asserts the order behind the stale hold reaches `cancelled`, which is
only reachable through the `RESERVATION_EXPIRED` emission (`inventory/service.ts:308` →
`orders/module.ts:42`). `orders/tests/integration/cancel.test.ts:240` separately pins the analytics
event.

What is still missing is the contract: `asyncapi.yaml` has no `reservation`/`expired` channel, and
no module fragment declares one. This is a contract gap before it is a test gap — write the channel,
then the existing tests become gradeable against it.

## 3. A real tautology in the inventory schema contract

`src/modules/inventory/tests/unit/schema-contract.test.ts:38`

```ts
expect(MOVEMENT_REASONS).toEqual(Object.values(StockMovementReason));
```

`src/modules/inventory/model.ts:22` defines `MOVEMENT_REASONS` as literally that expression. Both
sides are the same expression, so the assertion cannot fail unless the import binding breaks.

The preceding line (`:37`, `enumOf(...)`) is genuine — only the second assertion is the passenger.
Replace it with the literal reason list the contract states, or delete it.

## 4. Security properties the contract still does not state

Correctly implemented, ungradeable — no future audit can check them and no regression would read as
a contract break:

- **cookie `SameSite` / `Secure` policy** — `docs/theory/web-attack-catalog.md:109,154` carry the
  generic taxonomy, not this app's actual policy.
- **token entropy and atomicity** for refresh and reset tokens — `docs/tools/security.md:108` covers
  backup codes only.

Anti-enumeration on login no longer belongs here: it is stated and citable at
`docs/theory/web-attack-defences.md:39`.

Writing the Tier A text is the work. This was the original audit's main output and it is still the
highest-leverage item after #1.

## 5. The cross-repo differential is 59/75 endpoints

16 auth endpoints were never differentially checked (auth 23/39; commerce is complete at 36/36).

Worth finishing before opening any new audit scope: the differential found the only finding in the
entire exercise with live production impact, at a fraction of the per-row cost of the spec-vs-test
pass.

## 6. Ordering prior for the next mutation or `suite-bloat` pass

Guidance, not findings. Ranked by density and blast radius rather than raw survivor count:

- `src/infrastructure/http/validation-messages.ts` — **49 survivors at a 0% score**, the worst-scoring
  file in the report, and it has a documented contract to grade against
  (`docs/theory/request-flow.md:197`).
- `image-signatures.ts` and `image-store.ts` — 7 each, but the tightest mutant-to-documented-rule
  match in scope, and the rule is a security property (magic-byte identification; the only path
  turning an `imageUrl` into a filesystem path).
- `src/modules/users/model.ts` — 62 survivors, including all 14 variants of the email-format regex.
- `src/modules/feedback/repository.ts` — 11 of 11 mutants survive. A 100% survival rate is a
  different signal from a large count; worth one cheap look regardless of order.
- `orders/controllers/get-order-invoice.ts` — 27 mutants, all `NoCoverage`; nothing executes it
  during the mutation run.

`stryker-incremental.json` is a past snapshot — treat its line numbers as "near here".

## 7. Process — the prompts are duplicated by hand

`tests/audit/*.md` and `docs/tools/ai-auditing.md` exist in both repos and are kept identical by
copying. Nothing enforces it. Fold it into the contract-sync pipeline or accept the drift knowingly —
the prompts are the only durable asset this exercise produces.

## Verified fixed — do not re-open

| Item                           | Evidence                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Password policy "browser-only" | Enforced server-side for every setting flow via `zodUserSchema` (`users/model.ts:227-241`). See #1 for the remaining contract half. |
| `M-1`, BE-6 title bug          | Fixed in `9790d1ab`.                                                                                                                |
| `T-1` / `T-1b`                 | Literal-anchored companions added at `orders/tests/unit/lifecycle.test.ts:162` and `:196`.                                          |
| `T-2`                          | `transitions.test.ts:27-36` now pins the signed delta per reason, citing `openapi.yaml:162-171`.                                    |
| `X-8` `CART_ADDRESS_NOT_FOUND` | `account/tests/integration/addresses.test.ts:162,183` drive checkout into it and assert nothing moved.                              |
| BE-3 address snapshot          | `addresses.test.ts:156` asserts checkout copies the address onto the order.                                                         |
| BE-3 `reorder` and `422`       | `cart/tests/contract/api.contract.test.ts:301`; 93 literal `422` assertions repo-wide.                                              |
| BE-1 cancel/race/`hardDelete`  | `cart/tests/integration/stock.test.ts:354,373,392,409`; `products/tests/contract/api.contract.test.ts:205`.                         |
| BE-4 refund waiver             | Phantom — `orders/tests/integration/cancel.test.ts:160` always covered it.                                                          |
| `X-1` login envelope           | Frontend-side; fixed there.                                                                                                         |
