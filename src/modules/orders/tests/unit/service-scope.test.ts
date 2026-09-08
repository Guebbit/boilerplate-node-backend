/**
 * @module
 * Order read scoping — `orderService.callerScope`, the authorization boundary for order reads.
 * Admin gets `undefined` (no restriction); anyone else gets a filter on their own `userId`
 * excluding soft-deleted rows; no auth context *throws*, rather than widening the scope. The
 * filter's `userId` must be a real BSON `ObjectId`, not a string — `$match` inside an aggregation
 * skips schema casting, so a string id reads as "no orders" rather than as an error; the coercion
 * lives in `orderRepository.ownerScope`.
 */

import { Types } from 'mongoose';
import { orderService } from '@modules/orders';
import { asCustomer, asOwner } from '../../../../../tests/support/callers';

const USER_ID = '507f1f77bcf86cd799439011';

describe('orderService.callerScope', () => {
    it('returns undefined for an admin, so the caller applies no restriction', () => {
        const scope = orderService.callerScope(asOwner(USER_ID));

        // Not `toBeFalsy()`: `{}` is falsy-adjacent in review but would spread into a filter
        // that matches nothing. Only `undefined` spreads to nothing.
        expect(scope).toBeUndefined();
    });

    it('restricts a non-admin to their own userId', () => {
        const scope = orderService.callerScope(asCustomer(USER_ID));

        expect(scope).toEqual({
            userId: new Types.ObjectId(USER_ID),
            deletedAt: { $exists: false }
        });
    });

    it('hides soft-deleted orders from their own owner', () => {
        // The second axis of the scope, and the one an ownership-only assertion would miss: a
        // soft-deleted order still belongs to the caller, so `userId` alone still matches it.
        // `$exists: false` rather than `null` — `remove` unsets the field to restore.
        const scope = orderService.callerScope(asCustomer(USER_ID));

        expect(scope!.deletedAt).toEqual({ $exists: false });
    });

    it('lets an admin see soft-deleted orders, by restricting nothing', () => {
        expect(orderService.callerScope(asOwner(USER_ID))).toBeUndefined();
    });

    it('restricts a caller whose role holds no wide key', () => {
        // A role that does not grant unconditional reads must narrow, never widen: the question
        // is asked of the ability, so "no rule" and "a conditional rule" both mean restricted.
        // This is the fail-safe direction.
        const scope = orderService.callerScope(asCustomer(USER_ID));

        expect(scope).toEqual({
            userId: new Types.ObjectId(USER_ID),
            deletedAt: { $exists: false }
        });
    });

    it('emits a BSON ObjectId rather than a string, so aggregation $match can compare it', () => {
        const scope = orderService.callerScope(asCustomer(USER_ID));

        // The distinction that a `toEqual` on ids alone would miss: a plain string would satisfy
        // a loose comparison but silently match zero documents inside a pipeline.
        expect(scope!.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(scope!.userId)).toBe(USER_ID);
    });

    it('throws when there is no auth context at all', () => {
        // The documented safe direction: an unauthenticated request must error out rather than
        // fall through to an unscoped query. `toObjectId('')` is what enforces it.
        expect(() => orderService.callerScope(undefined)).toThrow();
    });

    it('throws when the auth context carries no id', () => {
        expect(() => orderService.callerScope(asCustomer(''))).toThrow();
    });

    it('throws on a malformed id instead of scoping to nothing', () => {
        expect(() => orderService.callerScope(asCustomer('not-an-object-id'))).toThrow();
    });
});
