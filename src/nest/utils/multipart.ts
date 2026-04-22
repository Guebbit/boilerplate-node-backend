import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import type { IRequestContext } from '@nest/types/request-context';

/**
 * Extract extension from filename.
 */
const getExtension = (filename: string) => {
    const extension = path.extname(filename).slice(1);
    return extension || 'bin';
};

/**
 * Parse incoming multipart payload and persist imageUpload file (if provided).
 */
export const parseMultipartImageRequest = async (
    request: IRequestContext
): Promise<{
    body: Record<string, unknown>;
    imageUrlRaw?: string;
    imageUrl?: string;
}> => {
    const body = { ...(request.body as Record<string, unknown> | undefined) };

    // Non-multipart requests use already parsed body payload.
    if (!request.isMultipart?.()) {
        return {
            body,
            imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined
        };
    }

    let imageUrlRaw: string | undefined;

    // `parts()` streams both fields and files from Fastify multipart plugin.
    for await (const part of request.parts()) {
        if (part.type === 'file') {
            const isSupportedField = part.fieldname === 'imageUpload';
            const isSupportedMime =
                part.mimetype === 'image/png' ||
                part.mimetype === 'image/jpg' ||
                part.mimetype === 'image/jpeg';

            if (!isSupportedField || !isSupportedMime || !part.filename) {
                part.file.resume();
                continue;
            }

            const extension = getExtension(part.filename);
            const publicPath = process.env.NODE_PUBLIC_PATH ?? 'public';
            const destinationDirectory = path.resolve(publicPath, 'images');

            await mkdir(destinationDirectory, { recursive: true });

            const generatedFileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
            imageUrlRaw = path.join(destinationDirectory, generatedFileName);

            await pipeline(part.file, createWriteStream(imageUrlRaw));
            continue;
        }

        // Multipart fields are received as strings.
        body[part.fieldname] = part.value;
    }

    const imageUrl = imageUrlRaw
        ? `/${path
              .relative(path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public'), imageUrlRaw)
              .split(path.sep)
              .join('/')}`
        : typeof body.imageUrl === 'string'
          ? body.imageUrl
          : undefined;

    return {
        body,
        imageUrlRaw,
        imageUrl
    };
};
