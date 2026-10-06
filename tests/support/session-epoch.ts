/**
 * @module
 * Test support for the session epoch: a 2FA factor change moves `tokensValidAfter`, which kills the
 * access token the caller logged in with — a real client swaps it through its re-minted refresh
 * cookie. A suite that tests the FACTORS, not that swap, keeps its login bearer by calling
 * {@link forgetSessionEpoch} after the change. The epoch itself is tested in
 * `src/modules/account/tests/integration/session-epoch.test.ts`.
 */

import { userRepository } from '@modules/users/tests/factories';

/** Clears every account's session epoch, so a bearer minted before a factor change is live again. */
export const forgetSessionEpoch = (): Promise<unknown> =>
    userRepository.updateMany({}, { $unset: { tokensValidAfter: '' } });
