import { generateReject, generateSuccess } from '@utils/response';

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

describe('generateReject', () => {
    it('builds structured error items from plain string errors', () => {
        const response = generateReject(400, 'Bad Request', ['Field is required']);

        expect(response).toEqual({
            success: false,
            status: 400,
            message: 'Bad Request',
            data: undefined,
            errors: [
                {
                    code: 'BAD_REQUEST',
                    message: 'Field is required'
                }
            ]
        });
    });

    it('preserves provided structured error items', () => {
        const response = generateReject(422, 'Validation failed', [
            {
                code: 'VALIDATION_ERROR',
                message: 'Invalid email format',
                details: { field: 'email' }
            }
        ]);

        expect(response.errors).toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: 'Invalid email format',
                details: { field: 'email' }
            }
        ]);
    });
});
