// requires-module: example
/**
 * @module
 * `permitsOnRows` — the per-row answer to "may this caller update or delete THIS row?". The
 * conditions in `authorization.yaml` (`userId: $caller.id`) are the only encoding of "own rows";
 * this asks the same ability the query filter is compiled from, once per row.
 */

import { permitsOnRows } from '@kernel/ability';
import { callerAs } from '../../support/callers';

/** A row owned by `userId`, as the example module's rows carry it. */
const rowOf = (userId: string) => ({ userId, status: 'draft' });

describe('permitsOnRows', () => {
    it('lets an author act on their own row and not on another’s', () => {
        const permits = permitsOnRows(callerAs('editor', 'author-1'), 'Example', [
            'update',
            'delete'
        ]);

        expect(permits(rowOf('author-1'))).toEqual({ update: true, delete: true });
        expect(permits(rowOf('author-2'))).toEqual({ update: false, delete: false });
    });

    it('lets an admin act on anyone’s row', () => {
        const permits = permitsOnRows(callerAs('admin', 'boss'), 'Example', ['update', 'delete']);

        expect(permits(rowOf('author-2'))).toEqual({ update: true, delete: true });
    });

    it('answers no for a caller with no rule for the subject', () => {
        const permits = permitsOnRows(callerAs('customer', 'shopper'), 'Example', [
            'update',
            'delete'
        ]);

        expect(permits(rowOf('shopper'))).toEqual({ update: false, delete: false });
    });

    it('does not let a row pick the tenant: the caller’s own is used', () => {
        const permits = permitsOnRows(callerAs('editor', 'author-1'), 'Example', ['update']);

        expect(permits({ ...rowOf('author-1'), tenantId: 'someone-else' })).toEqual({
            update: true
        });
    });
});
