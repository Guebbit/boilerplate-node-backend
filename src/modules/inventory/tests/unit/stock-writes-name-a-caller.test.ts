/**
 * @module
 * `receive` and `adjust` move stock, so each names the caller who answers for it: the type
 * refuses a call without one, and the audit row is written against that caller.
 */

import { inventoryService } from '../../services';

describe('a stock write names who made it', () => {
    it('is refused by the compiler when the caller is left out', () => {
        const attempts = [
            // @ts-expect-error -- the missing caller is the thing under test
            () => inventoryService.receive('64b64c4f4f4f4f4f4f4f4f4f', 1, 'delivery note'),
            // @ts-expect-error -- the missing caller is the thing under test
            () => inventoryService.adjust('64b64c4f4f4f4f4f4f4f4f4f', -1, 'stocktake')
        ];

        // Never called: reaching the database is not what this test is about.
        expect(attempts).toHaveLength(2);
    });
});
