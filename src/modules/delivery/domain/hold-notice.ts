/**
 * @module
 * What a buyer is told about a hold, which is not the reason staff gave. Pure.
 *
 * Staff's reason can be an internal call (a risk check), and naming it to the buyer tips off
 * exactly the people a risk check exists for (Shopify keeps hold reasons admin-only; Kount and
 * Riskified say the delay, never the screening). So the buyer gets one of three notices, and a
 * reason that must stay quiet reads as the plainest one. Hiding the hold altogether would be a
 * false "being prepared" (UCPD Art. 6(1)(b)) and would leave an address problem unfixable.
 *
 * See: docs/modules/delivery.md#holds
 */

import { FulfillmentHoldNotice, FulfillmentHoldReason } from '@types';

/**
 * The buyer-safe notice for a hold reason.
 *
 * | Reason | Notice |
 * | --- | --- |
 * | `awaiting_stock` | `awaiting_stock`: the goods are not here yet |
 * | `incorrect_address` | `check_address`: the buyer can act |
 * | `high_risk`, `other` | `delayed`: the same plain delay, so a risk hold cannot be told apart |
 *
 * @param reason - the stored reason
 */
export const holdNoticeOf = (reason: FulfillmentHoldReason): FulfillmentHoldNotice => {
    if (reason === FulfillmentHoldReason.awaiting_stock)
        return FulfillmentHoldNotice.awaiting_stock;
    if (reason === FulfillmentHoldReason.incorrect_address)
        return FulfillmentHoldNotice.check_address;
    return FulfillmentHoldNotice.delayed;
};

/**
 * Whether a new hold gives the buyer something to do or read, and so earns a mail and an inbox
 * row: an address to check, or a message staff wrote for them. A bare delay is not mailed, and
 * `awaiting_stock` never is (a preorder group's birth also holds).
 *
 * @param reason - the stored reason
 * @param message - staff's message to the buyer, if any
 */
export const holdNeedsBuyerNotice = (
    reason: FulfillmentHoldReason,
    message: string | undefined
): boolean =>
    reason !== FulfillmentHoldReason.awaiting_stock &&
    (reason === FulfillmentHoldReason.incorrect_address || Boolean(message));
