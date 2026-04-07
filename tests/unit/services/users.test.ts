import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser, PLAIN_PASSWORD } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import * as userService from '@services/users';
import * as cartService from '@services/cart';
import * as userRepository from '@repositories/users';
import type { IResponseSuccess, IResponseReject } from '@utils/response';
import type { IUserDocument } from '@models/users';

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

describe('userService.signup', () => {
    it('creates a new user and returns a success response', async () => {
        const result = await userService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.email).toBe('new@example.com');
    });

    it('rejects when passwords do not match', async () => {
        const result = await userService.signup(
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

        const result = await userService.signup(
            'taken@example.com',
            'anotheruser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(409);
    });

    it('rejects with 400 when the email format is invalid', async () => {
        const result = await userService.signup('not-an-email', 'user', 'Password1!', 'Password1!');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(400);
    });

    it('rejects with 400 when the password is too short', async () => {
        const result = await userService.signup('short@example.com', 'shortpwd', 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(400);
    });
});

describe('userService.login', () => {
    it('returns a success response with correct credentials', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await userService.login('login@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.email).toBe('login@example.com');
    });

    it('rejects with 401 for the wrong password', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await userService.login('login@example.com', 'WrongPassword!');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });

    it('rejects with 401 for a non-existent email', async () => {
        const result = await userService.login('nobody@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });

    it('rejects soft-deleted users', async () => {
        await createUser({ email: 'deleted@example.com', deletedAt: new Date() });

        const result = await userService.login('deleted@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(401);
    });
});

describe('userService cart operations', () => {
    it('cartItemSetById adds a new product to an empty cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const result = await cartService.cartItemSetById(user, pid, 3);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(1);
        expect((result as IResponseSuccess<IUserDocument>).data!.cart.items[0].quantity).toBe(3);
    });

    it('cartItemSetById overwrites the quantity when the product is already in the cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const firstResult = await cartService.cartItemSetById(user, pid, 2);
        const updatedUser = (firstResult as IResponseSuccess<IUserDocument>).data!;

        const secondResult = await cartService.cartItemSetById(updatedUser, pid, 7);

        expect((secondResult as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(1);
        expect((secondResult as IResponseSuccess<IUserDocument>).data!.cart.items[0].quantity).toBe(
            7
        );
    });

    it('cartItemAddById increases the quantity of an existing cart item', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const setResult = await cartService.cartItemSetById(user, pid, 2);
        const userAfterSet = (setResult as IResponseSuccess<IUserDocument>).data!;

        const addResult = await cartService.cartItemAddById(userAfterSet, pid, 3);

        expect((addResult as IResponseSuccess<IUserDocument>).data!.cart.items[0].quantity).toBe(5);
    });

    it('cartItemRemoveById removes the specified product from the cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const addResult = await cartService.cartItemSetById(user, pid, 1);
        const userWithItem = (addResult as IResponseSuccess<IUserDocument>).data!;

        const removeResult = await cartService.cartItemRemoveById(userWithItem, pid);

        expect((removeResult as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(0);
    });

    it('cartRemove empties the entire cart', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const addResult = await cartService.cartItemSetById(user, pid, 5);
        const userWithCart = (addResult as IResponseSuccess<IUserDocument>).data!;

        const clearResult = await cartService.cartRemove(userWithCart);

        expect((clearResult as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(0);
    });

    it('cartGet returns populated cart items with product details', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Visible Product' });
        const pid = product.id.toString();

        const addResult = await cartService.cartItemSetById(user, pid, 2);
        const userLoaded = (addResult as IResponseSuccess<IUserDocument>).data!;

        const items = await cartService.cartGet(userLoaded);

        expect(items).toHaveLength(1);
        expect(items[0].quantity).toBe(2);
    });

    it('cartItemSet (by document) is equivalent to cartItemSetById', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await cartService.cartItemSet(user, product, 4);

        expect(result.success).toBe(true);
        expect((result as IResponseSuccess<IUserDocument>).data!.cart.items[0].quantity).toBe(4);
    });

    it('cartItemAdd (by document) increases quantity', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pid = product.id.toString();

        const setResult = await cartService.cartItemSetById(user, pid, 1);
        const userLoaded = (setResult as IResponseSuccess<IUserDocument>).data!;

        const addResult = await cartService.cartItemAdd(userLoaded, product, 9);

        expect((addResult as IResponseSuccess<IUserDocument>).data!.cart.items[0].quantity).toBe(
            10
        );
    });

    it('cartItemRemove (by document) removes the product', async () => {
        const user = await createUser();
        const product = await createProduct();

        const addResult = await cartService.cartItemSet(user, product, 1);
        const userLoaded = (addResult as IResponseSuccess<IUserDocument>).data!;

        const removeResult = await cartService.cartItemRemove(userLoaded, product);

        expect((removeResult as IResponseSuccess<IUserDocument>).data!.cart.items).toHaveLength(0);
    });
});

describe('userService.orderConfirm', () => {
    it('creates an order from the cart and empties the cart afterwards', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 20 });
        const pid = product.id.toString();

        const addResult = await cartService.cartItemSetById(user, pid, 2);
        const userWithCart = (addResult as IResponseSuccess<IUserDocument>).data!;

        const orderResult = await cartService.orderConfirm(userWithCart);

        expect(orderResult.success).toBe(true);

        const refreshed = await userRepository.findById(user.id.toString());
        expect(refreshed!.cart.items).toHaveLength(0);
    });

    it('rejects with 409 when the cart is empty', async () => {
        const user = await createUser();
        const result = await cartService.orderConfirm(user);

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(409);
    });
});

describe('userService.tokenAdd', () => {
    it('adds a token to the user and returns the token string', async () => {
        const user = await createUser();
        const token = await userService.tokenAdd(user, 'password-reset', 3_600_000);

        expect(typeof token).toBe('string');
        expect(token).toHaveLength(32);
    });

    it('persists the token to the database', async () => {
        const user = await createUser();
        const id = user.id.toString();

        await userService.tokenAdd(user, 'email-verify');

        const refreshed = await userRepository.findById(id);
        expect(refreshed!.tokens).toHaveLength(1);
        expect(refreshed!.tokens[0].type).toBe('email-verify');
    });

    it('sets an expiration date when expirationTime is provided', async () => {
        const user = await createUser();
        const id = user.id.toString();
        const now = Date.now();

        await userService.tokenAdd(user, 'reset', 3_600_000);

        const refreshed = await userRepository.findById(id);
        const expiration = refreshed!.tokens[0].expiration!;
        expect(expiration.getTime()).toBeGreaterThan(now);
    });
});

describe('userService.passwordChange', () => {
    it('changes the password when both fields match and meet requirements', async () => {
        const user = await createUser();
        const result = await userService.passwordChange(user, 'NewPassword1!', 'NewPassword1!');

        expect(result.success).toBe(true);
    });

    it('rejects when passwords do not match', async () => {
        const user = await createUser();
        const result = await userService.passwordChange(user, 'NewPassword1!', 'Different1!');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(400);
    });

    it('rejects when the new password is too short', async () => {
        const user = await createUser();
        const result = await userService.passwordChange(user, 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(400);
    });

    it('actually changes the password so the new one can be used to log in', async () => {
        const user = await createUser({ email: 'pwdchange@example.com' });
        const id = user.id.toString();

        await userService.passwordChange(user, 'BrandNew1!', 'BrandNew1!');

        const refreshed = await userRepository.findById(id);
        const loginResult = await userService.login('pwdchange@example.com', 'BrandNew1!');
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
});

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

    it('filters active users (no deletedAt)', async () => {
        await createUser({ email: 'active@example.com', username: 'active' });
        await createUser({
            email: 'deleted@example.com',
            username: 'deleted',
            deletedAt: new Date()
        });

        const active = await userService.search({ active: true });
        expect(active.items).toHaveLength(1);
    });

    it('filters inactive (soft-deleted) users', async () => {
        await createUser({ email: 'active@example.com', username: 'active' });
        await createUser({
            email: 'deleted@example.com',
            username: 'deleted',
            deletedAt: new Date()
        });

        const inactive = await userService.search({ active: false });
        expect(inactive.items).toHaveLength(1);
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
    it('returns a plain object for an existing user', async () => {
        const user = await createUser();
        const id = user.id.toString();

        const found = await userService.getById(id);

        expect(found).toBeDefined();
        expect(found!.email).toBe('user@example.com');
        // Lean object — no model instance methods
        expect(typeof (found as unknown as { save?: unknown }).save).toBe('undefined');
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
    it('creates a user and returns the persisted record', async () => {
        const user = await userService.adminCreate({
            email: 'created@example.com',
            username: 'createduser',
            password: PLAIN_PASSWORD
        });

        expect(user.id).toBeDefined();
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

describe('userService.adminUpdate', () => {
    it('updates the username and admin flag of an existing user', async () => {
        const user = await createUser();
        const id = user.id.toString();

        const updated = await userService.adminUpdate(id, {
            username: 'new-name',
            admin: true
        });

        expect(updated.username).toBe('new-name');
        expect(updated.admin).toBe(true);
    });

    it('changes the password when a non-empty password is supplied', async () => {
        const user = await createUser({ email: 'pwdupdate@example.com' });
        const id = user.id.toString();
        const originalHash = user.password;

        await userService.adminUpdate(id, { password: 'UpdatedPwd1!' });

        const refreshed = await userRepository.findById(id);
        expect(refreshed!.password).not.toBe(originalHash);
    });

    it('does not touch the password when an empty string is supplied', async () => {
        const user = await createUser();
        const id = user.id.toString();
        const originalHash = user.password;

        await userService.adminUpdate(id, { password: '' });

        const refreshed = await userRepository.findById(id);
        expect(refreshed!.password).toBe(originalHash);
    });

    it('throws when the user does not exist', async () => {
        await expect(
            userService.adminUpdate('000000000000000000000000', { username: 'x' })
        ).rejects.toThrow();
    });
});

describe('userService.remove', () => {
    it('soft-deletes a user by setting deletedAt', async () => {
        const user = await createUser();
        const id = user.id.toString();

        const result = await userService.remove(id);

        expect(result.success).toBe(true);
        const updated = await userRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted user when called again (toggle)', async () => {
        const user = await createUser({ deletedAt: new Date() });
        const id = user.id.toString();

        await userService.remove(id);

        const restored = await userRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes a user when hardDelete is true', async () => {
        const user = await createUser();
        const id = user.id.toString();

        await userService.remove(id, true);

        expect(await userRepository.findById(id)).toBeNull();
    });

    it('returns a 404 rejection when the user does not exist', async () => {
        const result = await userService.remove('000000000000000000000000');

        expect(result.success).toBe(false);
        expect((result as IResponseReject).status).toBe(404);
    });
});

describe('userService.productRemoveFromCartsById', () => {
    it('removes a product from every user cart that contains it', async () => {
        const product = await createProduct();
        const pid = product.id.toString();

        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });

        const addResult1 = await cartService.cartItemSetById(user1, pid, 1);
        const addResult2 = await cartService.cartItemSetById(user2, pid, 2);
        const id1 = (addResult1 as IResponseSuccess<IUserDocument>).data!.id.toString();
        const id2 = (addResult2 as IResponseSuccess<IUserDocument>).data!.id.toString();

        const result = await cartService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);

        const refreshed1 = await userRepository.findById(id1);
        const refreshed2 = await userRepository.findById(id2);
        expect(refreshed1!.cart.items).toHaveLength(0);
        expect(refreshed2!.cart.items).toHaveLength(0);
    });

    it('succeeds even when no user has the product in their cart', async () => {
        const product = await createProduct();
        const pid = product.id.toString();

        const result = await cartService.productRemoveFromCartsById(pid);

        expect(result.success).toBe(true);
    });
});
