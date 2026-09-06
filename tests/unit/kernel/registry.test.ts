/**
 * `registerModules` — the whole of what the registry does at boot.
 *
 * Two properties, and there is nothing else left to assert: every module's `subscribe` is called,
 * and a module that declares none is not a special case. There is no duplicate-name,
 * unknown-dependency or cycle check to assert: they validated a `dependsOn` field nothing read at
 * runtime, so the field and its checks are both gone.
 */
import { registerModules, type AppModule } from '@kernel/registry';

it('calls subscribe on every module that declares one', () => {
    const first = jest.fn();
    const second = jest.fn();
    const modules: AppModule[] = [
        { name: 'first', subscribe: first },
        { name: 'second', subscribe: second }
    ];

    registerModules(modules);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
});

it('skips a module with no subscribe, rather than treating it as a mistake', () => {
    // `audit-logs` and `feedback` both declare none: a module with nothing to react to is
    // ordinary, and the optional call is what says so.
    const subscribe = jest.fn();

    expect(() =>
        registerModules([{ name: 'headless' }, { name: 'listener', subscribe }])
    ).not.toThrow();
    expect(subscribe).toHaveBeenCalledTimes(1);
});
