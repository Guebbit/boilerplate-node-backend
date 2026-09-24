/**
 * `src/infrastructure/runtime/demo-profile.ts` — whether this process is the demo profile.
 */
import { enableDemoProfile, isDemoMode } from '@infrastructure/runtime/demo-profile';
import { logger } from '@infrastructure/adapters/logger';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    enableDemoProfile(false);
    process.env.NODE_ENV = originalNodeEnv;
});

it('is demo mode exactly when enableDemoProfile() was called', () => {
    expect(isDemoMode()).toBe(false);
    enableDemoProfile();
    expect(isDemoMode()).toBe(true);
});

it('refuses production even after enableDemoProfile(), and logs it', () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    enableDemoProfile();
    process.env.NODE_ENV = 'production';

    expect(isDemoMode()).toBe(false);
    expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('production') })
    );
});
