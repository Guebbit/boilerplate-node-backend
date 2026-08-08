import { Types } from 'mongoose';
import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import * as userService from '@services/users';
import * as authService from '@services/auth';
import * as cartService from '@services/cart';
import { userRepository } from '@repositories/users';
import type { IResponseSuccess, IResponseReject } from '@core/http/response';
import type { IUserCartDto } from '@services/cart.dto';
import type { IUserDocument } from '@models/users';

setupTestDb();

describe('authService.signup', () => {
    it('creates a new user and returns a success response', async () => {
        const result = await authService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.email).toBe('new@example.com');
    });

    it('rejects when passwords do not match', async () => {
        const result = await authService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Different1!'
        );

        expect(result.success).toBe(false);
        expect((result as IResponseReject).errors).toHaveLength(1);
    });

    it('rejects with 409 when the email is already registered', async () => {
        await createUser({ email: 'taken@example.com' });

        const result = await authService.signup(
            'taken@example.com',
            'anotheruser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(409);
    });

    it('rejects with 422 when the email format is invalid', async () => {
        const result = await authService.signup('not-an-email', 'user', 'Password1!', 'Password1!');

        expect(result.success).toBe(false);
        // 422 across the board for validation failures: auth used to answer 400 here while every
        // other service used 422, and openapi.yaml declares 422 (it never declares 400 at all).
        expect((result as IResponseReject).status).toBe(422);
    });

    it('rejects with 422 when the password is too short', async () => {
        const result = await authService.signup('short@example.com', 'shortpwd', 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(422);
    });
});

describe('authService.login', () => {
    it('returns a success response with correct credentials', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await authService.login('login@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.email).toBe('login@example.com');
    });

    it('rejects with 401 for the wrong password', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await authService.login('login@example.com', 'WrongPassword!');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });

    it('rejects with 401 for a non-existent email', async () => {
        const result = await authService.login('nobody@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });

    it('rejects soft-deleted users', async () => {
        await createUser({ email: 'deleted@example.com', deletedAt: new Date() });

        const result = await authService.login('deleted@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });
});

describe('cartService cart operations', () => {
    it('cartItemSetById adds a new product to an empty cart', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        const result = await cartService.cartItemSetById(userId, pid, 3);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserCartDto>).data!.cart.items).toHaveLength(1);
        expect((result as IResponseSuccess<IUserCartDto>).data!.cart.items[0].quantity).toBe(3);
    });

    it('cartItemSetById overwrites the quantity when the product is already in the cart', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 2);
        const secondResult = await cartService.cartItemSetById(userId, pid, 7);

        expect((secondResult as IResponseSuccess<IUserCartDto>).data!.cart.items).toHaveLength(1);
        expect((secondResult as IResponseSuccess<IUserCartDto>).data!.cart.items[0].quantity).toBe(
            7
        );
    });

    it('cartItemAddById increases the quantity of an existing cart item', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 2);
        const addResult = await cartService.cartItemAddById(userId, pid, 3);

        expect((addResult as IResponseSuccess<IUserCartDto>).data!.cart.items[0].quantity).toBe(5);
    });

    it('cartItemRemoveById removes the specified product from the cart', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 1);
        const removeResult = await cartService.cartItemRemoveById(userId, pid);

        expect((removeResult as IResponseSuccess<IUserCartDto>).data!.cart.items).toHaveLength(0);
    });

    it('cartRemove empties the entire cart', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 5);
        const clearResult = await cartService.cartRemove(userId);

        expect((clearResult as IResponseSuccess<IUserCartDto>).data!.cart.items).toHaveLength(0);
    });

    it('cartGet returns populated cart items with product details', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct({ title: 'Visible Product' });
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 2);
        const items = await cartService.cartGet(userId);

        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(2);
    });

    it('cartItemSet (by document) is equivalent to cartItemSetById', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();

        const result = await cartService.cartItemSet(userId, product, 4);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserCartDto>).data!.cart.items[0].quantity).toBe(4);
    });

    it('cartItemAdd (by document) increases quantity', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 1);
        const addResult = await cartService.cartItemAdd(userId, product, 9);

        expect((addResult as IResponseSuccess<IUserCartDto>).data!.cart.items[0].quantity).toBe(10);
    });

    it('cartItemRemove (by document) removes the product', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct();

        await cartService.cartItemSet(userId, product, 1);
        const removeResult = await cartService.cartItemRemove(userId, product);

        expect((removeResult as IResponseSuccess<IUserCartDto>).data!.cart.items).toHaveLength(0);
    });
});

describe('cartService.orderConfirm', () => {
    it('creates an order from the cart and empties the cart afterwards', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const product = await createProduct({ price: 20 });
        const pid = (product._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId, pid, 2);
        const orderResult = await cartService.orderConfirm(userId);

        expect(orderResult.success).toBe(true);

        const refreshed = await userRepository.findById(userId);
        expect(refreshed!.cart.items).toHaveLength(0);
    });

    it('rejects with 409 when the cart is empty', async () => {
        const user = await createUser();
        const userId = (user._id as Types.ObjectId).toString();
        const result = await cartService.orderConfirm(userId);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(409);
    });
});

describe('authService.tokenAdd', () => {
    it('adds a token to the user and returns the token string', async () => {
        const user = await createUser();
        const token = await authService.tokenAdd(user, 'password-reset', 3_600_000);

        expect(typeof token).toBe('string');
        expect(token).toHaveLength(32);
    });

    it('persists the token to the database', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        await authService.tokenAdd(user, 'email-verify');

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.tokens).toHaveLength(1);
        expect(refreshed!.tokens[0].type).toBe('email-verify');
    });

    it('sets an expiration date when expirationTime is provided', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();
        const now = Date.now();

        await authService.tokenAdd(user, 'reset', 3_600_000);

        const refreshed = await userRepository.findByIdWithCredentials(id);
        const expiration = refreshed!.tokens[0].expiration!;
        expect(expiration.getTime()).toBeGreaterThan(now);
    });
});

describe('authService.passwordChange', () => {
    it('changes the password when both fields match and meet requirements', async () => {
        const user = await createUser();
        const result = await authService.passwordChange(user, 'NewPassword1!', 'NewPassword1!');

        expect(result.success).toBe(true);
    });

    it('rejects when passwords do not match', async () => {
        const user = await createUser();
        const result = await authService.passwordChange(user, 'NewPassword1!', 'Different1!');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(422);
    });

    it('rejects when the new password is too short', async () => {
        const user = await createUser();
        const result = await authService.passwordChange(user, 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(422);
    });

    it('actually changes the password so the new one can be used to log in', async () => {
        const user = await createUser({ email: 'pwdchange@example.com' });
        const id = (user._id as Types.ObjectId).toString();

        await authService.passwordChange(user, 'BrandNew1!', 'BrandNew1!');

        const refreshed = await userRepository.findById(id);
        const loginResult = await authService.login('pwdchange@example.com', 'BrandNew1!');
        expect(loginResult.success).toBe(true);
        expect(refreshed).not.toBeNull();
    });
});

describe('userService.validateData', () => {
    it('returns an empty array for valid user data', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!'
        });

        expect(errors).toHaveLength(0);
    });

    it('returns errors for an invalid email', () => {
        const errors = userService.validateData({
            email: 'not-an-email',
            username: 'validuser',
            password: 'Password1!'
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns errors for a username that is too short', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'ab',
            password: 'Password1!'
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('does not require password when requirePassword is false', () => {
        const errors = userService.validateData(
            { email: 'valid@example.com', username: 'validuser' },
            false
        );

        expect(errors).toHaveLength(0);
    });

    /**
     * These four used to pass validation untouched, because the schema was applied through a
     * `.pick({ email, username, password })` that never looked at the rest of the payload.
     * `admin` was the worst of them: an unchecked string reached Mongoose and threw a CastError
     * on save, so `POST /users` answered 500 where its own contract promises 422.
     */
    it.each(['admin', 'active'])('rejects a wrong-typed %s flag', (field) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!',
            [field]: 'not-a-boolean'
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it.each([true, false])('accepts a real boolean admin flag (%s)', (admin) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!',
            admin
        });

        expect(errors).toHaveLength(0);
    });

    // The contract says `uri-reference`, not `uri`: an uploaded avatar is stored as a path
    // relative to the API host, so requiring an absolute URL here would reject every upload.
    it('accepts a server-relative upload path as the imageUrl', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!',
            imageUrl: '/uploads/1700000000-avatar.jpg'
        });

        expect(errors).toHaveLength(0);
    });

    // Not strict: a PUT body legitimately carries `id`, which is not part of the user schema.
    it('ignores body keys the schema does not declare', () => {
        const errors = userService.validateData({
            id: '65dc8a99604c307b702b5ccc',
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!'
        });

        expect(errors).toHaveLength(0);
    });

    /**
     * The messages are what the API sends a client verbatim, so a wrong i18n key is a
     * user-visible bug — and the assertions above cannot see it, because a missing key makes
     * i18next return the key itself, which is still a non-empty string.
     *
     * That is exactly what had happened: `user-validation.ts` asked for `signup.user-field-*`
     * while `en.json` defined them under `login.*`, so every user whose email failed validation
     * was told "signup.user-field-email-invalid". A raw key is recognisable by shape — a dotted
     * identifier with no spaces — which is what this asserts against, so it keeps working when
     * the copy is reworded.
     */
    it('returns translated messages, never raw i18n keys', () => {
        const errors = userService.validateData({
            email: 'not-an-email',
            username: 'ab',
            password: 'x'
        });

        expect(errors.length).toBeGreaterThan(0);
        for (const message of errors) expect(message).not.toMatch(/^[a-z]+(?:\.[\da-z-]+)+$/);
    });
});

/*
 * Backs the three `active` filter cases below, which replace a pair titled "filters active users
 * (no deletedAt)" and "filters inactive (soft-deleted) users" — names that record the bug they
 * were asserting. `active` had no column; the filter was rewritten into a `deletedAt` existence
 * check, so asking for inactive accounts returned deleted ones and there was no way to ask for
 * either alone.
 *
 * Built so the two facts DISAGREE: the deactivated account is not deleted, and the deleted account
 * is still active. Under the old behaviour every one of those assertions came out the other way.
 */
const seedActiveAndDeleted = () =>
    Promise.all([
        createUser({ email: 'enabled@example.com', username: 'enabled', active: true }),
        createUser({ email: 'disabled@example.com', username: 'disabled', active: false }),
        createUser({
            email: 'deleted@example.com',
            username: 'deleted',
            active: true,
            deletedAt: new Date()
        })
    ]);

describe('userService.search', () => {
    it('returns all users with default pagination', async () => {
        await createUser({ email: 'a@example.com', username: 'a' });
        await createUser({ email: 'b@example.com', username: 'b' });

        const result = await userService.search({});

        expect(result.items).toHaveLength(2);
        expect(result.meta.totalItems).toBe(2);
    });

    it('filters by text (partial match on email or username)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await userService.search({ text: 'alice' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by email (case-insensitive partial match)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await userService.search({ email: 'ALICE' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by username', async () => {
        await createUser({ email: 'a@example.com', username: 'alice' });
        await createUser({ email: 'b@example.com', username: 'bob' });

        const result = await userService.search({ username: 'bob' });

        expect(result.items).toHaveLength(1);
    });

    it('filters on the active column, not on soft-deletion', async () => {
        await seedActiveAndDeleted();

        const active = await userService.search({ active: true });

        // The deleted-but-active account is included: deletion is a separate fact, and this
        // filter does not ask about it.
        expect(
            active.items.map((item) => (item as unknown as { username: string }).username)
        ).toEqual(expect.arrayContaining(['enabled', 'deleted']));
        expect(active.items).toHaveLength(2);
    });

    it('returns the deactivated account, and only it, for active: false', async () => {
        await seedActiveAndDeleted();

        const inactive = await userService.search({ active: false });

        expect(inactive.items).toHaveLength(1);
        expect((inactive.items[0] as unknown as { username: string }).username).toBe('disabled');
    });

    it('returns every account when active is not filtered on', async () => {
        await seedActiveAndDeleted();

        const all = await userService.search({});

        expect(all.items).toHaveLength(3);
    });

    it('paginates results correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await createUser({ email: `u${i}@example.com`, username: `u${i}` });
        }

        const page1 = await userService.search({ page: 1, pageSize: 3 });
        const page2 = await userService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
    });

    it('returns correct meta when the collection is empty', async () => {
        const result = await userService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
        expect(result.meta.totalPages).toBe(0);
    });
});

describe('userService.getById', () => {
    it('returns a real document for an existing user', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        const found = await userService.getById(id);

        expect(found).toBeDefined();
        expect(found!.email).toBe('user@example.com');
        // A real Mongoose document — schema's toJSON transform normalizes it on the way out
        expect(typeof (found as unknown as { save: unknown }).save).toBe('function');
    });

    it('returns undefined for a non-existent id', async () => {
        const found = await userService.getById('000000000000000000000000');
        expect(found).toBeUndefined();
    });

    it('returns undefined when no id is provided', async () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        expect(await userService.getById(undefined)).toBeUndefined();
    });
});

describe('userService.adminCreate', () => {
    it('creates a user and returns the Mongoose document', async () => {
        const user = await userService.adminCreate({
            email: 'created@example.com',
            username: 'createduser',
            password: PLAIN_PASSWORD
        });

        expect(user._id).toBeDefined();
        expect(user.email).toBe('created@example.com');
        // Password should have been hashed by the pre-save hook
        expect(user.password).not.toBe(PLAIN_PASSWORD);
    });

    it('can create an admin user when admin flag is set', async () => {
        const user = await userService.adminCreate({
            email: 'superadmin@example.com',
            username: 'superadmin',
            password: PLAIN_PASSWORD,
            admin: true
        });

        expect(user.admin).toBe(true);
    });
});

describe('userService.adminUpdateById', () => {
    it('updates the username and admin flag of an existing user', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        const result = await userService.adminUpdateById(id, {
            username: 'new-name',
            admin: true
        });

        expect(result.success).toBe(true);
        const updated = (result as { data: IUserDocument }).data;
        expect(updated.username).toBe('new-name');
        expect(updated.admin).toBe(true);
    });

    it('changes the password when a non-empty password is supplied', async () => {
        const user = await createUser({ email: 'pwdupdate@example.com' });
        const id = (user._id as Types.ObjectId).toString();
        const originalHash = user.password;

        await userService.adminUpdateById(id, { password: 'UpdatedPwd1!' });

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.password).not.toBe(originalHash);
    });

    it('does not touch the password when an empty string is supplied', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();
        const originalHash = user.password;

        await userService.adminUpdateById(id, { password: '' });

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.password).toBe(originalHash);
    });

    it('returns reject result when the user does not exist', async () => {
        const result = await userService.adminUpdateById('000000000000000000000000', {
            username: 'x'
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('userService.adminUpdate', () => {
    it('updates an existing user document directly', async () => {
        const user = await createUser();

        const result = await userService.adminUpdate(user, { username: 'direct-update' });

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.username).toBe('direct-update');
    });
});

describe('userService.removeById', () => {
    it('soft-deletes a user by setting deletedAt', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        const result = await userService.removeById(id);

        expect(result.success).toBe(true);
        const updated = await userRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted user when called again (toggle)', async () => {
        const user = await createUser({ deletedAt: new Date() });
        const id = (user._id as Types.ObjectId).toString();

        await userService.removeById(id);

        const restored = await userRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes a user when hardDelete is true', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        await userService.removeById(id, true);

        expect(await userRepository.findById(id)).toBeNull();
    });

    it('returns a 404 rejection when the user does not exist', async () => {
        const result = await userService.removeById('000000000000000000000000');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(404);
    });
});

describe('userService.remove', () => {
    it('soft-deletes a user document directly', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        const result = await userService.remove(user);

        expect(result.success).toBe(true);
        const updated = await userRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('hard-deletes a user document directly', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        await userService.remove(user, true);

        expect(await userRepository.findById(id)).toBeNull();
    });
});

describe('cartService.productRemoveFromCartsById', () => {
    it('removes a product from every user cart that contains it', async () => {
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });
        const userId1 = (user1._id as Types.ObjectId).toString();
        const userId2 = (user2._id as Types.ObjectId).toString();

        await cartService.cartItemSetById(userId1, pid, 1);
        await cartService.cartItemSetById(userId2, pid, 2);

        const result = await cartService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);

        const refreshed1 = await userRepository.findById(userId1);
        const refreshed2 = await userRepository.findById(userId2);
        expect(refreshed1!.cart.items).toHaveLength(0);
        expect(refreshed2!.cart.items).toHaveLength(0);
    });

    it('succeeds even when no user has the product in their cart', async () => {
        const product = await createProduct();
        const pid = (product._id as Types.ObjectId).toString();

        const result = await cartService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);
    });
});
