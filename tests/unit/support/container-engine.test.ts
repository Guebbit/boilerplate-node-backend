/**
 * The reaper's decision: which test containers are orphans.
 */
import { isProcessAlive, orphanedContainerIds } from '@tests/container-engine';

describe('orphanedContainerIds', () => {
    it('picks only containers whose owner is dead', () => {
        const rows = [
            'aaa node-backend.owner-pid=100,node-backend.test=1',
            'bbb node-backend.test=1,node-backend.owner-pid=200',
            'ccc node-backend.owner-pid=100,node-backend.test=1'
        ];

        expect(orphanedContainerIds(rows, (pid) => pid === 100)).toEqual(['bbb']);
    });

    it('leaves rows without a usable owner pid alone', () => {
        expect(
            orphanedContainerIds(
                ['aaa', 'bbb node-backend.test=1', 'ccc node-backend.owner-pid=0'],
                () => false
            )
        ).toEqual([]);
    });
});

describe('isProcessAlive', () => {
    it('is true for this process', () => {
        expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('is false for a pid nothing owns', () => {
        expect(isProcessAlive(4_206_649)).toBe(false);
    });
});
