/**
 * @module
 * What webhook subscribers are told about a person: the public event name and its payload,
 * projected from the domain event by the module's manifest. Ids only, never a value.
 */

import usersModule from '../../module';
import { USER_ERASED, USER_PROFILE_CHANGED } from '../../events';

// `as never`: the slot takes `never` so one registry can hold every module's projections.
describe('the users module’s public events', () => {
    it('tells subscribers an account was erased, with its id alone', () => {
        const target = usersModule.publicEvents[USER_ERASED];

        const projected = target.toPublicEvent({ userId: 'u1', email: 'a@b.c' } as never);

        expect(projected).toEqual({ eventType: 'user.erased', data: { userId: 'u1' } });
    });

    it('tells subscribers which fields were rectified, never their values', () => {
        const target = usersModule.publicEvents[USER_PROFILE_CHANGED];

        const projected = target.toPublicEvent({ userId: 'u1', changed: ['email'] } as never);

        expect(projected).toEqual({
            eventType: 'user.updated',
            data: { userId: 'u1', changed: ['email'] }
        });
    });
});
