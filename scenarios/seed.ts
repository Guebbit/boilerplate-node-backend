/**
 * @module
 * The seeding primitive every module's `demo.ts` upserts through. Lives in `infrastructure`
 * because it knows nothing about any domain — just a repository shape and a fixture with a fixed
 * `_id`; the demo dataset itself belongs to the modules, since `infrastructure` naming `products`
 * is exactly the coupling this layout exists to remove.
 */

import type { Types } from 'mongoose';

/** Whether a fixture was written or was already present. Counted by the runner. */
export type SeedOutcome = 'created' | 'skipped';

/**
 * The slice of a repository seeding needs. Structural, so every module's repository satisfies it.
 *
 * Generic over the fixture rather than `create: (data: never)` — `never` made every repository
 * assignable at the cost of an `as never` cast at the one call site that used it. Naming the type
 * checks the fixture against the repository that will actually store it.
 */
export interface SeedRepository<TFixture> {
    findById: (id: string) => PromiseLike<unknown>;
    create: (data: TFixture) => Promise<unknown>;
}

/**
 * The same slice for a collection addressed by its OWNER — see {@link upsertByOwner}.
 */
export interface OwnedSeedRepository<TFixture> {
    findByUserId: (userId: string) => PromiseLike<unknown>;
    create: (data: TFixture) => Promise<unknown>;
}

/**
 * Upsert one fixture by its fixed `_id`.
 *
 * Goes through `create()`/`save()` rather than `updateOne(..., { upsert: true })`, so pre-save
 * hooks still run — most importantly the bcrypt password hash, which a raw driver write would skip.
 * An existing `_id` is SKIPPED, not rewritten: re-running the seeder does not repair a database
 * seeded from older fixtures.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document with a pinned `_id`
 */
export const upsertById = <TFixture extends { _id: Types.ObjectId }>(
    repository: SeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    Promise.resolve(repository.findById(fixture._id.toString())).then((existing) =>
        existing ? 'skipped' : repository.create(fixture).then((): SeedOutcome => 'created')
    );

/**
 * Upsert one fixture by its OWNER rather than by its id.
 *
 * Carts, wishlists and address books have no pinned `_id` — `userId` is the unique column every
 * query reaches them through, so {@link upsertById}'s skip-if-present policy is stated here
 * against the owner instead.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document whose `userId` identifies it
 */
export const upsertByOwner = <TFixture extends { userId: Types.ObjectId }>(
    repository: OwnedSeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    Promise.resolve(repository.findByUserId(fixture.userId.toString())).then((existing) =>
        existing ? 'skipped' : repository.create(fixture).then((): SeedOutcome => 'created')
    );
