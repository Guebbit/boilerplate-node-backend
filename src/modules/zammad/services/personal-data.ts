/**
 * @module
 * What this module holds about a person: the messages still waiting for hand-over, the Zammad
 * customer id their account maps to, and Zammad's own copy (read live for the export). The erasure
 * deletes the local rows and the profile-sync row inside its transaction, and writes the erase job
 * that has Zammad delete its copy.
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
    findCustomerIn,
    findOwnContacts
} from '../repository';
import { queueErasure } from './erase-job';
import { collectZammadCopy } from './export-section';

/**
 * The export section: pending messages (the same words the contact export shows once the ticket
 * exists elsewhere), the customer id, and Zammad's copy while the module is on. Empty when there is
 * nothing; rejects when Zammad cannot be read, so the export fails whole.
 *
 * @param subject - who the export is about
 */
export const collectPersonalData = (subject: PersonalDataSubject) =>
    Promise.all([
        findOwnContacts(subject),
        findCustomer(subject.userId),
        collectZammadCopy(subject)
    ]).then(([contacts, customer, customers]) => ({
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
        ...(customer ? { customerId: customer.zammadUserId } : {}),
        ...(customers ? { customers } : {})
    }));

/**
 * The erase hook: runs only inside a hard delete's transaction. Sequential: a `ClientSession`
 * runs one operation at a time. The mapping is read BEFORE it is deleted: it names the Zammad
 * customer the erase job must see removed.
 *
 * @param subject - the erased account
 * @param session - the erasure's transaction
 */
export const erasePersonalData = async (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<void> => {
    const mapping = await findCustomerIn(subject.userId, session);
    await queueErasure(subject, mapping ? [mapping.zammadUserId] : [], session);
    await deleteOwnContacts(subject, session);
    await deleteCustomer(subject.userId, session);
    await deleteProfileSync(subject.userId, session);
};
