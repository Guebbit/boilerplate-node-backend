/**
 * @module
 * `OrderActions` says what a button may offer; the door behind it says what it will accept. A
 * client renders from the first and the server enforces the second, so any day the two disagree a
 * shopper sees a button that fails, or an operator misses one that would work. This pins them
 * together over the real app: for every role × order status × act, the flag is `true` exactly when
 * the door answers a success.
 *
 * Acts: cancel, start, override, withdraw, pay, recordPayment. Each case gets its own order,
 * because the door writes. The withdrawal is also swept over the kinds of order that differ in what
 * it takes: ordinary, mixed with a made-to-order line, and made only of made-to-order goods.
 *
 * Known edge, not swept: a mixed `processing` order whose eligible groups are already cancelled
 * keeps its button (the order's lines are frozen) and a second withdrawal answers 409
 * `RETURN_NOTHING_TO_CANCEL`. See docs/modules/returns.md#goods-with-no-right-of-withdrawal.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, forceOrderStatus, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo, fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { OrderStatus } from '@types';
import type { OrderActions } from '@types';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
});

/** The roles swept: the order's own buyer, and the staff roles that differ in what they may do. */
const ROLES = ['customer', 'admin', 'manager', 'warehouse', 'support'] as const;

/** Every status an order can be in. */
const STATUSES = [
    OrderStatus.pending,
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.shipped,
    OrderStatus.delivered,
    OrderStatus.cancelled
] as const;

/** What an order is made of, for the withdrawal sweep. */
type OrderKind = 'ordinary' | 'mixed' | 'bespoke-only';

/** A signed-in caller. */
interface Caller {
    role: (typeof ROLES)[number];
    bearer: `Bearer ${string}`;
}

/**
 * Sign every swept role in. The `customer` is the order's owner; the rest are staff who do not own
 * it, so a flag that is `true` for them rests on their keys, never on ownership.
 */
const signedIn = async () => {
    const owner = await authenticateAsRole('customer');
    const buyer: Caller = { role: 'customer', bearer: owner.bearer };
    const callers: Caller[] = [buyer];
    for (const role of ROLES.filter((one) => one !== 'customer')) {
        const staff = await authenticateAsRole(role);
        callers.push({ role, bearer: staff.bearer });
    }
    return { owner, buyer, callers };
};

/**
 * An order of `kind` in `status`, made the way production would have made it: goods that left or
 * arrived go through the real doors, and a paid order has the fulfillment orders its payment event
 * would have made.
 */
const orderIn = async (
    owner: Awaited<ReturnType<typeof authenticateAsRole>>,
    status: OrderStatus,
    kind: OrderKind = 'ordinary'
): Promise<string> => {
    const ordinary = await createProduct({ title: `Shirt ${Math.random()}`, price: 30 });
    const bespoke = await createProduct({
        title: `Engraved mug ${Math.random()}`,
        price: 10,
        noWithdrawal: true
    });
    const items = {
        ordinary: [toOrderItem(ordinary, 1)],
        mixed: [toOrderItem(ordinary, 1), toOrderItem(bespoke, 1)],
        'bespoke-only': [toOrderItem(bespoke, 1)]
    }[kind];
    const carried = status === OrderStatus.shipped || status === OrderStatus.delivered;
    const order = await createOrder(owner.user, items, {
        status: carried ? OrderStatus.processing : status
    });
    const orderId = String(order._id);

    if (carried) await carryOrderTo(orderId, status);
    else if (status === OrderStatus.paid || status === OrderStatus.processing)
        await fulfillmentOrdersOf(orderId);

    return orderId;
};

/**
 * The actions a caller is shown on an order, or `undefined` when they cannot read it at all (then
 * no button exists to promise anything).
 */
const actionsFor = async (caller: Caller, orderId: string): Promise<OrderActions | undefined> => {
    const response = await api().get(`/orders/${orderId}`).set('Authorization', caller.bearer);
    if (response.status !== 200) return undefined;

    return (response.body as { data: { actions?: OrderActions } }).data.actions;
};

/** Why the button is off for this caller, when the server says. */
const whyBlocked = async (caller: Caller, orderId: string) => {
    const actions = await actionsFor(caller, orderId);
    return actions?.withdrawBlocked;
};

/** One act: which flag it reads, and the request its door answers. */
interface Act {
    name: string;
    flag: (actions: OrderActions) => boolean;
    door: (caller: Caller, orderId: string) => PromiseLike<{ status: number }>;
}

/** The acts whose flag is a plain boolean. `override` is swept separately, per destination. */
const ACTS: Act[] = [
    {
        name: 'cancel',
        flag: (actions) => actions.cancel,
        door: (caller, orderId) =>
            api().post(`/orders/${orderId}/cancel`).set('Authorization', caller.bearer).send({})
    },
    {
        name: 'start',
        flag: (actions) => actions.start,
        door: (caller, orderId) =>
            api().post(`/delivery/order/${orderId}/start`).set('Authorization', caller.bearer)
    },
    {
        name: 'withdraw',
        flag: (actions) => actions.withdraw,
        door: (caller, orderId) =>
            api()
                .post('/returns')
                .set('Authorization', caller.bearer)
                .send({ orderId, reason: 'withdrawal' })
    },
    {
        name: 'pay',
        flag: (actions) => actions.pay,
        door: (caller, orderId) =>
            api().post('/payments/intent').set('Authorization', caller.bearer).send({ orderId })
    },
    {
        name: 'recordPayment',
        flag: (actions) => actions.recordPayment,
        door: (caller, orderId) =>
            api()
                .post(`/payments/order/${orderId}/offline`)
                .set('Authorization', caller.bearer)
                .send({ method: 'cash', reference: 'till' })
    }
];

/** Whether a response is the door opening. */
const accepted = ({ status }: { status: number }): boolean => status >= 200 && status < 300;

describe('the button and its door agree', () => {
    it.each(ACTS)('on $name, for every role and every status', async (act) => {
        const { owner, callers } = await signedIn();
        const disagreements: string[] = [];
        let bothOpen = 0;

        for (const status of STATUSES)
            for (const caller of callers) {
                const orderId = await orderIn(owner, status);
                const actions = await actionsFor(caller, orderId);
                const flagged = actions !== undefined && act.flag(actions);
                const opened = accepted(await act.door(caller, orderId));

                if (flagged && opened) bothOpen += 1;
                if (flagged !== opened)
                    disagreements.push(
                        `${caller.role} on ${status}: button ${String(flagged)}, door ${String(opened)}`
                    );
            }

        expect(disagreements).toEqual([]);
        // A sweep where both sides always say no would agree too: some cell must open.
        expect(bothOpen).toBeGreaterThan(0);
    });

    it('on override, for every role, status and destination', async () => {
        const { owner, callers } = await signedIn();
        const disagreements: string[] = [];
        let bothOpen = 0;

        for (const status of STATUSES)
            for (const caller of callers)
                for (const to of STATUSES) {
                    const orderId = await orderIn(owner, status);
                    const shown = await actionsFor(caller, orderId);
                    const offered = shown?.override ?? [];
                    const opened = accepted(
                        await api()
                            .post(`/orders/${orderId}/status-override`)
                            .set('Authorization', caller.bearer)
                            .send({ to, reason: 'parity sweep' })
                    );

                    if (offered.includes(to) && opened) bothOpen += 1;
                    if (offered.includes(to) !== opened)
                        disagreements.push(
                            `${caller.role} ${status}→${to}: button ${String(offered.includes(to))}, door ${String(opened)}`
                        );
                }

        expect(disagreements).toEqual([]);
        expect(bothOpen).toBeGreaterThan(0);
    });

    it('on withdraw, for the buyer, over what the order is made of', async () => {
        const { owner, buyer } = await signedIn();
        const disagreements: string[] = [];
        let bothOpen = 0;

        for (const kind of ['ordinary', 'mixed', 'bespoke-only'] as const)
            for (const status of [OrderStatus.pending, OrderStatus.paid, OrderStatus.processing]) {
                const orderId = await orderIn(owner, status, kind);
                const actions = await actionsFor(buyer, orderId);
                const opened = accepted(
                    await api()
                        .post('/returns')
                        .set('Authorization', buyer.bearer)
                        .send({ orderId, reason: 'withdrawal' })
                );

                if (actions?.withdraw && opened) bothOpen += 1;
                if (actions?.withdraw !== opened)
                    disagreements.push(
                        `${kind} ${status}: button ${String(actions?.withdraw)}, door ${String(opened)}`
                    );
            }

        expect(disagreements).toEqual([]);
        expect(bothOpen).toBeGreaterThan(0);
    });

    it('says why the button is off, and only when it is off, for the buyer alone', async () => {
        const { owner, buyer, callers } = await signedIn();
        const bespokeOnly = await orderIn(owner, OrderStatus.paid, 'bespoke-only');
        const ordinary = await orderIn(owner, OrderStatus.paid);
        await forceOrderStatus(ordinary, OrderStatus.cancelled);

        const reasons = {
            buyerBespoke: await whyBlocked(buyer, bespokeOnly),
            buyerCancelled: await whyBlocked(buyer, ordinary),
            staffBespoke: await Promise.all(
                callers.filter((one) => one !== buyer).map((one) => whyBlocked(one, bespokeOnly))
            )
        };

        expect(reasons).toEqual({
            buyerBespoke: 'all_excluded',
            buyerCancelled: undefined,
            staffBespoke: [undefined, undefined, undefined, undefined]
        });
    });
});
