import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { appConfig } from '@app/config';

/**
 * Guard: the shared Traefik overlay is the one container facing the internet, so what it mounts and
 * how it finds a client are a security property of one file, kept by reading the file on every push.
 *
 * Narrow on purpose: the five decisions that were reasoned about (no Docker socket, routes only,
 * port 80 only redirects, a hop count for the app, a per-client alias with no routing labels), not
 * an inventory of the overlay's keys.
 */

/** The overlay's services, as far as this file reads them. */
interface Overlay {
    services: Record<
        string,
        {
            command?: string[];
            volumes?: string[];
            labels?: string[];
            environment?: Record<string, string>;
            networks?: Record<string, { aliases?: string[] } | null>;
        }
    >;
}

/** Narrows what `yaml`'s `parse` hands back to the shape this file reads. */
const isOverlay = (value: unknown): value is Overlay =>
    typeof value === 'object' && value !== null && 'services' in value;

/**
 * The overlay, parsed with merge keys applied. `logLevel: 'error'` silences the one warning `yaml`
 * gives for compose's own `!reset` tag, which it reads correctly as an empty list anyway.
 * https://eemeli.org/yaml/#options
 */
const parsed: unknown = parse(
    readFileSync(path.join(REPO_ROOT, 'docker-compose.proxy.yml'), 'utf8'),
    {
        merge: true,
        logLevel: 'error'
    }
);
if (!isOverlay(parsed))
    throw new Error('[proxy-overlay] docker-compose.proxy.yml did not parse to an object.');

const { traefik, app } = parsed.services;

/**
 * The value of one Traefik flag written in whole seconds (`--<flag>=135s`), as milliseconds.
 * @param flag - the flag name without the leading dashes
 * @returns milliseconds, or NaN when the flag is missing or not in seconds
 */
const flagMs = (flag: string): number => {
    const entry = (traefik?.command ?? []).find((item) => item.startsWith(`--${flag}=`));
    return Number(entry?.slice(flag.length + 3).replace(/s$/, '')) * 1000;
};

describe('the Traefik overlay', () => {
    /*
     * The Docker API behind the socket is root on the host, and `:ro` only protects the socket file.
     * The file provider reads routes from a directory instead.
     */
    it('mounts no Docker socket and reads routes from a file provider', () => {
        expect(traefik?.volumes?.join('\n')).not.toMatch(/docker\.sock/);
        expect(traefik?.command?.join('\n')).not.toMatch(/--providers\.docker/);
        expect(traefik?.command).toContain('--providers.file.directory=/etc/traefik/dynamic');
        expect(traefik?.command).toContain('--providers.file.watch=true');
    });

    /*
     * `clients/` holds every client's secrets; the routes directory holds nothing but routes.
     */
    it('mounts only the routes directory, read-only, and never the clients', () => {
        const hostMounts = (traefik?.volumes ?? []).filter((volume) => volume.startsWith('.'));

        expect(hostMounts).toEqual(['./traefik/dynamic:/etc/traefik/dynamic:ro']);
    });

    it('makes port 80 redirect to HTTPS and nothing else', () => {
        expect(traefik?.command).toEqual(
            expect.arrayContaining([
                '--entrypoints.web.http.redirections.entryPoint.to=websecure',
                '--entrypoints.web.http.redirections.entryPoint.scheme=https'
            ])
        );
    });

    /*
     * With a hop count of 0 every client is the proxy: the per-address login budgets become
     * site-wide. A client env file that sets its own value must still win, hence `:-`.
     */
    it('gives the app one trusted hop unless the client says otherwise', () => {
        expect(app?.environment?.NODE_TRUST_PROXY_HOPS).toBe('${NODE_TRUST_PROXY_HOPS:-1}');
    });

    /*
     * Client env files are copies of `.env-example`, and Compose's `:-` default applies only to an
     * unset variable: a shipped `NODE_TRUST_PROXY_HOPS=0` would override the overlay's `1`.
     */
    it('is not overridden by a shipped NODE_TRUST_PROXY_HOPS in .env-example', () => {
        const envExample = readFileSync(path.join(REPO_ROOT, '.env-example'), 'utf8');

        expect(envExample).not.toMatch(/^NODE_TRUST_PROXY_HOPS=/m);
    });

    /*
     * Traefik's read limit must outlast the app's, or it cuts a slow upload with no problem body;
     * its idle-to-app limit must be shorter, or it reuses a socket Node already closed (502).
     */
    it('times out reads after the app does and idle connections before it does', () => {
        const {
            NODE_HTTP_REQUEST_TIMEOUT_MS,
            NODE_HTTP_HEADERS_TIMEOUT_MS,
            NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS
        } = appConfig();

        expect(
            flagMs('entrypoints.websecure.transport.respondingTimeouts.readTimeout')
        ).toBeGreaterThanOrEqual(NODE_HTTP_REQUEST_TIMEOUT_MS + NODE_HTTP_HEADERS_TIMEOUT_MS);
        expect(flagMs('serversTransport.forwardingTimeouts.idleConnTimeout')).toBeLessThan(
            NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS
        );
    });

    /*
     * A bare `app` resolves on the shared network to every client's `app`; only the alias is unique.
     */
    it('names the app by a per-client alias and carries no routing labels', () => {
        expect(app?.networks?.proxy?.aliases).toEqual([
            '${COMPOSE_PROJECT_NAME:?set COMPOSE_PROJECT_NAME}-app'
        ]);
        expect(app?.labels).toBeUndefined();
    });
});
