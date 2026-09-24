/**
 * `createItemController` — the read-one factory shared by `products` and `users`. Pins the
 * generated operation NAME: the default (`get<Entity>Item`) every existing caller relies on, and
 * the `handlerSuffix` override (`get<Entity><Suffix>`) `get-product-admin.ts` uses to avoid
 * colliding with `getProductItem` on the same entity. The name is observed through the log line
 * `rejectDatabaseError` writes, not `handler.name` — `namedHandler`'s computed-key rename only
 * fires for a function LITERAL written at that property position, not for a reference passed in
 * as an argument, so `handler.name` is `''` for every controller this factory (or its siblings)
 * builds, regardless of `handlerSuffix`; that is a pre-existing, unrelated gap. Also pins the
 * found/not-found round trip, since a naming change is only safe if the response behaviour it
 * wraps is untouched.
 */
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/logger', () => ({ logger: { error: jest.fn() } }));

const makeRequest = (id: string) => asStub<Request>({ params: { id } });

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

        await handler(makeRequest('1'), response);

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

        await handler(makeRequest('1'), response);

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

        await handler(makeRequest('1'), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: { id: '1' } })
        );
    });

    it('answers 404 when fetch resolves to nothing', async () => {
        const response = makeResponse();
        const handler = createItemController({
            entity: 'widget',
            fetch: () => Promise.resolve(undefined),
            notFoundKey: 'widgets.not-found'
        });

        await handler(makeRequest('missing'), response);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
});
