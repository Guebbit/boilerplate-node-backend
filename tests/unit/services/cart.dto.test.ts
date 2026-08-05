/**
 * Cart DTO projections — `src/services/cart.dto.ts`.
 *
 * Pure mapping code sitting directly on the wire boundary, which is why it is worth testing
 * exhaustively rather than by sample:
 *
 *   `toIdString` accepts four different id representations because a cart item's `product` may
 *   arrive as an ObjectId, a string, a populated document, or a lean object — and returning ''
 *   for an unrecognised shape means a cart line silently loses its product reference rather than
 *   throwing.
 *
 *   `toCartProductDto` is ten independent conditional spreads. Each one decides whether a field
 *   appears in the response at all. A type guard that stops matching does not error; the field
 *   just vanishes, and only a client that happened to render it notices.
 *
 *   `toCartItemResponse` is the over-serialization guard: `CartItem` is
 *   `additionalProperties: false` over `{ productId, quantity }`, and the populated product must
 *   not cross the wire. That has shipped as a bug here before.
 */

import { Types } from 'mongoose';
import { toIdString, toCartItemDto, toCartItemResponse, toUserCartDto } from '@services/cart.dto';
import type { ICartItem, IUserDocument } from '@models/users';

/** `ICartItem.product` is typed as ObjectId but legitimately holds populated shapes at runtime. */
const asProduct = (value: unknown) => value as ICartItem['product'];

describe('toIdString', () => {
    it('stringifies an ObjectId', () => {
        const id = new Types.ObjectId();

        expect(toIdString(id)).toBe(id.toString());
    });

    it('passes a string through unchanged', () => {
        expect(toIdString('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    });

    it('reads a string `id` property', () => {
        // The lean/serialized shape, after a toJSON transform has already renamed _id.
        expect(toIdString({ id: 'abc' })).toBe('abc');
    });

    it('recurses into `_id` when there is no `id`', () => {
        const id = new Types.ObjectId();

        expect(toIdString({ _id: id })).toBe(id.toString());
    });

    it('prefers a string `id` over `_id`', () => {
        // Order matters: a populated Mongoose document carries both, and `id` is the virtual
        // that already reflects the toJSON contract.
        const other = new Types.ObjectId();

        expect(toIdString({ id: 'preferred', _id: other })).toBe('preferred');
    });

    it('ignores a non-string `id` and falls back to `_id`', () => {
        const id = new Types.ObjectId();

        expect(toIdString({ id: 12345, _id: id })).toBe(id.toString());
    });

    it('handles a nested _id chain', () => {
        expect(toIdString({ _id: { _id: 'deep' } })).toBe('deep');
    });

    it('returns an empty string for null', () => {
        // `value !== null` guard — `typeof null === 'object'`, so without it this throws.
        expect(toIdString(null)).toBe('');
    });

    it('returns an empty string for undefined', () => {
        expect(toIdString(undefined)).toBe('');
    });

    it('returns an empty string for a number', () => {
        expect(toIdString(42)).toBe('');
    });

    it('returns an empty string for an object with neither id nor _id', () => {
        expect(toIdString({ title: 'no id here' })).toBe('');
    });
});

describe('toCartItemDto', () => {
    it('maps ObjectId product references to productId', () => {
        const productId = new Types.ObjectId();

        const dto = toCartItemDto({ product: productId, quantity: 2 } as ICartItem);

        expect(dto).toEqual({
            productId: productId.toString(),
            quantity: 2,
            // A bare reference is not a populated product — inventing a `{ id }` stub here would
            // make "not loaded" indistinguishable from "loaded but empty".
            product: undefined
        });
    });

    it('leaves product undefined for a bare string reference', () => {
        // The lean-query shape: `product` comes back as a plain id string rather than an
        // ObjectId, and must be treated as "not populated" just the same.
        const dto = toCartItemDto({
            product: asProduct('507f1f77bcf86cd799439011'),
            quantity: 1
        } as ICartItem);

        expect(dto.productId).toBe('507f1f77bcf86cd799439011');
        expect(dto.product).toBeUndefined();
    });

    it('preserves the quantity verbatim', () => {
        const dto = toCartItemDto({ product: new Types.ObjectId(), quantity: 7 } as ICartItem);

        expect(dto.quantity).toBe(7);
    });

    it('maps every populated product field', () => {
        const productId = new Types.ObjectId();
        const created = new Date('2024-01-01T00:00:00.000Z');
        const updated = new Date('2024-02-01T00:00:00.000Z');
        const deleted = new Date('2024-03-01T00:00:00.000Z');

        const dto = toCartItemDto({
            product: asProduct({
                _id: productId,
                title: 'Keyboard',
                price: 99,
                description: 'Clicky',
                imageUrl: '/images/k.png',
                categories: ['tools'],
                tags: ['new'],
                active: true,
                createdAt: created,
                updatedAt: updated,
                deletedAt: deleted
            }),
            quantity: 1
        } as ICartItem);

        expect(dto.product).toEqual({
            id: productId.toString(),
            title: 'Keyboard',
            price: 99,
            description: 'Clicky',
            imageUrl: '/images/k.png',
            categories: ['tools'],
            tags: ['new'],
            active: true,
            // Dates become ISO strings to match the contract — a raw Date would serialize
            // differently depending on the JSON encoder in play.
            createdAt: created.toISOString(),
            updatedAt: updated.toISOString(),
            deletedAt: deleted.toISOString()
        });
    });

    it('omits fields whose types do not match, rather than emitting them as undefined', () => {
        const productId = new Types.ObjectId();

        const dto = toCartItemDto({
            product: asProduct({
                _id: productId,
                title: 123,
                price: 'free',
                description: null,
                imageUrl: {},
                categories: 'tools',
                tags: undefined,
                active: 'yes',
                createdAt: '2024-01-01',
                updatedAt: 0,
                deletedAt: false
            }),
            quantity: 1
        } as ICartItem);

        // Every guard rejected its value, so only `id` survives. `toEqual` with exactly this
        // object also asserts nothing extra leaked through.
        expect(dto.product).toEqual({ id: productId.toString() });
    });

    it('keeps a falsy-but-valid price of 0', () => {
        // `typeof p.price === 'number'`, not truthiness — a free product must keep its price.
        const dto = toCartItemDto({
            product: asProduct({ _id: new Types.ObjectId(), price: 0 }),
            quantity: 1
        } as ICartItem);

        expect(dto.product!.price).toBe(0);
    });

    it('keeps active:false', () => {
        const dto = toCartItemDto({
            product: asProduct({ _id: new Types.ObjectId(), active: false }),
            quantity: 1
        } as ICartItem);

        expect(dto.product!.active).toBe(false);
    });

    it('keeps an empty title', () => {
        const dto = toCartItemDto({
            product: asProduct({ _id: new Types.ObjectId(), title: '' }),
            quantity: 1
        } as ICartItem);

        expect(dto.product!.title).toBe('');
    });

    it('filters non-string entries out of categories and tags', () => {
        const dto = toCartItemDto({
            product: asProduct({
                _id: new Types.ObjectId(),
                categories: ['tools', 42, null, 'office'],
                tags: [undefined, 'new']
            }),
            quantity: 1
        } as ICartItem);

        expect(dto.product!.categories).toEqual(['tools', 'office']);
        expect(dto.product!.tags).toEqual(['new']);
    });

    it('keeps empty arrays as empty arrays', () => {
        // `Array.isArray`, not truthiness — "no categories" and "categories not loaded" are
        // different states, and the contract distinguishes them.
        const dto = toCartItemDto({
            product: asProduct({ _id: new Types.ObjectId(), categories: [], tags: [] }),
            quantity: 1
        } as ICartItem);

        expect(dto.product!.categories).toEqual([]);
        expect(dto.product!.tags).toEqual([]);
    });

    it('leaves product undefined when the populated object carries no usable id', () => {
        const dto = toCartItemDto({
            product: asProduct({ title: 'Orphan' }),
            quantity: 1
        } as ICartItem);

        expect(dto.product).toBeUndefined();
        expect(dto.productId).toBe('');
    });
});

describe('toCartItemResponse', () => {
    it('projects a line down to exactly productId and quantity', () => {
        const response = toCartItemResponse({
            productId: 'p1',
            quantity: 3,
            product: { id: 'p1', title: 'Keyboard', price: 99 }
        });

        // `CartItem` is additionalProperties:false. `toEqual` plus the key assertion below is
        // the guard against the populated product reaching the wire.
        expect(response).toEqual({ productId: 'p1', quantity: 3 });
        expect(Object.keys(response).sort()).toEqual(['productId', 'quantity']);
    });

    it('drops the product even when there is nothing else to carry', () => {
        const response = toCartItemResponse({ productId: 'p1', quantity: 1 });

        expect(response).toEqual({ productId: 'p1', quantity: 1 });
    });
});

describe('toUserCartDto', () => {
    it('projects only the id and cart, mapping every line', () => {
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        const updatedAt = new Date('2024-05-01T00:00:00.000Z');

        const dto = toUserCartDto({
            id: 'u1',
            email: 'ada@example.com',
            password: 'must-not-appear',
            cart: {
                items: [
                    { product: first, quantity: 1 },
                    { product: second, quantity: 2 }
                ],
                updatedAt
            }
        } as unknown as IUserDocument);

        expect(dto).toEqual({
            id: 'u1',
            cart: {
                items: [
                    { productId: first.toString(), quantity: 1, product: undefined },
                    { productId: second.toString(), quantity: 2, product: undefined }
                ],
                updatedAt
            }
        });
    });

    it('carries no user field beyond id and cart', () => {
        // The projection is the point: this DTO is returned from cart endpoints, and a stray
        // `password` or `tokens` here is the leak class the contract suite exists to catch.
        const dto = toUserCartDto({
            id: 'u1',
            email: 'ada@example.com',
            password: 'must-not-appear',
            tokens: [{ token: 'secret' }],
            cart: { items: [], updatedAt: new Date() }
        } as unknown as IUserDocument);

        expect(Object.keys(dto).sort()).toEqual(['cart', 'id']);
    });

    it('handles an empty cart', () => {
        const updatedAt = new Date();

        const dto = toUserCartDto({
            id: 'u1',
            cart: { items: [], updatedAt }
        } as unknown as IUserDocument);

        expect(dto.cart.items).toEqual([]);
        expect(dto.cart.updatedAt).toBe(updatedAt);
    });
});
