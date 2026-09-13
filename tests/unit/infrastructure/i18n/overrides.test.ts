/**
 * The override overlay.
 *
 * Three properties, and they are the three this layer was most at risk of quietly losing when it
 * was added on top of a module built around never touching the request path:
 *
 *   the files still stand alone — no provider, or one that throws, must be indistinguishable from
 *   the deployment that existed before overrides did;
 *   overrides do not accumulate — a deleted row must actually stop answering, which only works
 *   because a refresh restores the baseline before re-applying;
 *   a language with no deployed file is skipped — the supported list is what the middleware
 *   negotiates against, and answering `Content-Language: pt` while resolving English is worse
 *   than not offering Portuguese at all.
 *
 * `i18next` is initialised per test rather than shared: `addResourceBundle` mutates a global, and
 * a leaked override would make whichever test ran next depend on order.
 */
import i18next from 'i18next';
import {
    getOverrideRefreshMs,
    listSupportedLocales,
    loadLocaleResources,
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    startLocaleOverrideRefresh,
    stopLocaleOverrideRefresh,
    t
} from '@infrastructure/i18n';
import enTranslation from '../../../../src/locales/en.json';

describe('locale overrides', () => {
    beforeEach(async () => {
        registerLocaleOverrideProvider(undefined);
        await i18next.init({
            lng: 'en',
            fallbackLng: 'en',
            supportedLngs: listSupportedLocales(),
            resources: loadLocaleResources()
        });
    });

    afterEach(() => {
        registerLocaleOverrideProvider(undefined);
        resetLocaleOverrides();
    });

    it('resolves from the deployed files when no provider is registered', async () => {
        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe(enTranslation.generic['error-unauthorized']);
    });

    it('lets a stored override win over the deployed file', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited by a human' } } })
        );

        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe('Edited by a human');
    });

    /**
     * The deep-merge half. An override names one leaf, and its siblings have to survive — a
     * shallow bundle would drop every other `generic.*` key and the damage would surface on an
     * unrelated response.
     */
    it('keeps the sibling keys of an overridden one', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );

        await refreshLocaleOverrides();

        expect(t('generic.error-internal')).toBe(enTranslation.generic['error-internal']);
    });

    /**
     * The reason a refresh restores the baseline first. Without it a deleted row would keep
     * answering until the process restarted — which looks exactly like the delete not saving.
     */
    it('drops an override that has since been deleted', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );
        await refreshLocaleOverrides();

        registerLocaleOverrideProvider(() => Promise.resolve({}));
        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe(enTranslation.generic['error-unauthorized']);
    });

    /**
     * Stale copy beats copy that reverts itself every time Mongo hiccups: a failed refresh keeps
     * the last good overlay rather than falling back to the files.
     */
    it('keeps the last good overlay when the provider fails', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );
        await refreshLocaleOverrides();

        registerLocaleOverrideProvider(() => Promise.reject(new Error('mongo is down')));
        await expect(refreshLocaleOverrides()).resolves.toBeUndefined();

        expect(t('generic.error-unauthorized')).toBe('Edited');
    });

    it('ignores overrides for a language with no deployed dictionary', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ pt: { generic: { 'error-unauthorized': 'Editado' } } })
        );

        await expect(refreshLocaleOverrides()).resolves.toBeUndefined();
        expect(i18next.getResourceBundle('pt', 'translation')).toBeUndefined();
    });

    it('overrides one language without touching another', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ it: { generic: { 'error-unauthorized': 'Modificato' } } })
        );

        await refreshLocaleOverrides();

        expect(i18next.getFixedT('it')('generic.error-unauthorized')).toBe('Modificato');
        expect(i18next.getFixedT('en')('generic.error-unauthorized')).toBe(
            enTranslation.generic['error-unauthorized']
        );
    });
});

/**
 * The refresh timer — how an edit made on one worker reaches the others.
 *
 * There is no broadcast: each worker re-reads on its own interval, so the interval IS the staleness
 * window an admin sees after saving. A timer that never fires means copy that only updates on the
 * worker that handled the write, which is invisible until a load balancer sends the next request
 * somewhere else.
 */
describe('the override refresh interval', () => {
    const ORIGINAL_REFRESH_MS = process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS;

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        stopLocaleOverrideRefresh();
        jest.useRealTimers();
        registerLocaleOverrideProvider(undefined);
        if (ORIGINAL_REFRESH_MS === undefined) delete process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS;
        else process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = ORIGINAL_REFRESH_MS;
    });

    it('reads the configured period', () => {
        process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = '5000';

        expect(getOverrideRefreshMs()).toBe(5000);
    });

    // A zero or negative period would be a busy loop, and a typo'd one is not a reason to hammer
    // Mongo — both fall back to the minute rather than being taken literally.
    it.each([
        ['unset', undefined],
        ['0', '0'],
        ['-1', '-1'],
        ['nonsense', 'soon']
    ])('falls back to a minute when the period is %s', (_label, value) => {
        if (value === undefined) delete process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS;
        else process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = value;

        expect(getOverrideRefreshMs()).toBe(60_000);
    });

    it('re-reads the overrides once per period', () => {
        process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = '1000';
        const provider = jest.fn(() => Promise.resolve({}));
        registerLocaleOverrideProvider(provider);

        startLocaleOverrideRefresh();
        jest.advanceTimersByTime(3000);

        expect(provider).toHaveBeenCalledTimes(3);
    });

    // Called from the boot sequence, which a test may run more than once in-process. A second
    // timer would double every worker's read rate against Mongo for the life of the process.
    it('runs one timer however many times it is started', () => {
        process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = '1000';
        const provider = jest.fn(() => Promise.resolve({}));
        registerLocaleOverrideProvider(provider);

        startLocaleOverrideRefresh();
        startLocaleOverrideRefresh();
        jest.advanceTimersByTime(1000);

        expect(provider).toHaveBeenCalledTimes(1);
    });

    it('stops re-reading once stopped, and can be started again', () => {
        process.env.NODE_LOCALE_OVERRIDE_REFRESH_MS = '1000';
        const provider = jest.fn(() => Promise.resolve({}));
        registerLocaleOverrideProvider(provider);

        startLocaleOverrideRefresh();
        stopLocaleOverrideRefresh();
        jest.advanceTimersByTime(5000);

        expect(provider).not.toHaveBeenCalled();

        startLocaleOverrideRefresh();
        jest.advanceTimersByTime(1000);

        expect(provider).toHaveBeenCalledTimes(1);
    });

    // Stopping what was never started is what the shutdown path does on a worker that never
    // registered a provider.
    it('is safe to stop when it was never started', () => {
        expect(() => {
            stopLocaleOverrideRefresh();
        }).not.toThrow();
    });
});
