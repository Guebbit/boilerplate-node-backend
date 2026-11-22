/**
 * @module
 * What this module holds about a person: the messages still waiting for hand-over, and the Zammad
 * customer id their account maps to. The export lists both; the erasure deletes both, and the
 * profile-sync row, inside the erasure's transaction.
 *
 * @see docs/modules/zammad.md#personal-data
 */

import type { ClientSession } from 'mongoose';
import type { PersonalDataSubject } from '@kernel/registry';
import {
    deleteCustomer,
    deleteOwnContacts,
    deleteProfileSync,
    findCustomer,
    findOwnContacts
} from '../repository';

/**
 * The export section: pending messages (the same words the contact export shows once the ticket
 * exists elsewhere) and the customer id. Empty when there is nothing.
 *
 * @param subject - who the export is about
 */
export const collectPersonalData = (subject: PersonalDataSubject) =>
    Promise.all([findOwnContacts(subject), findCustomer(subject.userId)]).then(
        ([contacts, customer]) => ({
            pendingContacts: contacts.map((contact) => ({
                id: String(contact._id),
                ...(contact.name ? { name: contact.name } : {}),
                email: contact.email ?? '',
                subject: contact.subject ?? '',
                message: contact.message ?? '',
                ...(contact.category ? { category: contact.category } : {}),
                ...(contact.orderNumber ? { orderNumber: contact.orderNumber } : {}),
                ...(contact.createdAt ? { createdAt: contact.createdAt.toISOString() } : {})
            })),
            ...(customer ? { customerId: customer.zammadUserId } : {})
        })
    );

/**
 * The erase hook: runs only inside a hard delete's transaction. Sequential: a `ClientSession`
 * runs one operation at a time.
 *
 * @param subject - the erased account
 * @param session - the erasure's transaction
 */
export const erasePersonalData = async (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<void> => {
    await deleteOwnContacts(subject, session);
    await deleteCustomer(subject.userId, session);
    await deleteProfileSync(subject.userId, session);
};
