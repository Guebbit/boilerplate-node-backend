/**
 * The order schema's contract — the declarations, not the documents.
 *
 * `tests/integration/model.test.ts` drives this schema through real saves and asserts what comes
 * back. That covers the behaviour and misses the declaration: dropping `required` from `email`,
 * flipping `_id: false` on the embedded item, reversing the direction of the `createdAt` index or
 * turning off `timestamps` all leave every fixture in that suite passing, because none of them
 * changes what a VALID document looks like. Each is a live defect the moment it merges.
 *
 * So this asserts the schema object directly — see `tests/support/schema.ts` for why that needs no
 * database. The two suites are complementary and neither replaces the other: this one says what
 * was declared, that one says what happens when you use it.
 */
import { orderSchema } from '@modules/orders/model';
import { OrderStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathOptions,
    requiredPaths,
    subSchema,
    typeOf
} from '@tests/schema';

describe('orderSchema — what an order must carry', () => {
    it('requires exactly the owner and the contact address', () => {
        // A set, not a list of individual checks: this fails if a `required` is REMOVED (rows
        // start persisting without an owner) and equally if one is ADDED (writes a client was
        // allowed to make start being rejected). Both are breaking, in opposite directions.
        expect(requiredPaths(orderSchema)).toEqual(['email', 'userId']);
    });

    it('stores the owner as an ObjectId, not a string', () => {
        // `$match` inside an aggregation applies no schema casting, so a string here matches zero
        // documents and reads as "you have no orders" rather than as an error. Same reasoning as
        // `orderService.callerScope`, at the other end.
        expect(typeOf(orderSchema, 'userId')).toBe('ObjectId');
    });

    it('leaves notes, shipping method and the soft-delete marker optional', () => {
        // Each absence means something: no note, no delivery chosen, not deleted. A `required`
        // added to any of them makes ordinary orders unsaveable.
        for (const path of ['notes', 'shippingMethod', 'deletedAt'])
            expect(requiredPaths(orderSchema)).not.toContain(path);
    });
});

describe('orderSchema — status', () => {
    it('restricts status to the documented lifecycle states', () => {
        expect(enumOf(orderSchema, 'status')).toEqual(Object.values(OrderStatus));
    });

    it('starts an order as pending', () => {
        // The default is the whole of "a new order has not been paid for". Without it a status is
        // `undefined` and every lifecycle check compares against nothing.
        expect(defaultOf(orderSchema, 'status')).toBe(OrderStatus.pending);
    });
});

describe('orderSchema — money', () => {
    it('defaults shipping cost to zero rather than leaving it absent', () => {
        // What the customer owes for shipping is always a number; an order that chose no method
        // owes nothing. This is what makes `orderTotal`'s tolerance of an absent value a defence
        // against a malformed document rather than a live contract with the schema.
        expect(defaultOf(orderSchema, 'shippingCost')).toBe(0);
    });

    it('refuses a negative shipping cost', () => {
        // A negative shipping cost is a discount applied where nothing checks discounts.
        expect(pathOptions(orderSchema, 'shippingCost').min).toBe(0);
    });
});

describe('orderSchema — the embedded snapshots', () => {
    it('gives order items no _id of their own', () => {
        // `_id: true` would add an ObjectId to every line of every order — changing what is
        // stored and what is serialized — and the shared `OrderItem` contract is
        // `additionalProperties: false`, so the extra field is a contract violation too.
        expect(optionsOf(subSchema(orderSchema, 'items'))._id).toBe(false);
    });

    it('requires a quantity on every item', () => {
        expect(requiredPaths(subSchema(orderSchema, 'items'))).toContain('quantity');
    });

    it('keeps the catalogue index definitions out of the order collection', () => {
        // Mongoose copies an embedded schema's indexes onto whatever embeds it. Without
        // `excludeIndexes`, every index describing how the CATALOGUE is searched would be
        // maintained on every order write, pointed at `items.product.*` — indexes nobody queries.
        expect(pathOptions(subSchema(orderSchema, 'items'), 'product').excludeIndexes).toBe(true);
        // And the proof it worked: no order index mentions the embedded product.
        expect(indexSpecs(orderSchema).filter((spec) => spec.includes('items.'))).toEqual([]);
    });

    it('freezes the shipping address without an _id, requiring everything but the phone', () => {
        const address = subSchema(orderSchema, 'shippingAddress');

        expect(optionsOf(address)._id).toBe(false);
        // An address that can be saved missing its street is not an address.
        expect(requiredPaths(address)).toEqual(['city', 'country', 'fullName', 'street', 'zip']);
        expect(requiredPaths(address)).not.toContain('phone');
    });
});

describe('orderSchema — indexes', () => {
    it('declares exactly the three documented indexes, named and directed', () => {
        // Names are given rather than derived because Mongo identifies an index by name: a rename
        // leaves the old index in production and builds a second copy beside it. The DIRECTION on
        // `createdAt` is what serves "my orders, newest first" from the index instead of sorting
        // in memory — a change there is a latency incident, never a wrong answer.
        expect(indexSpecs(orderSchema)).toEqual([
            'orders_email: email+1',
            'orders_userId_createdAt: userId+1, createdAt-1',
            'orders_userId_deletedAt: userId+1, deletedAt+1'
        ]);
    });

    it('declares none of them unique or sparse', () => {
        // A unique index here would reject a customer's second order. Stated explicitly because
        // "no options" is the kind of fact that is never written down and quietly acquires one.
        expect(indexOptionSpecs(orderSchema)).toEqual([
            'orders_email: (none)',
            'orders_userId_createdAt: (none)',
            'orders_userId_deletedAt: (none)'
        ]);
    });
});

describe('orderSchema — options', () => {
    it('keeps createdAt and updatedAt', () => {
        // Every "recent first" ordering in the app, and the compound index above, depend on
        // `createdAt` actually being written.
        expect(optionsOf(orderSchema).timestamps).toBe(true);
    });
});
