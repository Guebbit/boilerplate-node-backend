import { LocaleTenantKind, type LocaleTenant, type LocaleTenantDescriptor } from '@types';

/**
 * The tenants this deployment holds words for — the keyspaces an entry can belong to.
 *
 * A tenant is one consumer of the translation service, authored by one team: this API is a tenant
 * of itself, the frontend it is paired with is another, and a second client would be a third. Two
 * tenants may declare the same key in the same language and mean two unrelated strings, which is
 * why every stored row is identified by (language, tenant, key) and not by the key alone.
 *
 * CONFIGURATION, not data, and deliberately so. Which tenants exist is a deployment fact — it says
 * which clients this API serves copy to — and a table an admin could add rows to would let a typo
 * in an import create a keyspace nobody serves. The ids come from the environment, default to the
 * demo pair, and `GET /locales/tenants` publishes the list so no client has to hardcode it.
 *
 * Exactly one tenant is `backend`: the API's own copy, whose rows are layered over the deployed
 * files by `@infrastructure/i18n` and never leave the API. Every other tenant is a `frontend`,
 * whose rows `GET /locales/{locale}/messages` serves.
 */

/** The id of the API's own tenant — `NODE_LOCALE_TENANT_BACKEND`, `demo-be` by default. */
export const backendTenant = (): LocaleTenant =>
    process.env.NODE_LOCALE_TENANT_BACKEND?.trim() || 'demo-be';

/**
 * The id of the default frontend tenant — `NODE_LOCALE_TENANT_FRONTEND`, `demo-fe` by default.
 *
 * What `GET /locales/{locale}/messages` builds when the client does not say which tenant it is:
 * a frontend paired one-to-one with this API never needs to.
 */
export const frontendTenant = (): LocaleTenant =>
    process.env.NODE_LOCALE_TENANT_FRONTEND?.trim() || 'demo-fe';

/**
 * Further frontend tenants — `NODE_LOCALE_TENANTS_EXTRA`, a comma-separated list of `id=Label`
 * pairs (`mobile=Mobile app,kiosk=Store kiosk`). The label is optional; omitted, the id is shown.
 */
const extraFrontendTenants = (): LocaleTenantDescriptor[] =>
    (process.env.NODE_LOCALE_TENANTS_EXTRA ?? '')
        .split(',')
        .map((pair) => pair.trim())
        .filter((pair) => pair.length > 0)
        .map((pair) => {
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
