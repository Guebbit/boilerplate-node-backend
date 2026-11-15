/**
 * `loadDevelopmentDoubles` — the one runtime door from `src/` to `scenarios/`.
 *
 * Three branches: not development (nothing happens), development with no `scenarios/` (a refusal
 * that names the cause), development with the file (it is imported). Plus the one thing no static
 * check can see: the loader's literal path still names a file.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEVELOPMENT_DOUBLES_PATH, loadDevelopmentDoubles } from '@app/development-doubles';
import { setEnvironment } from '@tests/environment';

/** Counts imports of the doubles file; the real one writes `process.env` and the registries. */
const mockLoaded = jest.fn();

// The loader imports `<cwd>/scenarios/support/development-doubles.ts`, and under jest cwd is the
// repo root. The factory runs at that import, not at hoist time, so `mockLoaded` exists by then.
jest.mock('../../../scenarios/support/development-doubles', () => {
    mockLoaded();
    return {};
});

/** The empty working directory the "no scenarios/" case points `process.cwd()` at. */
let emptyDirectory: string | undefined;

beforeEach(() => {
    mockLoaded.mockClear();
});

afterEach(() => {
    jest.restoreAllMocks();
    if (emptyDirectory) rmSync(emptyDirectory, { recursive: true });
    emptyDirectory = undefined;
});

describe('loadDevelopmentDoubles', () => {
    it('does nothing outside development', async () => {
        setEnvironment({ NODE_ENV: 'production' });

        await expect(loadDevelopmentDoubles()).resolves.toBeUndefined();

        expect(mockLoaded).not.toHaveBeenCalled();
    });

    it('imports the doubles file under development', async () => {
        setEnvironment({ NODE_ENV: 'development' });

        await loadDevelopmentDoubles();

        expect(mockLoaded).toHaveBeenCalledTimes(1);
    });

    it('refuses under development when the working directory has no scenarios/', async () => {
        emptyDirectory = mkdtempSync(path.join(os.tmpdir(), 'no-scenarios-'));
        jest.spyOn(process, 'cwd').mockReturnValue(emptyDirectory);
        setEnvironment({ NODE_ENV: 'development' });

        await expect(loadDevelopmentDoubles()).rejects.toThrow(
            /NODE_ENV=development.*no `scenarios\/`.*NODE_ENV=production/
        );
    });

    it('names a file that exists: a rename of the doubles must move the loader with it', () => {
        expect(existsSync(path.join(process.cwd(), DEVELOPMENT_DOUBLES_PATH))).toBe(true);
    });
});
