import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/**
 * Guard: the shared Traefik overlay is the one container facing the internet, so what it mounts and
 * how it finds a client are a security property of one file, kept by reading the file on every push.
 *
 * Narrow on purpose: the four decisions that were reasoned about (no Docker socket, routes only,
 * port 80 only redirects, a hop count for the app), not an inventory of the overlay's keys.
 */

const ROOT = path.join(__dirname, '..', '..');

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
const parsed: unknown = parse(readFileSync(path.join(ROOT, 'docker-compose.proxy.yml'), 'utf8'), {
    merge: true,
    logLevel: 'error'
});
if (!isOverlay(parsed))
    throw new Error('[proxy-overlay] docker-compose.proxy.yml did not parse to an object.');

const { traefik, app } = parsed.services;

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
     * A bare `app` resolves on the shared network to every client's `app`; only the alias is unique.
     */
    it('names the app by a per-client alias and carries no routing labels', () => {
        expect(app?.networks?.proxy?.aliases).toEqual([
            '${COMPOSE_PROJECT_NAME:?set COMPOSE_PROJECT_NAME}-app'
        ]);
        expect(app?.labels).toBeUndefined();
    });
});
