/**
 * Order CRUD — the write half of `src/modules/orders/service.ts`.
 *
 * `orders.test.ts` covers the read/aggregation half (`search`). Everything below it —
 * `getById`, `create`, `update`, `updateById`, `remove`, `removeById` — had no unit test at all,
 * which the mutation report showed as a block of uncovered mutants rather than as a low score.
 *
 * Two behaviours here carry real weight:
 *
 *   **Orders embed a product snapshot, not a reference.** `create` looks each product up and
 *   stores a full copy, so that repricing an item later cannot rewrite what a customer was
 *   charged. That is the difference between an order history and a lie, and it is only visible
 *   by mutating the product after the order exists — which is what the snapshot tests do.
 *
 *   **`getById`'s `scope` argument is an authorization boundary.** Without it the lookup is a
 *   plain findById; with it, the order must also match the caller's scope. Passing a scope that
 *   does not match must yield `undefined`, not the order — this is what stops one user reading
 *   another's order by id.
 */

import { asStub } from '@tests/stub';
import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import {
    getById,
    create,
    update,
    updateById,
    remove,
    removeById,
    search,
    callerScope
} from '@modules/orders/service';
import { orderRepository } from '@modules/orders';
import { productRepository } from '@modules/products';
import type { OrderDocument } from '@modules/orders';
import type { ResponseReject, ResponseSuccess } from '@infrastructure/http/response';

setupTestDb();

const MISSING_ID = '507f1f77bcf86cd799439011';

const asReject = (result: unknown) => result as ResponseReject;
const asSuccess = (result: unknown) => result as ResponseSuccess<OrderDocument>;

/** Creates an order through the service, returning the persisted document. */
const seedOrder = async () => {
    const user = await createUser({ email: 'buyer@example.com' });
    const keyboard = await createProduct({ title: 'Keyboard', price: 25 });
    const mouse = await createProduct({ title: 'Mouse', price: 10 });

    const result = await create(String(user._id), user.email, [
        { productId: String(keyboard._id), quantity: 2 },
        { productId: String(mouse._id), quantity: 1 }
    ]);

    return { user, keyboard, mouse, order: asSuccess(result).data! };
};

describe('create', () => {
    it('creates an order and answers 201', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Keyboard', price: 25 });

        const result = await create(String(user._id), user.email, [
            { productId: String(product._id), quantity: 2 }
        ]);

        expect(result.success).toBe(true);
        expect(result.status).toBe(201);
        expect(asSuccess(result).data!.email).toBe(user.email);
    });

    it('stores a full product snapshot on each line', async () => {
        const { order, keyboard } = await seedOrder();

        const line = order.items.find(
            (item) => String((item.product as { _id: unknown })._id) === String(keyboard._id)
        );

        // Not a bare reference: title and price live on the order itself.
        expect(line).toBeDefined();
        expect((line!.product as { title: string }).title).toBe('Keyboard');
        expect((line!.product as { price: number }).price).toBe(25);
        expect(line!.quantity).toBe(2);
    });

    it('keeps the snapshot frozen when the product is later repriced', async () => {
        // The whole reason for embedding rather than referencing. If this regresses, historical
        // orders silently restate themselves at today's prices.
        const { order, keyboard } = await seedOrder();

        keyboard.price = 999;
        await productRepository.save(keyboard);

        const reloaded = await orderRepository.findById(String(order._id));
        const line = reloaded!.items.find(
            (item) => String((item.product as { _id: unknown })._id) === String(keyboard._id)
        );

        expect((line!.product as { price: number }).price).toBe(25);
    });

    it('preserves one line per requested item', async () => {
        const { order } = await seedOrder();

        expect(order.items).toHaveLength(2);
    });

    it('rejects an empty item list with 422', async () => {
        const user = await createUser();

        const result = await create(String(user._id), user.email, []);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(422);
    });

    it('rejects with 404 when any product does not exist', async () => {
        const user = await createUser();
        const product = await createProduct();

        const result = await create(String(user._id), user.email, [
            { productId: String(product._id), quantity: 1 },
            { productId: MISSING_ID, quantity: 1 }
        ]);

        expect(asReject(result).status).toBe(404);
    });

    it('creates nothing when one product is missing', async () => {
        // All-or-nothing: a partially-fulfilled order would charge for items nobody ordered.
        const user = await createUser();

        await create(String(user._id), user.email, [{ productId: MISSING_ID, quantity: 1 }]);

        await expect(orderRepository.count({})).resolves.toBe(0);
    });
});

describe('getById', () => {
    it('returns the order for a bare id lookup', async () => {
        const { order } = await seedOrder();

        const found = await getById(String(order._id));

        expect(String(found!._id)).toBe(String(order._id));
    });

    it('returns undefined for an id that does not exist', async () => {
        await expect(getById(MISSING_ID)).resolves.toBeUndefined();
    });

    it('returns undefined for an empty id without querying', async () => {
        await expect(getById(undefined)).resolves.toBeUndefined();
        await expect(getById('')).resolves.toBeUndefined();
    });

    it('returns the order when the scope matches', async () => {
        const { order, user } = await seedOrder();

        const found = await getById(String(order._id), { userId: user._id });

        expect(found).toBeDefined();
        expect(asStub<{ id: string }>(found).id).toBe(String(order._id));
    });

    /**
     * DIVERGENCE — pinned, not endorsed.
     *
     * The two branches of `getById` return structurally different objects despite one signature:
     *
     *   no scope → `orderRepository.findById()` — a Mongoose document, identified by `_id`.
     *   scope    → an aggregation piped through `applyOrderTransform` — a plain object where
     *              `_id` has been renamed to `id` and the computed totals added.
     *
     * So `order._id` works for the unscoped (admin) path and is `undefined` for the scoped
     * (owner) one, while `order.id` is the reverse — a Mongoose document exposes `id` as a
     * virtual, so that one happens to work both ways. Any caller reading `_id` therefore behaves
     * differently depending on who is asking, which is exactly the kind of role-dependent bug
     * that survives a green suite.
     *
     * See the report for the suggested fix.
     */
    it('returns a transformed plain object when scoped, and a document when not', async () => {
        const { order, user } = await seedOrder();

        const scoped = asStub<Record<string, unknown>>(
            await getById(String(order._id), {
                userId: user._id
            })
        );
        const unscoped = asStub<Record<string, unknown>>(await getById(String(order._id)));

        expect(scoped._id).toBeUndefined();
        expect(scoped.id).toBe(String(order._id));

        expect(unscoped._id).toBeDefined();
        // `id` is a Mongoose virtual, so it resolves on this branch too — which is why the
        // divergence is easy to miss.
        expect(String(unscoped.id)).toBe(String(order._id));
    });

    it('returns undefined when the scope does NOT match', async () => {
        // The authorization boundary: a correct id plus the wrong owner must behave exactly like
        // "no such order", with no hint that it exists.
        const { order } = await seedOrder();
        const stranger = await createUser({ email: 'stranger@example.com' });

        const found = await getById(String(order._id), { userId: stranger._id });

        expect(found).toBeUndefined();
    });

    it('includes the computed totals when scoped', async () => {
        // The scoped path goes through the aggregation, so it must not silently lose the
        // computed fields the unscoped path provides.
        const { order, user } = await seedOrder();

        const found = await getById(String(order._id), { userId: user._id });

        // 2 lines, 3 units, 2×25 + 1×10 = 60.
        expect(found).toMatchObject({ totalItems: 2, totalQuantity: 3, totalPrice: 60 });
    });
});

describe('update', () => {
    it('changes the status along a move the lifecycle allows', async () => {
        const { order } = await seedOrder();

        // A fresh order is `pending`; cancelling is the operator's move from there.
        const result = await update(order, { status: 'cancelled' });

        expect(result.success).toBe(true);
        expect(asSuccess(result).data!.status).toBe('cancelled');
    });

    it('refuses a move the lifecycle does not allow, naming what was open instead', async () => {
        const { order } = await seedOrder();

        const result = await update(order, { status: 'delivered' });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('ORDER_TRANSITION_NOT_ALLOWED');
        expect(asReject(result).errors[0].details).toEqual({
            from: 'pending',
            to: 'delivered',
            allowed: ['cancelled']
        });
    });

    it('leaves the order untouched when the move is refused', async () => {
        // The guard runs before any assignment, so the email in the same request must not land.
        const { order } = await seedOrder();

        await update(order, { status: 'delivered', email: 'moved@example.com' });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.status).toBe('pending');
        expect(reloaded!.email).toBe('buyer@example.com');
    });

    it('refuses to mark an order paid by hand', async () => {
        // `paid` belongs to `system` alone — see docs/theory/tactical-ddd.md §1.
        const { order } = await seedOrder();

        const result = await update(order, { status: 'paid' });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
    });

    it('refuses to reopen a cancelled order', async () => {
        // The path that made this worth fixing: a reopened order is cancellable again, and the
        // refund listener sees a payment that is still `succeeded`.
        const { order } = await seedOrder();
        await update(order, { status: 'cancelled' });

        const result = await update(order, { status: 'pending' });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
    });

    it('accepts a write that repeats the status it already has', async () => {
        const { order } = await seedOrder();

        const result = await update(order, { status: 'pending', email: 'same@example.com' });

        expect(result.success).toBe(true);
        expect(asSuccess(result).data!.email).toBe('same@example.com');
    });

    it('changes the email', async () => {
        const { order } = await seedOrder();

        await update(order, { email: 'new@example.com' });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe('new@example.com');
    });

    it('reassigns the owner', async () => {
        const { order } = await seedOrder();
        const other = await createUser({ email: 'other@example.com' });

        await update(order, { userId: String(other._id) });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(String(reloaded!.userId)).toBe(String(other._id));
        // Stored as an ObjectId, not the string it arrived as — otherwise every scoped
        // aggregation stops matching this order.
        expect(reloaded!.userId).toBeInstanceOf(Types.ObjectId);
    });

    it('leaves untouched fields alone', async () => {
        // Each assignment is guarded by `!== undefined`, so a partial update must be partial.
        const { order } = await seedOrder();
        const originalEmail = order.email;

        await update(order, { status: 'paid' });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.email).toBe(originalEmail);
        expect(reloaded!.items).toHaveLength(2);
    });

    it('replaces the items with fresh snapshots when given', async () => {
        const { order } = await seedOrder();
        const replacement = await createProduct({ title: 'Monitor', price: 200 });

        await update(order, { items: [{ productId: String(replacement._id), quantity: 3 }] });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.items).toHaveLength(1);
        expect((reloaded!.items[0].product as { title: string }).title).toBe('Monitor');
        expect(reloaded!.items[0].quantity).toBe(3);
    });

    it('rejects with 404 when a replacement product does not exist', async () => {
        const { order } = await seedOrder();

        const result = await update(order, { items: [{ productId: MISSING_ID, quantity: 1 }] });

        expect(asReject(result).status).toBe(404);
    });

    it('leaves the existing items intact when a replacement product is missing', async () => {
        const { order } = await seedOrder();

        await update(order, { items: [{ productId: MISSING_ID, quantity: 1 }] });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.items).toHaveLength(2);
    });

    it('treats an empty items array as "no change", not as "empty the order"', async () => {
        // `data.items && data.items.length > 0` — an order with zero lines is not a legal state,
        // so an empty array must be ignored rather than obeyed.
        const { order } = await seedOrder();

        await update(order, { items: [] });

        const reloaded = await orderRepository.findById(String(order._id));
        expect(reloaded!.items).toHaveLength(2);
    });
});

describe('updateById', () => {
    it('updates an existing order', async () => {
        const { order } = await seedOrder();

        const result = await updateById(String(order._id), { status: 'cancelled' });

        expect(result.success).toBe(true);
        expect(asSuccess(result).data!.status).toBe('cancelled');
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await updateById(MISSING_ID, { status: 'cancelled' });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });
});

describe('remove', () => {
    it('soft-deletes by default, keeping the row', async () => {
        const { order } = await seedOrder();

        const result = await remove(order);

        expect(result.success).toBe(true);
        // The record survives — an order is a financial record, and the default must not destroy
        // one. This is the assertion that fails if the default flips back to a hard delete.
        await expect(orderRepository.count({})).resolves.toBe(1);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.deletedAt).toBeInstanceOf(Date);
    });

    it('restores an already soft-deleted order', async () => {
        const { order } = await seedOrder();

        await remove(order);
        await remove(order);

        const stored = await orderRepository.findById(String(order._id));
        // `undefined`, not null: the field is unset, which is what `$exists: false` in
        // `visibleScope` tests for.
        expect(stored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes when asked', async () => {
        const { order } = await seedOrder();

        const result = await remove(order, true);

        expect(result.success).toBe(true);
        await expect(orderRepository.count({})).resolves.toBe(0);
    });
});

describe('removeById', () => {
    it('soft-deletes an existing order by default', async () => {
        const { order } = await seedOrder();

        const result = await removeById(String(order._id));

        expect(result.success).toBe(true);
        const stored = await orderRepository.findById(String(order._id));
        expect(stored).not.toBeNull();
        expect(stored!.deletedAt).toBeInstanceOf(Date);
    });

    it('hard-deletes an existing order when asked', async () => {
        const { order } = await seedOrder();

        const result = await removeById(String(order._id), true);

        expect(result.success).toBe(true);
        await expect(orderRepository.findById(String(order._id))).resolves.toBeNull();
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await removeById(MISSING_ID);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('deletes nothing when the id does not exist', async () => {
        const { order } = await seedOrder();

        await removeById(MISSING_ID, true);

        await expect(orderRepository.findById(String(order._id))).resolves.not.toBeNull();
    });
});

describe('callerScope hides soft-deleted orders', () => {
    it('excludes a soft-deleted order from its own owner, but not from an admin', async () => {
        const { order } = await seedOrder();
        const userId = String(order.userId);

        await removeById(String(order._id));

        const own = await search({}, callerScope({ id: userId, admin: false }));
        expect(own.items).toHaveLength(0);

        const asAdmin = await search({}, callerScope({ id: userId, admin: true }));
        expect(asAdmin.items).toHaveLength(1);
    });
});
