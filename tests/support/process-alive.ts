/**
 * @module
 * Whether a pid is still running. Alias-free on purpose: jest's `globalSetup` imports it, and
 * that chain cannot resolve `@` aliases.
 */

/**
 * Whether a process with this pid is still running.
 *
 * Signal 0 only checks existence. `EPERM` means it exists but belongs to another user: alive.
 *
 * @param pid - a pid read from outside: a container's owner label, or a data directory's name
 */
export const isProcessAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // Narrowed: `process.kill` only throws Node system errors, which carry `code`.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
};
