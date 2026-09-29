/**
 * Re-hosting a remote picture is best-effort: every refusal or failure answers `undefined`, never
 * a rejection, so a signup never fails over an avatar. Only the paths that need no network.
 */
import { rehostRemoteImage } from '@infrastructure/adapters/remote-image';

describe('rehostRemoteImage', () => {
    it('has nothing to fetch for an absent url', async () => {
        await expect(rehostRemoteImage(undefined)).resolves.toBeUndefined();
    });

    it.each([
        ['a plaintext url', 'http://avatars.example.test/a.png'],
        ['a url with credentials', 'https://user:pw@avatars.example.test/a.png'],
        ['a loopback literal', 'https://127.0.0.1/a.png'],
        ['a private literal', 'https://10.0.0.5/a.png'],
        ['not a url at all', 'not a url']
    ])('refuses %s without rejecting', async (_label, url) => {
        await expect(rehostRemoteImage(url)).resolves.toBeUndefined();
    });
});
