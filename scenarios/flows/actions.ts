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

/** What `POST /cart/checkout` answers with — the created order itself. Only the id is ever read. */
interface CheckoutData {
    id: string;
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
 * Defaults to `pickup`: every demo product is physical, so checkout refuses a basket with no
 * method at all, and `pickup` is the one method that needs no address — not every seeded shopper
 * has one. A flow demonstrating a real shipment (`standard`) overrides it.
 *
 * The shipping method is the cart's own choice now (`PUT /cart/shipping-method`), set here before
 * checkout rather than sent in its body — see `docs/modules/cart-checkout.md`.
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

    const { shippingMethodId = 'pickup', ...rest } = options;
    await caller.call('PUT', '/cart/shipping-method', { shippingMethodId });

    const order = await caller.call<CheckoutData>('POST', '/cart/checkout', rest);
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

/**
 * Checkout, then pay it off with a card that settles first time.
 *
 * @param options - shipping and payment choices, as {@link checkout} takes them
 */
export const checkoutAndPay = async (
    caller: Caller,
    lines: Line[],
    options: Parameters<typeof checkout>[2] = {}
): Promise<string> => {
    const orderId = await checkout(caller, lines, options);
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
 * Move a paid order into `processing`, as an operator would: the warehouse's own door,
 * `POST /delivery/order/{id}/start`. Going through it means a seeded order carries the ordinary
 * history, not an override's status-correction audit rows.
 *
 * @param owner - a caller holding `delivery.any.start`
 */
export const startProcessing = (owner: Caller, orderId: string): Promise<void> =>
    owner.call('POST', `/delivery/order/${orderId}/start`).then(() => undefined);

/**
 * Record a parcel's handover to the carrier — the door that moves an order `processing → shipped`
 * now. `trackingCode` is only required for a `tracked` method; every order this scenario ships
 * uses one that is not, so it stays unset.
 *
 * @param owner - a caller holding `delivery.any.update`
 */
export const shipOrder = (owner: Caller, orderId: string, trackingCode?: string): Promise<void> =>
    owner
        .call('POST', `/delivery/order/${orderId}/ship`, trackingCode ? { trackingCode } : {})
        .then(() => undefined);

/**
 * Record a parcel's arrival — the door that moves an order `shipped → delivered` now.
 *
 * @param owner - a caller holding `delivery.any.update`
 */
export const deliverOrder = (owner: Caller, orderId: string): Promise<void> =>
    owner.call('POST', `/delivery/order/${orderId}/deliver`).then(() => undefined);

/**
 * Cancel an order. `refund` is the operator's choice alone — a customer cancelling their own paid
 * order is always refunded, whatever this says.
 */
export const cancelOrder = (caller: Caller, orderId: string, refund?: boolean): Promise<void> =>
    caller
        .call('POST', `/orders/${orderId}/cancel`, refund === undefined ? {} : { refund })
        .then(() => undefined);

/**
 * Open a return on a delivered order — `POST /returns`, the customer's own door. Every line, since
 * the body names none.
 *
 * @param caller - the order's own buyer; staff cannot exercise a consumer's right for them
 * @param reason - `defective`, `wrong_item`, `other` or `withdrawal`
 * @returns the return's id
 */
export const requestReturn = (
    caller: Caller,
    orderId: string,
    reason: string,
    note?: string
): Promise<string> =>
    caller
        .call<{ id: string }>('POST', '/returns', { orderId, reason, ...(note ? { note } : {}) })
        .then((opened) => opened.id);

/**
 * Soft-delete an order — `deletedAt`, not a removal.
 *
 * @param owner - a caller holding `orders.any.delete`
 */
export const softDeleteOrder = (owner: Caller, orderId: string): Promise<void> =>
    owner.call('DELETE', `/orders/${orderId}`).then(() => undefined);

/**
 * A 1x1 PNG. The server digests every upload, so the bytes must genuinely decode; the picture
 * itself is beside the point of the flow that sends it.
 */
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

/**
 * Replace a product's picture through the multipart upload route — the only way to name one,
 * since `imageUrl` on a write body is `null`-only. The point is the CHANGE, not the picture — an
 * order placed against the old `imageUrl` must resolve this new one live, never the one the
 * buyer originally saw.
 *
 * @param owner - a caller holding `products.any.update`
 */
export const replaceProductImage = (owner: Caller, productId: string): Promise<void> => {
    const form = new FormData();
    form.append('imageUpload', new Blob([TINY_PNG], { type: 'image/png' }), 'replacement.png');
    return owner.call('PATCH', `/products/${productId}`, form).then(() => undefined);
};

/**
 * Hard-delete a product — the row is gone, not merely hidden. An order line that named it keeps
 * the id and resolves `current: null` from then on.
 *
 * @param owner - a caller holding `products.any.delete`
 */
export const hardDeleteProduct = (owner: Caller, productId: string): Promise<void> =>
    owner.call('DELETE', `/products/${productId}/hard`).then(() => undefined);
