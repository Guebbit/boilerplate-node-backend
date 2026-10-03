/**
 * `accountFrontendLink` — this module's own D14 fix: `infrastructure/http/frontend-link.ts` only
 * turns a resolved template into a URL, so the four kinds' env vars and default templates live
 * here, not in infrastructure.
 */
import { accountFrontendLink } from '@modules/account/config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

withoutEnvironmentInThisFile([
    'NODE_FRONTEND_URL',
    'NODE_FRONTEND_LINK_VERIFY',
    'NODE_FRONTEND_LINK_RESET',
    'NODE_FRONTEND_LINK_DELETE',
    'NODE_FRONTEND_LINK_EMAIL_CHANGE'
]);

const TOKEN = 'a1b2c3d4e5f6';

describe('accountFrontendLink — the default template per kind', () => {
    it("builds the verify link: locale, then the frontend's verify-email page, token as a query param", () => {
        expect(accountFrontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
        );
    });

    it('builds the reset link', () => {
        expect(accountFrontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/password-reset/confirm?token=${TOKEN}`
        );
    });

    it('builds the delete link', () => {
        expect(accountFrontendLink('delete', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/account-delete/confirm?token=${TOKEN}`
        );
    });

    it('builds the email-change link', () => {
        expect(accountFrontendLink('email-change', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/email-change/confirm?token=${TOKEN}`
        );
    });

    it('gives every kind a distinct path, so one token can never be mistaken for another flow', () => {
        const urls = (['verify', 'reset', 'delete', 'email-change'] as const).map((kind) =>
            accountFrontendLink(kind, { locale: 'en', token: TOKEN })
        );

        expect(new Set(urls).size).toBe(urls.length);
    });
});

describe('accountFrontendLink — per-kind override', () => {
    it("lets a deployment override one kind's template without touching the others", () => {
        setEnvironment({ NODE_FRONTEND_LINK_RESET: 'change-password?t={token}' });

        expect(accountFrontendLink('reset', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/change-password?t=${TOKEN}`
        );
        expect(accountFrontendLink('verify', { locale: 'en', token: TOKEN })).toBe(
            `http://localhost:8080/en/verify-email/confirm?token=${TOKEN}`
        );
    });
});
