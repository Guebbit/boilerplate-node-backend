/**
 * `src/infrastructure/persistence/seed.ts` — the upsert policy every module seeder goes through.
 *
 * Two arms and both matter: `skipped` is what makes `db:seed` idempotent on every container
 * boot, `created` is what makes it a seeder at all. The skip arm went unexercised by any unit —
 * the db suites always seed into a dropped database — which left the branch invisible to
 * coverage the day the persistence directory fell out of the threshold globs.
 */
import { Types } from 'mongoose';
import { upsertById } from '@infrastructure/persistence/seed';

const FIXTURE = { _id: new Types.ObjectId('65de646a44f861fd83c13f13'), name: 'row' };

it('creates when no document carries the pinned id', async () => {
    const create = jest.fn().mockResolvedValue(FIXTURE);
    const repository = { findById: jest.fn().mockResolvedValue(null), create };

    await expect(upsertById(repository, FIXTURE)).resolves.toBe('created');
    expect(create).toHaveBeenCalledWith(FIXTURE, expect.anything());
});

it('skips when the id already exists — a second boot is a no-op, not a rewrite', async () => {
    const create = jest.fn();
    const repository = { findById: jest.fn().mockResolvedValue(FIXTURE), create };

    await expect(upsertById(repository, FIXTURE)).resolves.toBe('skipped');
    expect(create).not.toHaveBeenCalled();
});
