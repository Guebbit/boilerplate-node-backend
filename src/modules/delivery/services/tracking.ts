/**
 * @module
 * Setting or correcting a shipment's tracking code — at any time after it left, delivered and
 * lost ones included: the code matters most later, as evidence in a "never arrived" dispute. A digital
 * fulfilment never had a carrier, so it has no code to set. The first code of a parcel that left
 * without one mails the buyer an "added" notice; a replacement mails the "corrected" one.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { fieldChange } from '@infrastructure/observability/audit-changes';
import { orderService } from '@modules/orders';
import { FulfillmentOrderKind } from '@types';
import type { AuthContext, CallerContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { deliveryAuditActions } from '../audit';
import { shipmentRepository } from '../repository';
import type { ShipmentDocument } from '../model';
import { viewShipmentOf } from './found';
import { mailTrackingChanged } from './notify';

/**
 * The audit metadata of a tracking edit: the shipment, and — only when the code really changed — the
 * code before and after, so the trail answers "what was it before".
 * @param shipmentId - the shipment
 * @param before - the code it carried, if any
 * @param after - the code it carries now
 */
const trackingAuditMetadata = (
    shipmentId: string,
    before: string | undefined,
    after: string | undefined
): Record<string, unknown> =>
    before === after
        ? { shipmentId }
        : { shipmentId, changes: { trackingCode: fieldChange(before, after) } };

/**
 * Save the code, audit it, and mail the buyer when it changed.
 * @param found - the shipment as it was read
 * @param edited - the shipment as the write left it
 * @param context - the caller, for the audit entry
 */
const afterEdited = (
    found: ShipmentDocument,
    edited: ShipmentDocument,
    context: CallerContext
): Promise<void> => {
    recordAudit(context, {
        action: deliveryAuditActions.ADMIN_SHIPMENT_TRACKING_EDITED,
        outcome: 'success',
        targetType: 'order',
        targetId: String(edited.orderId),
        metadata: trackingAuditMetadata(String(edited._id), found.trackingCode, edited.trackingCode)
    });
    // Only a code that CHANGED is news: saving the same one again mails nobody.
    if (found.trackingCode === edited.trackingCode) return Promise.resolve();
    return mailTrackingChanged(edited, found.trackingCode ? 'corrected' : 'added');
};

/**
 * Set or correct a shipment's tracking code.
 *
 * @param shipmentId - the shipment
 * @param trackingCode - the new code; absent changes nothing (a merge patch with no field)
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 * @returns the shipment as it now stands, or the refusal naming which case it was
 */
export const editShipmentTracking = (
    shipmentId: string,
    trackingCode: string | undefined,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> =>
    shipmentRepository.findById(shipmentId).then((found) => {
        if (!found) return generateReject(404, [t('delivery.shipment-not-found')]);
        if (found.kind !== FulfillmentOrderKind.physical)
            return generateReject(409, [
                { code: ERROR_CODES.DELIVERY_NOT_PHYSICAL, message: t('delivery.not-physical') }
            ]);

        return orderService.getById(String(found.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('delivery.order-not-found')]);

            if (trackingCode === undefined)
                return viewShipmentOf(found, order, authContext).then((view) =>
                    generateSuccess(view)
                );

            return shipmentRepository.setTrackingCode(shipmentId, trackingCode).then((edited) => {
                if (!edited) return generateReject(404, [t('delivery.shipment-not-found')]);
                return afterEdited(found, edited, context)
                    .then(() => viewShipmentOf(edited, order, authContext))
                    .then((view) => generateSuccess(view));
            });
        });
    });
