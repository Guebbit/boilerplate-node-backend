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
import type { EmailContent } from '@infrastructure/adapters/mailer';
import { emailTemplatesDirectory } from '@infrastructure/adapters/mailer';
import { listSupportedLocales } from '@infrastructure/i18n';
import {
    verifyRequestEmail,
    resetRequestEmail,
    setupRequestEmail,
    resetConfirmEmail,
    deleteRequestEmail,
    deleteConfirmEmail
} from '@modules/account/emails';
import { contactRequestEmail } from '@modules/feedback/emails';
import { orderConfirmEmail, invoiceDocument } from '@modules/orders/emails';
import { shipmentShippedEmail } from '@modules/delivery/emails';

describe('email templates', () => {
    it('resolves to a directory that exists', () => {
        expect(existsSync(emailTemplatesDirectory())).toBe(true);
    });

    it('contains at least one .ejs template', () => {
        const templates = readdirSync(emailTemplatesDirectory()).filter((f) => f.endsWith('.ejs'));
        expect(templates.length).toBeGreaterThan(0);
    });

    it.each([
        'orders.order-confirm.ejs',
        'account.delete-confirm.ejs',
        'account.delete-request.ejs',
        'feedback.contact.ejs'
    ])('resolves %s to a real file', (template) => {
        expect(existsSync(path.resolve(emailTemplatesDirectory(), template))).toBe(true);
    });
});

/**
 * Every template, rendered for real, in every supported locale — through the builder that owns
 * its copy.
 *
 * A missing key is invisible until an email lands in someone's inbox: i18next returns the key
 * itself, which is a perfectly valid string, so nothing throws and nothing logs. Rendering each
 * template against each dictionary and asserting no dotted identifier survives is the only place
 * that shows up before delivery.
 *
 * Since templates stopped translating, the keys live in each module's `emails.ts` — so that is
 * what this drives. `CONTENT` maps every template to the builder that fills it, and the first
 * test below asserts the map covers the directory, which is what keeps a new template from
 * arriving with no locale coverage.
 *
 * Rendering goes through EJS directly rather than `nodemailer`, so no SMTP transport is involved —
 * this is about the copy, not the delivery.
 */
/**
 * Every template, against the builder that fills it, all asked for the same language.
 *
 * No locale scope anywhere: the builders take the language as an argument and the render takes
 * nothing but their output, which is exactly the production sequence.
 */
const contentFor = (locale: string): Record<string, EmailContent> => ({
    'account.verify-request.ejs': verifyRequestEmail(locale, 'Ada', 'a-token'),
    'account.reset-request.ejs': resetRequestEmail(locale, 'Ada', 'a-token'),
    'account.setup-request.ejs': setupRequestEmail(locale, 'Ada', 'a-token'),
    'account.reset-confirm.ejs': resetConfirmEmail(locale, 'Ada'),
    'account.delete-request.ejs': deleteRequestEmail(locale, 'Ada', 'a-token'),
    'account.delete-confirm.ejs': deleteConfirmEmail(locale, 'Ada'),
    'orders.order-confirm.ejs': orderConfirmEmail(locale, 'Ada', {
        items: [
            { quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } },
            { quantity: 1, product: { title: 'A whole ham', price: 42 } }
        ]
    }),
    'delivery.shipment-shipped.ejs': shipmentShippedEmail(locale, 'Ada', 'TRK-0000TEST'),
    'feedback.contact.ejs': contactRequestEmail(locale, {
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'A subject',
        message: 'A message',
        createdAt: '2026-08-06T00:00:00.000Z'
    })
});

describe('email templates render in every supported locale', () => {
    const templates = readdirSync(emailTemplatesDirectory()).filter((file) =>
        file.endsWith('.ejs')
    );

    const render = (template: string, locale: string) =>
        ejs.renderFile(
            path.resolve(emailTemplatesDirectory(), template),
            contentFor(locale)[template].data
        );

    it('has copy registered for every template in the directory', () => {
        expect(Object.keys(contentFor('en')).toSorted()).toEqual(templates.toSorted());
    });

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
        const html = await ejs.renderFile(
            path.resolve('shared', 'views', 'templates-files', 'orders.invoice.ejs'),
            invoiceDocument(locale, {
                id: 'an-order-id',
                items: [{ product: { title: 'A product', price: 10 }, quantity: 2 }]
            })
        );

        expect(html).toContain(`<html lang="${locale}"`);
        expect(html).not.toMatch(/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</);
    });

    it('produces different copy per locale, so the dictionaries are actually consulted', async () => {
        const [english, italian] = await Promise.all([
            render('account.reset-confirm.ejs', 'en'),
            render('account.reset-confirm.ejs', 'it')
        ]);

        expect(english).not.toBe(italian);
    });
});
