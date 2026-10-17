import { Login200Response } from '@api/schemas.zod';
import { bodyOf } from '@tests/body-of';

/** A response carrying only what `bodyOf` reads. */
const respond = (status: number, body: unknown) => ({ status, body });

/** A login answer that fits `Login200Response`. */
const SESSION = {
    success: true,
    status: 200,
    message: 'ok',
    data: { token: 'abc' }
};

describe('bodyOf', () => {
    it('returns the body when the status is the one the schema stands for', () => {
        const body = bodyOf(respond(200, SESSION), Login200Response);

        expect(body.data).toEqual({ token: 'abc' });
    });

    it('refuses another status, naming both and the body', () => {
        expect(() => bodyOf(respond(401, { success: false }), Login200Response)).toThrow(
            /expected 200, got 401.*success/
        );
    });

    it('refuses a body the schema does not accept', () => {
        expect(() => bodyOf(respond(200, { ...SESSION, extra: 1 }), Login200Response)).toThrow();
    });

    it('refuses a schema that is not a per-status response', () => {
        expect(() => bodyOf(respond(200, SESSION), Login200Response.shape.data)).toThrow(
            /per-status response schema/
        );
    });
});
