/**
 * @module
 * Test support for the session epoch: a 2FA factor change moves `tokensValidAfter` and ends every
 * session row, which kills the access token the caller logged in with — a real client swaps it
 * through its re-minted refresh cookie. A suite that tests the FACTORS, not that swap, keeps its
 * login bearer by calling {@link forgetSessionEpoch} after the change. The epoch itself is tested
 * in `src/modules/account/tests/integration/session-epoch.test.ts`.
 */

import { Types } from 'mongoose';
import { decodeJwt } from 'jose';
import { userRepository } from '@modules/users/tests/factories';
import { sessionRepository } from '@modules/account/repository';

/**
 * Clears every account's session epoch and restores the session family `bearer` names, so a bearer
 * minted before a factor change is live again.
 *
 * @param bearer - the login bearer to keep, with or without its `Bearer ` prefix
 */
export const forgetSessionEpoch = (bearer: string): Promise<unknown> => {
    const { sub: id, sid } = decodeJwt(bearer.replace(/^Bearer /i, ''));
    const now = new Date();
    return userRepository
        .updateMany({}, { $unset: { tokensValidAfter: '' } })
        .then(() => sessionRepository.familyActivity(String(id), String(sid), 'jwt', now))
        .then((activity) =>
            activity
                ? undefined
                : sessionRepository.insert({
                      userId: new Types.ObjectId(String(id)),
                      familyId: new Types.ObjectId(String(sid)),
                      mode: 'jwt',
                      tokenHash: new Types.ObjectId().toHexString(),
                      startedAt: now,
                      expiresAt: new Date(now.getTime() + 3_600_000)
                  })
        );
};
