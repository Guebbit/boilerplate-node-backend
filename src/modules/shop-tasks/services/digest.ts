/**
 * @module
 * The daily and weekly staff digest: each summary row is a count of what waits, read from the
 * module that owns it (through its barrel), and written, through `notifications`, for every member
 * whose role does that work. A count of zero removes the row; a count that fell is updated quietly; one that appeared
 * or grew is unread again, pushed, and, where the route says `digest`, mailed once per person per
 * run.
 *
 * Idempotent: a re-run writes the same counts, and an unchanged count mails nothing.
 *
 * See: docs/modules/shop-tasks.md#the-staff-digest
 */

import { Types } from 'mongoose';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { PaymentAttentionKind } from '@types';
import { deliveryService } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { returnService } from '@modules/returns';
import type { StaffContact } from '@modules/users';
import { notificationsService } from '@modules/notifications';
import { shopTasksConfig } from '../config';
import { staffDigestEmail, type DigestItem } from '../emails';
import { SHOP_STAFF_ROUTES, type SummaryCode } from '../staff-routing';

/** Which run owns a summary: most are daily, the late-preorder one is weekly. */
export type DigestRun = 'daily' | 'weekly';

/** Everything the summaries count, read once per run. */
interface Figures {
    orders: Awaited<ReturnType<typeof orderService.ordersDigest>>;
    returns: Awaited<ReturnType<typeof returnService.returnsDigest>>;
    delivery: Awaited<ReturnType<typeof deliveryService.deliveryDigest>>;
    staleRefunds: number;
    lowStock: number;
}

/** One summary row: its code, the run that writes it, and where its count comes from. */
interface Summary {
    code: SummaryCode;
    run: DigestRun;
    count: (figures: Figures) => number;
}

/** Every summary row the digest maintains. */
const SUMMARIES: readonly Summary[] = [
    {
        code: 'shop-tasks.staff.transfers-due',
        run: 'daily',
        count: (f) => f.orders.transfersDue
    },
    { code: 'shop-tasks.staff.unshipped', run: 'daily', count: (f) => f.orders.unshipped },
    {
        code: 'shop-tasks.staff.returns-undecided',
        run: 'daily',
        count: (f) => f.returns.undecided
    },
    {
        code: 'shop-tasks.staff.withdrawals-awaiting-goods',
        run: 'daily',
        count: (f) => f.returns.withdrawalsAwaitingGoods
    },
    {
        code: 'shop-tasks.staff.delivery-holds-open',
        run: 'daily',
        count: (f) => f.delivery.holdsOpen
    },
    {
        code: 'shop-tasks.staff.awaiting-tracking',
        run: 'daily',
        count: (f) => f.delivery.awaitingTracking
    },
    { code: 'shop-tasks.staff.undelivered', run: 'daily', count: (f) => f.delivery.undelivered },
    { code: 'shop-tasks.staff.stale-refunds', run: 'daily', count: (f) => f.staleRefunds },
    { code: 'shop-tasks.staff.low-stock', run: 'daily', count: (f) => f.lowStock },
    {
        code: 'shop-tasks.staff.preorders-late',
        run: 'weekly',
        count: (f) => f.delivery.preordersLate
    }
];

/** Read every figure the summaries need. */
const readFigures = (now: Date): Promise<Figures> => {
    const config = shopTasksConfig();
    return Promise.all([
        orderService.ordersDigest(now, {
            transferHours: config.NODE_STAFF_TRANSFER_DUE_HOURS,
            unshippedDays: config.NODE_STAFF_UNSHIPPED_DAYS
        }),
        returnService.returnsDigest(now, config.NODE_STAFF_RETURN_DECISION_DAYS),
        deliveryService.deliveryDigest(now, {
            holdDays: config.NODE_STAFF_HOLD_OPEN_DAYS,
            trackingHours: config.NODE_STAFF_TRACKING_MISSING_HOURS,
            undeliveredDays: config.NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS
        }),
        paymentService
            .listAttention()
            .then(
                ({ items }) =>
                    items.filter(({ kind }) => kind === PaymentAttentionKind.stale_refund).length
            ),
        // One row of the low-stock board: the count is its pagination total.
        inventoryService
            .listLevels({ lowOnly: true, page: 1, pageSize: 1 })
            .then(({ meta }) => meta.totalItems)
    ]).then(([orders, returns, delivery, staleRefunds, lowStock]) => ({
        orders,
        returns,
        delivery,
        staleRefunds,
        lowStock
    }));
};

/** What one run did, for the job's log line. */
export interface DigestResult {
    written: number;
    cleared: number;
    mailed: number;
}

/** Write one summary for everyone it is for; the lines that appeared or grew, per person. */
const writeSummary = async (
    summary: Summary,
    count: number,
    now: Date,
    mailLines: Map<string, { contact: StaffContact; items: DigestItem[] }>
): Promise<number> => {
    const route = SHOP_STAFF_ROUTES[summary.code];
    const recipients = await notificationsService.staffRecipients(DEPLOYMENT_TENANT_ID, route.sets);

    for (const contact of recipients) {
        const outcome = await notificationsService.writeSummary(
            {
                userId: new Types.ObjectId(contact.id),
                code: summary.code,
                params: { count },
                severity: route.severity,
                tenantId: DEPLOYMENT_TENANT_ID,
                sets: [...route.sets],
                dedupeKey: summary.code
            },
            now
        );
        if (route.email !== 'digest' || outcome === 'unchanged') continue;
        const lines = mailLines.get(contact.id) ?? { contact, items: [] };
        lines.items.push({ code: summary.code, count });
        mailLines.set(contact.id, lines);
    }
    return recipients.length;
};

/**
 * Run the digest: refresh every summary row of this run, then mail each person what appeared or
 * grew. A mail that cannot be queued is logged by the queue and never raised: the rows are the
 * notice.
 *
 * @param run - `daily` or `weekly`
 * @param now - the instant the allowances are measured from; tests pass their own
 */
export const runStaffDigest = async (
    run: DigestRun,
    now: Date = new Date()
): Promise<DigestResult> => {
    const figures = await readFigures(now);
    const mailLines = new Map<string, { contact: StaffContact; items: DigestItem[] }>();
    const result: DigestResult = { written: 0, cleared: 0, mailed: 0 };

    for (const summary of SUMMARIES.filter((one) => one.run === run)) {
        const count = summary.count(figures);
        if (count === 0) {
            await notificationsService.clearSummary(summary.code);
            result.cleared += 1;
        } else {
            result.written += await writeSummary(summary, count, now, mailLines);
        }
    }

    for (const { contact, items } of mailLines.values()) {
        const mail = staffDigestEmail(contact.locale, items);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
        void enqueueEmail({ to: contact.email, subject: mail.subject }, mail.template, mail.data);
        result.mailed += 1;
    }
    return result;
};
