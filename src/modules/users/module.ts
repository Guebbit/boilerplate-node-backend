import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedUsersCollection, exportSeededUsers } from './demo';
import './events';

/**
 * The user record: admin-facing search, read, write and soft delete.
 *
 * Depends on nothing. Deleting an account has to empty that user's cart, and the cart needs the user
 * to price a checkout — the first half of that goes through `user.deleted` precisely so this module
 * stays a leaf and the arrow points cart → users.
 *
 * Authentication is not here. `account` owns signup, login, password reset and the token lifecycle,
 * and reaches this module's barrel for the record it authenticates.
 *
 * A user record with an email, a password hash and an admin flag is the same problem in every
 * application that has ever had one. Nothing about it differentiates this shop, and no aggregate
 * belongs here however central the record feels.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   account, cart, delivery, payments, wishlist
 * Not imports:  `account` writes this same document — the shared kernel. Six migrations touch this
 *               collection, more than any other.
 */
export default {
    name: 'users',
    basePath: '/users',
    routes: router,
    seeds: seedUsersCollection,
    seedExport: exportSeededUsers,
    /* `GET /users/:id` answers the serialized document as it stands. */
    demoShapes: { users: 'response' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
