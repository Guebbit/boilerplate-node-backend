/**
 * The pure rule step-up adds: what a re-minted session claims (`amrAfterReauth`). The HTTP
 * behaviour is in `contract/reauth.contract.test.ts`.
 */
import { amrAfterReauth } from '../../services/reauth';

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
