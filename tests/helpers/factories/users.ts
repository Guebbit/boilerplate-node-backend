/**
 * User factory
 *
 * Provides two helpers:
 *
 *   makeUser(overrides?)   – returns a plain-object payload (no DB write).
 *                            Use it to build data for direct Repository calls
 *                            or to keep a test self-contained.
 *
 *   createUser(overrides?) – inserts a user into the test database and returns
 *                            the Mongoose document.  Use it whenever a test
 *                            needs an already-persisted user.
 *
 *   createAdminUser(…)     – convenience wrapper that sets admin: true.
 *
 * Password handling
 * -----------------
 * Always pass **plain-text** passwords to the factory.  The User model's
 * `pre('save')` hook hashes them automatically via bcrypt.  When you need to
 * authenticate that user later (e.g. in a login test), use the exported
 * PLAIN_PASSWORD constant so your test stays in sync with the factory default.
 *
 * Usage example
 * -------------
 *   import { createUser, PLAIN_PASSWORD } from '../helpers/factories/users';
 *
 *   const user = await createUser({ email: 'alice@example.com' });
 *   const loginResult = await UserService.login(user.email, PLAIN_PASSWORD);
 */

import type { IUser, IUserDocument, ICartItem } from '@models/users';
import { userRepository as UserRepository } from '@repositories/users';

/** Plain-text password used by the default factory.  Re-export so tests can
 *  authenticate without duplicating this string everywhere. */
export const PLAIN_PASSWORD = 'Password1!';

/** The minimal shape accepted by UserRepository.create(). */
type CreateUserInput = Pick<
    IUser,
    'email' | 'username' | 'password' | 'admin' | 'cart' | 'tokens'
> &
    Partial<Pick<IUser, 'imageUrl' | 'deletedAt'>>;

/**
 * Build a valid user payload.
 *
 * All fields have sensible defaults so that most tests only need to override
 * the one or two fields relevant to the scenario under test.
 *
 * @param overrides - Any field from CreateUserInput to override the defaults.
 */
export const makeUser = (overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
    email: 'user@example.com',
    username: 'testuser',
    password: PLAIN_PASSWORD, // hashed automatically by the pre-save hook
    admin: false,
    cart: { items: [] as ICartItem[], updatedAt: new Date() },
    tokens: [],
    ...overrides
});

/**
 * Insert a user into the test database and return the Mongoose document.
 *
 * @param overrides - Fields to override the factory defaults.
 */
export const createUser = (overrides: Partial<CreateUserInput> = {}): Promise<IUserDocument> =>
    UserRepository.create(makeUser(overrides) as Partial<IUserDocument>);

/**
 * Insert an admin user (admin: true) into the test database.
 *
 * @param overrides - Additional overrides applied on top of the admin defaults.
 */
export const createAdminUser = (overrides: Partial<CreateUserInput> = {}): Promise<IUserDocument> =>
    createUser({
        admin: true,
        email: 'admin@example.com',
        username: 'adminuser',
        ...overrides
    });
