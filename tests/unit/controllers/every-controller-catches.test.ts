import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: a controller that starts a promise chain must end it with a `.catch()`.
 *
 * The global handler in `app.ts` interprets database rejections and answers a client-shaped
 * status, so a missing `.catch()` is not visible as a bug — the response usually looks right. It
 * was not always: `POST /orders` with a malformed `productId` answered 500 for exactly this
 * reason, an ordinary bad request reported as a server fault, found by the fuzz suite. Eight
 * controllers were relying on that net, and "the safety net catches it" is not the same as "the
 * code is correct": the net cannot clean up (an upload written by a failed write stays orphaned)
 * and it cannot record a domain metric (a failed checkout still needs its counter).
 *
 * So the net stays as a net, and this asserts nothing routinely needs it.
 *
 * Deliberately syntactic. The alternative — driving every controller with a rejecting service —
 * needs a fixture per controller, and the thing worth pinning is a property of the whole
 * directory, including files that do not exist yet.
 */

const CONTROLLERS_ROOT = path.join(__dirname, '..', '..', '..', 'src', 'controllers');

const listSourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/** Controllers that hand a promise to a `.then()` without ever handling a rejection. */
const findUnhandledChains = (): string[] =>
    listSourceFiles(CONTROLLERS_ROOT)
        .filter((filePath) => {
            const source = readFileSync(filePath, 'utf8');
            return source.includes('.then(') && !source.includes('.catch(');
        })
        .map((filePath) => path.relative(CONTROLLERS_ROOT, filePath));

describe('every controller handles its own rejections', () => {
    it('finds no promise chain without a .catch()', () => {
        expect(findUnhandledChains()).toEqual([]);
    });

    it('actually scans the controller tree', () => {
        // A canary, as in `no-hardcoded-user-text.test.ts`: an empty result must mean "all
        // handled", never "nothing was read".
        const scanned = listSourceFiles(CONTROLLERS_ROOT);

        expect(scanned.length).toBeGreaterThan(30);
        expect(
            scanned.filter((filePath) => readFileSync(filePath, 'utf8').includes('.catch(')).length
        ).toBeGreaterThan(20);
    });
});
