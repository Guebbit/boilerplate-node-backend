/**
 * @module
 * The staff preview of a release-date or restock-date move: how many orders the move would email,
 * before it is saved. It judges every waiting fulfillment order with the listener's own rule
 * (`judgeMove`, `expectedDateOf`) against the date that WOULD be, and writes nothing, so the
 * preview cannot drift from the save.
 *
 * The count is orders, not fulfillment orders: an order with several groups to tell counts once. A
 * snapshot — a payment or a shipment between preview and save can shift it.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { productService } from '@modules/products';
import type { ReleaseDateImpact } from '@types';
import { expectedDateOfWaiting, judgeMove } from '../domain';
import type { SlipVerdict, WaitCause } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';

/** Nobody is notified or asked. */
const NOBODY = { notify: 0 } as const;

/** One waiting fulfillment order's verdict. */
interface Judged {
    orderId: string;
    verdict: SlipVerdict;
}

/**
 * Whether two optional dates are the same instant.
 * @param a - one date
 * @param b - the other
 */
const sameDate = (a: Date | undefined, b: Date | undefined): boolean =>
    a?.getTime() === b?.getTime();

/**
 * The date a product holds for the kind of wait asked about: a release date for a preorder, a
 * restock date for a backorder.
 * @param product - the product
 * @param cause - which wait
 */
const dateFor = (
    product: { releaseDate?: Date | undefined; restockDate?: Date | undefined },
    cause: WaitCause
): Date | undefined => (cause === 'backorder' ? product.restockDate : product.releaseDate);

/**
 * The verdict of every waiting fulfillment order if `productId` took `date`.
 *
 * @param waiting - the fulfillment orders still waiting for the product
 * @param productId - the product whose date would move
 * @param date - the date to preview, absent when cleared
 * @param cause - which date: a preorder's release date or a backorder's restock date
 * @returns one entry per fulfillment order that was promised a date
 */
const verdictsFor = (
    waiting: readonly FulfillmentOrderDocument[],
    productId: string,
    date: Date | undefined,
    cause: WaitCause
): Promise<Judged[]> => {
    const otherIds = [
        ...new Set(waiting.flatMap(({ lines }) => lines.map((line) => line.productId)))
    ].filter((id) => id !== productId);
    return productService.findManyByIds(otherIds).then((products) => {
        const dateOf = (id: string): Date | undefined => {
            if (id === productId) return date;
            const other = products.find((product) => String(product._id) === id);
            return other && dateFor(other, cause);
        };
        return waiting.flatMap<Judged>((fulfillmentOrder) => {
            const verdict = judgeMove(
                fulfillmentOrder,
                expectedDateOfWaiting(fulfillmentOrder, dateOf)
            );
            return verdict ? [{ orderId: String(fulfillmentOrder.orderId), verdict }] : [];
        });
    });
};

/**
 * Tally the orders that would get an email: distinct orders, however many of their fulfillment
 * orders are told.
 * @param judged - one entry per fulfillment order
 */
const tally = (judged: readonly Judged[]): ReleaseDateImpact => ({
    notify: new Set(
        judged.filter(({ verdict }) => verdict.kind === 'notify').map(({ orderId }) => orderId)
    ).size
});

/**
 * What saving a date on a product would tell the buyers who already paid.
 *
 * @param productId - the product whose date would move
 * @param cause - which date: `preorder` for the release date, `backorder` for the restock date
 * @param date - the date to preview; absent means cleared
 * @returns the counts, or a 404 for an unknown product
 */
export const previewDateImpact = (
    productId: string,
    cause: WaitCause,
    date: Date | undefined
): Promise<ResponseSuccess<ReleaseDateImpact> | ResponseReject> =>
    productService.findByIdRaw(productId).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);

        // Saving the date it already has emits nothing, so nobody hears anything.
        if (sameDate(dateFor(product, cause), date)) return generateSuccess({ ...NOBODY });

        return fulfillmentOrderRepository
            .findWaitingForProduct(productId, cause)
            .then((waiting) => verdictsFor(waiting, productId, date, cause))
            .then((judged) => generateSuccess(tally(judged)));
    });
