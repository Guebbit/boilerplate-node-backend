/**
 * This module's slice of the demo dataset, in mongoose shape.
 *
 * The FACTS — ids, emails, admin flags, who has what in their cart — live in
 * `@seed-identities`, which is byte-identical to a copy in the paired frontend so a `diff` catches
 * the two datasets drifting apart. That file cannot move and cannot be split per module: both
 * repos pin its path in `scripts/specIdentity.ts`. What lives here is only the mapping from those
 * facts into what mongoose wants.
 */

import { Types } from 'mongoose';
import { seedUsers } from '@seed-identities';
import { upsertById, type TSeedOutcome } from '@infrastructure/persistence/seed';
import { userRepository } from './repository';

export const userFixtures = seedUsers.map((user) => ({
    _id: new Types.ObjectId(user.id),
    username: user.username,
    email: user.email,
    /* Plain text on purpose: the model's pre-save hook hashes it. Anything hashed by hand would
     * drift from that hook, and its plaintext would be lost. */
    password: user.password,
    imageUrl: user.imageUrl,
    admin: user.admin,
    /* Not part of the cross-repo identity: whether a demo account has confirmed its email is
     * this backend's own column, so it is decided here, not in `@seed-identities`. `true`
     * because a seed user exists to be logged into, not to demonstrate the nag banner. */
    verified: true,
    tokens: []
}));

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedUsersCollection = (): Promise<TSeedOutcome[]> =>
    Promise.all(userFixtures.map((user) => upsertById(userRepository, user)));
