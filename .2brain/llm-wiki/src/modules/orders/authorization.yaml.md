---
source: src/modules/orders/authorization.yaml
source_sha256: 913e785edd639ef3eb86340f8636688bb12edfcc02d99f0a8bed3391a7a6de00
context_sha256: b9253308da18853988e422c7b73b3eb83112dd43279fe989d7649afcbde58ba2
generated_at: 2026-11-22T06:07:50.662282+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/authorization.yaml

## Purpose
Declares the authorization rules and permission sets for the `orders` module. Each rule is an `action:subject` permission on `Order`. Sets bundle those rules into named groups that can be granted as a unit.

## Key elements
- **`rules`**: seven rules, all with `subject: Order`, `module: orders` and `scope: tenant`.
  - `read`: the caller's own orders only. It has `credential: false` and the conditions `userId: $caller.id` and `deletedAt: null`.
  - `display`: read every order in the shop, for roles like support and warehouse that handle orders that aren't theirs.
  - `create`: raise an order on someone else's behalf. The description says that checking out is not this key.
  - `update`: move an order along its status path.
  - `delete`: remove an order.
  - `override`: skip the lifecycle gate to force a delivery move or correct a status by hand, with a recorded reason. Requires `stepUp: critical`.
  - `export`: export all orders as CSV, customer emails included. Requires `stepUp: sensitive`. The description says an API key cannot use it, since its step-up needs a person.
- **`sets`**: seven single-rule sets, one per rule.

| Set | Rule |
|---|---|
| `OrderOwn` | `read:Order` |
| `OrderDisplay` | `display:Order` |
| `OrderCreation` | `create:Order` |
| `OrderEditing` | `update:Order` |
| `OrderRemoval` | `delete:Order` |
| `OrderOverride` | `override:Order` |
| `OrderExport` | `export:Order` |

## Relationships
- `src/modules/orders/openapi.yaml` is the neighboring API spec for the same module. The step-up comments refer to endpoints such as `POST /account/export`. This file's content doesn't show how the two are wired together.

## Notes
- `read` (own orders, filtered by owner and non-deleted) and `display` (all orders) are separate permissions. Read-everything access needs `display`, not `read`.
- Step-up levels are `critical` (`override`) and `sensitive` (`export`). The comments justify them by pointing to `create:Refund` and `POST /account/export`.
- The other rules declare no `stepUp`.
- Set `rules` entries use the `action:Subject` form (e.g. `read:Order`).
