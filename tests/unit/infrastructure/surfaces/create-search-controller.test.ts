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

/** A schema mirroring the contract's sort grammar: 1-3 tokens of an enum, plus the overlaid `userId`. */
const sortSchema = z.object({
    sort: z
        .array(z.enum(['price', '-price', 'title']))
        .min(1)
        .max(3)
        .optional(),
    userId: z.string().optional()
});

describe('createSearchController — the module overlay', () => {
    it('lets the overlay beat the caller: a query userId is replaced by the overlay value', async () => {
        const runSearch = jest.fn().mockResolvedValue({ items: [] });
        const handler = createSearchController({
            entity: 'widgets',
            schema: sortSchema,
            extendInput: () => ({ userId: undefined }),
            runSearch
        });

        await handler(makeRequest({ userId: 'someone-else' }), makeResponse());

        expect(runSearch.mock.calls[0]?.[0]).toEqual({ userId: undefined });
    });

    it('hands the overlay split sort tokens, not the raw CSV', async () => {
        const extendInput = jest.fn(() => ({}));
        const handler = createSearchController({
            entity: 'widgets',
            schema: sortSchema,
            extendInput,
            runSearch: jest.fn().mockResolvedValue({ items: [] })
        });

        await handler(makeRequest({ sort: 'price,-price' }), makeResponse());

        expect(extendInput).toHaveBeenCalledWith(
            expect.objectContaining({ sort: ['price', '-price'] }),
            expect.anything()
        );
    });
});

describe('createSearchController — refusals and failures', () => {
    it('answers 422 and never searches for a body sort of []', async () => {
        const runSearch = jest.fn();
        const response = makeResponse();
        const request = asStub<Request>({
            params: {},
            query: {},
            body: { sort: [] },
            is: () => true
        });

        await createSearchController({ entity: 'widgets', schema: sortSchema, runSearch })(
            request,
            response
        );

        expect(response.status).toHaveBeenCalledWith(422);
        expect(runSearch).not.toHaveBeenCalled();
    });

    it('answers 422 and never searches for a token outside the enum', async () => {
        const runSearch = jest.fn();
        const response = makeResponse();

        await createSearchController({ entity: 'widgets', schema: sortSchema, runSearch })(
            makeRequest({ sort: 'zzz' }),
            response
        );

        expect(response.status).toHaveBeenCalledWith(422);
        expect(runSearch).not.toHaveBeenCalled();
    });

    it('answers 500 once, and no 200, when the search rejects', async () => {
        const response = makeResponse();

        await createSearchController({
            entity: 'widgets',
            schema: sortSchema,
            runSearch: () => Promise.reject(new Error('db down'))
        })(makeRequest({}), response);

        expect(response.status).toHaveBeenCalledTimes(1);
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.status).not.toHaveBeenCalledWith(200);
    });

    it.each([',', ' '])('passes a blank sort %p on with no sort key at all', async (blank) => {
        const runSearch = jest.fn().mockResolvedValue({ items: [] });

        await createSearchController({ entity: 'widgets', schema: sortSchema, runSearch })(
            makeRequest({ sort: blank }),
            makeResponse()
        );

        expect(runSearch.mock.calls[0]?.[0]).not.toHaveProperty('sort');
    });
});
