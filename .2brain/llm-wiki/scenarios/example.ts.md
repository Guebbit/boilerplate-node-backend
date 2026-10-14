---
source: scenarios/example.ts
sha256: 98d52f7c476917be18c7b5228dcff03f4d73cd77811b65c757b22bf211b3c2ed
generated_at: 2026-10-14T06:56:34.178265+00:00
model: ollama:qwen3.8:27b
---

# scenarios/example.ts

## Purpose

Provides the demo dataset for the `example` module: a small set of fixed examples (one per status for the customer, one published for the admin) so that module screens render something on first open. Belongs to the `example` demo group, which `demo:remove` deletes wholesale.

## Key elements

- **`SEED_EXAMPLE_IDS`** — `as const` object of four hardcoded `ObjectId` strings (customerPublished, customerDraft, customerArchived, adminPublished). Exposed so journeys and screenshot tests can name a specific row instead of querying by content.
- **`exampleFixtures`** — `PinnedExample[]` of four documents built via `makeExample` from the example factories, each overridden with its pinned `_id`. The customer user owns one per `ExampleStatus` (published, draft, archived); the admin user owns one published example.
- **`seedExampleCollection`** — Returns `Promise<SeedOutcome[]>`. Maps each fixture through `insertIfAbsent(exampleRepository, fixture)` and resolves all in parallel.

## Relationships

- **`scenarios/accounts.ts`** — Supplies `SEED_ADMIN_ID` and `SEED_USER_ID`, the two `userId` values assigned to the fixtures.
- **`scenarios/seed.ts`** — Supplies the `SeedOutcome` type and the `insertIfAbsent` helper used by `seedExampleCollection`.
- **`scenarios/shop-modules.ts`** — Registers `seedExampleCollection` in its seed table; `seedShop` walks that table and invokes this function.
- **`src/modules/example/factories.ts`** — Provides `makeExample` (document builder) and the `PinnedExample` type that shapes each fixture.
- **`src/modules/example/repository.ts`** — Provides `exampleRepository`, passed to `insertIfAbsent` as the write target.
- **`src/types/index.ts`** — Provides the `ExampleStatus` enum values used in the fixture definitions.

## Notes

- IDs are **pinned** (hardcoded hex strings), not generated. This is deliberate: downstream tests and screenshot suites reference them by the named keys in `SEED_EXAMPLE_IDS`.
- `publishedAt` dates are intentionally spread (two in 2026, one in 2025) to make published vs. archived ordering visually distinct in a demo UI.
- The admin-published fixture (`adminPublished`) exists solely so a public/read path has content; the file comment explicitly frames it as "there to be copied" and then deleted.
