/**
 * @module
 * `makeWishlist` — the wishlist fixture builder.
 *
 * It takes bare product ids rather than `{ productId }` objects, because a wishlist line IS a
 * product id and nothing else. The mapping into line shape happens here, which is what keeps every
 * seed file from repeating it.
 */
import { Types } from 'mongoose';
import { makeWishlist } from '@modules/wishlist/fixtures';

const USER = '65dc8a99604c307b702b5ccc';
const PANINO = '65dcdec2b18ad5e4bd597f0f';
const PUFETTINO = '65dc9be92f2794d1c16741e1';

describe('makeWishlist', () => {
    it('stores the owner as a real ObjectId', () => {
        const wishlist = makeWishlist({ userId: USER });

        expect(wishlist.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(wishlist.userId)).toBe(USER);
    });

    it('omits items when none are given, so the schema default applies', () => {
        expect(Object.hasOwn(makeWishlist({ userId: USER }), 'items')).toBe(false);
    });

    it('wraps each bare product id into a line, as a real ObjectId', () => {
        const wishlist = makeWishlist({ userId: USER, productIds: [PANINO, PUFETTINO] });

        expect(wishlist.items).toHaveLength(2);
        expect(wishlist.items![0].productId).toBeInstanceOf(Types.ObjectId);
        expect(wishlist.items!.map((item) => String(item.productId))).toEqual([PANINO, PUFETTINO]);
    });

    it('gives a line nothing but a product id', () => {
        // No quantity, deliberately — that is the whole difference from a cart line, and a
        // fixture that added one would seed documents the schema strips and the contract forbids.
        const wishlist = makeWishlist({ userId: USER, productIds: [PANINO] });

        expect(Object.keys(wishlist.items![0])).toEqual(['productId']);
    });

    it('keeps an explicitly empty list distinct from an absent one', () => {
        expect(makeWishlist({ userId: USER, productIds: [] }).items).toEqual([]);
    });
});
