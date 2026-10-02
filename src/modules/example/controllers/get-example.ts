/**
 * @module
 * In any module: a read-one controller is one call to the shared item factory, which owns the
 * 404 (an unknown id and a malformed one answer the same). Here: `GET /examples/:id`, and the
 * public `GET /examples/published/:id` that sits above the auth gate.
 *
 * See: docs/theory/request-flow.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { exampleService } from '../services';

/** GET /examples/:id — an example the caller may read. */
export const getExample = createItemController({
    entity: 'example',
    notFoundKey: 'example.not-found',
    fetch: (id, request) => exampleService.getById(id, callerContextOf(request))
});

/** GET /examples/published/:id — anyone may read a published example. */
export const getPublishedExample = createItemController({
    entity: 'example',
    handlerSuffix: 'Published',
    notFoundKey: 'example.not-found',
    fetch: (id) => exampleService.getPublishedById(id)
});
