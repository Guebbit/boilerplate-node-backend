/**
 * @module
 * User fixtures that touch the test database. The plain-payload builder lives in `../fixtures`;
 * this file only persists what it returns — kept separate after two divergent `makeUser` copies
 * once caused confusion.
 *
 * Passwords are always plain-text (the model hashes on save); authenticate with `PLAIN_PASSWORD`.
 * Defaulted fields (`admin`, `active`, `verified`, `locale`, `tokens`) are left unset unless a test
 * overrides them, so `createUser()` exercises the real schema default.
 */

import type { UserDocument } from '@modules/users';
import { userRepository } from '@modules/users';
import { makeUser } from '../fixtures';
import type { UserOverrides } from '../fixtures';

export { makeUser, PLAIN_PASSWORD, type UserOverrides } from '../fixtures';

/** Insert a user into the test database and return the Mongoose document. */
export const createUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    userRepository.create(makeUser(overrides));

/** Insert an admin user into the test database. */
export const createAdminUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    createUser({
        admin: true,
        email: 'admin@example.com',
        username: 'adminuser',
        ...overrides
    });
