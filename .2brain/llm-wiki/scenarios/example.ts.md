---
source: scenarios/example.ts
sha256: ba6bc6fa2ae78067f686384a9f0ecd18388d4daed8e55195aad17b628784412a
generated_at: 2026-10-29T01:22:05.326214+00:00
model: ollama:qwen3.8:27b
---

# scenarios/example.ts

## Purpose

Seed dataset for the `example` module: four documents spread across all three statuses (and two user roles) so the module's list, detail, and public screens open on real content. Lives in the demo profile (`group: example`); `demo:remove` deletes these rows alongside the module.

## Key elements

- **`SEED_EXAMPLE_IDS`** — Four hard-coded `ObjectId`s (`…e01`–`…e04`). E2E journeys and screenshot tests reference these directly instead of querying by title.
- **`exampleFixtures`** — Array of four `PinnedExample` objects built via `makeExample`: three editor-owned (published, draft, archived) and one admin-owned (published). The admin fixture is an explicit "copy me, then delete" scaffold.
- **`seedExampleCollection`** — Async function that inserts every fixture with `insertIfAbsent`, returning `SeedOutcome[]`. Idempotent; safe to re-run.
- **`shopModule`** (exported) — `{ seed: seedExampleCollection }`. The single entry point consumed by the generated aggregator; this is the contract the rest of the seeding pipeline sees.

## Relationships

- **`scenarios/accounts.ts`** — Provides `SEED_ADMIN_ID` and `SEED_EDITOR_ID` used to assign `userId` on the fixtures.
- **`scenarios/seed.ts`** — Provides the `insertIfAbsent` helper and the `SeedOutcome` type that `seedExampleCollection` returns.
- **`scenarios/shop-modules.generated.ts`** — Generated aggregate (`npm run regenerate`) that collects the `shopModule` export from this file into the `shopModules` table. Deleting this file removes the entry on next regeneration.
- **`src/modules/example/factories.ts`** — Source of the `makeExample` factory and the `PinnedExample` shape used to construct each fixture.
- **`src/modules/example/repository.ts`** — `exampleRepository` is the persistence target passed to `insertIfAbsent`.
- **`src/types/index.ts`** — Provides the `ExampleStatus` enum used in fixture status fields.

## Notes

- The four `_id` values are **not** randomly generated; they are fixed so that tests and docs can name a specific row. Do not replace them with `new Types.ObjectId()` calls.
- The file is intentionally minimal and self-describing: its own JSDoc header points to `docs/tools/demo-profile.md` for the broader demo-profile contract.
- Because `shopModule` is the only export, the generated aggregator picks up this module purely by convention (file presence). There is no manual registration step.
