/**
 * @module
 * The staff preview of a release-date move: how many orders the move would notify or ask, before
 * it is saved. It judges every waiting fulfillment order with the listener's own rule
 * (`judgeMove`, `expectedDateOf`) against the date that WOULD be, and writes nothing, so the
 * preview cannot drift from the save.
 *
 * Counts are orders, not fulfillment orders: an order with groups in both buckets counts once,
 * under `ask`. A snapshot — a payment or a shipment between preview and save can shift it.
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
import { answerBy, expectedDateOf, judgeMove } from '../domain';
import type { SlipVerdict } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';

/** Nobody is notified or asked. */
const NOBODY = { notify: 0, ask: 0 } as const;

/**
 * Whether two optional dates are the same instant.
 * @param a - one date
 * @param b - the other
 */
const sameDate = (a: Date | undefined, b: Date | undefined): boolean =>
    a?.getTime() === b?.getTime();

/**
 * The verdict of every waiting fulfillment order if `productId` took `releaseDate`.
 *
 * @param waiting - the fulfillment orders still waiting for the product
 * @param productId - the product whose date would move
 * @param releaseDate - the date to preview, absent when cleared
 * @returns one `[orderId, verdict]` per fulfillment order that was promised a date
 */
const verdictsFor = (
    waiting: readonly FulfillmentOrderDocument[],
    productId: string,
    releaseDate: Date | undefined
): Promise<[string, SlipVerdict][]> => {
    const otherIds = [
        ...new Set(waiting.flatMap(({ lines }) => lines.map((line) => line.productId)))
    ].filter((id) => id !== productId);
    return productService.findManyByIds(otherIds).then((products) => {
        const releaseDateOf = (id: string): Date | undefined =>
            id === productId
                ? releaseDate
                : products.find((product) => String(product._id) === id)?.releaseDate;
        return waiting.flatMap<[string, SlipVerdict]>((fulfillmentOrder) => {
            const verdict = judgeMove(
                fulfillmentOrder,
                expectedDateOf(fulfillmentOrder.lines, releaseDateOf)
            );
            return verdict ? [[String(fulfillmentOrder.orderId), verdict]] : [];
        });
    });
};

/**
 * Tally verdicts in distinct orders; an order with both a notice and a question counts as asked.
 * @param verdicts - one `[orderId, verdict]` per fulfillment order
 */
const tally = (verdicts: readonly [string, SlipVerdict][]): Omit<ReleaseDateImpact, 'answerBy'> => {
    const named = (kind: SlipVerdict['kind']) =>
        new Set(
            verdicts.filter(([, verdict]) => verdict.kind === kind).map(([orderId]) => orderId)
        );
    const asked = named('ask');
    const notified = [...named('notify')].filter((orderId) => !asked.has(orderId));
    return { notify: notified.length, ask: asked.size };
};

/**
 * What saving `releaseDate` on a product would tell the buyers who already paid.
 *
 * @param productId - the product whose release date would move
 * @param releaseDate - the date to preview; absent means cleared
 * @param now - the instant a question would be asked, for `answerBy`
 * @returns the counts, or a 404 for an unknown product
 */
export const previewReleaseDateImpact = (
    productId: string,
    releaseDate: Date | undefined,
    now = new Date()
): Promise<ResponseSuccess<ReleaseDateImpact> | ResponseReject> =>
    productService.findByIdRaw(productId).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);

        const deadline = answerBy(now).toISOString();
        // Saving the date it already has emits nothing, so nobody hears anything.
        if (sameDate(product.releaseDate, releaseDate))
            return generateSuccess({ ...NOBODY, answerBy: deadline });

        return fulfillmentOrderRepository
            .findWaitingForProduct(productId)
            .then((waiting) => verdictsFor(waiting, productId, releaseDate))
            .then((verdicts) => generateSuccess({ ...tally(verdicts), answerBy: deadline }));
    });
