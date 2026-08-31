/**
 * @module
 * The user record: admin-facing search, read, write and soft delete. Depends on nothing —
 * deleting an account empties that user's cart via `user.deleted`, keeping cart → users a
 * one-way arrow. Authentication lives in `account`, which reaches this module's barrel for the
 * record it authenticates.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   account, cart, delivery, payments, wishlist
 * Not imports:  `account` writes this same document — the shared kernel. Six migrations touch this
 *               collection, more than any other.
 *
 * See: docs/modules/users.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedUsersCollection, exportSeededUsers } from './demo';
import { userRepository } from './repository';
import './events';

/** This module's manifest entry: routes, demo seeding, locales, and the image writeback target. */
export default {
    name: 'users',
    basePath: '/users',
    routes: router,
    seeds: seedUsersCollection,
    seedExport: exportSeededUsers,
    /* `GET /users/:id` answers the serialized document as it stands. */
    demoShapes: { users: 'response' },
    locales: path.join(__dirname, 'locales'),
    /*
     * `account`'s signup and profile-update flows write through this same `userRepository` —
     * there is no separate `users` collection for them to register their own target under.
     */
    imageTargets: { users: { writeback: userRepository.writebackImage } }
} satisfies AppModule;
