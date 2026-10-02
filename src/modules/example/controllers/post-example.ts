/**
 * @module
 * In any module: a create controller validates the body against the generated schema, calls the
 * service, and answers `201` with a `Location`. Here: `POST /examples`.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import { CreateExampleBody } from '@api/schemas.zod';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf, readInput } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** POST /examples — create a draft owned by the caller. */
export const postExample = namedHandler('postExample', (request: Request, response: Response) => {
    const body = parseBody(CreateExampleBody, readInput(request, { surface: 'create' }), response);
    if (body === undefined) return Promise.resolve();

    return exampleService
        .create(body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            createdResponse(response, result.data, `/examples/${result.data.id}`, result.message);
        })
        .catch(catchAs(response, 'postExample'));
});
