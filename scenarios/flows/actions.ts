/**
 * @module
 * The verbs the shop's history is written in — one function per thing a person does, each a thin
 * wrapper over the endpoint a browser would call.
 *
 * Why they are wrappers and not a `service` call: every row these produce carries an audit entry,
 * an actor scope and a domain event, and those only come out right when the request travels the
 * real middleware stack — the authentication, the caller context and the rate limiters included.
 * A service call would produce the order and none of its trail.
 */

import type { Caller } from './client';

/** An order line, as both the cart and this file's callers name one. */
export interface Line {
    productId: string;
    quantity: number;
}

/** What `POST /cart/checkout` answers with. Only the id is ever read. */
interface CheckoutData {
    order: { id: string };
}

/** What every payment endpoint answers with, down to the two fields the flows branch on. */
interface PaymentData {
    id: string;
    status: string;
}

/** The fake provider's method handles — `src/modules/payments/providers/fake.ts` declares them. */
export const CARD = {
    /** Settles immediately. */
    visa: 'pm_card_visa',
    /** 409 `PAYMENT_DECLINED`, and retryable with another method. */
    declined: 'pm_card_declined',
    /** `requires_action` — a 3-D Secure challenge the browser finishes, then calls `/sync`. */
    challenge: 'pm_card_authentication_required'
} as const;

/**
 * Bring `quantity` units of `productId` onto the shelf — the opening stock every product needs
 * before anyone can buy it, since the catalogue now seeds at `onHand: 0`.
 *
 * @param owner - a caller holding `inventory.any.create`
 */
export const receiveStock = (owner: Caller, productId: string, quantity: number): Promise<void> =>
    owner
        .call('POST', '/inventory/receipts', { productId, quantity, note: 'Opening stock' })
        .then(() => undefined);

/**
 * Fill the caller's cart and check it out — the whole customer half of an order.
 *
 * The cart is filled line by line because that is what `POST /cart` takes; the lines land in one
 * order either way, since a cart belongs to one account and this awaits each add.
 *
 * @param caller - the shopper
 * @param lines - what they are buying
 * @param options - the checkout body's own optional fields
 * @returns the new order's id
 */
export const checkout = async (
    caller: Caller,
    lines: Line[],
    options: { shippingMethodId?: string; paymentMethod?: string } = {}
): Promise<string> => {
    for (const line of lines) await caller.call('POST', '/cart', line);

    const { order } = await caller.call<CheckoutData>('POST', '/cart/checkout', options);
    return order.id;
};

/**
 * Freeze an order's price into a payment intent, ready to confirm.
 *
 * @returns the payment's id
 */
export const openPayment = (caller: Caller, orderId: string): Promise<string> =>
    caller.call<PaymentData>('POST', '/payments/intent', { orderId }).then((payment) => payment.id);

/**
 * Submit a card against an open payment.
 *
 * Returns the provider's answer rather than asserting one: two of the three history rows that
 * use this WANT a non-final outcome — a decline (409) and a 3-D Secure challenge — so the caller
 * decides what is acceptable, not this function.
 *
 * @param paymentMethodRef - one of {@link CARD}
 * @returns the payment's status, or `'declined'` for the 409 the fake provider answers a
 *          refused card with — a refusal, not a failure, and the one the flows retry past
 */
export const submitCard = (
    caller: Caller,
    paymentId: string,
    paymentMethodRef: string
): Promise<string> =>
    caller
        .attempt('POST', `/payments/${paymentId}/confirm`, { paymentMethodRef })
        .then((outcome) => {
            if (outcome.status === 409) return 'declined';
            if (outcome.status !== 200)
                throw new Error(
                    `submitCard(${paymentMethodRef}) answered ${String(outcome.status)} — ` +
                        JSON.stringify(outcome.data)
                );
            return (outcome.data as PaymentData).status;
        });

/**
 * What the browser calls after finishing a challenge at the provider — the step that settles a
 * `requires_action` payment.
 */
export const syncPayment = (caller: Caller, paymentId: string): Promise<string> =>
    caller
        .call<PaymentData>('POST', `/payments/${paymentId}/sync`)
        .then((payment) => payment.status);

/** Checkout, then pay it off with a card that settles first time. */
export const checkoutAndPay = async (caller: Caller, lines: Line[]): Promise<string> => {
    const orderId = await checkout(caller, lines);
    await submitCard(caller, await openPayment(caller, orderId), CARD.visa);
    return orderId;
};

/**
 * Record money that arrived outside the provider — the admin's own hand.
 *
 * @param owner - a caller holding `payments.any.create`
 * @param method - `cash`, `bank_transfer` or `other`
 */
export const recordOfflinePayment = (
    owner: Caller,
    orderId: string,
    method: string
): Promise<void> =>
    owner.call('POST', `/payments/order/${orderId}/offline`, { method }).then(() => undefined);

/**
 * Move an order along the lifecycle as an operator would, one transition at a time.
 *
 * One request per step on purpose: `canTransition` refuses a jump, and a shortcut that wrote the
 * final status directly would skip every transition's own side effects — the shipment, the stock
 * movement and the audit row that make this dataset worth more than a written one.
 *
 * @param owner - a caller holding `orders.any.update`
 * @param statuses - the transitions in order, e.g. `['processing', 'shipped']`
 */
export const advanceOrder = async (
    owner: Caller,
    orderId: string,
    statuses: string[]
): Promise<void> => {
    for (const status of statuses) await owner.call('PUT', `/orders/${orderId}`, { status });
};

/**
 * One courier tick: every parcel currently `shipped` is delivered.
 *
 * Global, with no body — so an order meant to stay in transit has to be shipped AFTER the tick
 * that delivered the others.
 *
 * @param owner - a caller holding `delivery.any.update`
 */
export const advanceCourier = (owner: Caller): Promise<void> =>
    owner.call('POST', '/delivery/advance').then(() => undefined);

/**
 * Cancel an order. `refund` is the operator's choice alone — a customer cancelling their own paid
 * order is always refunded, whatever this says.
 */
export const cancelOrder = (caller: Caller, orderId: string, refund?: boolean): Promise<void> =>
    caller
        .call('POST', `/orders/${orderId}/cancel`, refund === undefined ? {} : { refund })
        .then(() => undefined);

/**
 * Soft-delete an order — `deletedAt`, not a removal.
 *
 * @param owner - a caller holding `orders.any.delete`
 */
export const softDeleteOrder = (owner: Caller, orderId: string): Promise<void> =>
    owner.call('DELETE', `/orders/${orderId}`).then(() => undefined);

/**
 * Replace a product's picture — a plain JSON `PATCH`, not the multipart upload route: the
 * contract accepts `imageUrl` as a string directly, so this needs no file to actually decode.
 * The point is the CHANGE, not the picture — an order placed against the old `imageUrl` must
 * resolve this new one live, never the one the buyer originally saw.
 *
 * @param owner - a caller holding `products.any.update`
 */
export const replaceProductImage = (
    owner: Caller,
    productId: string,
    imageUrl: string
): Promise<void> =>
    owner.call('PATCH', `/products/${productId}`, { imageUrl }).then(() => undefined);

/**
 * Hard-delete a product — the row is gone, not merely hidden. An order line that named it keeps
 * the id and resolves `current: null` from then on; see SECURITY_HOLES_7_STORAGE_QUOTA.
 *
 * @param owner - a caller holding `products.any.delete`
 */
export const hardDeleteProduct = (owner: Caller, productId: string): Promise<void> =>
    owner.call('DELETE', `/products/${productId}/hard`).then(() => undefined);
