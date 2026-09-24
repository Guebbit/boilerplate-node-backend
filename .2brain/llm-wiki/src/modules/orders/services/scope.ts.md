---
source: src/modules/orders/services/scope.ts
sha256: 0120af7ae00faa2e7860c1138b3fd43fc4c6a4ee62f15c79276e225c17f7adde
generated_at: 2026-09-23T19:08:54.350727+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/scope.ts

## Purpose

The authorization boundary for the orders module. Before any other service reads or mutates an order, this file answers two questions: _which_ orders the caller may see (`callerScope`, `ownerScope`) and _what_ the caller may do to a specific order (`actorOf`, `withActions`). It centralises the read-filter compilation and the actor/action assignment so that every read path in the module applies the same rules.

## Key elements

- **`callerScope(context?)`** — Returns the Mongo query fragment that restricts order reads to the caller's visibility (own vs. everyone's, soft-deleted excluded). Delegates to `accessibleFilter`; returns `{}` (not `undefined`) for fully-unrestricted roles.
- **`ownerScope(userId)`** — Returns a filter for one account's orders _without_ the soft-delete exclusion. Intended for flows that already know whose data they are exporting (e.g. account data export). Thin pass-through to `orderRepository.ownerScope`.
- **`actorOf(authContext?)`** — Resolves the lifecycle actor (`'admin'` | `'customer'`) for the current caller by checking whether their permission set holds the `orders.any.update` key. No request may claim the `system` actor.
- **`withActions(order, authContext?)`** — Serialises a single order (handling both a hydrated `OrderDocument` and an already-transformed `Order`), resolves each line's live `current` images via `resolveCurrentImages`, and attaches the `actions` array computed by `orderActionsFor(status, actor)`. Returns `Promise<Order>`.

## Relationships

- **`src/kernel/access/query.ts`** — `callerScope` calls `accessibleFilter` to compile the "own AND still there" predicate from the caller's rules.
- **`src/kernel/permissions.ts`** — `actorOf` calls `callerForSubject` to obtain the caller's permission set for the `Order` subject.
- **`src/kernel/ability.ts`** — `actorOf` calls `holdsKey` to test for the `orders.any.update` key.
- **`src/modules/orders/repository.ts`** — `ownerScope` delegates directly to `orderRepository.ownerScope(userId)`.
- **`src/modules/orders/domain/index.ts`** — Provides `orderActionsFor` (maps status + actor → allowed actions) and the `OrderActor` type used by `actorOf` and `withActions`.
- **`src/modules/orders/services/current.ts`** — `withActions` calls `resolveCurrentImages` to fetch live `current` picture data for each line item (the only async step in the serialisation path).
- **`src/modules/orders/model.ts`** — Supplies the `OrderDocument` type so `withActions` can detect and call `.toJSON()` on a hydrated document.
- **`src/modules/orders/services/cancel.ts`** — Shares the `orders.any.update` permission key for its operator/customer split; `actorOf` was gated on the same key to stay consistent (see the doc comment).
- **`src/modules/orders/tests/unit/service-scope.test.ts`** — Unit tests covering the four exports above.

## Notes

- `callerScope` deliberately returns `{}` rather than `undefined` for unrestricted roles; both spread identically into a Mongo query, but `{}` is the honest "no conditions" value.
- `actorOf` checks the specific `orders.any.update` key rather than a broader capability. A broader check would have missed moderator/manager roles and silently reduced them to the customer's lifecycle column.
- `withActions` accepts `OrderDocument | Order` because the admin read path (`findByIdScoped` with no scope) yields a hydrated Mongoose document, while the owner-scoped path has already been passed through `applyOrderTransform`. The `'toJSON' in order` guard distinguishes the two without a runtime type import.
- The `system` actor (moves driven by external facts) is intentionally unreachable from any HTTP request; only `admin` and `customer` are returned.
