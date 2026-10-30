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
import { trimmedInto } from '@infrastructure/http/schemas';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { exampleService } from '../services';

/** `PUT`'s body with `title` and `body` trimmed first: `"   "` is a field-level 422, not a blank column. */
const replaceTrimmedBody = ReplaceExampleByIdBody.extend({
    title: trimmedInto(ReplaceExampleByIdBody.shape.title),
    body: trimmedInto(ReplaceExampleByIdBody.shape.body)
});

/** `PATCH`'s body, trimmed the same way; an omitted field stays omitted. */
const updateTrimmedBody = UpdateExampleByIdBody.extend({
    title: trimmedInto(UpdateExampleByIdBody.shape.title.unwrap()).optional(),
    body: trimmedInto(UpdateExampleByIdBody.shape.body.unwrap()).optional()
});

/** `PUT` and `PATCH /examples/:id` — one handler pair over `exampleService.updateById`. */
export const { replace: replaceExample, update: updateExample } = createUpdateController({
    versioned: true,
    entity: 'example',
    notFoundKey: 'example.not-found',
    replaceSchema: replaceTrimmedBody,
    patchSchema: updateTrimmedBody,
    update: (id, changes, request) =>
        exampleService.updateById(id, changes, callerContextOf(request)),
    // The service already answers in the contract's shape.
    present: (example) => example
});
