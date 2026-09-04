/**
 * @module
 * The TOTP handler: a device method, so it delivers nothing and its whole job is minting a
 * secret at setup and checking the six digits an authenticator app derives from it. The crypto
 * lives in `../totp.ts`; this file is only the registry adapter around it.
 */

import type { TwoFactorMethodHandler } from '../registry';
import {
    buildOtpauthUri,
    decryptTotpSecret,
    encryptTotpSecret,
    generateTotpSecret,
    verifyTotpCode
} from '../totp';

/**
 * An authenticator app holding a shared secret. Available everywhere and to everyone: it needs
 * no channel this deployment has to reach and no property this account has to prove.
 */
export const totpMethod: TwoFactorMethodHandler = {
    name: 'totp',
    delivers: false,
    available: () => true,
    eligibility: () => ({ enrollable: true }),
    target: () => undefined,

    setup: (user, entry) => {
        const secret = generateTotpSecret();
        entry.secret = encryptTotpSecret(secret);
        // A fresh secret means a fresh replay window: the old high-water mark belongs to a
        // secret that no longer exists, and keeping it would refuse the first valid code.
        entry.lastUsedStep = undefined;
        return Promise.resolve({
            method: 'totp',
            delivers: false,
            secret,
            otpauthUri: buildOtpauthUri(secret, user.email)
        });
    },

    verify: (_user, entry, code) => {
        if (!entry.secret) return Promise.resolve(false);
        return verifyTotpCode(decryptTotpSecret(entry.secret), code, entry.lastUsedStep).then(
            (result) => {
                if (!result.valid) return false;
                entry.lastUsedStep = result.timeStep;
                return true;
            }
        );
    }
};
