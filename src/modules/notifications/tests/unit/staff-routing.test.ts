/**
 * @module
 * The routing table is the audit of "who is told": every work notice has a route, names permission
 * sets that exist, and a notice that mails has the words to do it in every served language.
 */
import { PERMISSION_SETS } from '@kernel/permissions';
import { STAFF_NOTIFICATION_CODES } from '@modules/notifications/model';
import { staffNoticeEmail } from '@modules/notifications/emails';
import {
    STAFF_ROUTES,
    callerHoldsAnySet,
    setsOfRoute,
    staffLinkOf,
    type StaffNoticeBody
} from '@modules/notifications/staff-routing';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import { callerAs } from '@tests/callers';
import { translator } from '@infrastructure/i18n';
import { TASK_KINDS } from '@modules/tasks';

/** The shared staff screen paths the links are compared against. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

/** One valid body per work notice code. */
const BODIES: Record<(typeof STAFF_NOTIFICATION_CODES)[number], StaffNoticeBody> = {
    'notifications.staff.purchase-hold-placed': {
        code: 'notifications.staff.purchase-hold-placed',
        params: { userId: 'u1', until: '2026-10-30T09:00:00.000Z' }
    },
    'notifications.staff.webhook-disabled': {
        code: 'notifications.staff.webhook-disabled',
        params: { subscriptionId: 's1' }
    },
    'notifications.staff.task-opened': {
        code: 'notifications.staff.task-opened',
        params: { taskId: 't1', kind: 'contact', category: 'cancellation' }
    },
    'notifications.staff.task-overdue': {
        code: 'notifications.staff.task-overdue',
        params: { taskId: 't1', kind: 'contact', category: 'cancellation' }
    },
    'notifications.staff.task-assigned': {
        code: 'notifications.staff.task-assigned',
        params: { taskId: 't1', kind: 'dispute' }
    },
    'notifications.staff.return-requested': {
        code: 'notifications.staff.return-requested',
        params: { returnId: 'r1', orderId: 'o1' }
    },
    'notifications.staff.outbox-dead': {
        code: 'notifications.staff.outbox-dead',
        params: { eventName: 'user.updated', aggregateId: 'u1' }
    },
    'notifications.staff.transfers-due': {
        code: 'notifications.staff.transfers-due',
        params: { count: 3 }
    },
    'notifications.staff.preorders-late': {
        code: 'notifications.staff.preorders-late',
        params: { count: 3 }
    },
    'notifications.staff.delivery-holds-open': {
        code: 'notifications.staff.delivery-holds-open',
        params: { count: 3 }
    },
    'notifications.staff.withdrawals-awaiting-goods': {
        code: 'notifications.staff.withdrawals-awaiting-goods',
        params: { count: 3 }
    },
    'notifications.staff.returns-undecided': {
        code: 'notifications.staff.returns-undecided',
        params: { count: 3 }
    },
    'notifications.staff.low-stock': {
        code: 'notifications.staff.low-stock',
        params: { count: 3 }
    },
    'notifications.staff.unshipped': {
        code: 'notifications.staff.unshipped',
        params: { count: 3 }
    },
    'notifications.staff.awaiting-tracking': {
        code: 'notifications.staff.awaiting-tracking',
        params: { count: 3 }
    },
    'notifications.staff.undelivered': {
        code: 'notifications.staff.undelivered',
        params: { count: 3 }
    },
    'notifications.staff.stale-refunds': {
        code: 'notifications.staff.stale-refunds',
        params: { count: 3 }
    }
};

describe('STAFF_ROUTES', () => {
    it('routes every work notice code', () => {
        expect(Object.keys(STAFF_ROUTES).toSorted()).toEqual(
            [...STAFF_NOTIFICATION_CODES].toSorted()
        );
    });

    it.each(STAFF_NOTIFICATION_CODES)('%s names permission sets that exist', (code) => {
        const declared = new Set(PERMISSION_SETS.map(({ name }) => name));

        const { sets } = STAFF_ROUTES[code];

        // A `per-notice` route names no sets of its own: the producer's are checked where it emits.
        if (sets !== 'per-notice') for (const set of sets) expect(declared).toContain(set);
    });

    it('mails only where someone must act soon: a paused checkout, not a disabled webhook', () => {
        expect(STAFF_ROUTES['notifications.staff.purchase-hold-placed'].email).toBe('now');
        expect(STAFF_ROUTES['notifications.staff.webhook-disabled'].email).toBe('none');
    });

    it('mails an overdue task now, to the same per-notice sets as the opener', () => {
        expect(STAFF_ROUTES['notifications.staff.task-overdue']).toMatchObject({
            sets: STAFF_ROUTES['notifications.staff.task-opened'].sets,
            email: 'now'
        });
    });
});

describe('staffLinkOf', () => {
    it('points every task notice at the task page', () => {
        expect(staffLinkOf(BODIES['notifications.staff.task-opened'])).toEqual({
            template: PAGES.task,
            parameters: { id: 't1' }
        });
        expect(staffLinkOf(BODIES['notifications.staff.task-overdue']).template).toBe('tasks/{id}');
        expect(staffLinkOf(BODIES['notifications.staff.task-assigned']).template).toBe(PAGES.task);
    });

    it('points a hold at the buyer’s account and a disabled webhook at its subscription', () => {
        expect(staffLinkOf(BODIES['notifications.staff.purchase-hold-placed'])).toEqual({
            template: PAGES.user,
            parameters: { id: 'u1' }
        });
        expect(staffLinkOf(BODIES['notifications.staff.webhook-disabled'])).toEqual({
            template: PAGES.webhookSubscription,
            parameters: { id: 's1' }
        });
    });
});

describe('staffLinkOf for the later notices', () => {
    it('points a return request at the return', () => {
        expect(staffLinkOf(BODIES['notifications.staff.return-requested'])).toEqual({
            template: PAGES.return,
            parameters: { id: 'r1' }
        });
    });

    it('points a dead event at the account it was about, and at home when it names none', () => {
        expect(staffLinkOf(BODIES['notifications.staff.outbox-dead'])).toEqual({
            template: PAGES.user,
            parameters: { id: 'u1' }
        });
        expect(
            staffLinkOf({
                code: 'notifications.staff.outbox-dead',
                params: { eventName: 'order.created', aggregateId: 'o1' }
            })
        ).toEqual({ template: '', parameters: {} });
    });
});

describe('staffLinkOf for the summary rows', () => {
    it.each([
        ['notifications.staff.transfers-due', PAGES.salesOrders],
        ['notifications.staff.preorders-late', PAGES.salesPreorders],
        ['notifications.staff.delivery-holds-open', PAGES.salesOrders],
        ['notifications.staff.withdrawals-awaiting-goods', PAGES.returns],
        ['notifications.staff.returns-undecided', PAGES.returns],
        ['notifications.staff.low-stock', PAGES.inventory],
        ['notifications.staff.unshipped', PAGES.salesOrders],
        ['notifications.staff.awaiting-tracking', PAGES.salesOrders],
        ['notifications.staff.undelivered', PAGES.salesOrders],
        ['notifications.staff.stale-refunds', PAGES.salesPayments]
    ] as const)('points %s at its shared list screen', (code, path) => {
        expect(staffLinkOf({ code, params: { count: 2 } })).toEqual({
            template: path,
            parameters: {}
        });
    });
});

describe('staffNoticeEmail', () => {
    it.each(['en', 'it'])('has the words for every mailing code in %s', (locale) => {
        for (const code of STAFF_NOTIFICATION_CODES) {
            if (STAFF_ROUTES[code].email !== 'now') continue;

            const mail = staffNoticeEmail(locale, BODIES[code]);

            expect(mail.subject).not.toContain('notifications.staff-mail');
            expect(mail.data.summary).not.toContain('notifications.staff-mail');
            expect(mail.data.link).toMatch(new RegExp(`/${locale}/(users/u1|tasks/t1)$`));
        }
    });

    it.each(['en', 'it'])(
        'names a contact task by its category in %s, never by its text',
        (locale) => {
            const mail = staffNoticeEmail(locale, BODIES['notifications.staff.task-opened']);
            const words = translator(locale);

            expect(mail.subject).toContain(
                words('notifications.staff-mail.task-category.cancellation')
            );
            expect(mail.data.link).toContain('/tasks/t1');
        }
    );

    it.each(['en', 'it'])(
        'labels a contact task with no category as uncategorised in %s',
        (locale) => {
            const mail = staffNoticeEmail(locale, {
                code: 'notifications.staff.task-opened',
                params: { taskId: 't2', kind: 'contact' }
            });

            expect(mail.subject).toContain(
                translator(locale)('notifications.staff-mail.task-category.none')
            );
        }
    );

    it('has a label in every language for every task kind and category', () => {
        for (const locale of ['en', 'it']) {
            const words = translator(locale);
            for (const kind of TASK_KINDS)
                expect(words(`notifications.staff-mail.task-kind.${kind}`)).not.toContain(
                    'notifications.staff-mail'
                );
        }
    });

    it('carries ids and instants only: no buyer address, no name', () => {
        const mail = staffNoticeEmail('en', BODIES['notifications.staff.purchase-hold-placed']);

        expect(JSON.stringify(mail)).not.toMatch(/@/);
    });
});

describe('setsOfRoute', () => {
    it("reads a fixed route's own sets and a per-notice route's named ones", () => {
        expect(setsOfRoute(STAFF_ROUTES['notifications.staff.webhook-disabled'])).toEqual([
            'WebhookManagement'
        ]);
        expect(
            setsOfRoute(STAFF_ROUTES['notifications.staff.task-opened'], ['PaymentRefunding'])
        ).toEqual(['PaymentRefunding']);
    });

    it('keeps a per-notice route that was named nothing for administrators alone', () => {
        expect(setsOfRoute(STAFF_ROUTES['notifications.staff.task-opened'])).toEqual([]);
    });
});

describe('callerHoldsAnySet', () => {
    it('lets an administrator see every notice, whatever its sets', () => {
        expect(callerHoldsAnySet(callerAs('admin'), ['UserBanning'])).toBe(true);
        expect(callerHoldsAnySet(callerAs('admin'), [])).toBe(true);
    });

    it('lets a member see a notice only for a set their role lists', () => {
        expect(callerHoldsAnySet(callerAs('moderator'), ['UserBanning'])).toBe(true);
        expect(callerHoldsAnySet(callerAs('moderator'), ['WebhookManagement'])).toBe(false);
        expect(callerHoldsAnySet(callerAs('manager'), ['WebhookManagement'])).toBe(true);
    });

    it('keeps an empty list of sets for administrators alone', () => {
        expect(callerHoldsAnySet(callerAs('moderator'), [])).toBe(false);
    });
});
