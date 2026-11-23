---
source: scenarios/example.ts
source_sha256: 3b2c96f3b2dc11d0e26091a6fe52083f3e4b7547bffffc3ec3f54b1b08a3fb11
context_sha256: 58711b868e559340d2e39f429e3f17fc1b94f196ab6df19f764805163c189316
generated_at: 2026-11-22T01:42:32.536885+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/example.ts

## Purpose
Defines the `example` module's slice of the demo dataset: a few example documents in each status, so the module's screens open with data. It is tied to the module via `group: example`, so `demo:remove` deletes this data along with the module.

## Key elements
- `SEED_EXAMPLE_IDS` (private const): four fixed ObjectId strings (`editorPublished`, `editorDraft`, `editorArchived`, `adminPublished`). They let journeys or screenshots reference a specific row instead of searching for it.
- `exampleFixtures` (private): an array of `PinnedExample[]`. Each entry is built with `makeExample(...)` and then given its pinned `_id`.
  - Three belong to the editor (`SEED_EDITOR_ID`), one per status: published, draft (no status or date given, so the factory default applies), and archived.
  - One belongs to the admin (`SEED_ADMIN_ID`) and is published, so the public side has something to read.
- `seedExampleCollection` (private): runs `insertIfAbsent(exampleRepository, fixture)` for every fixture and resolves to `SeedOutcome[]`.
- `shopModule` (exported): `{ seed: seedExampleCollection }`, this module's entry in the `shop` fixture table.

## Relationships
- `scenarios/accounts.ts`: supplies `SEED_ADMIN_ID` and `SEED_EDITOR_ID`, which set the owner (`userId`) of each example.
- `scenarios/seed.ts`: supplies `insertIfAbsent` and the `SeedOutcome` type used for seeding.
- `src/modules/example/factories.ts`: supplies `makeExample` and the `PinnedExample` type for building fixtures.
- `src/modules/example/repository.ts`: `exampleRepository` is the target that fixtures are inserted into.
- `src/types/index.ts`: supplies the `ExampleStatus` enum (`published`, `archived`, and so on), imported via `@types`.
- The comments say `shopModule` is collected into `shopModules` (`./shop-modules`) and run by `seedShop`. Those files are not among the listed neighbors.

## Notes
- Seeding is idempotent in intent: it uses `insertIfAbsent`, and the ids are pinned.
- Per the file's comments, `shopModule` is picked up by `npm run regenerate`, which produces the `shopModules` table in `scenarios/shop-modules.ts`. Deleting this file therefore removes the entry. Nothing is registered by hand.
- The admin's "Welcome" note is written to be copied as a template for new modules.
