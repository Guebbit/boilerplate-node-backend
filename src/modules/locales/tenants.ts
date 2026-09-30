/**
 * @module
 * The tenants this deployment holds words for — the keyspaces an entry can belong to. A tenant
 * is one consumer of the translation service, identified by (language, tenant, key) so two
 * tenants can share a key and mean two unrelated strings. The id set is CONFIGURATION, not data:
 * letting an admin add rows would let an import typo create a keyspace nobody serves. Exactly one
 * tenant is `backend` — the API's own copy, layered over deployed files by `@infrastructure/i18n`
 * — every other is a `frontend`, and `GET /locales/tenants` publishes the whole list.
 */

import { LocaleTenantKind, type LocaleTenant, type LocaleTenantDescriptor } from '@types';
import { defineConfig } from '@infrastructure/config/define';
import { csv, text } from '@infrastructure/config/fields';

/** The tenant ids this deployment holds words for. */
export const localesConfig = defineConfig({
    name: 'locales-tenants',
    shape: {
        NODE_LOCALE_TENANT_BACKEND: text({
            default: 'demo-be',
            describe: 'The id of the API’s own translation tenant.'
        }),
        NODE_LOCALE_TENANT_FRONTEND: text({
            default: 'demo-fe',
            describe: 'The id of the default frontend translation tenant.'
        }),
        NODE_LOCALE_TENANTS_EXTRA: csv({
            describe: 'Further frontend tenants as `id=Label` pairs, comma-separated.'
        })
    }
});

/** The id of the API's own tenant — `NODE_LOCALE_TENANT_BACKEND`, `demo-be` by default. */
export const backendTenant = (): LocaleTenant => localesConfig().NODE_LOCALE_TENANT_BACKEND;

/**
 * The id of the default frontend tenant — `NODE_LOCALE_TENANT_FRONTEND`, `demo-fe` by default.
 * Used when the client omits which tenant it wants, since a frontend paired one-to-one with this
 * API never needs to say.
 */
export const frontendTenant = (): LocaleTenant => localesConfig().NODE_LOCALE_TENANT_FRONTEND;

/**
 * Further frontend tenants — `NODE_LOCALE_TENANTS_EXTRA`, a comma-separated list of `id=Label`
 * pairs (`mobile=Mobile app,kiosk=Store kiosk`). The label is optional; omitted, the id is shown.
 */
const extraFrontendTenants = (): LocaleTenantDescriptor[] =>
    localesConfig().NODE_LOCALE_TENANTS_EXTRA.map((pair) => {
        const [id, label] = pair.split('=').map((part) => part.trim());
        return { id, label: label || id, kind: LocaleTenantKind.frontend };
    });

/** Every tenant, the backend one first, then the default frontend, then the extras. */
export const listTenants = (): LocaleTenantDescriptor[] => {
    const backend = backendTenant();
    const frontend = frontendTenant();
    const rows: LocaleTenantDescriptor[] = [
        { id: backend, label: 'API', kind: LocaleTenantKind.backend },
        { id: frontend, label: 'Frontend', kind: LocaleTenantKind.frontend },
        ...extraFrontendTenants()
    ];
    // A tenant named twice in the environment is one tenant; the first spelling wins.
    const seen = new Set<string>();
    return rows.filter(({ id }) => (seen.has(id) ? false : (seen.add(id), true)));
};

/** Every frontend tenant's id — the rows `entryCount` counts and the messages route may serve. */
export const frontendTenantIds = (): LocaleTenant[] =>
    listTenants()
        .filter(({ kind }) => kind === LocaleTenantKind.frontend)
        .map(({ id }) => id);

/** Whether an id names a tenant this deployment knows. */
export const isKnownTenant = (id: string): boolean => listTenants().some((row) => row.id === id);

/** Whether an id names a frontend tenant — one whose dictionary may be served. */
export const isFrontendTenant = (id: string): boolean => frontendTenantIds().includes(id);
