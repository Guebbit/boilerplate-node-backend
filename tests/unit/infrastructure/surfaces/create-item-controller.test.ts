/**
 * `createItemController` — the read-one factory shared by `products` and `users`. Pins the
 * generated operation NAME: the default (`get<Entity>Item`) every existing caller relies on, and
 * the `handlerSuffix` override (`get<Entity><Suffix>`) `get-product-admin.ts` uses to avoid
 * colliding with `getProductItem` on the same entity. The name is observed through the log line
 * `rejectDatabaseError` writes. Also pins the found/not-found round trip, since a naming change
 * is only safe if the response behaviour it wraps is untouched.
 */
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/logger', () => ({ logger: { error: jest.fn() } }));

/** A well-formed id: the controller refuses anything else before it asks the database. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

const makeRequest = (id: string) =>
    asStub<Request>({ params: { id }, query: {}, body: undefined, is: () => null });

const makeResponse = () =>
    asStub<Response>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    });

describe('createItemController — operation naming', () => {
    it('defaults the logged operation to get<Entity>Item when handlerSuffix is omitted', async () => {
        const response = makeResponse();
        const handler = createItemController({
            entity: 'widget',
            fetch: () => Promise.reject(new Error('db down')),
            notFoundKey: 'widgets.not-found'
        });

        await handler(makeRequest(OBJECT_ID), response);

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('getWidgetItem'),
            expect.anything()
        );
    });

    it('logs get<Entity><Suffix> when handlerSuffix is given', async () => {
        const response = makeResponse();
        const handler = createItemController({
            entity: 'widget',
            fetch: () => Promise.reject(new Error('db down')),
            notFoundKey: 'widgets.not-found',
            handlerSuffix: 'Admin'
        });

        await handler(makeRequest(OBJECT_ID), response);

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('getWidgetAdmin'),
            expect.anything()
        );
    });
});

describe('createItemController — found/not-found round trip, unaffected by handlerSuffix', () => {
    it('answers 200 with the fetched row on a hit', async () => {
        const response = makeResponse();
        const handler = createItemController({
            entity: 'widget',
            fetch: (id) => Promise.resolve({ id }),
            notFoundKey: 'widgets.not-found',
            handlerSuffix: 'Admin'
        });

        await handler(makeRequest(OBJECT_ID), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: { id: OBJECT_ID } })
        );
    });

    it('answers 404 when fetch resolves to nothing', async () => {
        const response = makeResponse();
        const handler = createItemController({
            entity: 'widget',
            fetch: () => Promise.resolve(undefined),
            notFoundKey: 'widgets.not-found'
        });

        await handler(makeRequest(OBJECT_ID), response);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('answers a malformed id with the same 404, without asking fetch', async () => {
        const response = makeResponse();
        const fetch = jest.fn();
        const handler = createItemController({
            entity: 'widget',
            fetch,
            notFoundKey: 'widgets.not-found'
        });

        await handler(makeRequest('not-an-id'), response);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('createItemController — ETag', () => {
    it("stamps the row's version as ETag, so an edit form can send it back as If-Match", async () => {
        const setHeader = jest.fn();
        const response = asStub<Response>({
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader,
            req: { headers: {} }
        });
        const handler = createItemController({
            entity: 'widget',
            fetch: (id) => Promise.resolve({ id, editRevision: 12 }),
            notFoundKey: 'widgets.not-found'
        });

        await handler(makeRequest(OBJECT_ID), response);

        expect(setHeader).toHaveBeenCalledWith('ETag', '"12"');
    });
});
