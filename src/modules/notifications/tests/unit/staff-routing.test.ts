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
    staffLinkOf,
    type StaffNoticeBody
} from '@modules/notifications/staff-routing';
import { callerAs } from '@tests/callers';

/** One valid body per work notice code. */
const BODIES: Record<(typeof STAFF_NOTIFICATION_CODES)[number], StaffNoticeBody> = {
    'notifications.staff.purchase-hold-placed': {
        code: 'notifications.staff.purchase-hold-placed',
        params: { userId: 'u1', until: '2026-10-30T09:00:00.000Z' }
    },
    'notifications.staff.webhook-disabled': {
        code: 'notifications.staff.webhook-disabled',
        params: { subscriptionId: 's1' }
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

        for (const set of STAFF_ROUTES[code].sets) expect(declared).toContain(set);
    });

    it('mails only where someone must act soon: a paused checkout, not a disabled webhook', () => {
        expect(STAFF_ROUTES['notifications.staff.purchase-hold-placed'].email).toBe('now');
        expect(STAFF_ROUTES['notifications.staff.webhook-disabled'].email).toBe('none');
    });
});

describe('staffLinkOf', () => {
    it('points a hold at the buyer’s account and a disabled webhook at its subscription', () => {
        expect(staffLinkOf(BODIES['notifications.staff.purchase-hold-placed'])).toEqual({
            template: 'users/{id}',
            parameters: { id: 'u1' }
        });
        expect(staffLinkOf(BODIES['notifications.staff.webhook-disabled'])).toEqual({
            template: 'webhooks/subscriptions/{id}',
            parameters: { id: 's1' }
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
            expect(mail.data.link).toContain(`/${locale}/users/u1`);
        }
    });

    it('carries ids and instants only: no buyer address, no name', () => {
        const mail = staffNoticeEmail('en', BODIES['notifications.staff.purchase-hold-placed']);

        expect(JSON.stringify(mail)).not.toMatch(/@/);
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
