/**
 * @module
 * What an order can still send back, and what it can still cancel — computed here, once, so no
 * client re-derives a quantity or a refund. `returnable` is what has SHIPPED and is not already
 * coming back, offered only to the buyer and only while a `reasons` deadline is open; `cancellable` is each fulfillment order with a remainder and the exact refund
 * cancelling it would owe, delivery included when it takes the last unit.
 *
 * See: docs/modules/returns.md#the-options-read
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { deliveryService } from '@modules/delivery';
import { orderService, isBuyer, isExcludedFromWithdrawal } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext, ReturnOptions } from '@types';
import { returnRepository } from '../repository';
import {
    holdsReturnedGoods,
    isGuaranteeReason,
    reasonsOpenAt,
    returnableQuantities,
    wireLines
} from '../domain';
import type { ProductQuantity } from '../domain';
import { cancellationRefundOn } from './cancellation-refund';
import { frozenDeadlinesOf } from './deadlines';
import { cancelRefusalOf } from './cancel-right';
import { ownOrder } from './ownership';

/**
 * The order a caller may ask about: staff holding `read:Return` see any; anyone else only
 * their own.
 * @param orderId - the order
 * @param authContext - the caller
 */
const readableOrder = (
    orderId: string,
    authContext: AuthContext
): Promise<OrderDocument | undefined> =>
    holds(callerForSubject(authContext, 'Return'), 'read', 'Return')
        ? orderService.getById(orderId)
        : ownOrder(orderId, authContext);

/**
 * Quantities as option lines, with the title the order froze for each product.
 * @param order - the order
 * @param quantities - product id → units
 */
const optionLines = (
    order: OrderDocument,
    quantities: ReadonlyMap<string, number>,
    excluded: ReadonlySet<string>
) => {
    const titles = new Map(
        order.items.map((item) => [String(item.product._id), item.product.title])
    );
    return [...quantities]
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({
            productId,
            title: titles.get(productId) ?? '',
            quantity,
            withdrawable: !excluded.has(productId)
        }));
};

/**
 * What one order can still return and cancel.
 *
 * @param orderId - the order
 * @param authContext - the caller: the buyer, or staff reading returns
 * @returns the options, or a 404 for an order the caller may not read
 */
export const getReturnOptions = (
    orderId: string,
    authContext: AuthContext
): Promise<ResponseSuccess<ReturnOptions> | ResponseReject> =>
    readableOrder(orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('returns.order-not-found')]);

        return Promise.all([
            returnRepository.findByOrderId(orderId),
            deliveryService.shippedQuantities(orderId),
            deliveryService.remainderOptions(orderId, order.fulfillment?.shipped === true)
        ]).then(([returns, shipped, remainders]) => {
            // Only the buyer exercises a right (staff open nothing here), and only for a reason
            // whose deadline is still open: none left means no form.
            const reasons = isBuyer(order, authContext)
                ? reasonsOpenAt(frozenDeadlinesOf(order), new Date())
                : [];
            // Excluded goods (Art. 16) are offered only for a reason that is not the withdrawal:
            // a defect or a wrong item reaches made-to-order goods too.
            const excluded = new Set(
                order.items
                    .filter((item) => isExcludedFromWithdrawal(item))
                    .map((item) => String(item.product._id))
            );
            const guaranteeOpen = reasons.some((reason) => isGuaranteeReason(reason));
            const returnable = shipped.filter(
                ({ productId }) => guaranteeOpen || !excluded.has(productId)
            );
            const back: ProductQuantity[] = returns
                .filter(holdsReturnedGoods)
                .flatMap(({ lines }) => wireLines(lines));

            return generateSuccess({
                orderId,
                currency: order.currency,
                reasons,
                returnable:
                    reasons.length === 0
                        ? []
                        : optionLines(order, returnableQuantities(returnable, back), excluded),
                cancellable: remainders.map((remainder) => {
                    const refund = cancellationRefundOn(order, returns, remainder.lines);
                    return {
                        fulfillmentOrderId: remainder.fulfillmentOrderId,
                        number: remainder.number,
                        lines: remainder.lines,
                        refundAmount: refund.total,
                        shippingRefund: refund.shipping,
                        // The same rule the door applies, so the button never offers a refusal.
                        cancel: cancelRefusalOf(order, authContext, remainder.lines) === undefined
                    };
                })
            });
        });
    });
