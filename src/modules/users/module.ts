import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedUsersCollection } from './seeds';
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
 */
export default {
    name: 'users',
    basePath: '/users',
    routes: router,
    seeds: seedUsersCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
