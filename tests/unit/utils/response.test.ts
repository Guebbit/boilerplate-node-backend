import { generateSuccess } from '@utils/response';

describe('generateSuccess', () => {
    it('returns plain objects unchanged (no implicit Mongo normalization)', () => {
        const responseData = { _id: '507f1f77bcf86cd799439011', title: 'Keyboard' };
        Reflect.set(responseData, '__v', 3);
        const response = generateSuccess(responseData);

        expect(response.data).toEqual(responseData);
    });

    it('keeps primitives untouched', () => {
        const response = generateSuccess('ok');
        expect(response.data).toBe('ok');
    });
});
