/**
 * User fixtures that touch the test database.
 *
 * The BUILDER lives one level up, in `src/modules/users/fixtures.ts`, and this file only persists
 * what it returns. That split is deliberate and recent: there used to be a `makeUser` here and
 * another one beside the seeds, with different defaults, and no name to tell you which you were
 * looking at. One module, one `makeUser`.
 *
 *   makeUser(overrides?)     – a plain payload, no database write. Re-exported from `../fixtures`
 *                              so a test importing "the user factory" gets one thing.
 *   createUser(overrides?)   – inserts and returns the Mongoose document.
 *   createAdminUser(…)       – the same, with `admin: true`.
 *
 * Always pass PLAIN-TEXT passwords: the model's `pre('save')` hook hashes them. To authenticate a
 * fixture later, use `PLAIN_PASSWORD` rather than retyping the string.
 *
 *   const user = await createUser({ email: 'alice@example.com' });
 *   await userService.login(user.email, PLAIN_PASSWORD);
 *
 * A field the schema defaults — `admin`, `active`, `verified`, `locale`, `tokens` — is left unset
 * unless a test asks for it, so `createUser()` exercises the real default instead of pinning a copy
 * of it. Override any of them explicitly; `active` and `deletedAt` are independent, so all four
 * combinations are constructible.
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
