# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Schema-contract tests for the two inventory collections (`stockMovementSchema` and `reservationSchema`). They assert the *shape* of the MongoDB schemas—required fields, defaults, enums, index specs, and referential types—so that guarantees like exactly-once reservation, replayable deltas, and correct index coverage are enforced by CI rather than discovered in production.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — asserts: only `productId` + `reason` are required; `reason` enum mirrors `StockMovementReason`; `productId` is an ObjectId ref to `Product`; both delta fields default to `0`; timestamps are on; exactly two descending-`createdAt` indexes exist.
- **`describe('reservationSchema — the hold')`** — asserts: `orderId` carries a unique index (the exactly-once gate); four required paths including `items`; `status` is a 3-value enum defaulting to `'held'`; item sub-schema requires `productId` + `quantity` (min 1, `_id: false`); two indexes (unique `orderId`, composite `status+1, expiresAt+1`); **no** `expireAfterSeconds` on any index (TTL would delete the doc and leak stock).
- **Helpers used** (all from `@tests/schema`): `requiredPaths`, `enumOf`, `typeOf`, `refOf`, `defaultOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`, `indexBehaviour`, `subSchema`, `pathOptions`.

## Relationships

- **`src/modules/inventory/model.ts`** — source of `stockMovementSchema`, `reservationSchema`, and `MOVEMENT_REASONS`. Every assertion reads properties off these two schema objects.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum; the test cross-checks that the schema's `reason` enum and the exported `MOVEMENT_REASONS` array both equal `Object.values(StockMovementReason)`, preventing a third independent copy.
- **`tests/support/schema.ts`** — supplies the introspection helpers (`enumOf`, `indexSpecs`, `subSchema`, etc.) that let the tests read Mongoose schema internals without instantiating models.

## Notes

- This is a *meta*-test: it inspects the schema definition object, not a running database. It cannot catch misconfiguration in the connection layer, only drift in the schema code.
- The file deliberately does **not** test application logic (reservation lifecycle, sweep queries). Its scope is limited to "the schema says what we think it says."
- The TTL-index assertion is a guard against a *regression*: a well-meaning `expireAfterSeconds` addition would pass all behavioural tests (documents simply vanish before the sweep runs) and silently leak reserved stock.
- Index assertions use the exact string format produced by `indexSpecs` (e.g. `'createdAt: createdAt-1'`). If the helper's formatting changes, these tests break without the underlying schema having changed.
