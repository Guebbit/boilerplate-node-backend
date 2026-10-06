/**
 * The two pure rules step-up adds: what a re-minted session claims (`amrAfterReauth`) and the boot
 * refusal for a provider with no way to mail its accounts a code (`oauthConfig`'s check). The HTTP
 * behaviour is in `contract/reauth.contract.test.ts`.
 */
import { assertConfigIn } from '@infrastructure/config/define';
import { amrAfterReauth } from '../../services/reauth';
import { oauthConfig } from '../../oauth/config';

describe('amrAfterReauth', () => {
    it('claims only the method just proved', () => {
        expect(amrAfterReauth('password', false)).toEqual(['pwd']);
        expect(amrAfterReauth('email', false)).toEqual(['email']);
    });

    it('adds otp only when a second-factor code was verified in the same call', () => {
        expect(amrAfterReauth('password', true)).toEqual(['pwd', 'otp']);
    });

    it('carries nothing over from the login: there is no input for it', () => {
        // A password-only re-auth after a 2FA login must NOT read as second-factored.
        expect(amrAfterReauth('password', false)).not.toContain('otp');
    });
});

/** A production environment with Google enabled; each case changes what mail can do. */
const withGoogle = (mail: Record<string, string>): Record<string, string> => ({
    NODE_ENV: 'production',
    NODE_OAUTH_GOOGLE_CLIENT_ID: 'id',
    NODE_OAUTH_GOOGLE_CLIENT_SECRET: 'secret',
    ...mail
});

/** The refusal message `assertConfigIn` throws, or undefined when the boot is accepted. */
const refusal = (environment: Record<string, string>): string | undefined => {
    try {
        assertConfigIn([oauthConfig.slice], environment);
        return undefined;
    } catch (error) {
        return (error as Error).message;
    }
};

describe('an enabled OAuth provider needs deliverable mail', () => {
    it.each([
        ['log transport', { NODE_MAIL_TRANSPORT: 'log' }],
        ['smtp with no host', { NODE_MAIL_TRANSPORT: 'smtp' }]
    ])('refuses to boot in production with %s', (_name, mail) => {
        expect(refusal(withGoogle(mail))).toMatch(/cannot be delivered/);
    });

    it('accepts smtp with a host', () => {
        expect(
            refusal(withGoogle({ NODE_MAIL_TRANSPORT: 'smtp', NODE_SMTP_HOST: 'smtp.example.com' }))
        ).toBeUndefined();
    });

    it('accepts any mail setup when no provider is enabled', () => {
        expect(refusal({ NODE_ENV: 'production', NODE_MAIL_TRANSPORT: 'log' })).toBeUndefined();
    });

    it.each(['development', 'test'])('does not apply in %s', (nodeEnvironment) => {
        expect(
            refusal({ ...withGoogle({ NODE_MAIL_TRANSPORT: 'log' }), NODE_ENV: nodeEnvironment })
        ).toBeUndefined();
    });
});
