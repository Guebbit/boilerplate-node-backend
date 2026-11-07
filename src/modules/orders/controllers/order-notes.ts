/**
 * @module
 * Staff notes on an order: `POST /orders/:id/timeline/notes` writes one, `DELETE
 * /orders/:id/timeline/notes/:eventId` withdraws its text. Thin wiring onto `orderService`; the
 * route's `requirePermission('update', 'Order')` has already run.
 */

import type { Request, Response } from 'express';
import { orderService } from '../services';
import type { CreateOrderNoteRequest, OrderTimelineEntry } from '@types';
import { AddOrderNoteBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { createdResponse, noContentResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /orders/:id/timeline/notes — answers 201 with the entry and the `Location` of its DELETE.
 */
export const postOrderNote = (
    request: Request<{ id?: string }, unknown, CreateOrderNoteRequest>,
    response: Response
): Promise<void> => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(AddOrderNoteBody, request.body, response);
    if (!body) return Promise.resolve();

    return orderService
        .addNote(id, body.text, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            createdResponse<OrderTimelineEntry>(
                response,
                result.data,
                `/orders/${id}/timeline/notes/${result.data.id}`
            );
        })
        .catch(catchAs(response, 'postOrderNote'));
};

/**
 * DELETE /orders/:id/timeline/notes/:eventId — unsets the note's text; the row stays.
 */
export const deleteOrderNote = (
    request: Request<{ id?: string; eventId?: string }>,
    response: Response
): Promise<void> => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();
    const eventId = requireId(request, response, { name: 'eventId', notFound: 'orders.not-found' });
    if (!eventId) return Promise.resolve();

    return orderService
        .deleteNote(id, eventId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteOrderNote'));
};
