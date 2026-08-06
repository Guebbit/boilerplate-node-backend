/**
 * Schema contracts — defaults, requirements and serialization across the models.
 *
 * The existing per-model tests cover the `toJSON` transforms. This file covers the *schema
 * declarations* themselves, which are equally part of the API's behaviour and are not exercised
 * anywhere else:
 *
 *   **Defaults** decide what a client gets for a field it never sent. A product created without
 *   `active` is invisible or visible depending on one word in the schema, and nothing else in the
 *   suite pins which.
 *
 *   **`required`** is the only thing standing between a malformed write and a persisted row that
 *   later breaks every reader. Asserted per field, since each is an independent one-line flag.
 *
 *   **`select: false`** on credentials is the reason `password` and `tokens` do not leak from an
 *   ordinary read — the over-serialization class this repo has already shipped twice.
 *
 * Real Mongo, because these are Mongoose's behaviours rather than ours: a mocked model would
 * assert the mock's opinion of what `default` means.
 */

import { setupTestDb } from '../../helpers/setup-test-db';
import { productRepository } from '@repositories/products';
import { userRepository } from '@repositories/users';
import { feedbackRequestRepository } from '@repositories/feedback-requests';
import { orderRepository } from '@repositories/orders';
import { FeedbackRequestStatus } from '@types';
import { createProduct } from '../../helpers/factories/products';
import { createUser } from '../../helpers/factories/users';

setupTestDb();

describe('product schema', () => {
    it('applies documented defaults for every omitted optional field', async () => {
        const product = await productRepository.create({ title: 'Bare', price: 10 } as never);

        expect(product.description).toBe('');
        expect(product.categories).toEqual([]);
        expect(product.tags).toEqual([]);
        // Inactive by default: a product must be published deliberately, never by omission.
        expect(product.active).toBe(false);
        expect(product.deletedAt).toBeUndefined();
        expect(product.imageUrl).toBeTruthy();
    });

    it('requires a title', async () => {
        await expect(productRepository.create({ price: 10 } as never)).rejects.toThrow();
    });

    it('requires a price', async () => {
        await expect(productRepository.create({ title: 'No price' } as never)).rejects.toThrow();
    });

    it('accepts a price of zero', async () => {
        // `required` on a Number rejects `undefined`, not `0`. A free product is legal, and a
        // truthiness-based guard would wrongly reject it.
        const product = await productRepository.create({ title: 'Free', price: 0 } as never);

        expect(product.price).toBe(0);
    });

    it('stamps createdAt and updatedAt', async () => {
        const product = await createProduct();

        expect(product.createdAt).toBeInstanceOf(Date);
        expect(product.updatedAt).toBeInstanceOf(Date);
    });

    it('serialises to id, never _id or __v', async () => {
        const product = await createProduct({ title: 'Serialised' });

        const serialized = product.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(product._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });
});

describe('user schema', () => {
    it('hides password and tokens from an ordinary read', async () => {
        const created = await createUser({ email: 'hidden@example.com' });

        const found = await userRepository.findById(created.id);

        // `select: false`. This is the exact leak that shipped before — a plain findById must
        // not be able to hand a caller credentials.
        expect(found!.password).toBeUndefined();
        // Undefined rather than an empty array: the field was never selected, which is a
        // stronger guarantee than "selected but blank" — there is nothing to accidentally
        // serialise.
        expect(found!.tokens).toBeUndefined();
    });

    it('exposes credentials only through the explicit selector', async () => {
        const created = await createUser({ email: 'explicit@example.com' });

        const found = await userRepository.findByIdWithCredentials(created.id);

        expect(found!.password).toEqual(expect.any(String));
    });

    it('hashes the password rather than storing it verbatim', async () => {
        const created = await createUser({ email: 'hash@example.com' });

        const found = await userRepository.findByIdWithCredentials(created.id);

        expect(found!.password).not.toBe('Password1!');
        // bcrypt output, not a plain string that merely differs.
        expect(found!.password).toMatch(/^\$2[aby]\$/);
    });

    it('defaults admin to false', async () => {
        const user = await userRepository.create({
            email: 'plain@example.com',
            username: 'plain',
            password: 'Password1!'
        } as never);

        // Privilege by omission would be the worst possible default here.
        expect(user.admin).toBe(false);
    });

    it('starts with an empty cart', async () => {
        const user = await userRepository.create({
            email: 'cart@example.com',
            username: 'carty',
            password: 'Password1!'
        } as never);

        expect(user.cart.items).toEqual([]);
    });

    it('serialises to id, never _id, __v, password or tokens', async () => {
        const created = await createUser({ email: 'json@example.com' });

        const serialized = created.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(created._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
        expect(serialized).not.toHaveProperty('password');
        expect(serialized).not.toHaveProperty('tokens');
    });

    /**
     * FINDING — pinned, not endorsed.
     *
     * `email` carries a plain index (`db/migrations/…-initial-indexes.js`: `{ email: 1 }`, no
     * `unique: true`) and no schema-level `unique`. Uniqueness is enforced only by the
     * application check in `authService.signup` (`findOne({ email })` → 409).
     *
     * That check is not atomic: two concurrent signups for the same address can both pass the
     * lookup and both insert. `login` then does `findOneWithCredentials({ email })` and gets
     * whichever document Mongo returns first — so the winner is arbitrary and can change.
     *
     * Asserted as-is so the current state is explicit. See the report for the fix.
     */
    it('does NOT enforce email uniqueness at the database level', async () => {
        await createUser({ email: 'duplicate@example.com' });

        await expect(createUser({ email: 'duplicate@example.com' })).resolves.toBeDefined();
    });
});

describe('feedback request schema', () => {
    const payload = {
        email: 'ada@example.com',
        subject: 'Subject',
        message: 'Message'
    };

    it('defaults a new request to the "new" status', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        expect(feedback.status).toBe(FeedbackRequestStatus.new);
    });

    it('requires email, subject and message', async () => {
        await expect(
            feedbackRequestRepository.create({ subject: 'S', message: 'M' } as never)
        ).rejects.toThrow();
        await expect(
            feedbackRequestRepository.create({ email: 'a@b.c', message: 'M' } as never)
        ).rejects.toThrow();
        await expect(
            feedbackRequestRepository.create({ email: 'a@b.c', subject: 'S' } as never)
        ).rejects.toThrow();
    });

    it('treats name as optional', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        expect(feedback.name).toBeUndefined();
    });

    it('rejects a status outside the declared enum', async () => {
        // The enum mirrors openapi.yaml. A value outside it would satisfy no client's union
        // type and would be undetectable until something tried to render it.
        await expect(
            feedbackRequestRepository.create({ ...payload, status: 'NOT_A_STATUS' } as never)
        ).rejects.toThrow();
    });

    it('accepts every status the enum declares', async () => {
        for (const status of Object.values(FeedbackRequestStatus)) {
            const feedback = await feedbackRequestRepository.create({
                ...payload,
                status
            } as never);
            expect(feedback.status).toBe(status);
        }
    });

    it('serialises to id, never _id or __v', async () => {
        const feedback = await feedbackRequestRepository.create(payload as never);

        const serialized = feedback.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(feedback._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });
});

/**
 * `items[].product` embeds the whole `productSchema`, not a reference — an order is a
 * *snapshot*, so a later price change must not rewrite past orders. That is why a bare
 * ObjectId fails validation here: title and price are required on the embedded copy.
 */
const makeOrderPayload = async () => {
    const user = await createUser({ email: 'buyer@example.com' });
    const product = await createProduct({ title: 'Bought', price: 12.5 });
    return {
        userId: user._id,
        email: user.email,
        items: [{ product: product.toObject(), quantity: 2 }]
    };
};

describe('order schema', () => {
    it('requires an email', async () => {
        const payload = await makeOrderPayload();

        await expect(
            orderRepository.create({ ...payload, email: undefined } as never)
        ).rejects.toThrow();
    });

    it('serialises to id, never _id or __v', async () => {
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        const serialized = order.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(order._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });

    it('stamps createdAt and updatedAt', async () => {
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        expect(order.createdAt).toBeInstanceOf(Date);
        expect(order.updatedAt).toBeInstanceOf(Date);
    });
});
