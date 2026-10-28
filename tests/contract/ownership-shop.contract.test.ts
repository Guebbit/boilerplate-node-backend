/**
 * @module
 * Ownership sweep, shop half: another customer's order, payment, refund, credit note, shipment,
 * fulfillment order, return or notification, named in the URL, the body or a list filter, answers
 * exactly like an id that does not exist.
 *
 * Its own file because `demo:remove` deletes every test that imports a shop module, and this one
 * does. The completeness check, the foundation families and the shared vocabulary are in
 * `ownership-contract.test.ts` and `@tests/ownership-sweep`; the lists are `@tests/owned-ids`.
 *
 * Customer A owns a paid, delivered, partly refunded order with its invoice, credit note,
 * shipment, a return and a notification. Customer B attacks all of it over HTTP. A's world is
 * built with the modules' `tests/factories.ts`; the attacks only ever use the routes.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole, loginBearer } from '@tests/http';
import { createUser } from '@modules/users/tests/factories';
import { asAdmin, callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { isDeployed } from '@tests/paths';
import { MISSING_ID } from '@tests/ids';
import { OWNED_BODY, OWNED_FILTER, OWNED_PATH } from '@tests/owned-ids';
import type { OwnedId } from '@tests/owned-ids';
import { judge } from '@tests/ownership-sweep';
import type { OwnedCase, Verb } from '@tests/ownership-sweep';
import { shownTotal } from '@tests/checkout-as';
import { settleOutboxNudges } from '@kernel/outbox';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import { waitForInvoice } from '@modules/invoicing/tests/factories';
import { carryOrderTo, fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { createNotification } from '@modules/notifications/tests/factories';
import { deliveryService } from '@modules/delivery';
import { OrderStatus } from '@types';

setupTestDb();

/** The modules whose routes this file sweeps. */
const SHOP_MODULES = new Set([
    'cart',
    'delivery',
    'invoicing',
    'notifications',
    'orders',
    'payments',
    'returns'
]);

/** The entries of one family that this file owns, in the modules this checkout still has. */
const mine = (entries: readonly OwnedId[]): string[] =>
    entries
        .filter(({ module }) => SHOP_MODULES.has(module) && isDeployed(module))
        .map(({ key }) => key);

/** A customer who is logged in, as `authenticateAs` and `authenticateAsRole` answer. */
type Customer = Awaited<ReturnType<typeof authenticateAs>>;

/** The standard answer of every missing or foreign row. */
const NOT_FOUND = { status: 404 } as const;

/** Reads `id` out of a response body that has to have one. */
const idOf = (body: { id?: unknown }): string => String(body.id);

/** A customer's order that has been through the real doors: paid, delivered, part refunded. */
const paidDeliveredOrder = async (customer: Customer) => {
    const product = await createProduct({ price: 25, onHand: 20 });
    const order = await createOrder(customer.user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    await payByCard(order, customer.user);
    await settleOutboxNudges();
    await waitForInvoice(orderId);
    await carryOrderTo(orderId, 'delivered');
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 5 });
    await eventually(() =>
        api()
            .get(`/orders/${orderId}/credit-notes`)
            .set('Authorization', customer.bearer)
            .then((response) => (response.body.items as unknown[]).length > 0)
    );
    return orderId;
};

/** A customer's order, `processing`, whose first product shipped and whose second is the remainder. */
const partlyShippedOrder = async (customer: Customer) => {
    const shipped = await createProduct({ price: 20 });
    const waiting = await createProduct({ price: 5 });
    const order = await createOrder(
        customer.user,
        [toOrderItem(shipped, 1), toOrderItem(waiting, 2)],
        { status: OrderStatus.processing }
    );
    const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
    await deliveryService.shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        { lines: [{ productId: String(shipped._id), quantity: 1 }] },
        asAdmin(),
        callerContextAs('admin')
    );
    return { orderId: String(order._id), fulfillmentOrderId: String(fulfillmentOrder._id) };
};

/** A customer's order that reached `delivered` through the shipments, still unpaid, as a return needs. */
const deliveredOrder = async (customer: Customer) => {
    const product = await createProduct({ price: 20 });
    const order = await createOrder(customer.user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    await carryOrderTo(String(order._id), 'delivered');
    return String(order._id);
};

/** Reads the first row of an `items` list answered to `bearer`. */
const firstId = (path: string, bearer: string): Promise<string> =>
    api()
        .get(path)
        .set('Authorization', bearer)
        .then((response) => idOf(response.body.items[0]));

/** Everything customer A owns, as ids, and what customer B has to attack with. */
const seedShop = async () => {
    const victim = await authenticateAs('user');
    const attacker = await authenticateAsRole('customer');
    // A third customer who only checks out: a checkout that succeeds leaves an unpaid order, and
    // an account may hold few (`NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`), which B's own do use up.
    const shopperUser = await createUser(
        { email: 'shopper@example.com', username: 'shopper', verifiedAt: new Date() },
        'customer'
    );
    const shopper = { user: shopperUser, bearer: await loginBearer(shopperUser.email) };
    const orderId = await paidDeliveredOrder(victim);
    const { bearer } = victim;
    const paymentId = await firstId(`/orders/${orderId}/payments`, bearer);
    const refunds = await api().get(`/payments/${paymentId}`).set('Authorization', bearer);
    const returned = await api()
        .post('/returns')
        .set('Authorization', bearer)
        .send({ orderId, reason: 'withdrawal' });
    const address = await api().post('/account/addresses').set('Authorization', bearer).send({
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    });
    const notification = await createNotification({ userId: victim.user.id });
    return {
        victim,
        attacker,
        shopper,
        orderId,
        paymentId,
        refundId: idOf(refunds.body.refunds[0]),
        creditNoteId: await firstId(`/orders/${orderId}/credit-notes`, bearer),
        fulfillmentOrderId: await firstId(`/orders/${orderId}/fulfillment-orders`, bearer),
        shipmentId: await firstId(`/orders/${orderId}/shipments`, bearer),
        returnId: idOf(returned.body),
        notificationId: String(notification._id),
        addressId: idOf(address.body)
    };
};

/** What {@link seedShop} builds. */
type ShopWorld = Awaited<ReturnType<typeof seedShop>>;

/** Reads one route as `bearer`, as plain data. */
const readAs = (path: string, bearer: string) =>
    api()
        .get(path)
        .set('Authorization', bearer)
        .then((response) => response.body as unknown);

/** What a case must leave alone: A's rows and B's own cart, orders and returns. */
const watching = (world: ShopWorld) => () => {
    const { victim, attacker, orderId, paymentId, returnId } = world;
    return Promise.all([
        readAs(`/orders/${orderId}`, victim.bearer),
        readAs(`/orders/${orderId}/payments`, victim.bearer),
        readAs(`/payments/${paymentId}`, victim.bearer),
        readAs(`/returns/${returnId}`, victim.bearer),
        readAs('/notifications', victim.bearer),
        readAs('/account/addresses', victim.bearer),
        readAs('/cart', attacker.bearer),
        readAs('/orders', attacker.bearer),
        readAs('/returns', attacker.bearer),
        readAs('/cart', world.shopper.bearer),
        readAs('/orders', world.shopper.bearer)
    ]);
};

/**
 * One path case: the route's own `:params` take A's values, or `MISSING_ID`.
 *
 * @param key - the `OWNED_PATH` key; its first word is the verb
 * @param victim - A's value for each `:param`
 * @param body - a minimal valid body for a write; a 422 would mean the lookup was never reached
 * @param attacker - B
 */
const pathCase = (
    key: string,
    victim: Record<string, string>,
    attacker: Customer,
    body?: object
): OwnedCase => ({
    key,
    answer: NOT_FOUND,
    aim: (foreign) => ({
        method: key.split(' ', 1)[0] as Verb, // the key's first word is always one of the verbs
        path: (key.split(' ', 2)[1] ?? '').replaceAll(/:(\w+)/g, (_, name: string) =>
            foreign ? (victim[name] ?? MISSING_ID) : MISSING_ID
        ),
        bearer: attacker.bearer,
        body
    })
});

/** Whether a response is a 201, the answer of a create that went through. */
const created = (response: { status: number }): boolean => response.status === 201;

/** Whether a list answer holds at least one row. */
const found = (response: { body: { items?: unknown[] } }): boolean =>
    (response.body.items ?? []).length > 0;

/** A filter value sent as it is. */
const one = (value: string): unknown => value;

/** A filter value sent as a one-item list. */
const list = (value: string): unknown => [value];

/** The shop's path cases, one per `OWNED_PATH` entry. */
const shopPathCases = (world: ShopWorld): OwnedCase[] => {
    const { attacker } = world;
    const order = { id: world.orderId };
    const card = { paymentMethodRef: 'pm_card_visa' };
    return [
        pathCase('GET /orders/:id', order, attacker),
        pathCase('POST /orders/:id/cancel', order, attacker),
        pathCase('GET /orders/:id/timeline', order, attacker),
        pathCase('GET /orders/:id/invoice', order, attacker),
        pathCase('GET /orders/:id/credit-notes', order, attacker),
        pathCase(
            'GET /orders/:id/credit-notes/:creditNoteId',
            { ...order, creditNoteId: world.creditNoteId },
            attacker
        ),
        pathCase('GET /orders/:id/payments', order, attacker),
        pathCase('GET /orders/:id/fulfillment-orders', order, attacker),
        pathCase('GET /orders/:id/shipments', order, attacker),
        pathCase('GET /payments/:id', { id: world.paymentId }, attacker),
        pathCase(
            'GET /payments/:id/refunds/:refundId',
            { id: world.paymentId, refundId: world.refundId },
            attacker
        ),
        pathCase('POST /payments/:id/confirm', { id: world.paymentId }, attacker, card),
        pathCase('POST /payments/:id/sync', { id: world.paymentId }, attacker),
        pathCase(
            'GET /delivery/fulfillment-orders/:id',
            { id: world.fulfillmentOrderId },
            attacker
        ),
        pathCase('GET /delivery/shipments/:id', { id: world.shipmentId }, attacker),
        pathCase('GET /notifications/:id', { id: world.notificationId }, attacker),
        pathCase('DELETE /notifications/:id', { id: world.notificationId }, attacker),
        pathCase('GET /returns/:id', { id: world.returnId }, attacker)
    ];
};

/** A cart with one physical line and `standard` shipping; its total, as the cart shows it. */
const cartReadyToCheckOut = async (bearer: string) => {
    const product = await createProduct({ price: 10, onHand: 50 });
    await api()
        .post('/cart/items')
        .set('Authorization', bearer)
        .send({ productId: String(product._id), quantity: 1 });
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', bearer)
        .send({ shippingMethodId: 'standard' });
    return shownTotal(bearer);
};

/** A checkout case: `field` carries A's address id, or a missing one. */
const checkoutCase = (
    world: ShopWorld,
    field: 'addressId' | 'billingAddressId',
    ownAddressId: () => string
): OwnedCase => {
    let expectedTotal: object = {};
    const request = (id: string) => ({
        method: 'POST' as const,
        path: '/cart/checkout',
        bearer: world.shopper.bearer,
        body: { expectedTotal, [field]: id }
    });
    return {
        key: `POST /cart/checkout#${field}`,
        answer: { status: 404, code: 'CART_ADDRESS_NOT_FOUND' },
        prepare: () =>
            cartReadyToCheckOut(world.shopper.bearer).then((total) => {
                expectedTotal = total;
            }),
        aim: (foreign) => request(foreign ? world.addressId : MISSING_ID),
        control: () => request(ownAddressId()),
        controlPassed: (response) => response.status === 201
    };
};

/** The shop's body cases, one per `OWNED_BODY` entry, each with B's own id as its positive control. */
const shopBodyCases = async (world: ShopWorld): Promise<OwnedCase[]> => {
    const { attacker } = world;
    const own = await api()
        .post('/account/addresses')
        .set('Authorization', world.shopper.bearer)
        .send({
            fullName: 'Bob Builder',
            street: 'Via Emilia 2',
            city: 'Modena',
            zip: '41121',
            country: 'IT',
            default: true
        });
    const ownAddressId = idOf(own.body);
    const unpaid = await createOrder(attacker.user, [toOrderItem(await createProduct(), 1)]);
    const pending = String(unpaid._id);
    const delivered = await deliveredOrder(attacker);
    const partly = await partlyShippedOrder(attacker);
    const remainder = await partlyShippedOrder(attacker);
    const { bearer } = attacker;
    const post = (path: string, body: object) => ({ method: 'POST' as const, path, bearer, body });

    return [
        checkoutCase(world, 'addressId', () => ownAddressId),
        checkoutCase(world, 'billingAddressId', () => ownAddressId),
        {
            key: 'POST /cart/reorder#orderId',
            answer: NOT_FOUND,
            aim: (foreign) =>
                post('/cart/reorder', { orderId: foreign ? world.orderId : MISSING_ID }),
            control: () => post('/cart/reorder', { orderId: pending })
        },
        {
            key: 'POST /payments#orderId',
            answer: NOT_FOUND,
            aim: (foreign) => post('/payments', { orderId: foreign ? world.orderId : MISSING_ID }),
            control: () => post('/payments', { orderId: pending }),
            controlPassed: created
        },
        {
            key: 'POST /returns#orderId',
            answer: NOT_FOUND,
            aim: (foreign) =>
                post('/returns', {
                    orderId: foreign ? world.orderId : MISSING_ID,
                    reason: 'withdrawal'
                }),
            control: () => post('/returns', { orderId: delivered, reason: 'withdrawal' }),
            controlPassed: created
        },
        {
            key: 'POST /returns#orderId (cancellation)',
            answer: NOT_FOUND,
            aim: (foreign) =>
                post('/returns', {
                    orderId: foreign ? world.orderId : MISSING_ID,
                    reason: 'withdrawal',
                    kind: 'cancellation',
                    fulfillmentOrderId: partly.fulfillmentOrderId
                }),
            control: () =>
                post('/returns', {
                    orderId: partly.orderId,
                    reason: 'withdrawal',
                    kind: 'cancellation',
                    fulfillmentOrderId: partly.fulfillmentOrderId
                }),
            controlPassed: created
        },
        {
            key: 'POST /returns#fulfillmentOrderId',
            answer: { status: 409, code: 'RETURN_NOTHING_TO_CANCEL' },
            aim: (foreign) =>
                post('/returns', {
                    orderId: remainder.orderId,
                    reason: 'withdrawal',
                    kind: 'cancellation',
                    fulfillmentOrderId: foreign ? world.fulfillmentOrderId : MISSING_ID
                }),
            control: () =>
                post('/returns', {
                    orderId: remainder.orderId,
                    reason: 'withdrawal',
                    kind: 'cancellation',
                    fulfillmentOrderId: remainder.fulfillmentOrderId
                }),
            controlPassed: created
        },
        {
            key: 'GET /returns/options#orderId',
            answer: NOT_FOUND,
            aim: (foreign) => ({
                method: 'GET',
                path: '/returns/options',
                bearer,
                query: { orderId: foreign ? world.orderId : MISSING_ID }
            }),
            control: () => ({
                method: 'GET',
                path: '/returns/options',
                bearer,
                query: { orderId: delivered }
            })
        }
    ];
};

/** The filter cases: a foreign id narrows a list to an empty page, and B's own id finds B's row. */
const shopFilterCases = async (world: ShopWorld): Promise<OwnedCase[]> => {
    const { attacker, victim } = world;
    const { bearer } = attacker;
    const owned = await deliveredOrder(attacker);
    await api()
        .post('/returns')
        .set('Authorization', bearer)
        .send({ orderId: owned, reason: 'withdrawal' });
    /** One filter case; `array` filters carry their value in a list. */
    const filter = (
        key: string,
        method: 'GET' | 'POST',
        path: string,
        field: string,
        wrap: (value: string) => unknown,
        victimValue: string,
        ownValue: string,
        answer: OwnedCase['answer']
    ): OwnedCase => {
        const attempt = (value: string) =>
            method === 'GET'
                ? { method, path, bearer, query: { [field]: wrap(value) } }
                : { method, path, bearer, body: { [field]: wrap(value) } };
        return {
            key,
            answer,
            aim: (foreign) => attempt(foreign ? victimValue : MISSING_ID),
            control: () => attempt(ownValue),
            controlPassed: found
        };
    };
    // An `id` filter narrows. A `userId` filter is ignored for a caller without `display:Order`
    // (`honourUserIdFilter`), so the page is the caller's own, and must hold none of A's.
    const narrows = { status: 200, emptyPage: true };
    const ignored = { status: 200, without: world.orderId };
    return [
        filter(
            'GET /returns#orderId',
            'GET',
            '/returns',
            'orderId',
            one,
            world.orderId,
            owned,
            narrows
        ),
        filter('GET /orders#id[]', 'GET', '/orders', 'id', list, world.orderId, owned, narrows),
        filter(
            'GET /orders#userId',
            'GET',
            '/orders',
            'userId',
            one,
            victim.user.id,
            attacker.user.id,
            ignored
        ),
        filter(
            'POST /orders/search#id[]',
            'POST',
            '/orders/search',
            'id',
            list,
            world.orderId,
            owned,
            narrows
        ),
        filter(
            'POST /orders/search#userId',
            'POST',
            '/orders/search',
            'userId',
            one,
            victim.user.id,
            attacker.user.id,
            ignored
        )
    ];
};

/** Runs every case in turn, collecting what went wrong so one red run names all of it. */
const sweep = async (cases: OwnedCase[], world: ShopWorld, family: readonly OwnedId[]) => {
    expect([...new Set(cases.map((one) => one.key.replace(/ \(.*\)$/, '')))].toSorted()).toEqual(
        [...new Set(mine(family))].toSorted()
    );
    const watch = watching(world);
    const problems: string[] = [];
    for (const one of cases) problems.push(...(await judge(one, watch)));
    return problems;
};

describe('another customer’s order, payment, return and notification answer like a missing one', () => {
    it('refuses every shop path id, and leaves A’s rows as they were', async () => {
        const world = await seedShop();

        expect(await sweep(shopPathCases(world), world, OWNED_PATH)).toEqual([]);
    });

    it('refuses every shop body id with the documented answer, and B’s own id still works', async () => {
        const world = await seedShop();

        expect(await sweep(await shopBodyCases(world), world, OWNED_BODY)).toEqual([]);
    });

    it('narrows every shop list filter on a foreign id to an empty page', async () => {
        const world = await seedShop();

        expect(await sweep(await shopFilterCases(world), world, OWNED_FILTER)).toEqual([]);
    });
});
