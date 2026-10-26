/**
 * @module
 * GET /orders/:id/fulfillment-orders and GET /orders/:id/shipments
 * Where an order's goods stand, as two lists: the fulfillment orders (the plan) and the shipments
 * cut from them (what left). The order page's shipping panel reads both once the order is paid;
 * before that both are empty. Each list is unpaged: one order holds a handful.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { FulfillmentOrder, Shipment } from '@types';

/** Handles `GET /orders/:id/fulfillment-orders`. */
export const getOrderFulfillmentOrders = (
    request: Request<{ id?: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'delivery.order-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .listFulfillmentOrdersForOrder(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<{ items: FulfillmentOrder[] }>(response, { items: result.data });
        })
        .catch(catchAs(response, 'getOrderFulfillmentOrders'));
};

/** Handles `GET /orders/:id/shipments`. */
export const getOrderShipments = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.order-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .listShipmentsForOrder(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<{ items: Shipment[] }>(response, { items: result.data });
        })
        .catch(catchAs(response, 'getOrderShipments'));
};
