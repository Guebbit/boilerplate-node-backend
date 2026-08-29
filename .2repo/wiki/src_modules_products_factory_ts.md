# src/modules/products/factory.ts

## Purpose

Builds product fixtures for the demo dataset (`./demo`) and for tests that need a catalogue row. It exists to give callers a minimal, correct `productRepository.create` payload while deliberately **omitting** every field that has a `default:` in the Mongoose schema, so that downstream serialization records what the schema actually produces rather than a hand-guessed value.

## Key elements

- **`ProductOverrides`** (`type`) — derived from `OverridesFor<Product>`; the set of fields a caller may explicitly pin. `deletedAt` is widened to accept `Date`.
- **`ProductFixture`** (`type`) — the return shape of `makeProduct`. Guarantees `_id`, `title`, and `price` are present (not optional), so consumers can read them without non-null assertions.
- **`makeProduct`** (`const`) — the sole factory function. Sets `title: 'Test Product'` and `price: 9.99` as required-field placeholders, spreads `identityOf` for the id/timestamps, merges caller overrides via `compact`, and converts `deletedAt` with `toDate`. Returns a `ProductFixture`.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — provides the generic helpers `identityOf`, `compact`, `toDate`, and the `OverridesFor<T>` type alias that `ProductOverrides` is built on.
- **`src/modules/products/model.ts`** — supplies the `ProductDocument` and `ProductSnapshot` types used in the `ProductFixture` definition.
- **`src/types/index.ts`** — source of the generated `Product` type that `OverridesFor<Product>` derives from (via `openapi.yaml`).
- **`src/modules/products/demo.ts`** — primary consumer; builds the seeded catalogue rows and exports them through the real serializer.
- **`src/modules/products/tests/factory.ts`** and **`src/modules/products/tests/integration/repository.test.ts`** — test suites that call `makeProduct` to obtain fixtures.

## Notes

- **Do not add schema-default fields.** `onHand`, `reserved`, `active`, `description`, `imageUrl`, `categories`, and `tags` are intentionally absent. The demo dataset export round-trips through the real serializer so `demo-data.json` reflects actual Mongoose defaults. Adding them here would freeze a guess into the fixture and propagate it to the frontend mock.
- **`available` is not a schema path.** Pinning it in overrides has no effect — Mongoose strict mode drops it on write, and the serializer recomputes it from `onHand`/`reserved` on read. To control availability in a test, set those two counters.
- **`title` and `price` are always set** to placeholder values because the schema marks them required; a bare `makeProduct()` call must still produce a valid document.
