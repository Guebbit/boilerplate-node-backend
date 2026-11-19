/**
 * @module
 * What every suite that boots the real app as a child process shares: a free port, a wait for the
 * listener, an environment that boots like a fresh checkout, a marker watch over the child's
 * output and one way to stop it. Used by `tests/replicas/`.
 */

import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import { retryUntil } from '@tests/eventually';

/**
 * A port nobody is listening on.
 *
 * Asked for by binding to `0` and reading back what the OS assigned, rather than picking a number
 * and hoping. A fixed port is how two concurrent runs come to fight over one socket, and the loser
 * fails with `EADDRINUSE` naming nothing that explains it.
 */
export const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.on('error', reject);
        probe.listen(0, () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });

/** Resolves once something is accepting connections on `port`, or rejects after `timeoutMs`. */
export const waitForListening = (port: number, timeoutMs: number): Promise<void> =>
    retryUntil(
        () =>
            new Promise<void>((resolve, reject) => {
                const socket = net.connect(port, '127.0.0.1');
                socket.on('connect', () => {
                    socket.end(() => resolve());
                });
                socket.on('error', reject);
            }),
        timeoutMs,
        250
    ).catch((error: unknown) => {
        throw new Error(
            `The child never listened on ${String(port)} within ${String(timeoutMs)}ms: ${String(error)}`
        );
    });

/**
 * The environment a child needs to boot the way a fresh checkout does, over the caller's own.
 * Used by the single-process copies of `tests/replicas`.
 *
 * @param options - the port the child listens on and the database it is handed
 */
export const bootableEnvironment = ({
    port,
    dbUri
}: {
    port: number;
    dbUri: string;
}): Record<string, string | undefined> => ({
    ...process.env,
    /**
     * NOT `test`: `assertModuleConfig` (`kernel/module-config.ts`) skips its
     * presence checks under `NODE_ENV=test`, and this suite wants them run for real
     * against the secrets set below.
     */
    NODE_ENV: 'development',
    NODE_PORT: String(port),
    PORT: String(port),
    NODE_DB_URI: dbUri,
    NODE_TOKEN_ACCESS: '84860f6e3faa80b96e22593ea147c55d721af62475d82804a40610b892e84f80',
    NODE_TOKEN_REFRESH: '7097d82e55f0e74f39c83dbaab4b2197dc63b4a560559ffa9c104c7aee5ef290',
    /**
     * `NODE_ENV: 'development'` above means `assertModuleConfig` runs for real —
     * unlike every other suite, which sets `NODE_ENV=test` and skips it. A local
     * `.env` (via `dotenv/config` in `src/app.ts`) supplies these on a dev machine;
     * CI has none, so the child refuses to boot without them
     * (`src/kernel/module-config.ts`).
     */
    NODE_URL: `http://127.0.0.1:${String(port)}`,
    NODE_TOTP_ENCRYPTION_KEY: '92f71a95c55be9af2dace04afc34b7b8da824f58b7225bc8e289da7f6677581a',
    NODE_WEBHOOK_SECRET_ENCRYPTION_KEY:
        'd31c29a41dec73b1cb2a6c16030c377e997176fee0fa4a2101a623f6093a44a7',
    NODE_PII_ENCRYPTION_KEY: 'bdb9857044f9d079163b02211f0c7415a971033780165f3e37667a0a2fe01359',
    /**
     * The shop's identity and VAT rates are required at boot too
     * (`shop/config.ts`) — the invoice and the withdrawal notice print them. Same
     * values `.env-example` ships, so the child boots the way a fresh checkout does.
     */
    NODE_LEGAL_COUNTRY: 'IT',
    NODE_SHOP_TIMEZONE: 'Europe/Rome',
    NODE_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_LEGAL_STREET: 'Via Roma 1',
    NODE_LEGAL_CITY: 'Milano',
    NODE_LEGAL_ZIP: '20100',
    NODE_SUPPORT_EMAIL: 'support@example.com',
    NODE_LEGAL_PHONE: '+39 02 1234567',
    NODE_VAT_RATE_DEFAULT: '0.22',
    NODE_VAT_RATE_REDUCED: '0.10',
    /**
     * The access line is `info`: a developer's `.env` set higher would hide it, and
     * the ready line (`Server listening on port`, waited for in `tests/replicas/support/copies.ts`)
     * would never be written.
     */
    NODE_LOG_LEVEL: 'info'
});

/**
 * Watches a child's output for a marker line, counting every occurrence.
 *
 * `tail` carries the end of each chunk forward so a marker split between two `data` events is still
 * seen. It holds one character LESS than the marker, which keeps a marker that ended exactly on a
 * chunk boundary from being counted a second time: a whole marker can never fit in the tail, and a
 * split one always leaves at most that many characters behind.
 *
 * @param marker - the text one occurrence is
 */
export const createMarkerCounter = (marker: string) => {
    let seen = 0;
    let tail = '';
    return {
        /** How many occurrences have been fed so far; a running total, never trimmed. */
        count: (): number => seen,
        /** @param chunk - the next piece of the child's output */
        feed: (chunk: string): void => {
            const spanning = tail + chunk;
            seen += spanning.split(marker).length - 1;
            tail = spanning.slice(1 - marker.length);
        }
    };
};

/**
 * A copy tears itself down within `NODE_SHUTDOWN_DELAY_MS` + `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`
 * (15 s by default); past 30 s, stop being polite.
 */
const STOP_GRACE_MS = 30_000;

/**
 * Stops a spawned child: sends SIGTERM to its own pid, waits for it to exit, and SIGKILLs after 30 s.
 *
 * @param child - the child to stop; one that already exited resolves at once
 */
export const stopChild = (child: ChildProcess): Promise<void> =>
    new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, STOP_GRACE_MS).unref();
    });
