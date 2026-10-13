/**
 * @module
 * What an order's timeline may say, and to whom. The SET of types is generated from the contract
 * (`OrderTimelineType`); this file adds the audience each type is for, so a type cannot exist
 * without a decision about who reads it.
 *
 * Decided per type, never by stripping fields at read time: Magento's `is_visible_on_front`,
 * WooCommerce's `is_customer_note`. A private row is hidden whole.
 *
 * See: docs/modules/orders.md#the-timeline
 */

import type { OrderTimelineType } from '@types';

/** Who may read a row: the buyer and staff, or staff alone. */
export type TimelineAudience = 'buyer' | 'staff';

/**
 * The audience of every type. `Record` over the generated enum, so a type added to the contract
 * without a row here (a preorder's, say) fails to compile, and a row with no type does too.
 *
 * Staff only:
 *   status_overridden: carries the staff's own reason.
 *   fulfillment_held / fulfillment_released: a hold's reason is an internal call (a risk check, say).
 *   refund_failed: the provider's refusal; the buyer's answer is the refund that settles.
 */
export const TIMELINE_AUDIENCE: Readonly<Record<OrderTimelineType, TimelineAudience>> = {
    created: 'buyer',
    paid: 'buyer',
    processing: 'buyer',
    shipped: 'buyer',
    delivered: 'buyer',
    cancelled: 'buyer',
    status_overridden: 'staff',
    payment_declined: 'buyer',
    refund_issued: 'buyer',
    refund_settled: 'buyer',
    refund_failed: 'staff',
    shipment_shipped: 'buyer',
    shipment_delivered: 'buyer',
    fulfillment_held: 'staff',
    fulfillment_released: 'staff',
    remainder_cancelled: 'buyer',
    return_requested: 'buyer',
    return_approved: 'buyer',
    return_declined: 'buyer',
    return_received: 'buyer',
    return_closed: 'buyer',
    invoice_issued: 'buyer',
    credit_note_issued: 'buyer',
    release_date_moved: 'buyer',
    delay_notice_sent: 'buyer',
    wait_confirmed: 'buyer',
    wait_expired: 'buyer'
};

/**
 * Whether a row of this type may be shown to the buyer.
 * @param type - the row's type
 */
export const isBuyerVisible = (type: OrderTimelineType): boolean =>
    TIMELINE_AUDIENCE[type] === 'buyer';

/**
 * One row as `orders` writes it, from any module. Ids, codes and numbers go in `data`; free text
 * goes in `text`, and only when `orders` itself owns it (it has its own retention clock).
 */
export interface TimelineEntryInput {
    /** What happened. */
    type: OrderTimelineType;
    /** The account that made the change, as `caller.id` gives it: absent for the system. */
    actor?: string | null | undefined;
    /** Free text `orders` owns, such as an override's reason. Never a sibling module's text. */
    text?: string | undefined;
    /** What the type needs to say; scalars only, so a row stays small and exportable. */
    data?: Readonly<Record<string, string | number | boolean | null>> | undefined;
    /** When it happened; the write's own instant when omitted. */
    at?: Date | undefined;
}
