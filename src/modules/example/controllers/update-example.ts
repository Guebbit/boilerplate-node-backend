/**
 * @module
 * In any module: PUT (replace) and PATCH (merge) share one pipeline, built by the shared update
 * factory, which also owns the id check, `If-Match` and the `ETag`. What differs per module is the
 * two schemas and the service call. Here: `PUT` and `PATCH /examples/:id`.
 *
 * See: docs/api/write-methods.md
 */

import { ReplaceExampleByIdBody, UpdateExampleByIdBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { exampleService } from '../services';

/** `PUT` and `PATCH /examples/:id` — one handler pair over `exampleService.update`. */
export const { replace: replaceExample, update: updateExample } = createUpdateController({
    entity: 'example',
    replaceSchema: ReplaceExampleByIdBody,
    patchSchema: UpdateExampleByIdBody,
    update: (id, changes, request) => exampleService.update(id, changes, callerContextOf(request)),
    // The service already answers in the contract's shape.
    present: (example) => example
});
