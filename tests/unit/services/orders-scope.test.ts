/**
 * Order read scoping — `orderService.callerScope`.
 *
 * The authorization boundary for order reads: it is the difference between a user seeing their
 * own orders and seeing everyone's, and between seeing a soft-deleted order and not. It has three
 * documented properties, and each one is a distinct way to leak data if it breaks:
 *
 *   1. admin  → `undefined`, meaning "no restriction" (the caller spreads it).
 *   2. anyone else → a filter on their own `userId`, excluding soft-deleted rows.
 *   3. no auth context → *throws*, deliberately, rather than widening the scope.
 *
 * Property 2 additionally requires a real BSON `ObjectId`, not a string: `$match` inside an
 * aggregation pipeline does not apply schema casting, so a string id matches nothing and reads
 * as "you have no orders" instead of as an error. The coercion itself lives in
 * `orderRepository.ownerScope`, which `visibleScope` composes; these assert the behaviour
 * survives both delegations.
 */

import { Types } from 'mongoose';
import { orderService } from '@services/orders';

const USER_ID = '507f1f77bcf86cd799439011';

describe('orderService.callerScope', () => {
    it('returns undefined for an admin, so the caller applies no restriction', () => {
        const scope = orderService.callerScope({ id: USER_ID, admin: true });

        // Not `toBeFalsy()`: `{}` is falsy-adjacent in review but would spread into a filter
        // that matches nothing. Only `undefined` spreads to nothing.
        expect(scope).toBeUndefined();
    });

    it('restricts a non-admin to their own userId', () => {
        const scope = orderService.callerScope({ id: USER_ID, admin: false });

        expect(scope).toEqual({
            userId: new Types.ObjectId(USER_ID),
            deletedAt: { $exists: false }
        });
    });

    it('hides soft-deleted orders from their own owner', () => {
        // The second axis of the scope, and the one an ownership-only assertion would miss: a
        // soft-deleted order still belongs to the caller, so `userId` alone still matches it.
        // `$exists: false` rather than `null` — `remove` unsets the field to restore.
        const scope = orderService.callerScope({ id: USER_ID, admin: false });

        expect(scope!.deletedAt).toEqual({ $exists: false });
    });

    it('lets an admin see soft-deleted orders, by restricting nothing', () => {
        expect(orderService.callerScope({ id: USER_ID, admin: true })).toBeUndefined();
    });

    it('restricts a caller whose admin flag is absent entirely', () => {
        // `admin` is optional on the context; absent must mean "not an admin", never "unknown,
        // so allow". This is the fail-safe direction.
        const scope = orderService.callerScope({ id: USER_ID });

        expect(scope).toEqual({
            userId: new Types.ObjectId(USER_ID),
            deletedAt: { $exists: false }
        });
    });

    it('emits a BSON ObjectId rather than a string, so aggregation $match can compare it', () => {
        const scope = orderService.callerScope({ id: USER_ID, admin: false });

        // The distinction that a `toEqual` on ids alone would miss: a plain string would satisfy
        // a loose comparison but silently match zero documents inside a pipeline.
        expect(scope!.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(scope!.userId)).toBe(USER_ID);
    });

    it('throws when there is no auth context at all', () => {
        // The documented safe direction: an unauthenticated request must error out rather than
        // fall through to an unscoped query. `toObjectId('')` is what enforces it.
        // eslint-disable-next-line unicorn/no-useless-undefined -- the absent argument is the case
        expect(() => orderService.callerScope(undefined)).toThrow();
    });

    it('throws when the auth context carries no id', () => {
        expect(() => orderService.callerScope({ admin: false })).toThrow();
    });

    it('throws on a malformed id instead of scoping to nothing', () => {
        expect(() => orderService.callerScope({ id: 'not-an-object-id', admin: false })).toThrow();
    });
});
