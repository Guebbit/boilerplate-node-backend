/**
 * @module
 * The routing table is the audit of "who is told" for the notices every project has: every one has
 * a route, names permission sets that exist, and a notice that mails has the words to do it in
 * every served language. The shop's notices are audited beside the module that owns them.
 */
import { PERMISSION_SETS } from '@kernel/permissions';
import { staffNoticeEmail } from '@modules/notifications/emails';
import {
    STAFF_ROUTES,
    callerHoldsAnySet,
    setsOfRoute,
    staffLinkOf
} from '@modules/notifications/staff-routing';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import { callerAs } from '@tests/callers';
import { translator } from '@infrastructure/i18n';
import { TaskKind } from '@types';

/** The shared staff screen paths the links are compared against. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

/** One valid body per work notice code this module routes. */
const BODIES = {
    'notifications.staff.webhook-disabled': {
        code: 'notifications.staff.webhook-disabled',
        params: { subscriptionId: 's1' }
    },
    'notifications.staff.task-opened': {
        code: 'notifications.staff.task-opened',
        params: { taskId: 't1', kind: 'contact', category: 'privacy' }
    },
    'notifications.staff.task-overdue': {
        code: 'notifications.staff.task-overdue',
        params: { taskId: 't1', kind: 'contact', category: 'privacy' }
    },
    'notifications.staff.task-assigned': {
        code: 'notifications.staff.task-assigned',
        params: { taskId: 't1', kind: 'export_failed' }
    },
    'notifications.staff.outbox-dead': {
        code: 'notifications.staff.outbox-dead',
        params: { eventName: 'user.updated', aggregateId: 'u1' }
    }
} as const;

describe('STAFF_ROUTES', () => {
    it('routes exactly the notices every project has', () => {
        expect(Object.keys(STAFF_ROUTES).toSorted()).toEqual(Object.keys(BODIES).toSorted());
    });

    it.each(Object.keys(STAFF_ROUTES) as (keyof typeof STAFF_ROUTES)[])(
        '%s names permission sets that exist',
        (code) => {
            const declared = new Set(PERMISSION_SETS.map(({ name }) => name));

            const { sets } = STAFF_ROUTES[code];

            // A `per-notice` route names no sets of its own: the producer's are checked where it emits.
            if (sets !== 'per-notice') for (const set of sets) expect(declared).toContain(set);
        }
    );

    it('mails only where someone must act soon: a task, not a disabled webhook', () => {
        expect(STAFF_ROUTES['notifications.staff.task-opened'].email).toBe('now');
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
    it('points every task notice without a work screen at the task page', () => {
        expect(staffLinkOf(BODIES['notifications.staff.task-opened'])).toEqual({
            template: PAGES.task,
            parameters: { id: 't1' }
        });
        expect(staffLinkOf(BODIES['notifications.staff.task-overdue']).template).toBe('tasks/{id}');
        expect(staffLinkOf(BODIES['notifications.staff.task-assigned']).template).toBe(PAGES.task);
    });

    it('prefers the work screen the opener named over the to-do page', () => {
        const withWork = {
            code: 'notifications.staff.task-opened',
            params: { taskId: 't1', kind: 'export_failed', work: 'users/u9' }
        } as const;

        expect(staffLinkOf(withWork)).toEqual({ template: 'users/u9', parameters: {} });
        expect(
            staffLinkOf({ code: 'notifications.staff.task-overdue', params: withWork.params })
        ).toEqual({ template: 'users/u9', parameters: {} });
    });

    it('keeps a handed-over task on its own page: the assignee opens the to-do', () => {
        expect(
            staffLinkOf({
                code: 'notifications.staff.task-assigned',
                params: { taskId: 't1', kind: 'export_failed' }
            }).template
        ).toBe(PAGES.task);
    });

    it('points a disabled webhook at its subscription', () => {
        expect(staffLinkOf(BODIES['notifications.staff.webhook-disabled'])).toEqual({
            template: PAGES.webhookSubscription,
            parameters: { id: 's1' }
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

describe('staffNoticeEmail', () => {
    it.each(['en', 'it'])('has the words for every mailing code in %s', (locale) => {
        for (const [code, body] of Object.entries(BODIES) as [
            keyof typeof BODIES,
            (typeof BODIES)[keyof typeof BODIES]
        ][]) {
            if (STAFF_ROUTES[code].email !== 'now') continue;

            const mail = staffNoticeEmail(locale, body, staffLinkOf(body));

            expect(mail.subject).not.toContain('notifications.staff-mail');
            expect(mail.data.summary).not.toContain('notifications.staff-mail');
            expect(mail.data.link).toMatch(new RegExp(`/${locale}/tasks/t1$`));
        }
    });

    it('opens the screen the caller handed over, not one it picked itself', () => {
        const mail = staffNoticeEmail('en', BODIES['notifications.staff.task-opened'], {
            template: 'orders/{id}',
            parameters: { id: 'o 1' }
        });

        expect(mail.data.link).toMatch(/\/en\/orders\/o%201$/);
    });

    it.each(['en', 'it'])(
        'names a contact task by its category in %s, never by its text',
        (locale) => {
            const body = BODIES['notifications.staff.task-opened'];
            const mail = staffNoticeEmail(locale, body, staffLinkOf(body));
            const words = translator(locale);

            expect(mail.subject).toContain(words('notifications.staff-mail.task-category.privacy'));
            expect(mail.data.link).toContain('/tasks/t1');
        }
    );

    it.each(['en', 'it'])(
        'labels a contact task with no category as uncategorised in %s',
        (locale) => {
            const body = {
                code: 'notifications.staff.task-opened',
                params: { taskId: 't2', kind: 'contact' }
            } as const;
            const mail = staffNoticeEmail(locale, body, staffLinkOf(body));

            expect(mail.subject).toContain(
                translator(locale)('notifications.staff-mail.task-category.none')
            );
        }
    );

    it('has a label in every language for every task kind', () => {
        for (const locale of ['en', 'it']) {
            const words = translator(locale);
            for (const kind of Object.values(TaskKind))
                expect(words(`notifications.staff-mail.task-kind.${kind}`)).not.toContain(
                    'notifications.staff-mail'
                );
        }
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
