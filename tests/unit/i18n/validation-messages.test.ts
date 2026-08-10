import enTranslation from '../../../src/locales/en.json';
import itTranslation from '../../../src/locales/it.json';

/**
 * The tests that could have caught PROBLEM 01.
 *
 * The bug was that `t()` was called at module scope, which happens before `i18next.init()` in
 * `app.ts`'s body, so it returned `undefined` and Zod quietly used its own English defaults. No
 * existing test saw it, for two reasons this file removes:
 *
 * 1. `tests/helpers/setup.ts` runs in Jest's `setupFiles`, i.e. i18next is already initialised
 *    before a test file imports anything. Under Jest the eager `t()` therefore worked. Every
 *    test here instead loads the schema module inside `jest.isolateModulesAsync` with a FRESH,
 *    un-initialised i18next and only initialises afterwards — reproducing the live ordering.
 * 2. The only guard that existed asserted a message was not shaped like a dotted key, which a
 *    Zod default ("Too small: expected string…") satisfies perfectly. These assert the exact
 *    `en.json` / `it.json` strings instead, so a fallback to a Zod default fails them.
 */

/**
 * Loads the validation schemas the way production does: module first, i18n second.
 * Returns the schemas bound to a freshly-initialised i18next in `locale`.
 */
const loadSchemasBeforeI18n = async (locale: 'en' | 'it') => {
    let schemas!: {
        zodUserSchema: (typeof import('@models/user-validation'))['zodUserSchema'];
        zodProductSchema: (typeof import('@models/products'))['zodProductSchema'];
    };

    await jest.isolateModulesAsync(async () => {
        const i18nextModule = await import('i18next');
        const i18next = i18nextModule.default;

        // deliberately BEFORE init — this is the ordering ES modules force on `app.ts`
        const { zodUserSchema } = await import('@models/user-validation');
        const { zodProductSchema } = await import('@models/products');

        // the premise of the whole file: an un-initialised i18next resolves nothing, so an
        // eagerly-called `t()` in those modules just baked `undefined` into the checks
        expect(i18next.isInitialized).toBeFalsy();
        expect(i18next.t('signup.user-field-email-invalid')).toBeUndefined();

        await i18next.init({
            lng: locale,
            fallbackLng: 'en',
            resources: {
                en: { translation: enTranslation as Record<string, unknown> },
                it: { translation: itTranslation as Record<string, unknown> }
            }
        });

        schemas = { zodUserSchema, zodProductSchema };
    });

    return schemas;
};

/**
 * Every leaf key of a nested dictionary, dot-joined and sorted.
 */
const flattenKeys = (dictionary: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(dictionary)
        .flatMap(([key, value]) =>
            value !== null && typeof value === 'object'
                ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
                : [`${prefix}${key}`]
        )
        .toSorted();

describe('validation messages resolve against the active locale', () => {
    it('uses the en.json copy verbatim, not a Zod default', async () => {
        const { zodUserSchema } = await loadSchemasBeforeI18n('en');

        const result = zodUserSchema.safeParse({
            email: 'not-an-email',
            username: 'ab',
            password: 'x'
        });

        expect(result.success).toBe(false);
        const messages = result.error?.issues.map(({ message }) => message) ?? [];

        expect(messages).toContain(enTranslation.signup['user-field-email-invalid']);
        expect(messages).toContain(enTranslation.signup['user-field-username-min']);
        expect(messages).toContain(enTranslation.signup['user-field-password-min']);
    });

    it('uses the it.json copy when the active locale is it', async () => {
        const { zodUserSchema } = await loadSchemasBeforeI18n('it');

        const result = zodUserSchema.safeParse({
            email: 'not-an-email',
            username: 'ab',
            password: 'x'
        });

        expect(result.success).toBe(false);
        const messages = result.error?.issues.map(({ message }) => message) ?? [];

        expect(messages).toContain(itTranslation.signup['user-field-email-invalid']);
        expect(messages).toContain(itTranslation.signup['user-field-username-min']);
        expect(messages).toContain(itTranslation.signup['user-field-password-min']);
    });

    it('translates product messages too', async () => {
        const { zodProductSchema } = await loadSchemasBeforeI18n('it');

        const result = zodProductSchema.safeParse({ title: 'ab', price: -1 });

        expect(result.success).toBe(false);
        const messages = result.error?.issues.map(({ message }) => message) ?? [];

        expect(messages).toContain(itTranslation.ecommerce['product-field-title-min']);
        expect(messages).toContain(itTranslation.ecommerce['product-field-price-min']);
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
            const { zodUserSchema } = await import('@models/user-validation');

            await i18next.init({
                lng: 'en',
                fallbackLng: 'en',
                resources: {
                    en: { translation: enTranslation as Record<string, unknown> },
                    it: { translation: itTranslation as Record<string, unknown> }
                }
            });

            const parse = () =>
                zodUserSchema
                    .safeParse({ email: 'not-an-email', username: 'ab', password: 'x' })
                    .error?.issues.map(({ message }) => message) ?? [];

            english = parse();
            await i18next.changeLanguage('it');
            italian = parse();
        });

        expect(english).toContain(enTranslation.signup['user-field-email-invalid']);
        expect(italian).toContain(itTranslation.signup['user-field-email-invalid']);
        expect(italian).not.toEqual(english);
    });
});

describe('locale files', () => {
    it('en.json and it.json declare exactly the same keys', () => {
        expect(flattenKeys(itTranslation as Record<string, unknown>)).toEqual(
            flattenKeys(enTranslation as Record<string, unknown>)
        );
    });

    it('it.json is actually translated, not a copy of en.json', () => {
        expect(itTranslation.signup['user-field-email-invalid']).not.toBe(
            enTranslation.signup['user-field-email-invalid']
        );
    });
});
