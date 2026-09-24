/**
 * `createSearchController` — the search-controller shape shared by `products`, `users` and
 * `orders`. `id` is declared once here, in the factory, so this is the one place worth pinning
 * that a repeated key reaches `runSearch` as a batch, not collapsed to its first entry.
 */
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';

const schema = z.object({ id: z.array(z.string()).optional() });

const makeRequest = (query: unknown) =>
    asStub<Request>({
        params: {},
        query,
        body: undefined,
        is: () => false
    });

const makeResponse = () =>
    asStub<Response>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    });

describe('createSearchController — id is a batch filter, not a lookup', () => {
    it('reads a repeated query key as every id, not just the first', async () => {
        const runSearch = jest.fn().mockResolvedValue({ items: [] });
        const handler = createSearchController({ entity: 'widgets', schema, runSearch });

        await handler(makeRequest({ id: ['a', 'b'] }), makeResponse());

        expect(runSearch).toHaveBeenCalledWith(
            expect.objectContaining({ id: ['a', 'b'] }),
            expect.anything()
        );
    });

    it('reads a single query value as a one-element array', async () => {
        const runSearch = jest.fn().mockResolvedValue({ items: [] });
        const handler = createSearchController({ entity: 'widgets', schema, runSearch });

        await handler(makeRequest({ id: 'a' }), makeResponse());

        expect(runSearch).toHaveBeenCalledWith(
            expect.objectContaining({ id: ['a'] }),
            expect.anything()
        );
    });
});
