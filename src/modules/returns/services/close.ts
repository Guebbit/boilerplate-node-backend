/**
 * @module
 * Finishing a return once its money has gone back. Reached two ways — straight after a refund that
 * settled in the same request, and later, from `module.ts`'s `PAYMENT_REFUNDED` listener, when the
 * payment sweep completes a refund the provider first refused. Both call the same conditional move
 * (`received → closed`), so whichever arrives second finds nothing to do.
 */

import { emitDomainEvent } from '@kernel/events';
import { orderService } from '@modules/orders';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { CLOSABLE_RETURN_STATUSES } from '../domain';
import { RETURN_CLOSED } from '../events';
import { mailReturnNotice } from './notify';

/**
 * Close a received return: stamp when, announce it once, and tell the customer their money went
 * back.
 *
 * @param id - the return
 * @returns the closed return, or `null` when it was not `received` — already closed, or never
 *   received; both mean there is nothing for this call to do
 */
export const closeReturn = (id: string): Promise<ReturnDocument | null> =>
    returnRepository
        .claimStatus(id, CLOSABLE_RETURN_STATUSES, 'closed', { closedAt: new Date() })
        .then((closed) => {
            if (!closed) return null;

            void emitDomainEvent(RETURN_CLOSED, {
                returnId: id,
                orderId: String(closed.orderId),
                refundAmount: closed.refundAmount ?? 0,
                currency: closed.currency
            });
            return orderService
                .getById(String(closed.orderId))
                .then((order) =>
                    order
                        ? mailReturnNotice('return-closed', order, {
                              returnPostage: closed.returnPostage,
                              at: closed.closedAt ?? new Date(),
                              refund: {
                                  amount: closed.refundAmount ?? 0,
                                  currency: closed.currency
                              }
                          })
                        : undefined
                )
                .then(() => closed);
        });
