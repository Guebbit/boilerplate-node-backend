/**
 * A situation is a ticket kind or a work notice, never both: a ticket alerts only through
 * `ticket.opened` / `ticket.assigned`, so a notice code that names the same situation would tell
 * the staff twice (once from its producer event, once from the ticket).
 */

import { TICKET_KINDS } from '@modules/tickets';
import { STAFF_NOTIFICATION_CODES } from '@modules/notifications/model';

/** The two codes that ARE the ticket alerts: they name tickets, not a situation. */
const TICKET_ALERT_CODES = new Set([
    'notifications.staff.ticket-opened',
    'notifications.staff.ticket-assigned'
]);

/** `manual_refund_owed` → `manual-refund-owed`: the spelling a notice code uses. */
const kebab = (kind: string): string => kind.replaceAll('_', '-');

/** The situation a work notice code names: its last segment. */
const situationOf = (code: string): string => code.slice(code.lastIndexOf('.') + 1);

describe('ticket kinds and work notices', () => {
    it('name disjoint situations', () => {
        const noticeSituations = new Set(
            STAFF_NOTIFICATION_CODES.filter((code) => !TICKET_ALERT_CODES.has(code)).map((code) =>
                situationOf(code)
            )
        );

        const shared = TICKET_KINDS.map((kind) => kebab(kind)).filter((kind) =>
            noticeSituations.has(kind)
        );

        expect(shared).toEqual([]);
    });

    it('can tell the two alert codes apart from a situation (the canary: they exist)', () => {
        for (const code of TICKET_ALERT_CODES)
            expect(STAFF_NOTIFICATION_CODES as readonly string[]).toContain(code);
    });
});
