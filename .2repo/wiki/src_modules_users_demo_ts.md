# src/modules/users/demo.ts

## Purpose

Defines the user-directory slice of the demo seed dataset: two login-capable accounts (`root` admin, `ginopinoshow` customer) plus ten filler customers that give `cart/demo.ts` and `orders/demo.ts` varied shoppers. Exposes the fixtures, a collection seeder, and a read-back export used by the demo-data tooling.

## Key elements

- **`demoCustomerId(index)`** — deterministic hex ID generator (prefix `67f0c2`); avoids time-based `ObjectId` so `db:seed` upserts are idempotent.
- **`SEED_CUSTOMER_IDS`** — `as const` object mapping ten names (`amelia`…`isla`) to their IDs. Imported by `cart/demo.ts` and `orders/demo.ts` instead of raw hex strings.
- **`SEED_CUSTOMER_EMAILS`** — derived email per customer (`{username}@example.com`); exported so other modules can address orders without reconstructing the username.
- **`userFixtures`** — the full array (2 named + 10 filler) of user documents built via `makeUser`, ready for upsert.
- **`seedUsersCollection()`** — upserts every fixture through `userRepository`; declared in `module.ts`, invoked by `db/demo/index.ts`.
- **`exportSeededUsers()`** — reads the `users` collection (projecting only `_id`) via `exportCollection`; password is intentionally absent from the output.

## Relationships

- **`@kernel/seed-accounts`** — sole source of the two named accounts' IDs, emails, and passwords; no other module's seed rows depend on the ten fillers.
- **`./fixtures` (`makeUser`)** — constructs user documents with schema defaults (including `verified: false`, which this file overrides to `true`).
- **`./model` (`userModel`)** — Mongoose model used by `exportSeededUsers` for the read-back projection.
- **`./repository` (`userRepository`)** — the upsert target for `seedUsersCollection`.
- **`@infrastructure/persistence/seed`** — provides `upsertById`, `SeedOutcome`, and `exportCollection` utilities.
- **`./demo-images.generated.json`** — static avatar image data; the ten fillers alternate between the `root` and `ginopinoshow` image sets by index parity.
- **`../cart/demo.ts` / `../orders/demo.ts`** — consumers of `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS`; the seven customers through `priya` receive one small order and no cart row, while `marcus`, `harper`, `isla` receive a fuller cart and two orders.
- **`./module.ts`** — declares `seedUsersCollection` in the module's seed manifest so `db/demo/index.ts` can call it.

## Notes

- **Deterministic IDs are load-bearing.** The `67f0c2` prefix is distinct from the products demo-catalog prefix so the two ID spaces can never collide. Replacing `demoCustomerId` with `new Types.ObjectId()` would break idempotent reseeding.
- **`verified: true` is intentional.** The schema default (`false`) models "awaiting email verification"; seed accounts exist to be logged into, so the flag is overridden for all twelve users.
- **The ten fillers have no credentials in `@kernel/seed-accounts`.** They use `makeUser`'s internal password default and are never meant to be logged into. Credentials for `root`/`ginopinoshow` are published separately by `scripts/export-demo-dataset.ts`.
- **Image assignment is positional, not semantic.** Even-indexed fillers get `userImages.root`; odd-indexed get `userImages.ginopinoshow`. There is no per-user image mapping.
