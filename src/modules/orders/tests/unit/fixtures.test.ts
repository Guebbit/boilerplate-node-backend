/**
 * `makeOrder` — the order fixture builder, and the product SNAPSHOT it embeds.
 *
 * An order stores what was bought, not a reference to what the catalogue says today, so this
 * builder's real work is `toSnapshot`: it takes a product-shaped override and produces the frozen
 * copy `orderItemSchema` embeds. Two properties matter and neither is visible from a saved
 * document:
 *
 *   - the snapshot's id is `_id`, a real ObjectId, not the `id` string the override carries. An
 *     embedded snapshot keyed by `id` would serialize as a product with no id at all, because
 *     `applyProductTransform` renames `_id` and finds nothing.
 *   - `title` and `price` are always present, because they are what the confirmation email and
 *     the invoice render. Everything else is compacted away and left to the schema.
 */
import { Types } from 'mongoose';
import { makeOrder } from '@modules/orders/fixtures';

const HEX = '65dc8a99604c307b702b5ccc';
const PRODUCT = '65dcdec2b18ad5e4bd597f0f';

/** The minimum a snapshot override must state, per `OrderSnapshotInput`. */
const PANINO = { id: PRODUCT, title: 'Sallyno Panino', price: 100 };

describe('makeOrder — identity and defaults', () => {
    it('builds a complete order with no overrides at all', () => {
        const order = makeOrder();

        expect(order._id).toBeInstanceOf(Types.ObjectId);
        expect(order.userId).toBeInstanceOf(Types.ObjectId);
        // The schema requires an email; the fixture has to carry one or every bare `makeOrder()`
        // is an invalid document.
        expect(order.email).toBe('test@example.com');
    });

    it('mints an owner when none is given, rather than leaving the field absent', () => {
        // `userId` is required and is the scoping key for every non-admin read. An absent one
        // would make the fixture unsaveable; a shared constant would make two "different" users'
        // orders visible to each other.
        expect(makeOrder().userId).toBeInstanceOf(Types.ObjectId);
        expect(String(makeOrder().userId)).not.toBe(String(makeOrder().userId));
    });

    it('takes the owner it is given, as a real ObjectId', () => {
        // A string here matches nothing inside the aggregation `$match` that `callerScope`
        // builds, so the seeded order would read as "not yours" to its own owner.
        const order = makeOrder({ userId: HEX });

        expect(order.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(order.userId)).toBe(HEX);
    });

    it('starts with no items rather than an absent list', () => {
        // `items` is an array path the totals read; `undefined` there is a different code path in
        // every consumer of an order.
        expect(makeOrder().items).toEqual([]);
    });

    it('omits the optional fields, leaving the schema to default them', () => {
        const order = makeOrder();

        for (const field of ['shippingMethod', 'shippingAddress', 'notes', 'deletedAt'])
            expect(Object.hasOwn(order, field)).toBe(false);
    });

    it('keeps a zero shipping cost rather than dropping it as unspecified', () => {
        // Falsy and meaningful: an order that chose no delivery owes nothing, and that is a
        // different fixture from one that never stated a cost.
        expect(makeOrder({ shippingCost: 0 }).shippingCost).toBe(0);
    });

    it('converts a soft-delete timestamp from an ISO string', () => {
        expect(makeOrder({ deletedAt: '2026-08-27T10:00:00.000Z' }).deletedAt).toBeInstanceOf(Date);
    });
});

describe('makeOrder — the embedded product snapshot', () => {
    it('keys the snapshot by _id, as a real ObjectId', () => {
        const order = makeOrder({ items: [{ product: PANINO, quantity: 2 }] });
        const snapshot = order.items![0].product;

        // `_id`, not `id`: `applyProductTransform` renames `_id` on the way out, so a snapshot
        // carrying `id` serializes as a product with no id and the invoice cannot link to it.
        expect(snapshot._id).toBeInstanceOf(Types.ObjectId);
        expect(String(snapshot._id)).toBe(PRODUCT);
        expect(Object.hasOwn(snapshot, 'id')).toBe(false);
    });

    it('always carries the title and price the email and invoice render', () => {
        const snapshot = makeOrder({ items: [{ product: PANINO, quantity: 1 }] }).items![0].product;

        expect(snapshot.title).toBe('Sallyno Panino');
        expect(snapshot.price).toBe(100);
    });

    it('keeps the quantity beside the snapshot, not inside it', () => {
        const line = makeOrder({ items: [{ product: PANINO, quantity: 3 }] }).items![0];

        expect(line.quantity).toBe(3);
        expect(Object.hasOwn(line.product, 'quantity')).toBe(false);
    });

    it('omits the catalogue fields the snapshot was not given', () => {
        const snapshot = makeOrder({ items: [{ product: PANINO, quantity: 1 }] }).items![0].product;

        for (const field of ['categories', 'tags', 'active', 'onHand', 'reserved'])
            expect(Object.hasOwn(snapshot, field)).toBe(false);
    });

    it('freezes the catalogue fields it IS given', () => {
        // The whole reason a snapshot exists: an order keeps what was bought. A field stated on
        // the override has to survive into the stored copy.
        const snapshot = makeOrder({
            items: [{ product: { ...PANINO, categories: ['food'], active: false }, quantity: 1 }]
        }).items![0].product;

        expect(snapshot.categories).toEqual(['food']);
        expect(snapshot.active).toBe(false);
    });

    it('converts the snapshot"s own timestamps from ISO strings', () => {
        const snapshot = makeOrder({
            items: [
                {
                    product: { ...PANINO, deletedAt: '2026-08-27T10:00:00.000Z' },
                    quantity: 1
                }
            ]
        }).items![0].product;

        // A product soft-deleted after the order was placed still has to render on the invoice.
        expect(snapshot.deletedAt).toBeInstanceOf(Date);
    });

    it('builds one snapshot per line, in order', () => {
        const other = { id: '65dc9be92f2794d1c16741e1', title: 'Pufettino', price: 7.5 };
        const order = makeOrder({
            items: [
                { product: PANINO, quantity: 1 },
                { product: other, quantity: 2 }
            ]
        });

        expect(order.items!.map((line) => line.product.title)).toEqual([
            'Sallyno Panino',
            'Pufettino'
        ]);
    });
});
