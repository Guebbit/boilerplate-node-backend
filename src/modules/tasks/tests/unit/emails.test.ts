/**
 * @module
 * The contact-request notification — the email an OPERATOR receives, not a customer. That
 * audience is why the task's own subject is appended to the translated prefix (a mailbox scan
 * reads what each message is about) and why a missing name falls back to translated copy HERE
 * rather than in the template, which can't choose between a value and a placeholder.
 */

import {
    contactRequestEmail,
    erasureNoticeEmail,
    type ContactRequest
} from '@modules/tasks/emails';

/** A contact request, the input the mail is rendered from. */
const REQUEST: ContactRequest = {
    id: '6ad69a48f753b902e5b98dfe',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'The parcel never arrived',
    message: 'It has been three weeks.',
    createdAt: '2026-08-27T10:00:00.000Z'
};

describe('contactRequestEmail', () => {
    it('names the contact template', () => {
        expect(contactRequestEmail('en', REQUEST).template).toBe('tasks.contact');
    });

    it('puts the task"s own subject in the mail subject, after the prefix', () => {
        const { subject } = contactRequestEmail('en', REQUEST);

        /**
         * Both halves: the prefix marks it as a contact request among an operator's other mail,
         * and the task subject is what makes one distinguishable from the next.
         */
        expect(subject).toContain(REQUEST.subject);
        expect(subject.endsWith(`: ${REQUEST.subject}`)).toBe(true);
        expect(subject).not.toBe(REQUEST.subject);
    });

    it('words the reminder for an overdue message differently from the first announcement', () => {
        const first = contactRequestEmail('en', REQUEST);
        const reminder = contactRequestEmail('en', { ...REQUEST, reminder: 'overdue' });

        expect(reminder.subject).toMatch(/^Overdue/);
        expect(reminder.subject.endsWith(`: ${REQUEST.subject}`)).toBe(true);
        expect(reminder.data.title).not.toBe(first.data.title);
        expect(reminder.data.message).toBe(REQUEST.message);
    });

    it('words the due-soon reminder apart from the first mail and the overdue one', () => {
        const dueSoon = contactRequestEmail('en', { ...REQUEST, reminder: 'due-soon' });
        const overdue = contactRequestEmail('en', { ...REQUEST, reminder: 'overdue' });

        expect(dueSoon.subject).toMatch(/^Contact request due soon/);
        expect(dueSoon.subject).toContain(`[#${REQUEST.id.slice(-8)}]`);
        expect(dueSoon.data.title).not.toBe(overdue.data.title);
    });

    it('passes the sender"s details through unchanged', () => {
        /**
         * These are the reply-to details. Translating or reformatting any of them would be a
         * reply sent to the wrong address.
         */
        const { data } = contactRequestEmail('en', REQUEST);

        expect(data.name).toBe(REQUEST.name);
        expect(data.email).toBe(REQUEST.email);
        expect(data.subject).toBe(REQUEST.subject);
        expect(data.message).toBe(REQUEST.message);
        expect(data.createdAt).toBe(REQUEST.createdAt);
    });

    it('prints the category as a word, or "Uncategorised" when the sender chose none', () => {
        expect(contactRequestEmail('en', { ...REQUEST, category: 'privacy' }).data.category).toBe(
            'Personal data'
        );
        expect(contactRequestEmail('en', { ...REQUEST, category: 'account' }).data.category).toBe(
            'Account'
        );
        expect(contactRequestEmail('en', REQUEST).data.category).toBe('Uncategorised');
    });

    it('puts a stable [#ref] in the subject, the same for the first mail and the reminder', () => {
        const first = contactRequestEmail('en', REQUEST);
        const reminder = contactRequestEmail('en', { ...REQUEST, reminder: 'overdue' });

        expect(first.subject).toContain(`[#${REQUEST.id.slice(-8)}]`);
        expect(reminder.subject).toContain(`[#${REQUEST.id.slice(-8)}]`);
    });

    it('tags a privacy message [privacy] in the subject and no other', () => {
        expect(contactRequestEmail('en', { ...REQUEST, category: 'privacy' }).subject).toContain(
            '[privacy]'
        );
        expect(contactRequestEmail('en', REQUEST).subject).not.toContain('[privacy]');
    });

    it('carries the order number, a link to the item and a plain-text part with the message', () => {
        const mail = contactRequestEmail('en', { ...REQUEST, orderNumber: '2026-000041' });

        expect(mail.data.orderNumber).toBe('2026-000041');
        expect(mail.data.link).toContain(`/tasks/${REQUEST.id}`);
        expect(mail.text).toContain(REQUEST.message);
        expect(mail.text).toContain('2026-000041');
        expect(mail.text).toContain(`/tasks/${REQUEST.id}`);
    });

    it('words the reminder with the reference and the sender address', () => {
        const { data } = contactRequestEmail('en', { ...REQUEST, reminder: 'overdue' });

        expect(data.title).toContain(`#${REQUEST.id.slice(-8)}`);
        expect(data.title).toContain(REQUEST.email);
    });

    it('falls back to translated copy when the sender left no name', () => {
        /**
         * `||`, not `??`: an empty string is as nameless as an absent field, and the form allows
         * one. The fallback must be the translated placeholder, never a blank line.
         */
        const anonymous = contactRequestEmail('en', { ...REQUEST, name: undefined });
        const blank = contactRequestEmail('en', { ...REQUEST, name: '' });

        expect(anonymous.data.name).not.toBe('');
        expect(anonymous.data.name).not.toBeUndefined();
        expect(blank.data.name).toBe(anonymous.data.name);
        expect(anonymous.data.name).not.toMatch(/^tasks\./);
    });

    it('labels every field, so the operator reads a form rather than five strings', () => {
        const { data } = contactRequestEmail('en', REQUEST);

        for (const key of [
            'labelName',
            'labelEmail',
            'labelSubject',
            'labelMessage',
            'labelCategory',
            'labelCreatedAt'
        ]) {
            expect(data[key]).not.toBe('');
            expect(data[key]).not.toMatch(/^tasks\./);
        }
    });

    it('carries the locale through and translates by it', () => {
        const english = contactRequestEmail('en', REQUEST);
        const italian = contactRequestEmail('it', REQUEST);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.data.title).not.toBe(english.data.title);
    });
});

describe('erasureNoticeEmail', () => {
    it('names the deleted messages by [#ref] alone', () => {
        const mail = erasureNoticeEmail('en', [
            '65dc8a99604c307b702aaaaa',
            '65dc8a99604c307b702bbbbb'
        ]);

        expect(mail.subject).toBe(
            'An account was erased: delete the mails for [#702aaaaa] [#702bbbbb]'
        );
        expect(JSON.stringify(mail.data)).not.toMatch(/@/);
    });
});
