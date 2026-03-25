/**
 * UserService – Integration tests
 *
 * Why integration tests for services?
 * ------------------------------------
 * Service functions contain business logic that often spans multiple repository
 * calls and mutates related entities (e.g. placing an order also empties the
 * cart).  By running against a real in-memory database we verify that the full
 * interaction works correctly end-to-end, not just each piece in isolation.
 *
 * Structure
 * ---------
 * Each top-level describe block maps to one exported service function.
 * Tests build the required state themselves (using factories), invoke the
 * function under test, then assert on the result AND on any side-effects that
 * are visible through the repository layer (re-fetching documents from the DB).
 *
 * Response types
 * --------------
 * Most UserService functions return `IResponseSuccess<T> | IResponseReject`.
 * We check `result.success` first to assert the overall outcome, then cast to
 * the concrete type to inspect `data` or `errors` safely.
 */

import { Types } from 'mongoose';
import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser, PLAIN_PASSWORD } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import * as UserService from '@services/users';
import * as UserRepository from '@repositories/users';
import type { IResponseSuccess, IResponseReject } from '@utils/response';
import type { IUserDocument } from '@models/users';

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Narrow a service response to the success branch for type-safe assertions. */
const asSuccess = <T>(r: IResponseSuccess<T> | IResponseReject) =>
    r as IResponseSuccess<T>;

/** Narrow a service response to the rejection branch for type-safe assertions. */
const asReject = (r: IResponseSuccess<unknown> | IResponseReject) =>
    r as IResponseReject;

// ─── signup ───────────────────────────────────────────────────────────────────

describe('UserService.signup', () => {
    it('creates a new user and returns a success response', async () => {
        const result = await UserService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Password1!',
        );

        expect(result.success).toBe(true);
        expect(asSuccess<IUserDocument>(result).data!.email).toBe('new@example.com');
    });

    it('rejects when passwords do not match', async () => {
        const result = await UserService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Different1!',
        );

        expect(result.success).toBe(false);
        expect(asReject(result).errors).toHaveLength(1);
    });

    it('rejects with 409 when the email is already registered', async () => {
        await createUser({ email: 'taken@example.com' });

        const result = await UserService.signup(
            'taken@example.com',
            'anotheruser',
            'Password1!',
            'Password1!',
        );

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
    });

    it('rejects with 400 when the email format is invalid', async () => {
        const result = await UserService.signup(
            'not-an-email',
            'user',
            'Password1!',
            'Password1!',
        );

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(400);
    });

    it('rejects with 400 when the password is too short', async () => {
        const result = await UserService.signup(
            'short@example.com',
            'shortpwd',
            'abc',  // < 8 chars
            'abc',
        );

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(400);
    });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('UserService.login', () => {
    it('returns a success response with correct credentials', async () => {
        // createUser goes through the repository → pre-save hook hashes the password
        await createUser({ email: 'login@example.com' });

        const result = await UserService.login('login@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(true);
        expect(asSuccess<IUserDocument>(result).data!.email).toBe('login@example.com');
    });

    it('rejects with 401 for the wrong password', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await UserService.login('login@example.com', 'WrongPassword!');

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(401);
    });

    it('rejects with 401 for a non-existent email', async () => {
        const result = await UserService.login('nobody@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(401);
    });

    it('rejects soft-deleted users', async () => {
        // A user with deletedAt set is considered inactive
        await createUser({ email: 'deleted@example.com', deletedAt: new Date() });

        const result = await UserService.login('deleted@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(401);
    });
});

// ─── cart operations ─────────────────────────────────────────────────────────

describe('UserService cart operations', () => {
    it('cartItemSetById adds a new product to an empty cart', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        const result = await UserService.cartItemSetById(user, pid, 3);

        expect(result.success).toBe(true);
        expect(asSuccess<IUserDocument>(result).data!.cart.items).toHaveLength(1);
        expect(asSuccess<IUserDocument>(result).data!.cart.items[0].quantity).toBe(3);
    });

    it('cartItemSetById overwrites the quantity when the product is already in the cart', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        // First addition
        const firstResult = await UserService.cartItemSetById(user, pid, 2);
        const updatedUser = asSuccess<IUserDocument>(firstResult).data!;

        // Second call should SET, not ADD
        const secondResult = await UserService.cartItemSetById(updatedUser, pid, 7);

        expect(asSuccess<IUserDocument>(secondResult).data!.cart.items).toHaveLength(1);
        expect(asSuccess<IUserDocument>(secondResult).data!.cart.items[0].quantity).toBe(7);
    });

    it('cartItemAddById increases the quantity of an existing cart item', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        // Start with quantity 2
        const setResult = await UserService.cartItemSetById(user, pid, 2);
        const userAfterSet = asSuccess<IUserDocument>(setResult).data!;

        // Add 3 more → expected total: 5
        const addResult = await UserService.cartItemAddById(userAfterSet, pid, 3);

        expect(asSuccess<IUserDocument>(addResult).data!.cart.items[0].quantity).toBe(5);
    });

    it('cartItemRemoveById removes the specified product from the cart', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        const addResult    = await UserService.cartItemSetById(user, pid, 1);
        const userWithItem = asSuccess<IUserDocument>(addResult).data!;

        const removeResult = await UserService.cartItemRemoveById(userWithItem, pid);

        expect(asSuccess<IUserDocument>(removeResult).data!.cart.items).toHaveLength(0);
    });

    it('cartRemove empties the entire cart', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        const addResult   = await UserService.cartItemSetById(user, pid, 5);
        const userWithCart = asSuccess<IUserDocument>(addResult).data!;

        const clearResult = await UserService.cartRemove(userWithCart);

        expect(asSuccess<IUserDocument>(clearResult).data!.cart.items).toHaveLength(0);
    });

    it('cartGet returns populated cart items with product details', async () => {
        const user    = await createUser();
        const product = await createProduct({ title: 'Visible Product' });
        const pid     = (product._id as Types.ObjectId).toString();

        const addResult  = await UserService.cartItemSetById(user, pid, 2);
        const userLoaded = asSuccess<IUserDocument>(addResult).data!;

        // cartGet calls populate('cart.items.product') internally
        const items = await UserService.cartGet(userLoaded);

        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(2);
    });

    it('cartItemSet (by document) is equivalent to cartItemSetById', async () => {
        const user    = await createUser();
        const product = await createProduct();

        // Use the document variant — it calls cartItemSetById internally
        const result = await UserService.cartItemSet(user, product, 4);

        expect(result.success).toBe(true);
        expect(asSuccess<IUserDocument>(result).data!.cart.items[0].quantity).toBe(4);
    });

    it('cartItemAdd (by document) increases quantity', async () => {
        const user    = await createUser();
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        const setResult  = await UserService.cartItemSetById(user, pid, 1);
        const userLoaded = asSuccess<IUserDocument>(setResult).data!;

        const addResult = await UserService.cartItemAdd(userLoaded, product, 9);

        expect(asSuccess<IUserDocument>(addResult).data!.cart.items[0].quantity).toBe(10);
    });

    it('cartItemRemove (by document) removes the product', async () => {
        const user    = await createUser();
        const product = await createProduct();

        const addResult  = await UserService.cartItemSet(user, product, 1);
        const userLoaded = asSuccess<IUserDocument>(addResult).data!;

        const removeResult = await UserService.cartItemRemove(userLoaded, product);

        expect(asSuccess<IUserDocument>(removeResult).data!.cart.items).toHaveLength(0);
    });
});

// ─── orderConfirm ─────────────────────────────────────────────────────────────

describe('UserService.orderConfirm', () => {
    it('creates an order from the cart and empties the cart afterwards', async () => {
        const user    = await createUser();
        const product = await createProduct({ price: 20 });
        const pid     = (product._id as Types.ObjectId).toString();

        // Fill the cart
        const addResult   = await UserService.cartItemSetById(user, pid, 2);
        const userWithCart = asSuccess<IUserDocument>(addResult).data!;

        // Place the order
        const orderResult = await UserService.orderConfirm(userWithCart);

        expect(orderResult.success).toBe(true);

        // Verify the cart was cleared in the database (not just in memory)
        const refreshed = await UserRepository.findById((user._id as Types.ObjectId).toString());
        expect(refreshed!.cart.items).toHaveLength(0);
    });

    it('rejects with 409 when the cart is empty', async () => {
        const user   = await createUser();
        const result = await UserService.orderConfirm(user);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
    });
});

// ─── tokenAdd ─────────────────────────────────────────────────────────────────

describe('UserService.tokenAdd', () => {
    it('adds a token to the user and returns the token string', async () => {
        const user  = await createUser();
        const token = await UserService.tokenAdd(user, 'password-reset', 3_600_000);

        // randomBytes(16).toString('hex') → 32 hex characters
        expect(typeof token).toBe('string');
        expect(token).toHaveLength(32);
    });

    it('persists the token to the database', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();

        await UserService.tokenAdd(user, 'email-verify');

        const refreshed = await UserRepository.findById(id);
        expect(refreshed!.tokens).toHaveLength(1);
        expect(refreshed!.tokens[0].type).toBe('email-verify');
    });

    it('sets an expiration date when expirationTime is provided', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();
        const now  = Date.now();

        await UserService.tokenAdd(user, 'reset', 3_600_000); // 1 hour

        const refreshed = await UserRepository.findById(id);
        const expiration = refreshed!.tokens[0].expiration!;
        // Expiration should be roughly 1 hour in the future
        expect(expiration.getTime()).toBeGreaterThan(now);
    });
});

// ─── passwordChange ───────────────────────────────────────────────────────────

describe('UserService.passwordChange', () => {
    it('changes the password when both fields match and meet requirements', async () => {
        const user   = await createUser();
        const result = await UserService.passwordChange(user, 'NewPassword1!', 'NewPassword1!');

        expect(result.success).toBe(true);
    });

    it('rejects when passwords do not match', async () => {
        const user   = await createUser();
        const result = await UserService.passwordChange(user, 'NewPassword1!', 'Different1!');

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(400);
    });

    it('rejects when the new password is too short', async () => {
        const user   = await createUser();
        const result = await UserService.passwordChange(user, 'abc', 'abc');

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(400);
    });

    it('actually changes the password so the new one can be used to log in', async () => {
        const user = await createUser({ email: 'pwdchange@example.com' });
        const id   = (user._id as Types.ObjectId).toString();

        await UserService.passwordChange(user, 'BrandNew1!', 'BrandNew1!');

        // Re-fetch to get the hashed new password from the DB
        const refreshed = await UserRepository.findById(id);
        const loginResult = await UserService.login('pwdchange@example.com', 'BrandNew1!');
        expect(loginResult.success).toBe(true);
        expect(refreshed).not.toBeNull();
    });
});

// ─── validateData ─────────────────────────────────────────────────────────────

describe('UserService.validateData', () => {
    it('returns an empty array for valid user data', () => {
        const errors = UserService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: 'Password1!',
        });

        expect(errors).toHaveLength(0);
    });

    it('returns errors for an invalid email', () => {
        const errors = UserService.validateData({
            email: 'not-an-email',
            username: 'validuser',
            password: 'Password1!',
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns errors for a username that is too short', () => {
        const errors = UserService.validateData({
            email: 'valid@example.com',
            username: 'ab',  // < 3 chars
            password: 'Password1!',
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('does not require password when requirePassword is false', () => {
        const errors = UserService.validateData(
            { email: 'valid@example.com', username: 'validuser' },
            { requirePassword: false },
        );

        expect(errors).toHaveLength(0);
    });
});

// ─── search ───────────────────────────────────────────────────────────────────

describe('UserService.search', () => {
    it('returns all users with default pagination', async () => {
        await createUser({ email: 'a@example.com', username: 'a' });
        await createUser({ email: 'b@example.com', username: 'b' });

        const result = await UserService.search({});

        expect(result.items).toHaveLength(2);
        expect(result.meta.totalItems).toBe(2);
    });

    it('filters by text (partial match on email or username)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await UserService.search({ text: 'alice' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by email (case-insensitive partial match)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await UserService.search({ email: 'ALICE' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by username', async () => {
        await createUser({ email: 'a@example.com', username: 'alice' });
        await createUser({ email: 'b@example.com', username: 'bob' });

        const result = await UserService.search({ username: 'bob' });

        expect(result.items).toHaveLength(1);
    });

    it('filters active users (no deletedAt)', async () => {
        await createUser({ email: 'active@example.com', username: 'active' });
        await createUser({ email: 'deleted@example.com', username: 'deleted', deletedAt: new Date() });

        const active = await UserService.search({ active: true });
        expect(active.items).toHaveLength(1);
    });

    it('filters inactive (soft-deleted) users', async () => {
        await createUser({ email: 'active@example.com', username: 'active' });
        await createUser({ email: 'deleted@example.com', username: 'deleted', deletedAt: new Date() });

        const inactive = await UserService.search({ active: false });
        expect(inactive.items).toHaveLength(1);
    });

    it('paginates results correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await createUser({ email: `u${i}@example.com`, username: `u${i}` });
        }

        const page1 = await UserService.search({ page: 1, pageSize: 3 });
        const page2 = await UserService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
    });

    it('returns correct meta when the collection is empty', async () => {
        const result = await UserService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
        expect(result.meta.totalPages).toBe(0);
    });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe('UserService.getById', () => {
    it('returns a plain object for an existing user', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();

        const found = await UserService.getById(id);

        expect(found).toBeDefined();
        expect(found!.email).toBe('user@example.com');
        // Lean object — no Mongoose Document methods
        expect(typeof (found as unknown as { save?: unknown }).save).toBe('undefined');
    });

    it('returns undefined for a non-existent id', async () => {
        const found = await UserService.getById('000000000000000000000000');
        expect(found).toBeUndefined();
    });

    it('returns undefined when no id is provided', async () => {
        expect(await UserService.getById(undefined)).toBeUndefined();
    });
});

// ─── adminCreate ──────────────────────────────────────────────────────────────

describe('UserService.adminCreate', () => {
    it('creates a user and returns the Mongoose document', async () => {
        const user = await UserService.adminCreate({
            email: 'created@example.com',
            username: 'createduser',
            password: PLAIN_PASSWORD,
        });

        expect(user._id).toBeDefined();
        expect(user.email).toBe('created@example.com');
        // Password should have been hashed by the pre-save hook
        expect(user.password).not.toBe(PLAIN_PASSWORD);
    });

    it('can create an admin user when admin flag is set', async () => {
        const user = await UserService.adminCreate({
            email: 'superadmin@example.com',
            username: 'superadmin',
            password: PLAIN_PASSWORD,
            admin: true,
        });

        expect(user.admin).toBe(true);
    });
});

// ─── adminUpdate ──────────────────────────────────────────────────────────────

describe('UserService.adminUpdate', () => {
    it('updates the username and admin flag of an existing user', async () => {
        const user    = await createUser();
        const id      = (user._id as Types.ObjectId).toString();

        const updated = await UserService.adminUpdate(id, {
            username: 'new-name',
            admin: true,
        });

        expect(updated.username).toBe('new-name');
        expect(updated.admin).toBe(true);
    });

    it('changes the password when a non-empty password is supplied', async () => {
        const user = await createUser({ email: 'pwdupdate@example.com' });
        const id   = (user._id as Types.ObjectId).toString();
        const originalHash = user.password;

        await UserService.adminUpdate(id, { password: 'UpdatedPwd1!' });

        const refreshed = await UserRepository.findById(id);
        // The hash must have changed
        expect(refreshed!.password).not.toBe(originalHash);
    });

    it('does not touch the password when an empty string is supplied', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();
        const originalHash = user.password;

        await UserService.adminUpdate(id, { password: '' });

        const refreshed = await UserRepository.findById(id);
        expect(refreshed!.password).toBe(originalHash);
    });

    it('throws when the user does not exist', async () => {
        await expect(
            UserService.adminUpdate('000000000000000000000000', { username: 'x' }),
        ).rejects.toThrow();
    });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('UserService.remove', () => {
    it('soft-deletes a user by setting deletedAt', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();

        const result = await UserService.remove(id);

        expect(result.success).toBe(true);
        const updated = await UserRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted user when called again (toggle)', async () => {
        const user = await createUser({ deletedAt: new Date() });
        const id   = (user._id as Types.ObjectId).toString();

        await UserService.remove(id);

        const restored = await UserRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes a user when hardDelete is true', async () => {
        const user = await createUser();
        const id   = (user._id as Types.ObjectId).toString();

        await UserService.remove(id, true);

        expect(await UserRepository.findById(id)).toBeNull();
    });

    it('returns a 404 rejection when the user does not exist', async () => {
        const result = await UserService.remove('000000000000000000000000');

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });
});

// ─── productRemoveFromCartsById ───────────────────────────────────────────────

describe('UserService.productRemoveFromCartsById', () => {
    it('removes a product from every user cart that contains it', async () => {
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        // Two users each add the same product to their cart
        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });

        const addResult1 = await UserService.cartItemSetById(user1, pid, 1);
        const addResult2 = await UserService.cartItemSetById(user2, pid, 2);
        const id1 = (asSuccess<IUserDocument>(addResult1).data!._id as Types.ObjectId).toString();
        const id2 = (asSuccess<IUserDocument>(addResult2).data!._id as Types.ObjectId).toString();

        // Remove the product from all carts
        const result = await UserService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);

        // Verify both carts are now empty
        const refreshed1 = await UserRepository.findById(id1);
        const refreshed2 = await UserRepository.findById(id2);
        expect(refreshed1!.cart.items).toHaveLength(0);
        expect(refreshed2!.cart.items).toHaveLength(0);
    });

    it('succeeds even when no user has the product in their cart', async () => {
        const product = await createProduct();
        const pid     = (product._id as Types.ObjectId).toString();

        const result = await UserService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);
    });
});
