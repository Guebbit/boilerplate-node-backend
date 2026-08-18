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
 */
export default {
    name: 'users',
    /*
     * A user record with an email, a password hash and an admin flag is the same problem in every
     * application that has ever had one. Nothing about it differentiates this shop, which is what
     * `generic` means — and why no aggregate belongs here however central the record feels.
     */
    subdomain: 'generic',
    language: {
        User: 'The person record. Owns identity and the admin flag; owns no credentials workflow — see `account`.',
        Admin: 'A flag on the User, not a role table. Two levels of access is the whole model.',
        Token: 'A single-use secret bound to a user and a purpose (`TokenType`), stored on the record.',
        'Soft delete':
            'A destroyed account, kept for the audit trail. Emits `user.deleted`, which is what actually clears the cart and wishlist.'
    },
    basePath: '/users',
    routes: router,
    seeds: seedUsersCollection,
    seedExport: exportSeededUsers,
    /* `GET /users/:id` answers the serialized document as it stands. */
    demoShapes: { users: 'response' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
