---
source: scenarios/example.ts
sha256: ba6bc6fa2ae78067f686384a9f0ecd18388d4daed8e55195aad17b628784412a
generated_at: 2026-11-08T02:28:28.862196+00:00
model: ollama:qwen3.8:27b
---

# scenarios/example.ts

## Purpose

Provides the demo/seed dataset for the `example` module: a small set of fixed-example records (one per status for the editor, one published for the admin) so that UI screens and journey tests open on realistic content. The file is collected into a generated `shop-modules` registry and cleaned up by `demo:remove`.

## Key elements

- **`SEED_EXAMPLE_IDS`** – Const map of four hardcoded ObjectIds (`editorPublished`, `editorDraft`, `editorArchived`, `adminPublished`). Gives tests/screens stable handles to specific rows without querying.
- **`exampleFixtures`** – Array of `PinnedExample` objects built via `makeExample` and then overridden with a known `_id`. The editor owns three records (published, draft, archived); the admin owns one published record.
- **`seedExampleCollection`** – Runs `insertIfAbsent` over every fixture through `exampleRepository`; returns `Promise<SeedOutcome[]>`. Idempotent — re-running the seed is a no-op for rows that already exist.
- **`shopModule`** (exported) – `{ seed: seedExampleCollection }`. The single entry point consumed by the generated `shop-modules` table and ultimately by `seedShop`.

## Relationships

- **`scenarios/accounts.ts`** – Imports `SEED_ADMIN_ID` and `SEED_EDITOR_ID` so fixtures reference the same user accounts the rest of the demo data uses.
- **`scenarios/seed.ts`** – Imports the `SeedOutcome` type and the `insertIfAbsent` helper that makes seeding idempotent.
- **`src/modules/example/factories.ts`** – Imports `makeExample` and the `PinnedExample` type; all fixture shapes originate here.
- **`src/modules/example/repository.ts`** – Imports `exampleRepository`, the persistence layer that `insertIfAbsent` writes through.
- **`src/types/index.ts`** – Imports `ExampleStatus` enum used to set each fixture's status.

## Notes

- The ObjectIds are hardcoded hex strings, not generated at seed time. Do not replace them with `new Types.ObjectId()` or existing references in journeys/screenshot tests will break.
- The file must remain importable without side effects: the only side effect is inside `seedExampleCollection`, which runs when the generated `shop-modules` table calls it.
- Deleting this file is the supported way to remove the example module from the demo dataset; the generated `shop-modules.generated.ts` (produced by `npm run regenerate`) will drop the corresponding entry automatically.
- Fixture `publishedAt` dates are in the future relative to typical "now" values — intentional, but be aware if you add date-dependent assertions.
