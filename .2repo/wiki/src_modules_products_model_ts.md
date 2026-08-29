# src/modules/products/model.ts

## Purpose

Defines the Mongoose schema, Zod validation schema, TypeScript interfaces, and serialization transform for the Product collection. It is the single source of truth for what a product stores, how it is validated on input, and how it is shaped on output.

## Key elements

- **`ProductSnapshot`** — The stored fields (minus `_id`, `available`, dates) typed without Mongoose machinery. Exists so orders can embed a product copy without claiming `Document` methods that don't exist on a subdocument.
- **`ProductDocument`** — `ProductSnapshot` + `Document`; the full Mongoose instance type.
- **`ProductModel`** — `Model<ProductDocument, unknown, unknown>`; the typed model handle.
- **`zodProductSchema`** — Extends the orval-generated `CreateProductBody` with stricter `title` (min 5 chars) and `price` (min 0) rules. Used by the service layer for input validation.
- **`productSchema`** — Mongoose schema with `timestamps: true`, two explicit indexes (`products_createdAt`, `products_active_deletedAt`), and defaults for `onHand` (100), `reserved` (0), `description`, `imageUrl`, `categories`, `tags`, `active` (true).
- **`applyProductAvailability`** *(internal)* — Derives `available = max(0, onHand − reserved)` on a serialized object.
- **`applyProductTransform`** — The shared `applySerialization` wrapper: renames `_id → id`, strips `__v`, then runs `applyProductAvailability`. Exported so lean/aggregate results (which skip `toJSON`) can be mapped identically.
- **`productModel`** — The registered Mongoose model instance (`'Product'`).

## Relationships

- **`api/schemas.zod.ts`** — Imports `CreateProductBody`; `zodProductSchema` extends it, so the contract's constraints apply unless explicitly overridden.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which `applyProductTransform` wraps to add product-specific derivation.
- **`src/infrastructure/i18n/index.ts`** — Provides `t()`; every Zod error message in `zodProductSchema` calls it via a thunk.
- **`src/modules/products/repository.ts`** — Consumes `productModel` and `applyProductTransform` for queries and result shaping.
- **`src/modules/products/factory.ts`** — Creates `ProductDocument` instances from input data.
- **`src/modules/products/index.ts`** — Re-exports the public surface of this file.
- **`src/modules/orders/model.ts` / `src/modules/orders/factory.ts`** — Embed a `ProductSnapshot`-shaped copy on each line item; `ProductSnapshot` exists specifically to type that copy without over-claiming `Document` methods.
- **`src/modules/cart/services/reorder.ts` / `view.ts`** — Read product data (including the derived `available`) when assembling cart responses.

## Notes

- **`available` is never stored.** It is derived at serialization from `onHand − reserved` (clamped at 0). Any code that needs it must go through `applyProductTransform` or `toJSON`; reading the raw document will not have the field.
- **`onHand` / `reserved` are written only by `@modules/inventory`.** This module declares the columns (it owns the collection) but must not mutate them directly; all transitions go through the inventory module's conditional writes and ledger.
- **`active` and `deletedAt` are independent booleans/dates**, not a single "status" field. `publicScope()` in the repository requires *both* active and not-deleted; internally they remain separate states.
- **Zod `.extend()` replaces a field entirely.** Any constraint on an overridden field must be restated in the override or it is silently lost. The `price: min(0)` is restated for exactly this reason.
- **All i18n error messages are thunks** (`error: () => t('…')`), not eager calls. Eager `t()` runs before `i18next.init()` and yields `undefined`, which Zod discards.
- **Index names are set explicitly** to match names already present in the database; letting Mongoose derive names would cause a startup failure on a DB that already has the index under a different name.
- **`ProductMethods` is `unknown`** — no document-level instance methods exist; business logic lives in the service, queries in the repository.
