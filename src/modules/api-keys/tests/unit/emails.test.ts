/**
 * @module
 * The two notices this module mails: every part of the content is present, in the recipient's
 * language, and the revoked notice names the event that caused it.
 */

import { apiKeyMintedEmail, apiKeysRevokedEmail } from '../../emails';

describe('the minted notice', () => {
    it('says which key, its public id and when it stops working', () => {
        const mail = apiKeyMintedEmail('en', 'partner', 'abc123', '1 January 2031');

        expect(mail.template).toBe('api-keys.minted');
        expect(mail.subject).toBe('An API key was created on your account');
        expect(mail.data).toMatchObject({
            locale: 'en',
            pageMetaTitle: 'API key created',
            pageMetaLinks: [],
            greeting: 'Hello!',
            body: 'An API key named "partner" (abc123) was created on your account. It stops working on 1 January 2031.',
            advice: 'If this was not you, revoke it from your API keys and change your password now.'
        });
        expect(mail.data.footer).toEqual(expect.any(String));
        expect(mail.data.footer).not.toBe('');
    });
});

describe('the revoked notice', () => {
    it.each([
        ['logout-all', 'You signed out of every device, so the API keys you created were revoked:'],
        ['password-reset', 'Your password was reset, so the API keys you created were revoked:'],
        [
            'email-change-undo',
            'You reported an email change as not yours, so the API keys you created were revoked:'
        ]
    ] as const)('names the %s event and lists the keys', (reason, body) => {
        const mail = apiKeysRevokedEmail('en', reason, ['a (1)', 'b (2)']);

        expect(mail.template).toBe('api-keys.revoked');
        expect(mail.subject).toBe('Your API keys were revoked');
        expect(mail.data).toMatchObject({
            locale: 'en',
            pageMetaTitle: 'API keys revoked',
            pageMetaLinks: [],
            greeting: 'Hello!',
            body,
            list: 'a (1), b (2)',
            advice: 'Create new keys once you are sure the account is yours.'
        });
        expect(mail.data.footer).not.toBe('');
    });
});
