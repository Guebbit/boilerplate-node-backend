/**
 * The `shop` scenario, driven against a real database. Two claims about it that nothing else
 * makes, per `CLAUDE.md`'s rule that a behaviour check belongs in `npm test`, not a build step:
 *
 *   1. every module's `scenario.shop` guarantee is actually satisfied once seeded
 *   2. a seeded row, read back the way `GET`/`POST` would serve it, is valid input to the
 *      contract's own response schema for that entity
 *
 * Not every collection has a schema to check against. `scenarios/cart.ts` and `scenarios/locales.ts`
 * publish STORED shapes, by their own docblocks — no endpoint serves a raw cart or a raw locale
 * entry, `@modules/cart/service` and the locale tier-merge build the response instead. Parsing a
 * stored row against an unrelated response schema would be a false guardrail, not a true one.
 * Address books are the one STORED shape checked anyway: `@modules/account/model.ts` says each
 * entry already serializes as the contract's `Address`, through the same `applySerialization` a
 * real response path would use if one read a raw book — so it is that guarantee under test, not
 * the entry point's absence.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedShop, shopModules } from '@scenarios/index';
import { assertScenarioGuarantees } from '@scenarios/check';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { productModel } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { userModel } from '@modules/users/model';
import { auditLogModel } from '@modules/audit-logs/model';
import { addressBookModel } from '@modules/account/model';
import { enabledModules } from '../../../src/modules';
import {
    CreateProductResponse,
    CreateOrderResponse,
    GetUserByIdResponse,
    ListAuditEntriesResponse,
    GetAddressesResponse
} from '@api/schemas.zod';

setupTestDb();

// `products.seed()` writes its rows' `translations` through the same write surface
// `productService.writeCreate` does — see `scenarios/apply.ts`'s identical call for why the
// manifest has to be built from `enabledModules` and handed in by hand here too.
beforeAll(() => setTranslatables(resolveTranslatables(enabledModules)));
afterAll(() => setTranslatables({}));

beforeEach(() => seedShop());

/**
 * What `res.json()` would actually send: a `Date` on a Mongoose document's `toJSON()` is still a
 * `Date` instance, not the ISO string the wire carries — Express's own `JSON.stringify` is what
 * makes that conversion for a real response, and this test never goes over HTTP to get it for
 * free. `ObjectId` gets the same treatment.
 */
// eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round-trip is the point: structuredClone would keep Date and ObjectId as live instances instead of converting them to the wire's strings
const wireShape = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("the shop scenario's guarantees, actually seeded", () => {
    it('satisfies every guarantee every module declares', async () => {
        await expect(assertScenarioGuarantees('shop', shopModules)).resolves.toBeUndefined();
    });
});

describe('conformance: a seeded row parses as the response the API would serve for it', () => {
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
