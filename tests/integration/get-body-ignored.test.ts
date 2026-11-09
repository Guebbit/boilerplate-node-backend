/**
 * A body on a GET is never read: the answer is the one the bare request gets.
 *
 * RFC 9110 §9.3.1 gives content on a GET no defined semantics, and Zalando says it "must be
 * ignored on server side". `app/security.ts` skips the JSON parser for GET and HEAD, so no
 * controller and no cache key can see one. Each body below is one the `search` surface would have
 * read before the query, and would have refused (422): a request that ignores it answers 200,
 * exactly as the bare request does.
 *
 * See: docs/theory/request-input.md
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** A period every stats read accepts. */
const PERIOD = 'from=2026-03-01&to=2026-03-31';

/** A body the `search` surface would read first, and the schema would refuse. */
const HOSTILE_BODY = { page: 'not-a-number', from: '2026-03-31', to: '2026-03-01' };

describe('a GET body is ignored', () => {
    it.each([
        ['/products', false],
        ['/payments/refunds', true],
        [`/stats/sales?${PERIOD}`, true]
    ])('answers GET %s as the bare request does', async (url, staff) => {
        await createProduct();
        const { bearer } = await authenticateAs('admin');
        const headers: Record<string, string> = staff ? { Authorization: bearer } : {};

        const bare = await api().get(url).set(headers);
        const withBody = await api().get(url).set(headers).send(HOSTILE_BODY);

        expect(bare.status).toBe(200);
        expect(withBody.status).toBe(200);
        expect(withBody.body).toEqual(bare.body);
    });
});
