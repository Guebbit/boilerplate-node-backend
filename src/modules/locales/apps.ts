/**
 * @module
 * The apps this deployment holds words for — the keyspaces an entry can belong to. An app
 * is one consumer of the translation service, identified by (language, app, key) so two
 * apps can share a key and mean two unrelated strings. The id set is CONFIGURATION, not data:
 * letting an admin add rows would let an import typo create a keyspace nobody serves. Exactly one
 * app is `backend` — the API's own copy, layered over deployed files by `@infrastructure/i18n`
 * — every other is a `frontend`, and `GET /locales/apps` publishes the whole list.
 */

import { LocaleAppKind, type LocaleApp, type LocaleAppDescriptor } from '@types';
import { localesConfig } from './config';

/** The id of the API's own app — `NODE_LOCALE_APP_BACKEND`, `demo-be` by default. */
export const backendApp = (): LocaleApp => localesConfig().NODE_LOCALE_APP_BACKEND;

/**
 * The id of the default frontend app — `NODE_LOCALE_APP_FRONTEND`, `demo-fe` by default.
 * Used when the client omits which app it wants, since a frontend paired one-to-one with this
 * API never needs to say.
 */
export const frontendApp = (): LocaleApp => localesConfig().NODE_LOCALE_APP_FRONTEND;

/**
 * Further frontend apps — `NODE_LOCALE_APPS_EXTRA`, a comma-separated list of `id=Label`
 * pairs (`mobile=Mobile app,kiosk=Store kiosk`). The label is optional; omitted, the id is shown.
 */
const extraFrontendApps = (): LocaleAppDescriptor[] =>
    localesConfig().NODE_LOCALE_APPS_EXTRA.map((pair) => {
        const [id, label] = pair.split('=').map((part) => part.trim());
        return { id, label: label || id, kind: LocaleAppKind.frontend };
    });

/** Every app, the backend one first, then the default frontend, then the extras. */
export const listApps = (): LocaleAppDescriptor[] => {
    const backend = backendApp();
    const frontend = frontendApp();
    const rows: LocaleAppDescriptor[] = [
        { id: backend, label: 'API', kind: LocaleAppKind.backend },
        { id: frontend, label: 'Frontend', kind: LocaleAppKind.frontend },
        ...extraFrontendApps()
    ];
    // An app named twice in the environment is one app; the first spelling wins.
    const seen = new Set<string>();
    return rows.filter(({ id }) => (seen.has(id) ? false : (seen.add(id), true)));
};

/** Every frontend app's id — the rows `entryCount` counts and the messages route may serve. */
export const frontendAppIds = (): LocaleApp[] =>
    listApps()
        .filter(({ kind }) => kind === LocaleAppKind.frontend)
        .map(({ id }) => id);

/** Whether an id names an app this deployment knows. */
export const isKnownApp = (id: string): boolean => listApps().some((row) => row.id === id);

/** Whether an id names a frontend app — one whose dictionary may be served. */
export const isFrontendApp = (id: string): boolean => frontendAppIds().includes(id);
