/**
 * @module
 * The one state `GET /readyz` reads: has this process finished booting, has it started draining
 * for shutdown, and is the database reachable right now. Kept apart from `server-lifecycle.ts`,
 * which SEQUENCES the stop steps but exposes no queryable state of its own — this file is the
 * read side an HTTP handler calls synchronously, no I/O of its own beyond a Mongoose property read.
 */

import mongoose from 'mongoose';
import { connection } from './database';

/** The phases a process moves through, in order — a process never goes backwards through them. */
type ServerPhase = 'booting' | 'listening' | 'draining';

/** Starts `booting`; `markServerListening` and `markServerDraining` are the only way to move it. */
let phase: ServerPhase = 'booting';

/**
 * Marks the process as having finished booting and started accepting connections.
 * Called once by `createApp()`'s `start` (`src/app.ts`), right after `listenOn` resolves.
 */
export const markServerListening = (): void => {
    phase = 'listening';
};

/**
 * Marks the process as draining — a shutdown signal has been received. Called once by
 * `registerSignalHandlers` (`server-lifecycle.ts`), before teardown starts. `GET /readyz` answers
 * 503 from here on, though teardown begins in the same tick, so a probe rarely gets to see it.
 */
export const markServerDraining = (): void => {
    phase = 'draining';
};

/**
 * Whether this instance should receive traffic right now — `GET /readyz`'s whole decision.
 * `booting` and `draining` both answer `false` regardless of the database, so a load balancer
 * reading it sees either edge of the process lifecycle, not only a misbehaving one mid-run.
 * `ConnectionStates.connected` is Mongoose's own enum for a live connection:
 * https://mongoosejs.com/docs/api/connection.html#Connection.prototype.readyState
 */
export const isServerReady = (): boolean =>
    phase === 'listening' && connection.readyState === mongoose.ConnectionStates.connected;
