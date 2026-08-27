/**
 * `makeCart` — the cart fixture builder.
 *
 * Its one job beyond identity is turning the string product ids a seed file writes into real
 * `ObjectId`s. A line whose `productId` stayed a string matches nothing when the service reads
 * the cart back and joins against the catalogue, so the fixture produces a cart that looks
 * populated and behaves as if it were empty.
 */
import { Types } from 'mongoose';
import { makeCart } from '@modules/cart/factory';

const USER = '65dc8a99604c307b702b5ccc';
const PRODUCT = '65dcdec2b18ad5e4bd597f0f';

describe('makeCart', () => {
    it('stores the owner as a real ObjectId', () => {
        const cart = makeCart({ userId: USER });

        expect(cart.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(cart.userId)).toBe(USER);
    });

    it('omits items entirely when none are given, so the schema default applies', () => {
        // `items: []` here would work, but stating it makes the fixture rather than the schema
        // the authority on what an empty cart is — and the two would then have to be kept in step.
        expect(Object.hasOwn(makeCart({ userId: USER }), 'items')).toBe(false);
    });

    it('converts each line"s product id and keeps its quantity', () => {
        const cart = makeCart({
            userId: USER,
            items: [{ productId: PRODUCT, quantity: 3 }]
        });

        expect(cart.items![0].productId).toBeInstanceOf(Types.ObjectId);
        expect(String(cart.items![0].productId)).toBe(PRODUCT);
        expect(cart.items![0].quantity).toBe(3);
    });

    it('keeps an explicitly empty item list distinct from an absent one', () => {
        // `[]` means "this cart was emptied"; absent means "unspecified". A fixture that
        // collapsed them could not seed a cart that exists and holds nothing.
        const cart = makeCart({ userId: USER, items: [] });

        expect(cart.items).toEqual([]);
    });

    it('preserves the order of the lines it is given', () => {
        const second = '65dc9be92f2794d1c16741e1';
        const cart = makeCart({
            userId: USER,
            items: [
                { productId: PRODUCT, quantity: 1 },
                { productId: second, quantity: 2 }
            ]
        });

        expect(cart.items!.map((item) => String(item.productId))).toEqual([PRODUCT, second]);
    });
});
