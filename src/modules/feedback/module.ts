import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/**
 * Contact requests: anyone may file one, admins read and triage them.
 *
 * A leaf in both directions. It records an email address rather than referencing a user, because
 * the form is open to people who have no account — which is also why deleting an account leaves
 * their feedback standing, and why this module needs nothing from `users`.
 */
export default {
    name: 'feedback',
    basePath: '/feedback',
    routes: router,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
