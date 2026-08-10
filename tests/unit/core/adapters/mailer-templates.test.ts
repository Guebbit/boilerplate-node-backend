/**
 * Guards the email template path.
 *
 * A wrong `EMAIL_TEMPLATES_DIR` breaks every templated email and nothing else — no type catches
 * it, and a suite that mocks the filesystem away cannot see it either. So this asserts the path
 * points at real files, and renders them.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';
import { EMAIL_TEMPLATES_DIR } from '@core/adapters/mailer';
import { listSupportedLocales, runWithLocale, t } from '@core/i18n';

describe('email templates', () => {
    it('resolves to a directory that exists', () => {
        expect(existsSync(EMAIL_TEMPLATES_DIR)).toBe(true);
    });

    it('contains at least one .ejs template', () => {
        const templates = readdirSync(EMAIL_TEMPLATES_DIR).filter((f) => f.endsWith('.ejs'));
        expect(templates.length).toBeGreaterThan(0);
    });

    it.each([
        'email-registration-confirm.ejs',
        'email-order-confirm.ejs',
        'email-delete-confirm.ejs',
        'email-delete-request.ejs',
        'email-feedback-contact.ejs'
    ])('resolves %s to a real file', (template) => {
        expect(existsSync(path.resolve(EMAIL_TEMPLATES_DIR, template))).toBe(true);
    });
});

/**
 * Every template, rendered for real, in every supported locale.
 *
 * A missing key is invisible until an email lands in someone's inbox: i18next returns the key
 * itself, which is a perfectly valid string, so nothing throws and nothing logs. Rendering each
 * template against each dictionary and asserting no dotted identifier survives is the only place
 * that shows up before delivery.
 *
 * The templates are rendered directly rather than through `nodemailer`, so no SMTP transport is
 * involved — this is about the copy, not the delivery.
 */
describe('email templates render in every supported locale', () => {
    const templates = readdirSync(EMAIL_TEMPLATES_DIR).filter((file) => file.endsWith('.ejs'));

    /** Stand-in values for every variable the templates interpolate. */
    const templateData = {
        pageMetaTitle: 'Meta title',
        pageMetaLinks: [],
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'A subject',
        message: 'A message',
        createdAt: '2026-08-06T00:00:00.000Z',
        token: 'a-token'
    };

    const render = (template: string, locale: string) =>
        runWithLocale(locale, () =>
            ejs.renderFile(path.resolve(EMAIL_TEMPLATES_DIR, template), {
                t,
                locale,
                ...templateData
            })
        );

    const cases = listSupportedLocales().flatMap((locale) =>
        templates.map((template) => [template, locale] as const)
    );

    it.each(cases)('renders %s in %s with no unresolved keys', async (template, locale) => {
        const html = await render(template, locale);

        expect(html).toContain(`<html lang="${locale}"`);
        // A raw i18next key is a dotted identifier with no spaces — the shape a missing
        // translation leaves behind.
        expect(html).not.toMatch(/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</);
    });

    /**
     * The invoice PDF lives outside `templates-emails` but is the same kind of artefact — a
     * document a customer reads — so it is held to the same translation rule.
     */
    it.each(listSupportedLocales())('renders the invoice document in %s', async (locale) => {
        const html = await runWithLocale(locale, () =>
            ejs.renderFile(path.resolve('views', 'templates-files', 'invoice-order-file.ejs'), {
                t,
                locale,
                pageMetaTitle: 'Invoice',
                pageMetaLinks: [],
                order: {
                    items: [{ product: { title: 'A product', price: 10 }, quantity: 2 }]
                }
            })
        );

        expect(html).toContain(`<html lang="${locale}"`);
        expect(html).not.toMatch(/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</);
    });

    it('produces different copy per locale, so the dictionaries are actually consulted', async () => {
        const [english, italian] = await Promise.all([
            render('email-registration-confirm.ejs', 'en'),
            render('email-registration-confirm.ejs', 'it')
        ]);

        expect(english).not.toBe(italian);
    });
});
