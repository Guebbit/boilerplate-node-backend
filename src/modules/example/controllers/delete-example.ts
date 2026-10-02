/**
 * @module
 * In any module: a delete controller. Hand-written here because the shared delete factory is
 * for the soft/hard triplet, and this module has no soft-delete tier. Here: `DELETE /examples/:id`.
 *
 * See: docs/theory/request-flow.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { exampleService } from '../services';

/** DELETE /examples/:id — permanently remove an example the caller may delete. */
export const deleteExample = createDeleteController({
    entity: 'example',
    remove: (id, _hardDelete, request) => exampleService.remove(id, callerContextOf(request)),
    notFoundKey: 'example.not-found'
});
