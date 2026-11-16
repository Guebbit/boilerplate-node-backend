import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';

/**
 * How long one nested command may run before it is killed: 5 minutes.
 * Generous for a bundle build; short enough that a hung child fails the hook instead of freezing it.
 */
export const COMMAND_TIMEOUT_MS = 300_000;

/** A nested command that outlived its timeout and was killed. */
export class CommandTimeoutError extends Error {}

/**
 * `execFileSync` with a timeout; a timeout throws `CommandTimeoutError` naming the command.
 * Any other failure is rethrown untouched.
 *
 * @param command - the executable to run
 * @param arguments_ - its arguments
 * @param options - `execFileSync` options
 * @param timeoutMs - kill the command after this many milliseconds
 * @throws {CommandTimeoutError} when the command was killed for running too long
 */
export const runWithTimeout = (
    command: string,
    arguments_: string[],
    options: ExecFileSyncOptions = {},
    timeoutMs: number = COMMAND_TIMEOUT_MS
): void => {
    try {
        /**
         * `timeout` (ms) kills the child with `killSignal` and throws an error with `code: 'ETIMEDOUT'`.
         * https://nodejs.org/api/child_process.html#child_processexecfilesynccommand-args-options
         */
        execFileSync(command, arguments_, {
            ...options,
            timeout: timeoutMs,
            killSignal: 'SIGKILL'
        });
    } catch (error) {
        // Duck-typed: under jest's vm sandbox the child_process error is from another realm, so `instanceof Error` lies.
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ETIMEDOUT'
        ) {
            throw new CommandTimeoutError(
                `\`${[command, ...arguments_].join(' ')}\` did not finish within ${String(timeoutMs)} ms and was killed.`,
                { cause: error }
            );
        }
        throw error;
    }
};
