/**
 * @module
 * In any module: a read-one controller is one call to the shared item factory, which owns the
 * 404 (an unknown id and a malformed one answer the same). Here: `GET /examples/:id`, which sits
 * above the auth gate because a published example is open to anyone.
 *
 * See: docs/theory/request-flow.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { exampleService } from '../services';

/** GET /examples/:id — a published example for anyone; the owner's own, or any with `display:Example`. */
export const getExample = createItemController({
    entity: 'example',
    notFoundKey: 'example.not-found',
    fetch: (id, request) => exampleService.getById(id, callerContextOf(request))
});
