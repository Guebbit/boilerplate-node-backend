/**
 * @module
 * Work notices: finding who must hear about something and telling them. The audience is "members
 * of the shop whose role does this work, who can act today" (`access` for the roles, `users` for
 * the accounts), each told once per situation however often the event is delivered.
 *
 * Writing the row is the notice; the mail is a courtesy a failure cannot undo, so a mail that
 * cannot be queued is logged and never raised.
 *
 * See: docs/modules/notifications.md#work-notices-for-staff
 */

import { Types } from 'mongoose';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DAY_MS } from '@domain-primitives/time';
import { accessService } from '@modules/access';
import { userService, type StaffContact } from '@modules/users';
import { notificationsConfig } from '../config';
import { staffNoticeEmail } from '../emails';
import { setsOfRoute, STAFF_ROUTES, type StaffNoticeBody } from '../staff-routing';
import { notificationsCreateStaffOnce } from './inbox';

/** A situation staff must hear about, as a producer's event states it. */
export interface StaffNotice {
    /** The shop it happened in; its members are the audience. */
    tenantId: string;
    /** The code and the ids it needs. Ids only: the screen it points at has the rest. */
    body: StaffNoticeBody;
    /** `<kind>:<entity>`: one notice per situation per recipient, however often it is delivered. */
    dedupeKey: string;
    /** The permission sets to tell, for a code whose route says `per-notice`. */
    sets?: readonly string[];
}

/** Queue the "now" mail for one recipient; a failure is logged, the notice is already written. */
const mailNow = (contact: StaffContact, body: StaffNoticeBody): void => {
    const mail = staffNoticeEmail(contact.locale, body);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
    void enqueueEmail({ to: contact.email, subject: mail.subject }, mail.template, mail.data);
};

/** Write the notice for one recipient and, the first time and where its route says so, mail it. */
const tell = (contact: StaffContact, notice: StaffNotice): Promise<void> => {
    const route = STAFF_ROUTES[notice.body.code];
    return notificationsCreateStaffOnce({
        userId: new Types.ObjectId(contact.id),
        ...notice.body,
        severity: route.severity,
        tenantId: notice.tenantId,
        sets: [...setsOfRoute(route, notice.sets)],
        dedupeKey: notice.dedupeKey,
        expiresAt: new Date(
            Date.now() + notificationsConfig().NODE_NOTIFICATIONS_STAFF_TTL_DAYS * DAY_MS
        )
    }).then((first) => {
        if (first && route.email === 'now') mailNow(contact, notice.body);
    });
};

/**
 * The members of the shop whose role does this work and who can act today, with where to reach
 * them. Shared by a notice told once and by the digest's daily rewrite.
 *
 * @param tenantId - the shop
 * @param sets - the permission sets whose holders do the work (empty: administrators only)
 */
export const staffRecipients = (
    tenantId: string,
    sets: readonly string[]
): Promise<StaffContact[]> =>
    accessService
        .membersHolding(tenantId, sets)
        .then((members) => userService.staffContacts(members));

/**
 * Tell every member of the shop who does this work and can act today.
 *
 * Recipients are told one after another: an audience is a handful of people, and one failing
 * write must not hide the others' behind a parallel rejection.
 *
 * @param notice - what happened and where
 * @returns how many people with an address could act, whether or not they had been told already:
 *   zero is what lets a caller reach for a fallback mailbox
 */
export const notifyStaff = async (notice: StaffNotice): Promise<number> => {
    const route = STAFF_ROUTES[notice.body.code];
    const contacts = await staffRecipients(notice.tenantId, setsOfRoute(route, notice.sets));

    for (const contact of contacts) await tell(contact, notice);
    return contacts.length;
};

/**
 * Tell one named member, if they can still act: the notice for the person a task was given to.
 * Their jurisdiction is the notice's sets, read again at display time like any work notice.
 *
 * @param userId - who is told
 * @param notice - what happened and where
 */
export const notifyStaffMember = (userId: string, notice: StaffNotice): Promise<void> =>
    userService.staffContacts([userId]).then(async (contacts) => {
        for (const contact of contacts) await tell(contact, notice);
    });
