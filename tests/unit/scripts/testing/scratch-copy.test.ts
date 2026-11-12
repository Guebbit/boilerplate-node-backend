/**
 * `runIn` is how the `measure:*` scripts run `git` in a scratch folder. Under a git hook the
 * outer `GIT_*` variables point at the real repository, so the child must not inherit them.
 */
import os from 'node:os';
import { setProcessEnvironment } from '@tests/environment';
import { runIn } from '../../../../scripts/testing/scratch-copy';

describe('runIn', () => {
    it('hides the outer GIT_* variables from the command it runs and keeps the rest', () => {
        setProcessEnvironment({ GIT_INDEX_FILE: '/real/index', KEEP_ME: '1' });
        const childSees = `process.exit(process.env.GIT_INDEX_FILE === undefined && process.env.KEEP_ME === '1' ? 0 : 1)`;

        expect(runIn(os.tmpdir(), process.execPath, ['-e', childSees])).toBe(true);
    });
});
