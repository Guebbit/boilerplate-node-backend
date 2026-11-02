/**
 * @module
 * `antibotService.config` reports a misconfigured provider by rejecting, never by throwing at
 * the call: the controller chains `.catch` on the promise and would not see a synchronous throw.
 */

import { withEnvironmentOverrides } from '@tests/environment';
import { antibotService } from '../../service';

describe('antibotService.config', () => {
    it('rejects, rather than throws, when the provider named is not one this build has', () =>
        withEnvironmentOverrides({ NODE_ANTIBOT_PROVIDER: 'no-such-provider' }, () => {
            let pending: Promise<unknown> | undefined;
            expect(() => {
                pending = antibotService.config();
            }).not.toThrow();
            return expect(pending).rejects.toThrow(/NODE_ANTIBOT_PROVIDER|no-such-provider/);
        }));
});
