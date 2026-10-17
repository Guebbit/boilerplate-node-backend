/**
 * @module
 * The shop steps journeys share, as a client takes them: a shopper with an address, a basket
 * checked out into an order, and a card payment opened and confirmed in two calls so a journey
 * can reach in between them.
 */
import {
    Checkout201Response,
    ConfirmPayment200Response,
    CreatePaymentIntent201Response,
    GetOrderById200Response,
    GetPaymentByOrder200Response,
    GetProductAdmin200Response,
    ListStockMovements200Response
} from '@api/schemas.zod';
import { api, loginBearer } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { checkoutAs } from '@tests/checkout-as';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';

/** One basket line: a product's id and how many. */
export interface BasketLine {
    productId: string;
    quantity: number;
}

/** Makes each shopper's address its own, because the outbox is shared by the whole process. */
let shoppers = 0;

/**
 * A signed-in customer who can check out to a saved address. The address is unique to the call, so
 * a journey can count the mail that reached it.
 *
 * @returns the account, its address and its `Authorization` header value
 */
export const newShopper = async () => {
    shoppers += 1;
    const user = await createUser(
        {
            email: `shopper${String(shoppers)}@journeys.example.com`,
            username: `shopper${String(shoppers)}`,
            verifiedAt: new Date()
        },
        'customer'
    );
    await giveAddress(user.id);

    return { user, email: user.email, bearer: await loginBearer(user.email) };
};

/**
 * Fills the cart and checks out, paying by `card` unless told otherwise.
 *
 * @param bearer - the shopper's `Authorization` header value
 * @param lines - what goes in the basket
 * @param body - more of the checkout request, such as `paymentMethod`
 * @returns the order as checkout answers it
 */
export const placeOrder = async (
    bearer: string,
    lines: BasketLine[],
    body: Record<string, unknown> = {}
) => {
    for (const line of lines) await api().post('/cart').set('Authorization', bearer).send(line);
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', bearer)
        .send({ shippingMethodId: 'standard' });

    return bodyOf(await checkoutAs(bearer, body), Checkout201Response).data;
};

/**
 * Opens the card payment for an order.
 *
 * @param bearer - the shopper's `Authorization` header value
 * @param orderId - the order to pay
 * @returns the payment; the provider's reference for it is `fake_pi_<id>`
 */
export const openIntent = async (bearer: string, orderId: string) =>
    bodyOf(
        await api().post('/payments/intent').set('Authorization', bearer).send({ orderId }),
        CreatePaymentIntent201Response
    ).data;

/**
 * Confirms an open payment with a card handle.
 *
 * @param bearer - the shopper's `Authorization` header value
 * @param paymentId - the payment from {@link openIntent}
 * @param paymentMethodRef - the provider's handle, such as `pm_card_visa`
 * @returns the raw response, since a journey may expect a refusal
 */
export const confirmCard = (bearer: string, paymentId: string, paymentMethodRef = 'pm_card_visa') =>
    api()
        .post(`/payments/${paymentId}/confirm`)
        .set('Authorization', bearer)
        .send({ paymentMethodRef });

/**
 * Opens the payment and confirms it with a good card in one go.
 *
 * @param bearer - the shopper's `Authorization` header value
 * @param orderId - the order to pay
 * @returns the settled payment
 */
export const payByCard = async (bearer: string, orderId: string) => {
    const intent = await openIntent(bearer, orderId);

    return bodyOf(await confirmCard(bearer, intent.id), ConfirmPayment200Response).data;
};

/**
 * An order as a caller reads it.
 *
 * @param bearer - the caller's `Authorization` header value
 * @param orderId - the order
 */
export const orderOf = async (bearer: string, orderId: string) =>
    bodyOf(
        await api().get(`/orders/${orderId}`).set('Authorization', bearer),
        GetOrderById200Response
    ).data;

/**
 * An order's payment as staff read it.
 *
 * @param bearer - the staff member's `Authorization` header value
 * @param orderId - the order
 */
export const paymentOf = async (bearer: string, orderId: string) =>
    bodyOf(
        await api().get(`/payments/order/${orderId}`).set('Authorization', bearer),
        GetPaymentByOrder200Response
    ).data;

/**
 * A product's counters as staff read them.
 *
 * @param bearer - the staff member's `Authorization` header value
 * @param productId - the product
 */
export const stockOf = async (bearer: string, productId: string) => {
    const { onHand, reserved } = bodyOf(
        await api().get(`/products/${productId}/admin`).set('Authorization', bearer),
        GetProductAdmin200Response
    ).data;

    return { onHand, reserved };
};

/**
 * The ledger reasons recorded for one product, newest first.
 *
 * @param bearer - the staff member's `Authorization` header value
 * @param productId - the product
 */
export const ledgerOf = async (bearer: string, productId: string) =>
    bodyOf(
        await api().get('/inventory/movements').query({ productId }).set('Authorization', bearer),
        ListStockMovements200Response
    ).data.items.map(({ reason }) => reason);
