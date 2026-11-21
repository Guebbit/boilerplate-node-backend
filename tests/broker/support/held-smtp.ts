/**
 * @module
 * A fake SMTP server that takes a message and then WITHHOLDS its final answer until the test
 * says so: the lever that makes an email job slow on purpose, with nothing added to `src/`.
 *
 * The worker's mail job is a real one (`worker.email.send`, nodemailer over `NODE_SMTP_HOST`), so
 * a job "in the middle of its work" means nodemailer is waiting for this server's `250` after the
 * message body. The test sends SIGTERM in that window, then releases the answer.
 *
 * Speaks just enough of RFC 5321 for nodemailer to complete one send: greeting, EHLO, AUTH PLAIN,
 * MAIL, RCPT, DATA, QUIT. No TLS (the port is not 587 or 465, so nodemailer does not ask for it).
 * https://www.rfc-editor.org/rfc/rfc5321
 */

import net from 'node:net';

/** What a test holds to drive the fake server. */
export interface HeldSmtp {
    /** The port it listens on, on loopback. */
    port: number;
    /** Resolves once a message body has arrived and its final `250` is being withheld. */
    held: () => Promise<void>;
    /** Sends the withheld `250` to every connection waiting for it, and answers later mails at once. */
    release: () => void;
    /** How many messages were answered `250` to a client still connected. */
    accepted: () => number;
    /** Closes the listener and every open connection. */
    stop: () => Promise<void>;
}

/** The end of the DATA section: a line holding a single dot. */
const END_OF_DATA = '\r\n.\r\n';

/**
 * Starts the fake server on a port the OS picks.
 *
 * @returns the handle a test drives it with
 */
export const startHeldSmtp = (): Promise<HeldSmtp> =>
    new Promise((resolve, reject) => {
        /** Answers still withheld, one per connection that finished its DATA. */
        const waiting: (() => void)[] = [];
        /** Callbacks of `held()` callers, fired when a message is first withheld. */
        const heldListeners: (() => void)[] = [];
        /** Open connections, so `stop` can cut them. */
        const sockets = new Set<net.Socket>();
        /** Messages whose `250` reached a client that was still connected. */
        let accepted = 0;
        /** Whether any message body has arrived yet, for a `held()` that is called late. */
        let everHeld = false;
        /** Set by `release()`: a message arriving after it is answered at once, not withheld. */
        let released = false;

        /** The listener; each connection is one SMTP session. */
        const server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            // A client that drops the connection mid-session (the SIGKILL path) is not a test failure.
            socket.on('error', () => undefined);

            /** Bytes received and not yet consumed as a command line or a DATA body. */
            let buffer = '';
            let inData = false;
            let awaitingCredentials = false;

            /**
             * @param line - one reply line, without its CRLF
             */
            const reply = (line: string): void => {
                socket.write(`${line}\r\n`);
            };

            /**
             * @param command - one command line from the client
             */
            const handleCommand = (command: string): void => {
                if (awaitingCredentials) {
                    awaitingCredentials = false;
                    reply('235 2.7.0 Authentication successful');
                    return;
                }
                switch (command.slice(0, 4).toUpperCase()) {
                    case 'EHLO':
                    case 'HELO': {
                        // AUTH must be advertised: nodemailer refuses to send credentials never offered.
                        socket.write('250-held.test\r\n250 AUTH PLAIN\r\n');
                        break;
                    }
                    case 'AUTH': {
                        if (command.trim().split(/\s+/).length > 2) {
                            reply('235 2.7.0 Authentication successful');
                        } else {
                            awaitingCredentials = true;
                            reply('334 ');
                        }
                        break;
                    }
                    case 'DATA': {
                        inData = true;
                        reply('354 End data with <CR><LF>.<CR><LF>');
                        break;
                    }
                    case 'QUIT': {
                        socket.end('221 2.0.0 Bye\r\n');
                        break;
                    }
                    default: {
                        // MAIL, RCPT, RSET, NOOP: all fine.
                        reply('250 OK');
                    }
                }
            };

            /** Reads whatever complete command lines, or the end of a DATA body, the buffer now holds. */
            const drain = (): void => {
                while (buffer.length > 0) {
                    if (inData) {
                        const end = buffer.indexOf(END_OF_DATA);
                        if (end === -1) return;
                        buffer = buffer.slice(end + END_OF_DATA.length);
                        inData = false;
                        /**
                         * The final answer. Counted only when the client is still there to read it:
                         * a worker that gave up on the connection did not get its mail accepted.
                         */
                        const answer = (): void => {
                            if (!socket.writable) return;
                            accepted += 1;
                            reply('250 2.0.0 Queued');
                        };
                        // Withheld until `release()`; after it, a later mail (a redelivery) is answered at once.
                        if (released) {
                            answer();
                        } else {
                            waiting.push(answer);
                            everHeld = true;
                            for (const listener of heldListeners.splice(0)) listener();
                        }
                    } else {
                        const lineEnd = buffer.indexOf('\r\n');
                        if (lineEnd === -1) return;
                        const line = buffer.slice(0, lineEnd);
                        buffer = buffer.slice(lineEnd + 2);
                        handleCommand(line);
                    }
                }
            };

            reply('220 held.test ESMTP');
            socket.on('data', (chunk) => {
                buffer += chunk.toString('latin1');
                drain();
            });
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as net.AddressInfo;
            resolve({
                port,
                held: () =>
                    everHeld
                        ? Promise.resolve()
                        : new Promise<void>((done) => {
                              heldListeners.push(done);
                          }),
                release: () => {
                    released = true;
                    for (const answer of waiting.splice(0)) answer();
                },
                accepted: () => accepted,
                stop: () =>
                    new Promise<void>((done) => {
                        for (const socket of sockets) socket.destroy();
                        server.close(() => done());
                    })
            });
        });
    });
