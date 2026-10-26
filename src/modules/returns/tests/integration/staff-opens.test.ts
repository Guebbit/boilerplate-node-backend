/**
 * @module
 * Staff acting for the buyer: opening a return the way a phone call asks for it, waiving the
 * shop's own deadline and Art. 16 exclusion with the waiver written on the record, and recording a
 * withdrawal the buyer stated outside the shop — judged on the day it was sent, not the day it was
 * read.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import {
    asCustomer,
    asModerator,
    asSupport,
    asWarehouse,
    callerContextAs,
    testCallerContext
} from '@tests/callers';
import { asReject } from '@tests/response';
import { OrderStatus } from '@types';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    readOrder,
    setConformityUntil,
    setWithdrawUntil,
    timelineOf,
    toOrderItem
} from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import { paymentService } from '@modules/payments';
import { payByCard } from '@modules/payments/tests/factories';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

const DAY = 86_400_000;

/** A distinct address per customer. */
let customers = 0;

/** What a test may pin about the order it starts from. */
interface Wanted {
    /** Days ago the order was made; the buyer cannot have asked for a return before it. */
    madeDaysAgo?: number;
    excluded?: boolean;
    /** `processing` by default; a payment needs the order still pending. */
    status?: OrderStatus;
}

/** A buyer with a shirt (30.00) and a mug (10.00); the mug is made to order when `excluded`. */
const buyerWithOrder = async ({
    madeDaysAgo = 0,
    excluded = false,
    status = OrderStatus.processing
}: Wanted = {}) => {
    customers += 1;
    const user = await createUser({ email: `staff-opens-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({
        title: 'Mug',
        price: 10,
        onHand: 10,
        ...(excluded ? { noWithdrawal: true } : {})
    });
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(mug, 1)], {
        status,
        createdAt: new Date(Date.now() - madeDaysAgo * DAY).toISOString()
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 1 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    return { user, shirt, mug, orderId };
};

/** The same order, delivered, with the withdrawal period ending `endsInDays` from now. */
const deliveredOrder = async (wanted: Wanted & { endsInDays?: number } = {}) => {
    const fixture = await buyerWithOrder(wanted);
    await carryOrderTo(fixture.orderId, 'delivered');
    await setWithdrawUntil(fixture.orderId, new Date(Date.now() + (wanted.endsInDays ?? 7) * DAY));
    await settleOutboxNudges();
    mockEnqueueEmail.mockClear();
    return fixture;
};

/** The same order, paid by card and not yet shipped. */
const paidOrder = async () => {
    const fixture = await buyerWithOrder({ madeDaysAgo: 3, status: OrderStatus.pending });
    const order = await readOrder(fixture.orderId);
    if (!order) throw new Error('no order');
    await payByCard(order, fixture.user);
    await settleOutboxNudges();
    mockEnqueueEmail.mockClear();
    return fixture;
};

/** The staff caller pair: the auth context and the audit context. */
const staff = (role: 'support' | 'moderator') =>
    [role === 'support' ? asSupport() : asModerator(), callerContextAs(role)] as const;

describe('staff opening a return for the buyer', () => {
    it('opens it approved, names the staff member, and tells the buyer once with the address', async () => {
        const { orderId } = await deliveredOrder();
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            auth,
            context
        );

        const created = outcome.success ? outcome.data : undefined;
        expect(created).toMatchObject({
            status: 'approved',
            openedBy: 'staff',
            policyExceptions: []
        });
        expect(created?.decidedAt).toBeInstanceOf(Date);
        expect(created?.lines).toHaveLength(2);
        await settleOutboxNudges();
        const rows = await outboxEventModel.find({}).lean().exec();
        const names = rows.map(({ name }) => name);
        expect(names).toEqual(expect.arrayContaining(['return.requested', 'return.decided']));
        const notices = mockEnqueueEmail.mock.calls.filter(([, t]) => t === 'returns.notice');
        expect(notices).toHaveLength(1);
        expect(notices[0][0].subject).toBe('We opened your return');
        const row = audited.find(({ action }) => action === 'return.requested');
        expect(row?.metadata).toMatchObject({ onBehalfOfBuyer: true });
        const [requested, approved] = await Promise.all([
            timelineOf(orderId, 'return_requested'),
            timelineOf(orderId, 'return_approved')
        ]);
        expect(requested[0].actor).toBe('test-support');
        expect(approved[0].actor).toBe('test-support');
        const order = await readOrder(orderId);
        expect(order?.toJSON().returnStatus).toBe('in_progress');
    });

    it('dates it by the day the buyer asked, and refuses a date in the future or before the order', async () => {
        const { orderId } = await deliveredOrder({ madeDaysAgo: 10 });
        const [auth, context] = staff('support');
        const asked = new Date(Date.now() - 2 * DAY);

        const ok = await returnService.createReturn(
            { orderId, reason: 'defective', requestedAt: asked, lines: [] },
            auth,
            context
        );
        const future = await returnService.createReturn(
            { orderId, reason: 'defective', requestedAt: new Date(Date.now() + DAY) },
            auth,
            context
        );
        const early = await returnService.createReturn(
            { orderId, reason: 'defective', requestedAt: new Date(Date.now() - 20 * DAY) },
            auth,
            context
        );

        expect(ok.success && ok.data.requestedAt.getTime()).toBe(asked.getTime());
        expect(asReject(future).errors[0]).toMatchObject({
            code: 'RETURN_STATEMENT_INVALID',
            details: { field: 'requestedAt' }
        });
        expect(asReject(early).errors[0].code).toBe('RETURN_STATEMENT_INVALID');
    });

    it('refuses a channel on a reason that is not a withdrawal', async () => {
        const { orderId } = await deliveredOrder();
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective', statedVia: 'phone' },
            auth,
            context
        );

        expect(asReject(outcome).errors[0]).toMatchObject({
            code: 'RETURN_STATEMENT_INVALID',
            details: { field: 'statedVia' }
        });
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(0);
    });

    it('answers 404 to staff without update:Return and to a stranger', async () => {
        const { orderId } = await deliveredOrder();

        const warehouse = await returnService.createReturn(
            { orderId, reason: 'defective' },
            asWarehouse(),
            callerContextAs('warehouse')
        );
        const stranger = await returnService.createReturn(
            { orderId, reason: 'defective' },
            asCustomer('a-stranger'),
            testCallerContext
        );

        expect(asReject(warehouse).status).toBe(404);
        expect(asReject(stranger).status).toBe(404);
    });

    it('keeps the quantity guard: nothing beyond what shipped and is not already coming back', async () => {
        const { orderId, shirt } = await deliveredOrder();
        const [auth, context] = staff('support');
        const first = await returnService.createReturn(
            { orderId, reason: 'defective' },
            auth,
            context
        );
        expect(first.success).toBe(true);

        const again = await returnService.createReturn(
            { orderId, reason: 'other', lines: [{ productId: String(shirt._id), quantity: 1 }] },
            auth,
            context
        );

        expect(asReject(again).errors[0].code).toBe('RETURN_LINES_INVALID');
    });

    it('takes a decline off the table: a declined return is fixed by opening a new one', async () => {
        const { user, orderId } = await deliveredOrder();
        const mine = await returnService.createReturn(
            { orderId, reason: 'defective' },
            asCustomer(user.id),
            callerContextAs('customer', user.id)
        );
        if (!mine.success) throw new Error('expected a return');
        const id = String(mine.data._id);
        await returnService.declineReturn(id, 'Worn', callerContextAs('admin'));
        const [auth, context] = staff('support');

        const second = await returnService.createReturn(
            { orderId, reason: 'defective' },
            auth,
            context
        );
        const decideAgain = await returnService.approveReturn(id, callerContextAs('admin'));

        expect(second.success && second.data.status).toBe('approved');
        expect(asReject(decideAgain).errors[0].code).toBe('RETURN_NOT_DECIDABLE');
    });
});

describe('what staff waive, and what they cannot', () => {
    it('records a goodwill return past the deadline as window_closed', async () => {
        const { orderId } = await deliveredOrder({ endsInDays: -10 });
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'other' },
            auth,
            context
        );

        expect(outcome.success && outcome.data.policyExceptions).toEqual(['window_closed']);
    });

    it('records no exception when the buyer asked inside the window and staff opened it late', async () => {
        const { orderId } = await deliveredOrder({ endsInDays: -10, madeDaysAgo: 30 });
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'other', requestedAt: new Date(Date.now() - 15 * DAY) },
            auth,
            context
        );

        expect(outcome.success && outcome.data.policyExceptions).toEqual([]);
    });

    it('lets a goodwill return take made-to-order goods and records excluded_goods', async () => {
        const { orderId } = await deliveredOrder({ excluded: true });
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'other' },
            auth,
            context
        );

        expect(outcome.success && outcome.data.policyExceptions).toEqual(['excluded_goods']);
        expect(outcome.success && outcome.data.lines).toHaveLength(2);
    });

    it('records nothing for a defect on made-to-order goods: the guarantee reaches them', async () => {
        const { orderId } = await deliveredOrder({ excluded: true });
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            auth,
            context
        );

        expect(outcome.success && outcome.data.policyExceptions).toEqual([]);
    });

    it('does not waive the legal window of a withdrawal: past it, 409', async () => {
        const { orderId } = await deliveredOrder({ endsInDays: -10, madeDaysAgo: 30 });
        const [auth, context] = staff('support');

        const outcome = await returnService.createReturn(
            {
                orderId,
                reason: 'withdrawal',
                requestedAt: new Date(),
                statedVia: 'phone'
            },
            auth,
            context
        );

        expect(asReject(outcome).errors[0].code).toBe('RETURN_WINDOW_CLOSED');
    });
});

describe('staff recording a withdrawal the buyer stated outside the shop', () => {
    it('judges it on the day it was sent: in time then, late now, accepted', async () => {
        const { orderId } = await deliveredOrder({ endsInDays: -5, madeDaysAgo: 30 });
        const [auth, context] = staff('support');
        const stated = new Date(Date.now() - 8 * DAY);

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal', requestedAt: stated, statedVia: 'email' },
            auth,
            context
        );

        expect(outcome.success && outcome.data).toMatchObject({
            status: 'approved',
            reason: 'withdrawal',
            statedVia: 'email',
            openedBy: 'staff'
        });
        expect(outcome.success && outcome.data.requestedAt.getTime()).toBe(stated.getTime());
    });

    it('mails the buyer the day they stated it, the channel, and when the shop wrote it down', async () => {
        const { orderId } = await deliveredOrder({ madeDaysAgo: 5 });
        const [auth, context] = staff('support');

        await returnService.createReturn(
            {
                orderId,
                reason: 'withdrawal',
                requestedAt: new Date(Date.now() - 2 * DAY),
                statedVia: 'letter'
            },
            auth,
            context
        );
        await settleOutboxNudges();

        const notices = mockEnqueueEmail.mock.calls.filter(([, t]) => t === 'returns.notice');
        expect(notices).toHaveLength(1);
        expect(notices[0][0].subject).toBe('We recorded your withdrawal');
        expect(JSON.stringify(notices[0][2])).toContain('letter');
    });

    it('needs the date and the channel, and refuses the buyer sending either', async () => {
        const { user, orderId } = await deliveredOrder();
        const [auth, context] = staff('support');

        const bare = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            auth,
            context
        );
        const noChannel = await returnService.createReturn(
            { orderId, reason: 'withdrawal', requestedAt: new Date() },
            auth,
            context
        );
        const buyerDate = await returnService.createReturn(
            { orderId, reason: 'withdrawal', requestedAt: new Date() },
            asCustomer(user.id),
            callerContextAs('customer', user.id)
        );
        const buyerChannel = await returnService.createReturn(
            { orderId, reason: 'withdrawal', statedVia: 'phone' },
            asCustomer(user.id),
            callerContextAs('customer', user.id)
        );

        expect(asReject(bare).errors[0].details).toMatchObject({ field: 'requestedAt' });
        expect(asReject(noChannel).errors[0].details).toMatchObject({ field: 'statedVia' });
        expect(asReject(buyerDate).errors[0].code).toBe('RETURN_STATEMENT_INVALID');
        expect(asReject(buyerChannel).errors[0].code).toBe('RETURN_STATEMENT_INVALID');
    });

    it('stamps the buyer’s own withdrawal online, with now', async () => {
        const { user, orderId } = await deliveredOrder();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            callerContextAs('customer', user.id)
        );

        expect(outcome.success && outcome.data).toMatchObject({
            statedVia: 'online',
            openedBy: 'buyer'
        });
    });

    it('before dispatch cancels and refunds the order, names the staff member, and records the stated day', async () => {
        const { orderId } = await paidOrder();
        const stated = new Date(Date.now() - 2 * DAY);

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal', requestedAt: stated, statedVia: 'phone' },
            asModerator(),
            callerContextAs('moderator')
        );

        expect(outcome.success && outcome.data).toMatchObject({
            status: 'closed',
            statedVia: 'phone',
            openedBy: 'staff',
            refundAmount: 40
        });
        expect(outcome.success && outcome.data.requestedAt.getTime()).toBe(stated.getTime());
        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.cancelled);
        await settleOutboxNudges();
        const payment = await paymentService.getForOrder(orderId, asModerator());
        expect(payment.success && payment.data.amountRefunded).toBe(40);
        const cancelled = await timelineOf(orderId, 'cancelled');
        expect(cancelled[0]).toMatchObject({
            actor: 'test-moderator',
            data: { cause: 'withdrawal' }
        });
    });

    it('before dispatch asks both keys: the refund and the cancel', async () => {
        const { orderId } = await paidOrder();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal', requestedAt: new Date(), statedVia: 'phone' },
            asSupport(),
            callerContextAs('support')
        );

        expect(asReject(outcome).status).toBe(403);
        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.paid);
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(0);
    });
});

describe('the options a staff caller reads', () => {
    it('lists the withdrawal and every other reason, and the made-to-order line for a goodwill return', async () => {
        const { orderId, mug } = await deliveredOrder({ excluded: true });

        const options = await returnService.getReturnOptions(orderId, asSupport());

        expect(options.success && options.data.reasons).toHaveLength(4);
        expect(
            options.success &&
                options.data.returnable.find(({ productId }) => productId === String(mug._id))
        ).toMatchObject({ withdrawable: false });
    });

    it('is unaffected by a conformity deadline already past: the preview names the reasons waived', async () => {
        const { orderId } = await deliveredOrder({ endsInDays: -10 });
        await setConformityUntil(orderId, new Date(Date.now() - DAY));

        const options = await returnService.getReturnOptions(orderId, asSupport());

        expect(options.success && options.data.exceptions).toEqual([
            'defective',
            'wrong_item',
            'other'
        ]);
    });
});
