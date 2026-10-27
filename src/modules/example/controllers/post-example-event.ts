/**
 * @module
 * In any module: an action controller stays thin — check the id, call the service, answer. The
 * rule it enforces lives in the service. Here: the three lifecycle doors,
 * `POST /examples/:id/publish|archive|unarchive`. They differ only in the service function, so
 * one factory builds all three and each keeps its own handler name for logs.
 *
 * Delete it if: the module has no action doors.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import type { CallerContext } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** The service function behind one door. */
type EventDoor = (
    id: string,
    context: CallerContext
) => ReturnType<typeof exampleService.publishById>;

/**
 * Build the handler for one lifecycle door.
 * @param operation - the handler's name, which the logs and metrics carry
 * @param door - the service function that applies the event
 */
const eventHandler = (operation: string, door: EventDoor) =>
    namedHandler(operation, (request: Request<{ id?: string }>, response: Response) => {
        const id = requireId(request, response, { notFound: 'example.not-found' });
        if (!id) return Promise.resolve();

        return door(id, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;
                successResponse(response, result.data, 200);
            })
            .catch(catchAs(response, operation));
    });

/** POST /examples/:id/publish — publish a draft the caller may edit. */
export const postExamplePublish = eventHandler('postExamplePublish', exampleService.publishById);

/** POST /examples/:id/archive — archive a draft or published example the caller may edit. */
export const postExampleArchive = eventHandler('postExampleArchive', exampleService.archiveById);

/** POST /examples/:id/unarchive — return an archived example the caller may edit to draft. */
export const postExampleUnarchive = eventHandler(
    'postExampleUnarchive',
    exampleService.unarchiveById
);
