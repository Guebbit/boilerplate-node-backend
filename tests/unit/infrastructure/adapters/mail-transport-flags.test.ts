import { createTransport } from 'nodemailer';

/**
 * The real nodemailer, with the two switches `smtp-transport.ts` and the log double set. The
 * claim is that message data cannot read a file or fetch a URL once they are on — so this builds
 * the transport the same way and sends it a message that tries both.
 */
const transport = () =>
    createTransport({ jsonTransport: true, disableFileAccess: true, disableUrlAccess: true });

describe('a transport with file and URL access disabled', () => {
    it('refuses an attachment that names a file path', async () => {
        await expect(
            transport().sendMail({
                to: 'a@example.com',
                attachments: [{ filename: 'x', path: '/etc/passwd' }]
            })
        ).rejects.toThrow(/access rejected/i);
    });

    it('refuses an attachment that names a URL', async () => {
        await expect(
            transport().sendMail({
                to: 'a@example.com',
                attachments: [{ filename: 'x', path: 'https://169.254.169.254/latest/meta-data/' }]
            })
        ).rejects.toThrow(/access rejected/i);
    });

    it('still sends an attachment carried as bytes', async () => {
        await expect(
            transport().sendMail({
                to: 'a@example.com',
                attachments: [{ filename: 'x.txt', content: Buffer.from('hello') }]
            })
        ).resolves.toBeDefined();
    });
});
