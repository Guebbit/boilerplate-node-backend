/**
 * @module
 * The TOTP handler: a device method, so it delivers nothing and its whole job is minting a
 * secret at setup and checking the six digits an authenticator app derives from it. The crypto
 * lives in `../totp.ts`; this file is only the registry adapter around it.
 */

import type { TwoFactorMethodHandler } from '../registry';
import { generateSecret } from 'otplib';
import { userService } from '@modules/users';
import { buildOtpauthUri, decryptTotpSecret, encryptTotpSecret, verifyTotpCode } from '../totp';

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
        // otplib: a fresh base32 TOTP secret, one per enrollment attempt.
        // https://github.com/yeojz/otplib
        const secret = generateSecret();
        // A hydrated subdocument always has its `_id` by now (`two-factor.ts` pushes it first).
        entry.secret = encryptTotpSecret(secret, String(entry._id));
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

    verify: (user, entry, code) => {
        if (!entry.secret) return Promise.resolve(false);
        return verifyTotpCode(
            decryptTotpSecret(entry.secret, String(entry._id)),
            code,
            entry.lastUsedStep
        ).then((result) => {
            // `timeStep` is present whenever `valid` is: the type just cannot say so.
            if (!result.valid || result.timeStep === undefined) return false;
            const { timeStep } = result;

            // The replay mark is a conditional write (only a LATER step wins), so two requests
            // carrying one code cannot both pass: the loser is a wrong code. The in-memory
            // entry follows, so the caller's own save writes the same value.
            return userService.claimTotpStep(user.id, entry.method, timeStep).then((claimed) => {
                if (claimed) entry.lastUsedStep = timeStep;
                return claimed;
            });
        });
    }
};
