/**
 * The account emails — the four that carry a link, and the two that confirm something happened.
 *
 * These builders look like data and fail like code. Every one of the six is the ONLY way a user
 * reaches the flow it belongs to, so each field is a single point of failure with no fallback and
 * no error path:
 *
 *   - a wrong `template` renders someone else's email, or none;
 *   - a wrong `linkUrl` path segment means every verification, reset and deletion link 404s, and
 *     the user's only recourse is to ask for another one that also 404s;
 *   - a missing `t()` slot renders as a blank line or a raw key in the user's inbox;
 *   - the wrong TOKEN in the wrong link hands a password reset to whoever asked to be deleted.
 *
 * None of that throws, and the integration tier asserts that mail was SENT rather than what it
 * said — which is why every one of these mutants survived. The assertions below therefore check
 * the built content, and the interpolation ones check that the copy actually used the value it was
 * given rather than merely being non-empty.
 */
import {
    verifyRequestEmail,
    resetRequestEmail,
    setupRequestEmail,
    resetConfirmEmail,
    deleteRequestEmail,
    deleteConfirmEmail
} from '@modules/account/emails';

const NAME = 'Ada Lovelace';
const TOKEN = 'a1b2c3d4e5f6';

/**
 * The four that exist to deliver a link, paired with the path segment each must produce.
 *
 * `setupRequestEmail` shares `resetRequestEmail`'s route deliberately — both spend a `password`-type
 * token at the same `POST /account/reset-confirm`, see `authentication.ts`'s `requestAccountSetup`
 * — so it is excluded from the "each token to its own route" case below rather than making that
 * case wrong.
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
    it.each(LINK_EMAILS)('%s points at /account/%s/<token>', (_name, build, _template, route) => {
        const { data } = build('en', NAME, TOKEN);

        // The whole path, not just the token: a link missing the `account/` prefix or naming the
        // wrong route reaches a page that cannot spend the token, and the user's only recourse is
        // another link with the same defect.
        expect(data.linkUrl).toBe(`${process.env.NODE_URL ?? ''}account/${route}/${TOKEN}`);
    });

    it('sends each token to its own route, never another flow"s', () => {
        // The consequence worth naming: a reset token delivered on the delete route, or the other
        // way round, is an account action performed by someone who asked for a different one.
        const verify = verifyRequestEmail('en', NAME, TOKEN).data.linkUrl as string;
        const reset = resetRequestEmail('en', NAME, TOKEN).data.linkUrl as string;
        const remove = deleteRequestEmail('en', NAME, TOKEN).data.linkUrl as string;

        expect(new Set([verify, reset, remove]).size).toBe(3);
        expect(verify).toContain('/verify/');
        expect(reset).toContain('/reset/');
        expect(remove).toContain('/delete/');
    });

    it('joins the base URL without losing or doubling the separator', () => {
        // `NODE_URL` is expected to carry its own trailing slash; the builder appends `account/`
        // directly. Asserting the joined result rather than the pieces is what catches a
        // "helpful" slash added on either side.
        const url = verifyRequestEmail('en', NAME, TOKEN).data.linkUrl as string;

        expect(url).not.toContain('//account/');
        expect(url.endsWith(`account/verify/${TOKEN}`)).toBe(true);
    });

    it('still produces a usable path when no base URL is configured', () => {
        // `?? ''` — a deployment with no `NODE_URL` set must not emit the string "undefined" in
        // the middle of every link in every email it sends.
        const original = process.env.NODE_URL;
        delete process.env.NODE_URL;

        try {
            expect(verifyRequestEmail('en', NAME, TOKEN).data.linkUrl).toBe(
                `account/verify/${TOKEN}`
            );
        } finally {
            if (original !== undefined) process.env.NODE_URL = original;
        }
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
