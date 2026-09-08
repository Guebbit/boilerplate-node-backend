/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. Records an email address
 * rather than referencing a user, since the form is open to people with no account — which is
 * also why deleting an account leaves their feedback standing. A leaf in both directions.
 *
 * See: docs/modules/feedback.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: public contact form, admin-only triage. */
export default {
    name: 'feedback',
    basePath: '/feedback',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['feedback.read', 'feedback.update', 'feedback.delete', 'feedback.manage'],
    routes: router,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
