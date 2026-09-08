/**
 * @module
 * `accessibleFilter` — the rules, compiled into the filter a collection is actually read with.
 *
 * The unit that replaces the four hand-written fragments, so these assert the two properties that
 * used to be somebody's job to remember: an unrestricted role narrows nothing, and a caller with
 * no rule at all gets a filter that matches nothing rather than a filter that is missing.
 */

import { accessibleFilter } from '@kernel/access/query';
import { Types } from 'mongoose';
import { asCustomer, asManager, asOwner, asOperator } from '../../support/callers';

describe('accessibleFilter', () => {
    it('narrows nothing for a role that reads everything', () => {
        // `{}` rather than `undefined`: "no conditions" and "no rules" must not look alike to the
        // caller spreading this into a query.
        expect(accessibleFilter(asOwner(), 'Product')).toEqual({});
    });

    it('narrows a customer to the rows their key carries a condition for', () => {
        // Both halves of the rule: what a visitor may see, and what has not been taken away.
        expect(accessibleFilter(asCustomer(), 'Product')).toEqual({
            active: true,
            deletedAt: null
        });
    });

    it('narrows an owner-scope read to the caller’s own rows', () => {
        const filter = accessibleFilter(asCustomer('507f1f77bcf86cd799439011'), 'Order');

        // The owner arrives as an ObjectId, not the string the caller carries: left as a string
        // the filter silently matches nothing, which is a missing restriction wearing the
        // opposite disguise.
        expect(filter).toEqual({
            userId: new Types.ObjectId('507f1f77bcf86cd799439011'),
            deletedAt: null
        });
    });

    it('matches nothing for a caller with no rule for the subject', () => {
        // CASL's own `EMPTY_RESULT_QUERY`. Fails closed by construction — the point of compiling
        // the rules rather than assembling a fragment, where "no rule" produced no filter at all.
        expect(accessibleFilter(asOperator(), 'Order')).toEqual({ $expr: { $eq: [0, 1] } });
    });

    it('matches nothing for an anonymous caller reading somebody’s orders', () => {
        expect(accessibleFilter(undefined, 'Order')).toEqual({ $expr: { $eq: [0, 1] } });
    });

    it('lets a guest read the live catalogue', () => {
        expect(accessibleFilter(undefined, 'Product')).toEqual({ active: true, deletedAt: null });
    });

    it('drops the tenant discriminator, which this deployment does not store', () => {
        // The model is tenant-aware and its conformance cases prove it; these collections are not
        // partitioned, because the boilerplate ships one shop. Compiling `tenantId` into a query
        // over a collection with no such field would match nothing and lock everybody out.
        expect(JSON.stringify(accessibleFilter(asManager(), 'Product'))).not.toContain('tenantId');
    });

    it('answers a write action from the same rules as a read', () => {
        // One artefact, asked twice. A key that grants more returns more without anybody editing
        // a filter, which is the whole reason this replaced four hand-written fragments.
        expect(accessibleFilter(asManager(), 'Product', 'update')).toEqual({});
        expect(accessibleFilter(asCustomer(), 'Product', 'update')).toEqual({
            $expr: { $eq: [0, 1] }
        });
    });
});
