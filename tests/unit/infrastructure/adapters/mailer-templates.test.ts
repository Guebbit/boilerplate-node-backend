/**
 * Guards the email/PDF template collection.
 *
 * A wrong template path breaks every templated email and nothing else — no type catches it, and a
 * suite that mocks the filesystem away cannot see it either. So this collects every enabled
 * module's own `templates/` directory exactly the way `app.ts` does at boot, then asserts the
 * result points at real files, and renders them.
 */
import path from 'node:path';
import ejs from 'ejs';
import type { EmailContent } from '@infrastructure/adapters/mailer';
import {
    registerTemplateDirectories,
    registeredTemplateNames,
    templateFile
} from '@infrastructure/adapters/mailer';
import { enabledModuleTemplateDirectories } from '../../../../src/modules';
import { listSupportedLocales } from '@infrastructure/i18n';
import {
    verifyRequestEmail,
    resetRequestEmail,
    setupRequestEmail,
    resetConfirmEmail,
    deleteRequestEmail,
    deleteConfirmEmail,
    inactivityWarningEmail,
    twoFactorCodeEmail,
    reauthCodeEmail,
    emailChangeNoticeEmail,
    twoFactorChangedEmail,
    exportReadyEmail
} from '@modules/account/emails';
import { contactRequestEmail } from '@modules/feedback/emails';
import { examplePublishedEmail } from '@modules/example';
import {
    orderConfirmEmail,
    paymentSucceededEmail,
    bankTransferInstructionsEmail,
    bankTransferExpiredEmail,
    cardHoldExpiredEmail,
    orderCancelledEmail,
    refundIssuedEmail
} from '@modules/orders/emails';
import { buildDocumentView } from '@modules/invoicing/emails';
import { shipmentShippedEmail } from '@modules/delivery/emails';
import { returnNoticeEmail } from '@modules/returns';
import { subscriptionDisabledEmail } from '@modules/webhooks';

// Every case in this file renders against the real collection, the same one `app.ts` builds at
// boot — a module's own manifest is what says which directory it owns.
registerTemplateDirectories(enabledModuleTemplateDirectories());

describe('the template collection', () => {
    it('collects at least one template', () => {
        expect(registeredTemplateNames().length).toBeGreaterThan(0);
    });

    it.each([
        'orders.order-confirm',
        'account.delete-confirm',
        'account.delete-request',
        'feedback.contact'
    ])('resolves %s to a real file', (name) => {
        expect(() => templateFile(name)).not.toThrow();
    });

    it.each(['../etc/passwd', 'a/b', String.raw`a\b`, '', '.hidden'])(
        'refuses the name %p before it can become a path',
        (name) => {
            expect(() => templateFile(name)).toThrow(/not a valid template name/);
        }
    );

    it('does not resolve an Object.prototype key as a template', () => {
        expect(() => templateFile('constructor')).toThrow(/not a registered template/);
    });
});

/**
 * Every template, against the builder that fills it, all asked for the same language.
 *
 * No locale scope anywhere: the builders take the language as an argument and the render takes
 * nothing but their output, which is exactly the production sequence.
 */
const contentFor = (locale: string): Record<string, EmailContent> => ({
    'account.verify-request': verifyRequestEmail(locale, 'Ada', 'a-token'),
    'account.reset-request': resetRequestEmail(locale, 'Ada', 'a-token'),
    'account.setup-request': setupRequestEmail(locale, 'Ada', 'a-token'),
    'account.reset-confirm': resetConfirmEmail(locale, 'Ada'),
    'account.delete-request': deleteRequestEmail(locale, 'Ada', 'a-token'),
    'account.delete-confirm': deleteConfirmEmail(locale, 'Ada'),
    'account.inactivity-warning': inactivityWarningEmail(locale, 'Ada', 30),
    'account.two-factor-code': twoFactorCodeEmail(locale, 'Ada', '492013', 10),
    'account.reauth-code': reauthCodeEmail(locale, 'Ada', '492013', 10),
    'account.email-change-notice': emailChangeNoticeEmail(locale, 'Ada', 'new@example.com'),
    'account.two-factor-changed': twoFactorChangedEmail(locale, 'Ada', 'enrolled', 'email'),
    'account.export-ready': exportReadyEmail(locale, 'Ada', '64b0c0ffee64b0c0ffee64b0', 7),
    'orders.order-confirm': orderConfirmEmail(
        locale,
        'Ada',
        {
            items: [
                { quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } },
                { quantity: 1, product: { title: 'A whole ham', price: 42 } }
            ]
        },
        'an-order-id'
    ),
    'orders.order-transfer-instructions': bankTransferInstructionsEmail(
        locale,
        'Ada',
        { items: [{ quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } }] },
        { beneficiary: 'Guebbit Shop', iban: 'DE89370400440532013000', reference: 'an-order-id' },
        new Date('2026-09-19T12:00:00.000Z'),
        'an-order-id'
    ),
    'orders.order-paid': paymentSucceededEmail(
        locale,
        'Ada',
        { items: [{ quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } }] },
        'an-order-id'
    ),
    'orders.order-transfer-expired': bankTransferExpiredEmail(locale, {
        items: [{ quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } }]
    }),
    'orders.order-card-expired': cardHoldExpiredEmail(locale, {
        items: [{ quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } }]
    }),
    'orders.order-cancelled': orderCancelledEmail(
        locale,
        'Ada',
        {
            items: [{ quantity: 2, product: { title: 'Boiled sweets', price: 3.5 } }],
            paidAt: new Date('2026-09-19T12:00:00.000Z')
        },
        '2026-000041',
        true
    ),
    'orders.order-refunded': refundIssuedEmail(
        locale,
        'Ada',
        '2026-000041',
        { amount: 7, currency: 'EUR' },
        true
    ),
    'delivery.shipment-shipped': shipmentShippedEmail(locale, 'Ada', 'TRK-0000TEST'),
    'returns.notice': returnNoticeEmail('withdrawal-acknowledged', locale, 'Ada', {
        orderRef: '2026-000041',
        returnPostage: 'consumer',
        at: new Date('2026-08-06T10:30:00Z')
    }),
    'webhooks.subscription-disabled': subscriptionDisabledEmail(locale, 'https://example.com/hook'),
    'example.published': examplePublishedEmail(locale, 'Ada', 'A title'),
    'feedback.contact': contactRequestEmail(locale, {
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'A subject',
        message: 'A message',
        createdAt: '2026-08-06T00:00:00.000Z'
    })
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
 * The translated keys live in each module's own `emails.ts` — so that is what `contentFor` above
 * drives. The first test below asserts it covers the collection, which is what keeps a new
 * template from arriving with no locale coverage.
 *
 * Rendering goes through EJS directly rather than `nodemailer`, so no SMTP transport is involved —
 * this is about the copy, not the delivery. `root: process.cwd()` matches production
 * (`sendTemplatedEmail`): a template's `/shared/templates/layouts/...` include is root-relative.
 */
const render = (name: string, locale: string) =>
    ejs.renderFile(templateFile(name), contentFor(locale)[name].data, { root: process.cwd() });

describe('email templates render in every supported locale', () => {
    const names = registeredTemplateNames();

    it('has copy registered for every collected template', () => {
        expect(Object.keys(contentFor('en')).toSorted()).toEqual(names.toSorted());
    });

    const cases = listSupportedLocales().flatMap((locale) =>
        names.map((name) => [name, locale] as const)
    );

    it.each(cases)('renders %s in %s with no unresolved keys', async (name, locale) => {
        const html = await render(name, locale);

        expect(html).toContain(`<html lang="${locale}"`);
        // A raw i18next key is a dotted identifier with no spaces — the shape a missing
        // translation leaves behind.
        expect(html).not.toMatch(/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</);
    });

    /**
     * The invoice PDF lives outside the collected map (nothing resolves it by name, so it
     * is reached directly, the same way its own module does) but is the same kind of artefact —
     * a document a customer reads — so it is held to the same translation rule.
     */
    it.each(listSupportedLocales())('renders the invoice document in %s', async (locale) => {
        const html = await ejs.renderFile(
            path.join(
                'src',
                'modules',
                'invoicing',
                'templates',
                'documents',
                'invoicing.document.ejs'
            ),
            buildDocumentView(locale, {
                kind: 'invoice',
                number: '2026-000001',
                issuedAt: new Date('2026-01-15'),
                currency: 'EUR',
                locale,
                seller: {},
                lines: [{ title: 'A product', quantity: 2, unitPrice: 10, taxRate: 0.22 }],
                netTotal: 16.39,
                taxTotal: 3.61,
                shippingNetAmount: 0,
                shippingTaxAmount: 0,
                taxSummary: [{ rate: 0.22, netAmount: 16.39, taxAmount: 3.61, grossAmount: 20 }],
                shippingByRate: [],
                grandTotal: 20
            }),
            { root: process.cwd() }
        );

        expect(html).toContain(`<html lang="${locale}"`);
        expect(html).not.toMatch(/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</);
    });

    it('produces different copy per locale, so the dictionaries are actually consulted', async () => {
        const [english, italian] = await Promise.all([
            render('account.reset-confirm', 'en'),
            render('account.reset-confirm', 'it')
        ]);

        expect(english).not.toBe(italian);
    });
});

/**
 * A name is escaped once, by the template (the HTML sink). i18next must not escape it first, or
 * `O'Brien` arrives as `O&amp;#39;Brien` in the HTML and `O&#39;Brien` in a plain-text subject.
 */
describe('a name with an apostrophe in a mail', () => {
    it('reaches the template raw and leaves it as HTML-escaped exactly once', async () => {
        const content = resetRequestEmail('en', "O'Brien", 'a-token');
        const html = await ejs.renderFile(templateFile(content.template), content.data, {
            root: process.cwd()
        });

        expect(content.data.greeting).toContain("O'Brien");
        expect(html).toContain('O&#39;Brien');
        expect(html).not.toContain('&amp;#39;');
    });
});
