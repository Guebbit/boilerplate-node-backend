/**
 * Installs supercronic, the scheduler the `cron` service runs, into /usr/local/bin — at image
 * build time, for both `docker/Dockerfile` and `docker/Dockerfile.production`.
 *
 * Why supercronic and not busybox `crond`: crond resets the job's supplementary groups before
 * every run, which needs CAP_SETGID, so as the unprivileged `node` user every job failed while
 * crond itself stayed up. supercronic runs jobs as whoever it runs as.
 * https://github.com/aptible/supercronic
 *
 * Node rather than a shell script because Node is the one tool both base images already carry:
 * Alpine ships wget, Debian slim ships neither wget nor curl.
 *
 * The binary is pinned by SHA-256 per architecture (the GitHub release asset digests). A download
 * that does not match fails the build.
 */
import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';

/** The supercronic release to install; bump it together with the digests below. */
const VERSION = 'v0.2.49';

/** Release asset digests, keyed by Node's `process.arch`. */
const SHA256 = {
    x64: {
        asset: 'amd64',
        digest: 'a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1'
    },
    arm64: {
        asset: 'arm64',
        digest: '02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5'
    }
};

/** Where the binary lands; on `PATH` in both images. */
const TARGET = '/usr/local/bin/supercronic';

/** The release asset and digest for this machine's CPU, or `undefined` for an unpinned one. */
const pinned = SHA256[process.arch];
if (!pinned) throw new Error(`supercronic: no pinned build for architecture ${process.arch}`);

/** The release asset's download URL. */
const url = `https://github.com/aptible/supercronic/releases/download/${VERSION}/supercronic-linux-${pinned.asset}`;
/** The download. `fetch` is Node's built-in (undici); it follows redirects, which GitHub releases use. */
const response = await fetch(url);
if (!response.ok) throw new Error(`supercronic: download failed, HTTP ${response.status}`);

/** The downloaded bytes. */
const binary = Buffer.from(await response.arrayBuffer());

/** The bytes' SHA-256 as hex, to compare with the pinned digest. */
const actual = createHash('sha256').update(binary).digest('hex');
if (actual !== pinned.digest)
    throw new Error(`supercronic: checksum mismatch, expected ${pinned.digest}, got ${actual}`);

// Install: write the file, then make it executable (0o755 = rwxr-xr-x).
await writeFile(TARGET, binary);
await chmod(TARGET, 0o755);
console.log(`supercronic ${VERSION} (${pinned.asset}) installed at ${TARGET}`);
