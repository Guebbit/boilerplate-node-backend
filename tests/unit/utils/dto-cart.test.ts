import { Types } from 'mongoose';
import { toCartItemDto } from '@utils/dto-cart';

describe('toCartItemDto', () => {
    it('maps ObjectId product references to productId', () => {
        const productId = new Types.ObjectId();

        const dto = toCartItemDto({
            product: productId,
            quantity: 2
        });

        expect(dto).toEqual({
            productId: productId.toString(),
            quantity: 2,
            product: undefined
        });
    });

    it('maps populated product objects to explicit product DTO fields', () => {
        const productId = new Types.ObjectId();

        const dto = toCartItemDto({
            product: {
                _id: productId,
                title: 'Keyboard',
                price: 99
            } as unknown as Types.ObjectId,
            quantity: 1
        });

        expect(dto).toEqual({
            productId: productId.toString(),
            quantity: 1,
            product: {
                id: productId.toString(),
                title: 'Keyboard',
                price: 99,
                description: undefined,
                imageUrl: undefined,
                categories: undefined,
                tags: undefined,
                active: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                deletedAt: undefined
            }
        });
    });
});
