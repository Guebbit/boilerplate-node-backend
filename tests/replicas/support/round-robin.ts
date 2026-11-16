/**
 * @module
 * A load balancer small enough to live inside a test: per-request round robin over the copies that
 * answer `/readyz`, on pooled keep-alive sockets. It behaves like a real edge on purpose, so the
 * faults an edge exposes (a stopping copy still receiving traffic, a reused socket hitting a closed
 * one) show up here the way they would in front of Kubernetes.
 *
 * @see docs/build/cluster-testing.md#the-multi-copy-suite
 */

import http from 'node:http';

/** One copy the proxy may send to. */
export interface Target {
    /** Stable name for the spread report. */
    name: string;
    /** Port the copy listens on, on 127.0.0.1. */
    port: number;
}

/** A running proxy, its address and what it saw. */
export interface RoundRobinProxy {
    /** The port clients talk to. */
    port: number;
    /** Requests answered by each target, by name. */
    servedBy: () => Map<string, number>;
    /** Requests the proxy itself answered 502 (an upstream error) or 503 (nothing ready). */
    failures: () => { badGateway: number; unavailable: number };
    /** Stops polling and closes the listener and the pooled sockets. */
    stop: () => Promise<void>;
}

/** How often each target's `/readyz` is polled. */
const READINESS_POLL_MS = 250;

/**
 * Whether `/readyz` of `port` answers 200 right now. Any error or timeout is "not ready".
 *
 * @param port - the copy's port
 */
const isReady = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const request = http.get(
            { host: '127.0.0.1', port, path: '/readyz', agent: false, timeout: 1000 },
            (response) => {
                response.resume();
                resolve(response.statusCode === 200);
            }
        );
        request.on('timeout', () => request.destroy());
        request.on('error', () => resolve(false));
    });

/**
 * Starts the proxy in front of `targets`.
 *
 * @param port - the port to listen on; chosen by the caller because the copies' public URL names it
 * @param targets - read on every poll, so a copy added or restarted joins without a new proxy
 */
export const startRoundRobinProxy = (
    port: number,
    targets: () => Target[]
): Promise<RoundRobinProxy> => {
    // One pooled agent for every upstream request: reused sockets are the point (a keep-alive edge).
    const agent = new http.Agent({ keepAlive: true });

    // Last `/readyz` verdict per target name; a target never polled is not ready.
    const ready = new Map<string, boolean>();

    // Requests answered per target name: the spread the cases assert on.
    const served = new Map<string, number>();

    // The proxy's own failures: an upstream error (502) and no ready target (503).
    const failed = { badGateway: 0, unavailable: 0 };

    // Position in the round; advanced once per request.
    let cursor = 0;

    /** Refreshes the readiness of every target, concurrently. */
    const poll = (): Promise<unknown> =>
        Promise.all(
            targets().map((target) =>
                isReady(target.port).then((ok) => {
                    ready.set(target.name, ok);
                })
            )
        );

    // Keeps readiness fresh; cleared by `stop`.
    const timer = setInterval(() => {
        // `isReady` never rejects; the handler only satisfies the floating-promise rule.
        poll().catch(() => undefined);
    }, READINESS_POLL_MS);

    /** The next ready target in turn, or undefined when none is. */
    const pick = (): Target | undefined => {
        const live = targets().filter((target) => ready.get(target.name) === true);
        if (live.length === 0) return undefined;
        cursor += 1;
        return live[cursor % live.length];
    };

    // The listener clients talk to: picks a target, forwards, streams the answer back.
    const server = http.createServer((request, response) => {
        const target = pick();
        if (!target) {
            failed.unavailable += 1;
            response.writeHead(503).end();
            return;
        }
        const forwarded = [request.headers['x-forwarded-for'], request.socket.remoteAddress]
            .filter(Boolean)
            .join(', ');
        const upstream = http.request(
            {
                host: '127.0.0.1',
                port: target.port,
                path: request.url,
                method: request.method,
                agent,
                headers: { ...request.headers, 'x-forwarded-for': forwarded }
            },
            (answer) => {
                served.set(target.name, (served.get(target.name) ?? 0) + 1);
                response.writeHead(answer.statusCode ?? 502, answer.headers);
                // Streamed, never buffered: a live stream must reach the client frame by frame.
                answer.pipe(response);
            }
        );
        upstream.on('error', () => {
            failed.badGateway += 1;
            if (!response.headersSent) response.writeHead(502);
            response.end();
        });
        request.pipe(upstream);
    });

    return poll().then(
        () =>
            new Promise<RoundRobinProxy>((resolve) => {
                server.listen(port, '127.0.0.1', () => {
                    resolve({
                        port,
                        servedBy: () => served,
                        failures: () => failed,
                        stop: () =>
                            new Promise<void>((done) => {
                                clearInterval(timer);
                                agent.destroy();
                                server.closeAllConnections();
                                server.close(() => done());
                            })
                    });
                });
            })
    );
};
