/**
 * @module
 * A literal sub-path wins over a templated sibling under the same parent, for `OPTIONS`:
 * `/payments/{id}/refunds/sync` is not read as a refund id. The one such pair in the contract is
 * `payments`', so the case lives here; the literal-over-template rule itself is
 * `tests/integration/method-not-allowed.test.ts`'s.
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

describe('OPTIONS on a literal sub-path', () => {
    it('lets a literal sub-path win over a templated sibling under the same parent', async () => {
        const response = await api().options('/payments/abc/refunds/sync');

        expect(response.headers.allow).toBe('OPTIONS, POST');
    });
});
