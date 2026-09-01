#!/usr/bin/env tsx
/**
 * @module
 * Three-stage inactivity reaper — `npm run reap:inactive-accounts`. GDPR_FIX.md G5: Art. 5(1)(e)
 * allows keeping personal data only as long as the purpose needs it, and an account nobody has
 * touched in years has no live purpose.
 *
 * **Disabled by default** (`NODE_INACTIVE_ACCOUNT_DAYS=0`). Automatically deleting a real
 * person's account is a decision only the controller running this deployment can make — a
 * boilerplate that ships it enabled will eventually delete someone's live account.
 *
 * "Last active" is the latest refresh-token exchange (`tokens[].lastUsedAt`, already stamped on
 * every refresh) or `createdAt` for an account that has never redeemed one — see
 * `LAST_ACTIVE_EXPR` in `users/repository.ts`. Three stages, one `NODE_INACTIVE_ACCOUNT_DAYS`
 * threshold and one fixed grace between them:
 *
 *   inactive N days  → email warning, `inactivityWarnedAt` stamped
 *   + GRACE_DAYS more, still no login → soft delete (`userService.remove(user, false)`)
 *   + GRACE_DAYS more since the soft delete → hard delete (`userService.remove(user, true)`),
 *     which emits `USER_DELETED` and cascades exactly like an admin's own hard delete
 *
 * `inactivityWarnedAt` is what tells stage three's candidates apart from an account an admin
 * soft-deleted for an unrelated reason — see the field's own doc comment on `UserRecord`. A
 * returning user is naturally excluded from every later stage: `LAST_ACTIVE_EXPR` is recomputed
 * fresh on each run, not read off the stale warning, so signing back in undoes the clock. The one
 * gap this leaves: someone who returns and later goes inactive AGAIN keeps their old
 * `inactivityWarnedAt` and so gets no fresh warning email before stage two — acceptable for a
 * disabled-by-default safety net, not for a paragraph pretending to be the "own plan" the source
 * document says this deserves.
 *
 * Meant to run periodically (the same cron container that runs `reap:quarantine` and
 * `reap:orders`), never on every boot.
 *
 * See: GDPR_FIX.md G5, docs/reference/ops.md
 */
import 'dotenv/config';
import i18next from 'i18next';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    registerLocaleDirectories
} from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../src/modules';
import { userRepository, userService, type UserDocument } from '@modules/users';
import { inactivityWarningEmail } from '@modules/account/emails';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { runScript } from '../db/run-script';

/** Fixed pause between stages — not configurable, to keep this script's one dial to a single day count. */
const GRACE_DAYS = 30;

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Bring up just enough of the app's own boot sequence (`app.ts`'s `startServer`) to render
 * translated email copy outside the HTTP process: module locale directories, then `i18next.init`.
 * Nothing else `startServer` does (cache, queue readiness, route mounting) is this script's
 * concern.
 */
const initI18n = (): Promise<unknown> => {
    registerLocaleDirectories(
        enabledModules
            .map((appModule) => appModule.locales)
            .filter((directory) => directory !== undefined)
    );
    return i18next.init({
        lng: getDefaultLocale(),
        fallbackLng: getFallbackLocale(),
        supportedLngs: listSupportedLocales(),
        resources: loadLocaleResources()
    });
};

/** Stage one: warn, and stamp so this account is not warned twice. */
const warn = (user: UserDocument): Promise<void> => {
    const mail = inactivityWarningEmail(
        user.locale ?? getDefaultLocale(),
        user.username,
        GRACE_DAYS
    );
    return enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data).then(
        () => {
            user.inactivityWarnedAt = new Date();
            return userRepository.save(user).then(() => undefined);
        }
    );
};

const main = async (): Promise<void> => {
    const inactiveDays = environmentNumber('NODE_INACTIVE_ACCOUNT_DAYS', 0);
    if (inactiveDays <= 0) {
        logger.info({
            message: 'Inactive-account reaper disabled (NODE_INACTIVE_ACCOUNT_DAYS <= 0).'
        });
        return;
    }

    await start();
    registerModules(enabledModules);
    await initI18n();

    const toWarn = await userRepository.findInactiveUnwarned(daysAgo(inactiveDays));
    for (const user of toWarn) await warn(user);

    const toSoftDelete = await userRepository.findWarnedStillInactive(
        daysAgo(inactiveDays + GRACE_DAYS)
    );
    for (const user of toSoftDelete) await userService.remove(user, false);

    const toHardDelete = await userRepository.findReaperSoftDeletedPastGrace(daysAgo(GRACE_DAYS));
    for (const user of toHardDelete) await userService.remove(user, true);

    logger.info({
        message: 'Inactive-account reaper run complete.',
        warned: toWarn.length,
        softDeleted: toSoftDelete.length,
        hardDeleted: toHardDelete.length
    });
};

void runScript(main, () => Promise.all([stopDatabase(), stopQueue()]));
