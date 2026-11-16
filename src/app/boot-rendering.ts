/**
 * @module
 * What turns a key into the words a person reads: translation files, mail templates and the copy
 * an admin edited. The web app and every scheduled job boot it, so a mail reads the same wherever
 * it is built.
 *
 * Runs after `registerModules` (the overlay reader is installed by `locales`' `onRegistered`) and
 * after the database connects (the overlay is read from it).
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import { registerTemplateDirectories } from '@infrastructure/adapters/mailer';
import { bootI18n, refreshLocaleOverrides } from '@infrastructure/i18n';
import { enabledModuleDirectories } from '../modules';

/**
 * Load the translation files, register the mail templates, then layer the admin's edits on top.
 *
 * Order matters: the overlay patches resources `bootI18n` just loaded. The refresh never rejects
 * and an empty overlay is a working state, so it is awaited only for ordering.
 */
export const bootRendering = (): Promise<void> =>
    /**
     * Modules carry their own copy, so deleting one deletes its strings. `infrastructure` sits
     * below every module and cannot go looking for them, so the paths are handed in.
     */
    bootI18n(enabledModuleDirectories('locales'))
        .then(() => {
            registerTemplateDirectories(enabledModuleDirectories('templates'));
        })
        .then(() => refreshLocaleOverrides());
