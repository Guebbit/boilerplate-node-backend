/**
 * @module
 * Correcting a shipment's tracking code — a typo, not a new fact. Only while the shipment is still
 * `shipped`: once it has arrived the code is a record of what happened.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { orderService } from '@modules/orders';
import type { AuthContext, CallerContext, Shipment } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { deliveryAuditActions } from '../audit';
import { shipmentRepository } from '../repository';
import { viewShipment } from './actions';
import { mailTrackingCorrected } from './notify';

/**
 * Correct a shipment's tracking code.
 *
 * @param shipmentId - the shipment
 * @param trackingCode - the corrected code; absent changes nothing (a merge patch with no field)
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

        return orderService.getById(String(found.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('delivery.order-not-found')]);

            if (trackingCode === undefined)
                return generateSuccess(viewShipment(found, order, authContext));

            return shipmentRepository.setTrackingCode(shipmentId, trackingCode).then((edited) => {
                if (!edited)
                    return generateReject(409, [
                        {
                            code: ERROR_CODES.DELIVERY_NOT_DELIVERABLE,
                            message: t('delivery.not-deliverable')
                        }
                    ]);
                recordAudit(context, {
                    action: deliveryAuditActions.ADMIN_SHIPMENT_TRACKING_EDITED,
                    outcome: 'success',
                    targetType: 'order',
                    targetId: String(edited.orderId),
                    metadata: { shipmentId }
                });
                // Only a code that CHANGED is news: saving the same one again mails nobody.
                if (found.trackingCode === edited.trackingCode)
                    return generateSuccess(viewShipment(edited, order, authContext));
                return mailTrackingCorrected(edited).then(() =>
                    generateSuccess(viewShipment(edited, order, authContext))
                );
            });
        });
    });
