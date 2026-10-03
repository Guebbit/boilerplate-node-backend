/**
 * `namedHandler`: the handler it returns carries the operation name, and still behaves as the
 * handler it wraps — the name is only worth having if the response is untouched.
 */
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { namedHandler } from '@infrastructure/http/controller';

describe('namedHandler', () => {
    it('names the returned function after the operation', () => {
        const handler = namedHandler('getThing', () => undefined);

        expect(handler.name).toBe('getThing');
    });

    it('forwards the request and response and returns what the handler returns', () => {
        const request = asStub<Request>({});
        const response = asStub<Response>({});
        const inner = jest.fn().mockReturnValue('answer');

        const result = namedHandler('getThing', inner)(request, response);

        expect(result).toBe('answer');
        expect(inner).toHaveBeenCalledWith(request, response);
    });
});
