/**
 * @module
 * `eraseOwnAccount` erases the document it is given, on an anonymous route. The type asks for the
 * spent deletion link's proof (`redeemedOwner`), so a bare document is refused by the compiler.
 */

import { asStub } from '@tests/stub';
import type { UserDocument } from '../../model';
import { userService } from '../../services';

describe('erasing one’s own account', () => {
    it('is refused by the compiler for a document nobody vouched for', () => {
        const bare = asStub<UserDocument>({});
        const attempt = () =>
            // @ts-expect-error -- a bare document without the redeemed-link proof is the thing under test
            userService.eraseOwnAccount(bare);

        // Never called: reaching the database is not what this test is about.
        expect(typeof attempt).toBe('function');
    });
});
