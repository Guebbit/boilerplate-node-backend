/**
 * The mail transports `registerDoubles` registers against the list the production adapter keeps
 * to explain a refusal. The two are written apart on purpose (production code may not import
 * `scenarios/`), so only this test notices one drifting from the other.
 *
 * The suite's own setup has already registered the doubles for real, so the modules are loaded
 * again here, with the registration call recorded.
 */

it('names exactly the transports the development doubles register', async () => {
    jest.resetModules();
    const registerMailTransport = jest.fn<undefined, [string, unknown]>();
    jest.doMock('@infrastructure/adapters/mail-transports', () => ({
        ...jest.requireActual('@infrastructure/adapters/mail-transports'),
        __esModule: true,
        registerMailTransport
    }));
    const [{ registerDoubles }, { DEVELOPMENT_TRANSPORTS }] = await Promise.all([
        import('@scenarios/support/doubles/register'),
        import('@infrastructure/adapters/mail-transports')
    ]);

    registerDoubles();

    const registered = registerMailTransport.mock.calls.map(([name]) => name);
    expect(DEVELOPMENT_TRANSPORTS.toSorted()).toEqual(registered.toSorted());
});
