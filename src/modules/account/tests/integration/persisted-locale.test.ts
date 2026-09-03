/**
 * @module
 * The persisted `locale` on the user document. `Accept-Language` answers "what language is
 * this request in" — enough for a response, but not for "what language should the email a
 * worker sends at 3am be in", since there is no request to read then. This field is that
 * answer, captured at signup and writable afterwards — hence both halves below — and it lives
 * in `account` because signup, which captures it, is behind this module's routes.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import * as accountService from '@modules/account/services';
import { userRepository, userService } from '@modules/users';
import { getDefaultLocale, runWithLocale } from '@infrastructure/i18n';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { UserDocument } from '@modules/users';

setupTestDb();

describe('a user’s persisted locale', () => {
    it('is captured from the request they signed up in', async () => {
        const result = await runWithLocale('it', () =>
            accountService.signup(
                'nuovo@example.com',
                'nuovo',
                'Password1!',
                'Password1!',
                undefined,
                true,
                undefined,
                undefined,
                undefined,
                testCallerContext
            )
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.locale).toBe('it');
    });

    it('falls back to the boot locale outside a request', async () => {
        const result = await accountService.signup(
            'plain@example.com',
            'plain',
            'Password1!',
            'Password1!',
            undefined,
            true,
            undefined,
            undefined,
            undefined,
            testCallerContext
        );

        expect((result as ResponseSuccess<UserDocument>).data!.locale).toBe(getDefaultLocale());
    });

    it('is editable afterwards', async () => {
        const user = await createUser({ email: 'switcher@example.com' });

        const updated = await userService.updateById(
            String(user._id),
            { locale: 'it' },
            testCallerContext
        );

        expect(updated.success).toBe(true);
        expect((updated as ResponseSuccess<UserDocument>).data!.locale).toBe('it');
    });

    it('is left alone by an update that does not mention it', async () => {
        const user = await createUser({ email: 'untouched@example.com' });
        await userService.updateById(String(user._id), { locale: 'it' }, testCallerContext);

        await userService.updateById(String(user._id), { username: 'renamed' }, testCallerContext);

        const reloaded = await userRepository.findById(String(user._id));
        expect(reloaded!.locale).toBe('it');
    });

    it('reaches the client, since it is part of the User contract', async () => {
        const user = await createUser({ email: 'exposed@example.com' });
        await userService.updateById(String(user._id), { locale: 'it' }, testCallerContext);

        const reloaded = await userRepository.findById(String(user._id));

        expect((reloaded!.toJSON() as { locale?: string }).locale).toBe('it');
    });
});
