/**
 * @module
 * The publish mail's copy, resolved into finished strings per language.
 */

import { examplePublishedEmail } from '../../emails';

describe('examplePublishedEmail', () => {
    it('names the title in the subject and the body, in the owner’s language', () => {
        const mail = examplePublishedEmail('en', 'Ada', 'Hello');

        expect(mail.template).toBe('example.published');
        expect(mail.subject).toBe('Your example is published: Hello');
        expect(mail.data).toMatchObject({
            locale: 'en',
            greeting: 'Hello, Ada!',
            body: '"Hello" is now public. Anyone can read it.'
        });
    });

    it('speaks Italian when the owner does', () => {
        const mail = examplePublishedEmail('it', 'Ada', 'Ciao');

        expect(mail.subject).toBe('Il tuo esempio è pubblicato: Ciao');
        expect(mail.data).toMatchObject({ greeting: 'Ciao, Ada!' });
    });
});
