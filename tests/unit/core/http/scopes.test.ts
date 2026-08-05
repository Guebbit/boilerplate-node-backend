/**
 * Query scoping — `src/core/http/scopes.ts`.
 *
 * `userScope()` is the authorization boundary for data reads: it is the difference between a
 * user seeing their own orders and seeing everyone's. It has three documented properties, and
 * each one is a distinct way to leak data if it breaks:
 *
 *   1. admin  → `undefined`, meaning "no restriction" (the caller spreads it).
 *   2. anyone else → a filter on their own `userId`.
 *   3. no auth context → *throws*, deliberately, rather than widening the scope.
 *
 * Property 2 additionally requires a real BSON `ObjectId`, not a string: `$match` inside an
 * aggregation pipeline does not apply schema casting, so a string id matches nothing and reads
 * as "you have no orders" instead of as an error.
 */

import { Types } from 'mongoose';
import type { Request } from 'express';
import { userScope } from '@core/http/scopes';

/** Minimal Request stand-in — `userScope` only ever touches `authContext`. */
const requestWith = (authContext?: Partial<Request['authContext']>): Request =>
    ({ authContext }) as Request;

const USER_ID = '507f1f77bcf86cd799439011';

describe('userScope', () => {
    it('returns undefined for an admin, so the caller applies no restriction', () => {
        const scope = userScope(requestWith({ id: USER_ID, admin: true }));

        // Not `toBeFalsy()`: `{}` is falsy-adjacent in review but would spread into a filter
        // that matches nothing. Only `undefined` spreads to nothing.
        expect(scope).toBeUndefined();
    });

    it('restricts a non-admin to their own userId', () => {
        const scope = userScope(requestWith({ id: USER_ID, admin: false }));

        expect(scope).toEqual({ userId: new Types.ObjectId(USER_ID) });
    });

    it('restricts a caller whose admin flag is absent entirely', () => {
        // `admin` is optional on the context; absent must mean "not an admin", never "unknown,
        // so allow". This is the fail-safe direction.
        const scope = userScope(requestWith({ id: USER_ID }));

        expect(scope).toEqual({ userId: new Types.ObjectId(USER_ID) });
    });

    it('emits a BSON ObjectId rather than a string, so aggregation $match can compare it', () => {
        const scope = userScope(requestWith({ id: USER_ID, admin: false }));

        // The distinction that a `toEqual` on ids alone would miss: a plain string would satisfy
        // a loose comparison but silently match zero documents inside a pipeline.
        expect(scope!.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(scope!.userId)).toBe(USER_ID);
    });

    it('throws when there is no auth context at all', () => {
        // The documented safe direction: an unauthenticated request must error out rather than
        // fall through to an unscoped query. `new Types.ObjectId('')` is what enforces it.
        expect(() => userScope(requestWith(undefined))).toThrow();
    });

    it('throws when the auth context carries no id', () => {
        expect(() => userScope(requestWith({ admin: false }))).toThrow();
    });

    it('throws on a malformed id instead of scoping to nothing', () => {
        expect(() => userScope(requestWith({ id: 'not-an-object-id', admin: false }))).toThrow();
    });
});
