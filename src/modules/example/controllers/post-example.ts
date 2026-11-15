/**
 * @module
 * In any module: a create controller validates the body against the generated schema, calls the
 * service, and answers `201` with a `Location`. Here: `POST /examples`.
 *
 * @see docs/understand/request-flow.md#what-each-layer-does
 */

import type { Request, Response } from 'express';
import { CreateExampleBody } from '@api/schemas.zod';
import { createdResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { trimmedInto } from '@infrastructure/http/schemas';
import { callerContextOf, readInput } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** The create body with `title` and `body` trimmed first, so `"   "` is the field-level 422 an empty one is. */
const createTrimmedBody = CreateExampleBody.extend({
    title: trimmedInto(CreateExampleBody.shape.title),
    body: trimmedInto(CreateExampleBody.shape.body)
});

/** POST /examples — create a draft owned by the caller. */
export const postExample = namedHandler('postExample', (request: Request, response: Response) => {
    const body = parseBody(createTrimmedBody, readInput(request, { surface: 'create' }), response);
    if (body === undefined) return Promise.resolve();

    return exampleService
        .create(body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            const location = `/examples/${result.data.id}`;
            // The new example's real tag, and the resource it belongs to (RFC 9110 §8.8.3).
            answerAsResource(response, result.data, location);
            createdResponse(response, result.data, location);
        })
        .catch(catchAs(response, 'postExample'));
});
