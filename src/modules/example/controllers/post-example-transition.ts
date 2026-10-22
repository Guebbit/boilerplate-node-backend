/**
 * @module
 * In any module: an action controller stays thin — check the id, parse the body against the
 * generated schema, call the service, answer. The rule it enforces lives in the service. Here:
 * `POST /examples/:id/transitions`.
 *
 * Delete it if: the module has no action doors.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import { TransitionExampleBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** POST /examples/:id/transitions — move an example the caller may edit to another status. */
export const postExampleTransition = namedHandler(
    'postExampleTransition',
    (request: Request<{ id?: string }>, response: Response) => {
        const id = requireId(request, response, { notFound: 'example.not-found' });
        if (!id) return Promise.resolve();

        const body = parseBody(TransitionExampleBody, request.body, response);
        if (body === undefined) return Promise.resolve();

        return exampleService
            .transitionById(id, body.to, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;
                successResponse(response, result.data, 200, result.message);
            })
            .catch(catchAs(response, 'postExampleTransition'));
    }
);
