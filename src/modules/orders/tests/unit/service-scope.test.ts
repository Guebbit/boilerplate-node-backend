/**
 * @module
 * Order read scoping — `orderService.callerScope`, the authorization boundary for order reads.
 *
 * Compiled from the caller's RULES rather than assembled here: a role that reads everything gets
 * `{}`, anyone else gets a filter on their own `userId` excluding soft-deleted rows, and a caller
 * with no identity gets a filter that matches nothing.
 *
 * TWO SHAPES ARE WORTH ASSERTING rather than assuming. Unrestricted is `{}`, not `undefined` —
 * both spread into a query as no restriction, and `{}` is what "these are the conditions, and
 * there are none" honestly looks like. And a caller with no identity compiles to CASL's
 * `EMPTY_RESULT_QUERY` rather than raising: the request answers an empty list, not a 500, and the
 * fail-closed property — a gap can never widen the read — is reached by a filter that matches
 * nothing.
 *
 * The filter's `userId` must be a real BSON `ObjectId`, not a string — `$match` inside an
 * aggregation skips schema casting, so a string id reads as "no orders" rather than as an error.
 */

import { Types } from 'mongoose';
import { orderService } from '@modules/orders';
import { asCustomer, asOwner } from '../../../../../tests/support/callers';

const USER_ID = '507f1f77bcf86cd799439011';

/** What CASL compiles a caller with no matching rule to. */
const MATCHES_NOTHING = { $expr: { $eq: [0, 1] } };

describe('orderService.callerScope', () => {
    it('applies no restriction for a role that reads everything', () => {
        expect(orderService.callerScope(asOwner(USER_ID))).toEqual({});
    });

    it('restricts a customer to their own userId', () => {
        expect(orderService.callerScope(asCustomer(USER_ID))).toEqual({
            userId: new Types.ObjectId(USER_ID),
            deletedAt: null
        });
    });

    it('hides soft-deleted orders from their own owner', () => {
        // Two axes in one rule: `userId` answers "whose", `deletedAt` answers "still there". The
        // wide key carries neither, which is how staff read a soft-deleted order to restore it.
        expect(orderService.callerScope(asCustomer(USER_ID))).toHaveProperty('deletedAt', null);
    });

    it('lets a role that reads everything see soft-deleted orders', () => {
        expect(orderService.callerScope(asOwner(USER_ID))).not.toHaveProperty('deletedAt');
    });

    it('matches nothing when there is no auth context at all', () => {
        // The load-bearing case. Returning `{}` here — or omitting the owner clause — would widen
        // an anonymous request to every user's orders without failing anything.
        expect(orderService.callerScope(undefined)).toEqual(MATCHES_NOTHING);
    });

    it('matches nothing for a caller whose identity is missing', () => {
        // A condition whose placeholder cannot be resolved drops its whole rule rather than
        // resolving to `{ userId: null }`, which is a perfectly good filter over unowned rows.
        expect(orderService.callerScope(asCustomer(''))).toEqual(MATCHES_NOTHING);
    });
});
