/**
 * This module's validation copy resolves against the ACTIVE locale, not the boot one.
 *
 * The failure this defends against is PROBLEM 01: `t()` called at module scope, before
 * `i18next.init()`, returning `undefined` so Zod fell back to its own English defaults. The only
 * guard that existed asserted a message was not shaped like a dotted key — which a Zod default
 * ("Too small: expected string…") satisfies perfectly. These assert the exact shipped strings, so
 * a fallback to a Zod default fails them.
 *
 * `loadBeforeI18n` is what makes the ordering real; see `tests/support/i18n-boot.ts`.
 */

import { loadBeforeI18n, mergedResources } from '@tests/i18n-boot';

const copy = (locale: 'en' | 'it') =>
    (mergedResources()[locale].translation as { users: Record<string, string> }).users;

const invalidUser = { email: 'not-an-email', username: 'ab', password: 'x' };

const messagesFor = async (locale: 'en' | 'it') => {
    const { zodUserSchema } = await loadBeforeI18n(
        locale,
        () => import('@modules/users'),
        'users.field-email-invalid'
    );

    const result = zodUserSchema.safeParse(invalidUser);
    expect(result.success).toBe(false);
    return result.error?.issues.map(({ message }) => message) ?? [];
};

describe('user validation messages', () => {
    it('uses the English copy verbatim, not a Zod default', async () => {
        const messages = await messagesFor('en');
        const en = copy('en');

        expect(messages).toContain(en['field-email-invalid']);
        expect(messages).toContain(en['field-username-min']);
        expect(messages).toContain(en['field-password-min']);
    });

    it('uses the Italian copy when the active locale is it', async () => {
        const messages = await messagesFor('it');
        const it = copy('it');

        expect(messages).toContain(it['field-email-invalid']);
        expect(messages).toContain(it['field-username-min']);
        expect(messages).toContain(it['field-password-min']);
    });

    it('is actually translated, rather than English twice', () => {
        expect(copy('it')['field-email-invalid']).not.toBe(copy('en')['field-email-invalid']);
    });

    /**
     * The same schema object, parsed twice, in two languages, with no rebuild in between.
     * This is the property a thunk gives and an eagerly-resolved message cannot.
     */
    it('follows a locale change without the schema being rebuilt', async () => {
        let english: string[] = [];
        let italian: string[] = [];

        await jest.isolateModulesAsync(async () => {
            const i18nextModule = await import('i18next');
            const i18next = i18nextModule.default;
            const { zodUserSchema } = await import('@modules/users');

            await i18next.init({ lng: 'en', fallbackLng: 'en', resources: mergedResources() });

            const parse = () =>
                zodUserSchema.safeParse(invalidUser).error?.issues.map(({ message }) => message) ??
                [];

            english = parse();
            await i18next.changeLanguage('it');
            italian = parse();
        });

        expect(english).toContain(copy('en')['field-email-invalid']);
        expect(italian).toContain(copy('it')['field-email-invalid']);
        expect(italian).not.toEqual(english);
    });
});
