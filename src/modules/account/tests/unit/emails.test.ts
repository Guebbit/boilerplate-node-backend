/**
 * @module
 * The account emails — four that carry a link, two that confirm something happened. These
 * builders look like data and fail like code: a wrong `template` renders someone else's email, a
 * wrong `linkUrl` 404s the link, a swapped token hands a reset to the wrong flow — none of which
 * throws. So these assert the built content itself, including that interpolation ran.
 */

import {
    verifyRequestEmail,
    resetRequestEmail,
    setupRequestEmail,
    resetConfirmEmail,
    deleteRequestEmail,
    deleteConfirmEmail,
    twoFactorChangedEmail,
    greetableName
} from '@modules/account/emails';
import { accountFrontendLink } from '@modules/account/config';

const NAME = 'Ada Lovelace';
const TOKEN = 'a1b2c3d4e5f6';

/**
 * The four that exist to deliver a link, paired with the `accountFrontendLink` kind each must
 * delegate to. `setupRequestEmail` shares `resetRequestEmail`'s kind deliberately — both spend a
 * `password`-type token at `POST /account/reset-confirm` (see `authentication.ts`'s
 * `requestAccountSetup`) — so it's excluded from the "each token to its own kind" case below.
 */
const LINK_EMAILS = [
    ['verifyRequestEmail', verifyRequestEmail, 'account.verify-request', 'verify'],
    ['resetRequestEmail', resetRequestEmail, 'account.reset-request', 'reset'],
    ['setupRequestEmail', setupRequestEmail, 'account.setup-request', 'reset'],
    ['deleteRequestEmail', deleteRequestEmail, 'account.delete-request', 'delete']
] as const;

/** The two that report a completed action and carry no link. */
const CONFIRM_EMAILS = [
    ['resetConfirmEmail', resetConfirmEmail, 'account.reset-confirm'],
    ['deleteConfirmEmail', deleteConfirmEmail, 'account.delete-confirm']
] as const;

/** Every string slot in a built email, with the locale and the empty meta-links excluded. */
const copySlots = (content: { subject: string; data: Record<string, unknown> }) =>
    Object.entries({ subject: content.subject, ...content.data })
        .filter(([key]) => key !== 'locale' && key !== 'pageMetaLinks' && key !== 'linkUrl')
        .map(([key, value]) => [key, value] as const);

describe('account emails — the template each one names', () => {
    it.each(LINK_EMAILS)('%s renders %s', (_name, build, template) => {
        expect(build('en', NAME, TOKEN).template).toBe(template);
    });

    it.each(CONFIRM_EMAILS)('%s renders %s', (_name, build, template) => {
        expect(build('en', NAME).template).toBe(template);
    });

    it('gives every email a distinct template', () => {
        // Six templates, six emails. A copy-paste that leaves two builders pointing at the same
        // template sends the wrong copy for one whole flow, and every individual assertion above
        // would still pass if the pair agreed with each other.
        const templates = [
            ...LINK_EMAILS.map(([, build]) => build('en', NAME, TOKEN).template),
            ...CONFIRM_EMAILS.map(([, build]) => build('en', NAME).template)
        ];

        expect(new Set(templates).size).toBe(templates.length);
    });
});

describe('account emails — the action links', () => {
    it.each(LINK_EMAILS)(
        '%s delegates to accountFrontendLink(%s, …)',
        (_name, build, _template, kind) => {
            const { data } = build('en', NAME, TOKEN);

            // The whole link, not just the token: `accountFrontendLink`/`frontendLink` are covered
            // by their own unit suites (`src/modules/account/tests/unit/config.test.ts`,
            // `tests/unit/infrastructure/http/frontend-link.test.ts`) — what this builder owns is
            // picking the right KIND and passing the recipient's own locale and token through
            // unchanged, never a swapped or hard-coded one.
            expect(data.linkUrl).toBe(accountFrontendLink(kind, { locale: 'en', token: TOKEN }));
        }
    );

    it('sends each token to its own kind, never another flow"s', () => {
        // The consequence worth naming: a reset token delivered on the delete page, or the other
        // way round, is an account action performed by someone who asked for a different one.
        const verify = verifyRequestEmail('en', NAME, TOKEN).data.linkUrl as string;
        const reset = resetRequestEmail('en', NAME, TOKEN).data.linkUrl as string;
        const remove = deleteRequestEmail('en', NAME, TOKEN).data.linkUrl as string;

        expect(new Set([verify, reset, remove]).size).toBe(3);
    });

    it('carries the recipient"s own locale into the link, not just the copy', () => {
        const english = verifyRequestEmail('en', NAME, TOKEN).data.linkUrl as string;
        const italian = verifyRequestEmail('it', NAME, TOKEN).data.linkUrl as string;

        expect(new URL(english).pathname.startsWith('/en/')).toBe(true);
        expect(new URL(italian).pathname.startsWith('/it/')).toBe(true);
    });
});

describe('account emails — the copy', () => {
    it.each(LINK_EMAILS)('%s resolves every slot to real copy', (_name, build) => {
        for (const [key, value] of copySlots(build('en', NAME, TOKEN))) {
            // Non-empty, and not the key echoed back — i18next returns the key itself when it
            // cannot find a translation, which renders in the inbox as
            // `account.email.verify-request.intro`.
            expect(typeof value).toBe('string');
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^account\.email\./);
            expect(key).toBeTruthy();
        }
    });

    it.each(CONFIRM_EMAILS)('%s resolves every slot to real copy', (_name, build) => {
        for (const [, value] of copySlots(build('en', NAME))) {
            expect(typeof value).toBe('string');
            expect(value).not.toBe('');
            expect(value).not.toMatch(/^account\.email\./);
        }
    });

    it('interpolates the recipient"s name rather than dropping it', () => {
        // The `{ name }` argument. Without it the greeting still resolves to real copy and still
        // passes every "is it non-empty" check — it just greets nobody, or renders `{{name}}`.
        const greeting = verifyRequestEmail('en', NAME, TOKEN).data.greeting as string;
        const confirmGreeting = resetConfirmEmail('en', NAME).data.greeting as string;

        expect(greeting).toContain(NAME);
        expect(confirmGreeting).toContain(NAME);
        expect(greeting).not.toContain('{{');
    });

    it('carries the locale through to the template, and translates by it', () => {
        // `locale` in `data` is what the renderer sets `<html lang>` from; the copy differing is
        // what proves the locale reached `translator()` as well as the payload.
        const english = verifyRequestEmail('en', NAME, TOKEN);
        const italian = verifyRequestEmail('it', NAME, TOKEN);

        expect(english.data.locale).toBe('en');
        expect(italian.data.locale).toBe('it');
        expect(italian.subject).not.toBe(english.subject);
    });

    it('gives every email an empty meta-links list, not a missing one', () => {
        // The renderer iterates it. `undefined` there is a template crash rather than an empty
        // `<head>`, so the empty array is load-bearing despite looking like filler.
        for (const [, build] of CONFIRM_EMAILS)
            expect(build('en', NAME).data.pageMetaLinks).toEqual([]);
        for (const [, build] of LINK_EMAILS)
            expect(build('en', NAME, TOKEN).data.pageMetaLinks).toEqual([]);
    });

    it('shares one footer across every account email', () => {
        // `email.footer` is a shared key deliberately: six footers that drift are six places to
        // update when the company address changes.
        const footers = [
            ...LINK_EMAILS.map(([, build]) => build('en', NAME, TOKEN).data.footer),
            ...CONFIRM_EMAILS.map(([, build]) => build('en', NAME).data.footer)
        ];

        expect(new Set(footers).size).toBe(1);
        expect(footers[0]).not.toBe('');
    });
});

describe('account emails — the two-factor change notice', () => {
    it('renders its own template, distinct from every other', () => {
        expect(twoFactorChangedEmail('en', NAME, 'enrolled', 'email').template).toBe(
            'account.two-factor-changed'
        );
    });

    it.each(['enrolled', 'removed', 'disabled'] as const)(
        'says %s in real copy, in both shipped languages, with the name and no raw keys',
        (change) => {
            for (const locale of ['en', 'it']) {
                const { data, subject } = twoFactorChangedEmail(locale, NAME, change, 'email');

                for (const value of [subject, data.greeting, data.body, data.advice]) {
                    expect(typeof value).toBe('string');
                    expect(value).not.toBe('');
                    expect(value).not.toMatch(/^account\.email\./);
                    expect(value).not.toContain('{{');
                }
                expect(data.greeting).toContain(NAME);
            }
        }
    );

    it('names the factor for an add and a removal, and a different sentence for each change', () => {
        const bodies = (['enrolled', 'removed', 'disabled'] as const).map(
            (change) => twoFactorChangedEmail('en', NAME, change, 'totp').data.body as string
        );

        expect(bodies[0]).toContain('totp');
        expect(bodies[1]).toContain('totp');
        expect(new Set(bodies).size).toBe(3);
    });
});

describe('account emails — the name in a greeting', () => {
    const everyBuilder = [
        ...LINK_EMAILS.map(
            ([name, build]) => [name, (n: string) => build('en', n, TOKEN)] as const
        ),
        ...CONFIRM_EMAILS.map(([name, build]) => [name, (n: string) => build('en', n)] as const)
    ];

    it.each(everyBuilder)('%s greets by name when it has one', (_name, build) => {
        expect(build(NAME).data.greeting).toContain(NAME);
    });

    // The name is user-supplied text. For a mailbox nobody has proven it is withheld, and every
    // template that greets must cope with having none.
    it.each(everyBuilder)('%s says a plain Hello! when it has none', (_name, build) => {
        expect(build('').data.greeting).toBe('Hello!');
    });

    it('speaks the recipient language when it has no name too', () => {
        expect(resetRequestEmail('it', '', TOKEN).data.greeting).toBe('Ciao!');
    });
});

describe('greetableName — when the name may appear', () => {
    const user = { username: NAME, email: 'ada@example.com', verifiedAt: new Date() };

    it('prints the name for the account’s own VERIFIED address, however it is cased', () => {
        expect(greetableName(user, 'ada@example.com')).toBe(NAME);
        expect(greetableName(user, ' ADA@Example.com ')).toBe(NAME);
    });

    it('withholds it from an address nobody has proven', () => {
        expect(greetableName({ ...user, verifiedAt: undefined }, 'ada@example.com')).toBe('');
        expect(greetableName({ ...user, verifiedAt: null }, 'ada@example.com')).toBe('');
    });

    // A pending new address is never the verified one, even on a verified account.
    it('withholds it from any address that is not the account’s own', () => {
        expect(greetableName(user, 'someone-else@example.com')).toBe('');
        expect(greetableName(user, 'ada+tag@example.com')).toBe('');
    });
});
