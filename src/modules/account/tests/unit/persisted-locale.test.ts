/**
 * The persisted `locale` on the user document.
 *
 * `Accept-Language` answers "what language is this request in", which is the right source for a
 * response and all a stateless API needs for one. It cannot answer "what language should the
 * email a worker sends at 3am be in", because there is no request to read. This field is that
 * answer, and it only works if it is actually captured at signup and actually writable
 * afterwards — hence both halves below.
 *
 * It is `account`'s spec rather than a central i18n one because signup is what captures the field,
 * and signup is behind this module's routes. The edits go through the `users` barrel, which is the
 * same surface `account` uses in production — it is a second service over the same entity.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import * as authService from '@modules/account/service';
import { userRepository, userService } from '@modules/users';
import { getDefaultLocale, runWithLocale } from '@infrastructure/i18n';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { UserDocument } from '@modules/users';

setupTestDb();

describe('a user’s persisted locale', () => {
    it('is captured from the request they signed up in', async () => {
        const result = await runWithLocale('it', () =>
            authService.signup('nuovo@example.com', 'nuovo', 'Password1!', 'Password1!')
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.locale).toBe('it');
    });

    it('falls back to the boot locale outside a request', async () => {
        const result = await authService.signup(
            'plain@example.com',
            'plain',
            'Password1!',
            'Password1!'
        );

        expect((result as ResponseSuccess<UserDocument>).data!.locale).toBe(getDefaultLocale());
    });

    it('is editable afterwards', async () => {
        const user = await createUser({ email: 'switcher@example.com' });

        const updated = await userService.updateById(String(user._id), { locale: 'it' });

        expect(updated.success).toBe(true);
        expect((updated as ResponseSuccess<UserDocument>).data!.locale).toBe('it');
    });

    it('is left alone by an update that does not mention it', async () => {
        const user = await createUser({ email: 'untouched@example.com' });
        await userService.updateById(String(user._id), { locale: 'it' });

        await userService.updateById(String(user._id), { username: 'renamed' });

        const reloaded = await userRepository.findById(String(user._id));
        expect(reloaded!.locale).toBe('it');
    });

    it('reaches the client, since it is part of the User contract', async () => {
        const user = await createUser({ email: 'exposed@example.com' });
        await userService.updateById(String(user._id), { locale: 'it' });

        const reloaded = await userRepository.findById(String(user._id));

        expect((reloaded!.toJSON() as { locale?: string }).locale).toBe('it');
    });
});
