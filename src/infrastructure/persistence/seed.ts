/**
 * The seeding primitive every module's `demo.ts` upserts through.
 *
 * Lives in `infrastructure` because it knows nothing about any domain: a repository shape and a fixture with
 * a fixed `_id`. The demo dataset itself belongs to the modules — `infrastructure` naming `products` is the
 * coupling this whole layout exists to remove.
 */

import type { Types } from 'mongoose';

/** Whether a fixture was written or was already present. Counted by the runner. */
export type SeedOutcome = 'created' | 'skipped';

/**
 * The slice of a repository seeding needs. Structural, so every module's repository satisfies it.
 *
 * Generic over the fixture rather than declaring `create: (data: never)`. `never` made every
 * repository assignable — nothing can be passed to it, so nothing conflicts — at the price of an
 * `as never` at the one call site that actually passes something. Naming the type instead means
 * the fixture is checked against the repository that will store it.
 */
export interface SeedRepository<TFixture> {
    findById: (id: string) => PromiseLike<unknown>;
    create: (data: TFixture, options?: { timestamps: false }) => Promise<unknown>;
}

/**
 * What every seed write passes to `save()`.
 *
 * A fixture states its own `createdAt` — read off its pinned `_id`, see `./factory` — and Mongoose's
 * `timestamps: true` would overwrite it with the instant the seeder ran. That is not a cosmetic
 * loss: `scripts/export-seed.ts` commits what it reads back, so a run-dependent timestamp would
 * make `db/demo/demo-data.json` differ on every export and its staleness check could never pass.
 */
export const SEED_SAVE_OPTIONS = { timestamps: false } as const;

/**
 * Upsert one fixture by its fixed `_id`.
 *
 * Documents go through `create()` — and therefore `save()` — rather than
 * `updateOne(..., { upsert: true })`, so the model's pre-save hooks still run. Most importantly the
 * bcrypt password hash, which a raw driver write would skip.
 *
 * Note what idempotent means here: an existing `_id` is SKIPPED, not rewritten. Re-running the
 * seeder does not repair a database seeded from older fixtures — a migration does that.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document with a pinned `_id`
 */
export const upsertById = async <TFixture extends { _id: Types.ObjectId }>(
    repository: SeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> => {
    const existing = await repository.findById(fixture._id.toString());
    if (existing) return 'skipped';
    await repository.create(fixture, SEED_SAVE_OPTIONS);
    return 'created';
};
