/**
 * The contact-request notification — the email an OPERATOR receives, not a customer.
 *
 * That audience is what shapes it. Two decisions in the builder exist so an operator can work
 * from the mailbox rather than from the admin screen, and both are the kind of detail that is
 * quietly removed as redundant:
 *
 *   - the ticket's own subject is appended to the translated prefix, so a mailbox scan reads what
 *     each message is about without opening it;
 *   - a missing name falls back to translated copy HERE rather than in the template, because a
 *     template that only interpolates cannot choose between a value and a placeholder — it would
 *     render an empty line where the sender's name should be.
 */
import { contactRequestEmail, type ContactRequest } from '@modules/feedback/emails';

const REQUEST: ContactRequest = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'The parcel never arrived',
    message: 'It has been three weeks.',
    createdAt: '2026-08-27T10:00:00.000Z'
};

describe('contactRequestEmail', () => {
    it('names the contact template', () => {
        expect(contactRequestEmail('en', REQUEST).template).toBe('feedback.contact');
    });

    it('puts the ticket"s own subject in the mail subject, after the prefix', () => {
        const { subject } = contactRequestEmail('en', REQUEST);

        // Both halves: the prefix marks it as a contact request among an operator's other mail,
        // and the ticket subject is what makes one distinguishable from the next.
        expect(subject).toContain(REQUEST.subject);
        expect(subject.endsWith(`: ${REQUEST.subject}`)).toBe(true);
        expect(subject).not.toBe(REQUEST.subject);
    });

    it('passes the sender"s details through unchanged', () => {
        // These are the reply-to details. Translating or reformatting any of them would be a
        // reply sent to the wrong address.
        const { data } = contactRequestEmail('en', REQUEST);

        expect(data.name).toBe(REQUEST.name);
        expect(data.email).toBe(REQUEST.email);
        expect(data.subject).toBe(REQUEST.subject);
        expect(data.message).toBe(REQUEST.message);
        expect(data.createdAt).toBe(REQUEST.createdAt);
    });

    it('falls back to translated copy when the sender left no name', () => {
        // `||`, not `??`: an empty string is as nameless as an absent field, and the form allows
        // one. The fallback must be the translated placeholder, never a blank line.
        const anonymous = contactRequestEmail('en', { ...REQUEST, name: undefined });
        const blank = contactRequestEmail('en', { ...REQUEST, name: '' });

        expect(anonymous.data.name).not.toBe('');
        expect(anonymous.data.name).not.toBeUndefined();
        expect(blank.data.name).toBe(anonymous.data.name);
        expect(anonymous.data.name).not.toMatch(/^feedback\./);
    });

    it('labels every field, so the operator reads a form rather than five strings', () => {
        const { data } = contactRequestEmail('en', REQUEST);

        for (const key of [
            'labelName',
            'labelEmail',
            'labelSubject',
            'labelMessage',
            'labelCreatedAt'
        ]) {
            expect(data[key]).not.toBe('');
            expect(data[key]).not.toMatch(/^feedback\./);
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
