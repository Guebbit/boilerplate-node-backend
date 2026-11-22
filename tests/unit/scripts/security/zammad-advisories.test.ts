/**
 * @module
 * The watcher's own exit codes, through its real entry point (the script runs on import): the
 * pin comes from the real `compose.production.yaml`, only the GitHub page is replaced. The
 * comparison itself is `zammad-exposure.test.ts`'s.
 *
 * @see docs/operate/zammad.md#security-releases
 */
import { eventually } from '@tests/eventually';

/** Stands in for the GitHub read; each case sets what the "network" answers. */
const mockFetchPage = jest.fn<Promise<{ body: unknown }>, [string | undefined]>();

/**
 * Only the network read is replaced: the real comparison and compose parsing run. Inline factory
 * because `jest.mock` is hoisted above the consts.
 */
jest.mock('../../../../scripts/security/zammad-exposure', () => ({
    ...jest.requireActual<typeof import('../../../../scripts/security/zammad-exposure')>(
        '../../../../scripts/security/zammad-exposure'
    ),
    fetchPage: (url: string | undefined) => mockFetchPage(url)
}));

/** The exit code as the script left it, restored after each case. */
const ORIGINAL_EXIT_CODE = process.exitCode;

/** A published advisory shaped like GitHub's, with one vulnerable range (`null`: none published). */
const advisoryWith = (range: string | null) => ({
    ghsa_id: 'GHSA-test-0001-aaaa',
    html_url: 'https://github.com/zammad/zammad/security/advisories/GHSA-test-0001-aaaa',
    summary: 'a fixture advisory',
    severity: 'high',
    vulnerabilities: [{ vulnerable_version_range: range, patched_versions: null }]
});

/** Records the script's console output, silenced; set in `beforeEach`. */
let mockLog: jest.SpyInstance;

/**
 * Run the script once, as `npm run security:zammad-advisories` would, and wait for its detached
 * chain to settle.
 *
 * @returns the exit code the script set
 */
const runWatcher = async (): Promise<number | string | undefined> => {
    process.exitCode = undefined;
    // A fresh load each time: the script does its work when it is imported.
    await jest.isolateModulesAsync(async () => {
        await import('../../../../scripts/security/zammad-advisories');
    });
    // The script's promise chain is not exported, so wait until it has either logged or failed.
    await eventually(() => mockFetchPage.mock.calls.length > 0);
    await eventually(() => process.exitCode !== undefined || mockLog.mock.calls.length > 0, 500);
    return process.exitCode;
};

beforeEach(() => {
    mockFetchPage.mockReset();
    mockLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE;
    jest.restoreAllMocks();
});

describe('the Zammad advisory watcher', () => {
    it('exits 0 and says so when no advisory covers the pinned version', async () => {
        mockFetchPage.mockResolvedValue({ body: [advisoryWith('< 1.0.0')] });

        expect(await runWatcher()).toBeUndefined();
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('no published advisory'));
    });

    it('exits 2 when the pin is inside a vulnerable range', async () => {
        mockFetchPage.mockResolvedValue({ body: [advisoryWith('>= 0.0.1')] });

        expect(await runWatcher()).toBe(2);
    });

    it('exits 1 when an advisory published no range that can be read', async () => {
        mockFetchPage.mockResolvedValue({ body: [advisoryWith(null)] });

        expect(await runWatcher()).toBe(1);
    });

    it('exits 2, not 1, when one advisory exposes the pin and another is unreadable', async () => {
        mockFetchPage.mockResolvedValue({ body: [advisoryWith('>= 0.0.1'), advisoryWith(null)] });

        expect(await runWatcher()).toBe(2);
    });

    it('exits 1 when GitHub cannot be reached', async () => {
        mockFetchPage.mockRejectedValue(new Error('network down'));

        expect(await runWatcher()).toBe(1);
    });
});
