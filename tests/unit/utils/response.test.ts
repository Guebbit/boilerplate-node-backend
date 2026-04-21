import { Types } from 'mongoose';
import { productModel } from '@models/products';
import { generateSuccess } from '@utils/response';

describe('generateSuccess', () => {
    it('serializes nested _id fields as id and removes __v from plain objects', () => {
        const productId = new Types.ObjectId();
        const orderId = new Types.ObjectId();

        const response = generateSuccess({
            _id: orderId,
            ['__v']: 3,
            items: [
                {
                    product: {
                        _id: productId,
                        ['__v']: 1,
                        title: 'Keyboard'
                    }
                }
            ]
        });

        expect(response.data).toEqual({
            id: orderId.toString(),
            items: [
                {
                    product: {
                        id: productId.toString(),
                        title: 'Keyboard'
                    }
                }
            ]
        });
    });

    it('serializes mongoose documents before sending the response body', () => {
        const product = new productModel({
            title: 'Monitor',
            price: 199,
            description: '27 inch',
            imageUrl: '/monitor.png',
            active: true
        });

        const response = generateSuccess(product);

        expect(response.data).toMatchObject({
            id: product.id,
            title: 'Monitor',
            price: 199,
            description: '27 inch',
            imageUrl: '/monitor.png',
            active: true
        });
        expect(response.data).not.toHaveProperty('_id');
        expect(response.data).not.toHaveProperty('__v');
    });
});
