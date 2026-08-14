/**
 * Inventory — the ledger hears every mover, and only movers that stood.
 *
 * These tests register the full module closure on purpose: the rows come from OTHER modules'
 * announcements (checkout, cancel, the admin product form), and a suite that called
 * `recordMovement` by hand would assert the ledger works while every emitter stays silent.
 * The shelf count itself is asserted alongside each row — the ledger explains, products stay
 * authoritative, and the two must agree at every step here.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { cartService } from '@modules/cart';
import { orderService } from '@modules/orders';
import { productService, productRepository } from '@modules/products';
import { restock, listMovements } from '@modules/inventory/service';
import { stockMovementRepository } from '@modules/inventory/repository';
import inventoryModule from '@modules/inventory/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import type { IResponseReject } from '@infrastructure/http/response';

// The confirmation email rides checkout; this suite is about the ledger, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

setupTestDb();

const asReject = (result: unknown) => result as IResponseReject;

beforeEach(() => {
    registerModules([
        accountModule,
        productsModule,
        usersModule,
        ordersModule,
        paymentsModule,
        deliveryModule,
        cartModule,
        inventoryModule
    ]);
});

afterEach(() => {
    resetDomainEvents();
});

describe('the ledger hears a checkout', () => {
    it('one negative row per bought line, referenced to the order, shelf agreeing', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });
        await cartService.cartItemSetById(user.id, String(product._id), 3);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(true);
        const rows = await stockMovementRepository.findLatest(String(product._id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.delta).toBe(-3);
        expect(rows[0]!.reason).toBe('order');
        expect(rows[0]!.reference).toBe(String(result.data!._id));
        const stored = await productRepository.findByIdRaw(String(product._id));
        expect(stored!.stock).toBe(7);
    });

    it('a refused checkout writes nothing — a movement fully undone is not a fact', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 2 });
        await cartService.cartItemSetById(user.id, String(product._id), 5);

        const result = await cartService.orderConfirm(user.id);

        expect(result.success).toBe(false);
        await expect(stockMovementRepository.count({})).resolves.toBe(0);
    });
});

describe('the ledger hears a cancel', () => {
    it('the units come back as a positive row against the same order', async () => {
        const user = await createUser();
        const product = await createProduct({ stock: 10 });
        await cartService.cartItemSetById(user.id, String(product._id), 2);
        const order = await cartService.orderConfirm(user.id);
        const orderId = String(order.data!._id);

        await orderService.cancelById(orderId, { id: user.id, admin: false });

        const rows = await stockMovementRepository.findLatest(String(product._id));
        expect(rows.map(({ delta, reason }) => ({ delta, reason }))).toEqual([
            { delta: 2, reason: 'order-cancelled' },
            { delta: -2, reason: 'order' }
        ]);
        const stored = await productRepository.findByIdRaw(String(product._id));
        expect(stored!.stock).toBe(10);
    });
});

describe('the ledger hears the admin form', () => {
    it('an absolute stock write lands as the relative movement it amounts to', async () => {
        const product = await createProduct({ stock: 25 });

        await productService.update(product, { stock: 40 });

        const rows = await stockMovementRepository.findLatest(String(product._id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.delta).toBe(15);
        expect(rows[0]!.reason).toBe('adjustment');
    });

    it('an update that does not touch stock stays off the ledger', async () => {
        const product = await createProduct({ stock: 25 });

        await productService.update(product, { title: 'Renamed' });

        await expect(stockMovementRepository.count({})).resolves.toBe(0);
    });
});

describe('restock', () => {
    it('puts the units on the shelf and the row in the book', async () => {
        const product = await createProduct({ stock: 4 });

        const result = await restock(String(product._id), 20);

        expect(result.success).toBe(true);
        expect(result.success && result.data!.stock).toBe(24);
        const rows = await stockMovementRepository.findLatest(String(product._id));
        expect(rows[0]!.delta).toBe(20);
        expect(rows[0]!.reason).toBe('restock');
    });

    it('refuses an unknown product and writes nothing', async () => {
        const result = await restock('507f1f77bcf86cd799439011', 5);

        expect(asReject(result).status).toBe(404);
        await expect(stockMovementRepository.count({})).resolves.toBe(0);
    });
});

describe('listMovements', () => {
    it('answers newest first and narrows to one product', async () => {
        const first = await createProduct({ stock: 5 });
        const second = await createProduct({ stock: 5 });
        await restock(String(first._id), 1);
        await restock(String(second._id), 2);
        await restock(String(first._id), 3);

        const all = await listMovements();
        const onlyFirst = await listMovements(String(first._id));

        expect(all.data!.items).toHaveLength(3);
        expect(onlyFirst.data!.items.map(({ delta }) => delta)).toEqual([3, 1]);
    });
});
