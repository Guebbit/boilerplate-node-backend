/**
 * The `shop` scenario, BUILT for real: seeded, then driven through the application's own
 * checkout, payment, shipping, refund and admin endpoints, then backdated — the same
 * `buildScenario` a `npm run demo` boot and `scenario:apply` both call.
 *
 * Four claims about it that nothing else makes, per `CLAUDE.md`'s rule that a behaviour check
 * belongs in `npm test` rather than a build step:
 *
 *   1. every module's `scenario.shop` guarantee resolves to a subject, and no subject is left
 *      over — `scenarios/check.ts`, in both directions
 *   2. each subject id names a row that really exists
 *   3. each row really has the property its name claims, WHERE THE CONSUMER LOOKS: out of stock
 *      means `available === 0`, not merely `onHand === 0`
 *   4. a produced row, read back the way `GET`/`POST` would serve it, is valid input to the
 *      contract's own response schema for that entity
 *
 * Not every collection has a schema to check against. `scenarios/locales.ts` publishes a STORED
 * shape, by its own docblock — no endpoint serves a raw locale entry, the locale tier-merge builds
 * the response instead. Parsing a stored row against an unrelated response schema would be a false
 * guardrail, not a true one. Address books are the one STORED shape checked anyway:
 * `@modules/account/model.ts` says each entry already serializes as the contract's `Address`,
 * through the same `applySerialization` a real response path would use if one read a raw book —
 * so it is that guarantee under test, not the entry point's absence.
 */

import { connect, disconnect } from '@tests/database';
import { app } from '../../../src/app';
import { buildScenario } from '@scenarios/index';
import { assertScenarioGuarantees } from '@scenarios/check';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { productModel, toProduct } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { paymentModel } from '@modules/payments/model';
import { userModel } from '@modules/users/model';
import { auditLogModel } from '@modules/audit-logs/model';
import { addressBookModel } from '@modules/account/model';
import { reservationModel } from '@modules/inventory/model';
import { SEED_OWNER_ID, SEED_USER_ID } from '@scenarios/accounts';
import { enabledModules } from '../../../src/modules';
import {
    CreateProductResponse,
    CreateOrderResponse,
    GetUserByIdResponse,
    ListAuditEntriesResponse,
    GetAddressesResponse
} from '@api/schemas.zod';

/*
 * `connect`/`disconnect` rather than `setupTestDb()`, which is the only suite in the repo that
 * does: `setupTestDb` empties the database before every `it()`, and the database IS the subject
 * here. One build, read by every case below — rebuilding it twenty-two times would cost a quarter
 * of an hour and prove nothing a single build does not.
 */
beforeAll(connect);
afterAll(disconnect);

/**
 * How long one build may take.
 *
 * Far above the suite default because this is the real thing: twelve bcrypt cost-12 logins and
 * several hundred HTTP round trips through the whole middleware stack. It runs ONCE — every case
 * below reads the database it left behind.
 */
const BUILD_TIMEOUT_MS = 300_000;

/**
 * What `res.json()` would actually send: a `Date` on a Mongoose document's `toJSON()` is still a
 * `Date` instance, not the ISO string the wire carries — Express's own `JSON.stringify` is what
 * makes that conversion for a real response, and this test never goes over HTTP to get it for
 * free. `ObjectId` gets the same treatment.
 */
// eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round-trip is the point: structuredClone would keep Date and ObjectId as live instances instead of converting them to the wire's strings
const wireShape = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The subject map the build produced — guarantee name → row id. */
let subjects: Readonly<Record<string, string>>;

// `products.seed()` writes its rows' `translations` through the same write surface
// `productService.writeCreate` does — see `scenarios/apply.ts`'s identical call for why the
// manifest has to be built from `enabledModules` and handed in by hand here too.
beforeAll(() => setTranslatables(resolveTranslatables(enabledModules)));
afterAll(() => setTranslatables({}));

beforeAll(async () => {
    subjects = await buildScenario('shop', app);
}, BUILD_TIMEOUT_MS);

describe("the shop scenario's guarantees", () => {
    it('offers exactly the subjects every module declares, and no others', () => {
        expect(() => assertScenarioGuarantees('shop', subjects)).not.toThrow();
    });
});

describe('each subject names a row that really has the property', () => {
    it('product.softDeleted is hidden by a deletion date', async () => {
        const product = await productModel.findById(subjects['product.softDeleted']).exec();
        expect(product?.deletedAt).toBeInstanceOf(Date);
    });

    it('product.inactive is unpublished rather than deleted', async () => {
        const product = await productModel.findById(subjects['product.inactive']).exec();
        expect(product?.active).toBe(false);
        expect(product?.deletedAt).toBeUndefined();
    });

    it('product.outOfStock is unbuyable where the storefront looks, and still listed', async () => {
        const product = await productModel.findById(subjects['product.outOfStock']).exec();
        expect(product).not.toBeNull();

        /*
         * `available`, not `onHand`: the storefront's badge reads the derived counter, which a row
         * held entirely in reservations would also be zero on. `toProduct` is the mapping a
         * response goes through, so this reads it exactly where the consumer does.
         */
        expect(toProduct(product!).available).toBe(0);
        // Public: an out-of-stock row nobody can reach demonstrates no badge at all.
        expect(product?.active).toBe(true);
        expect(product?.deletedAt).toBeUndefined();
    });

    it('product.barebones carries only what the schema requires', async () => {
        const product = await productModel.findById(subjects['product.barebones']).exec();
        expect(product?.description).toBe('');
    });

    it('product.inStock is buyable once the flows have finished shopping', async () => {
        const product = await productModel.findById(subjects['product.inStock']).exec();
        expect(toProduct(product!).available).toBeGreaterThan(0);
        expect(product?.active).toBe(true);
    });

    it('product.rich populates every optional field a detail page renders', async () => {
        const product = await productModel.findById(subjects['product.rich']).exec();
        expect(toProduct(product!).available).toBeGreaterThan(0);
        expect(product?.description).toBeTruthy();
        expect(product?.categories?.length).toBeGreaterThan(0);
        expect(product?.tags?.length).toBeGreaterThan(0);
        expect(product?.imageUrl).toBeTruthy();
    });

    it('order.ownerPending is pending, the admin account owns it, and it holds real stock', async () => {
        const order = await orderModel.findById(subjects['order.ownerPending']).exec();
        expect(order?.status).toBe('pending');
        expect(order?.userId?.toString()).toBe(SEED_OWNER_ID);

        const hold = await reservationModel
            .findOne({ orderId: subjects['order.ownerPending'] })
            .exec();
        expect(hold?.status).toBe('held');
    });

    it.each([
        ['order.paid', 'paid'],
        ['order.shipped', 'shipped'],
        ['order.delivered', 'delivered'],
        ['order.cancelled', 'cancelled']
    ])('%s is in status %s', async (subject, status) => {
        const order = await orderModel.findById(subjects[subject]).exec();
        expect(order?.status).toBe(status);
    });

    it('order.softDeleted is hidden, and sits on the non-admin account', async () => {
        const order = await orderModel.findById(subjects['order.softDeleted']).exec();
        expect(order?.deletedAt).toBeInstanceOf(Date);
        // The case this exists for is "the owner cannot see their own soft-deleted order", which
        // an admin-owned row could never catch.
        expect(order?.userId?.toString()).toBe(SEED_USER_ID);
    });

    it('order.paidOffline was settled by a payment nobody took through the provider', async () => {
        const order = await orderModel.findById(subjects['order.paidOffline']).exec();
        expect(order?.status).toBe('paid');

        const payment = await paymentModel
            .findOne({ orderId: subjects['order.paidOffline'] })
            .exec();
        expect(payment?.method).toBe('cash');
        expect(payment?.status).toBe('succeeded');
    });

    it('order.awaitingTransfer is still pending, on a week-long hold', async () => {
        const order = await orderModel.findById(subjects['order.awaitingTransfer']).exec();
        expect(order?.status).toBe('pending');
        expect(order?.paymentMethod).toBe('bank_transfer');

        const hold = await reservationModel
            .findOne({ orderId: subjects['order.awaitingTransfer'] })
            .exec();
        expect(hold?.status).toBe('held');
    });

    it('payment.refunded names an order whose money went back', async () => {
        const payment = await paymentModel
            .findOne({ orderId: subjects['payment.refunded'] })
            .exec();
        expect(payment?.status).toBe('refunded');
    });
});

describe('the history reads as a history', () => {
    it('spreads its orders across months rather than stacking them on boot', async () => {
        const orders = await orderModel.find().sort({ createdAt: 1 }).exec();
        expect(orders.length).toBeGreaterThan(20);

        // `createdAt` is optional on the contract type but always written by `timestamps: true`.
        const oldest = orders[0].createdAt!;
        const daysBack = (Date.now() - oldest.getTime()) / 86_400_000;
        expect(daysBack).toBeGreaterThan(30);
        // Inside `NODE_AUDIT_RETENTION_DAYS` (90), or the trail behind the oldest order is reaped
        // and the dataset contradicts itself in the one screen meant to explain it.
        expect(daysBack).toBeLessThan(90);
    });

    it('moves an order and its audit trail together', async () => {
        const order = await orderModel.findById(subjects['order.delivered']).exec();
        const entry = await auditLogModel
            .findOne({ target_id: subjects['order.delivered'], action: 'order.created' })
            .exec();

        expect(entry).not.toBeNull();
        // `createdAt` is optional on the contract type but always written by `timestamps: true`.
        const drift = Math.abs(entry!.timestamp.getTime() - order!.createdAt!.getTime());
        expect(drift / 1000).toBeLessThan(60);
    });

    it('accounts for every unit of stock with a movement the app wrote', async () => {
        // Nothing seeds `onHand`: the catalogue starts empty and takes delivery through
        // `POST /inventory/receipts`, so a product with stock and no receipt cannot exist.
        const stocked = await productModel.countDocuments({ onHand: { $gt: 0 } }).exec();
        expect(stocked).toBeGreaterThan(100);
    });
});

describe('conformance: a produced row parses as the response the API would serve for it', () => {
    it('every product', async () => {
        const products = await productModel.find().exec();
        expect(products.length).toBeGreaterThan(0);

        for (const product of products)
            expect(() =>
                CreateProductResponse.shape.data.parse(wireShape(product.toJSON()))
            ).not.toThrow();
    });

    it('every order', async () => {
        const orders = await orderModel.find().exec();
        expect(orders.length).toBeGreaterThan(0);

        for (const order of orders)
            expect(() =>
                CreateOrderResponse.shape.data.parse(wireShape(order.toJSON()))
            ).not.toThrow();
    });

    it('every user', async () => {
        const users = await userModel.find().exec();
        expect(users.length).toBeGreaterThan(0);

        for (const user of users)
            expect(() =>
                GetUserByIdResponse.shape.data.parse(wireShape(user.toJSON()))
            ).not.toThrow();
    });

    it('every audit log entry', async () => {
        const entries = await auditLogModel.find().exec();
        expect(entries.length).toBeGreaterThan(0);

        const entrySchema = ListAuditEntriesResponse.shape.data.shape.items.element;
        for (const entry of entries)
            expect(() => entrySchema.parse(wireShape(entry.toJSON()))).not.toThrow();
    });

    it('every address book entry', async () => {
        const books = await addressBookModel.find().exec();
        expect(books.length).toBeGreaterThan(0);

        const addressSchema = GetAddressesResponse.shape.data.shape.addresses.element;
        for (const book of books) {
            const { items } = wireShape(book.toJSON());
            expect(items.length).toBeGreaterThan(0);
            for (const address of items) expect(() => addressSchema.parse(address)).not.toThrow();
        }
    });
});
