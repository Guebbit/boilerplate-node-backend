import puppeteer, { type PDFOptions } from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Detect the system's Chrome/Chromium executable path
 */
export function getChromiumExecutablePath(): string {
    const possiblePaths = {
        win32: [
            String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
            String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
            process.env.LOCALAPPDATA + String.raw`\Google\Chrome\Application\chrome.exe`,
        ],
        linux: [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium',
        ],
        darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ],
    };

    const platform = process.platform as keyof typeof possiblePaths;
    const paths = possiblePaths[platform] || [];

    // Find the first existing path
    for (const path of paths) {
        if (path && existsSync(path)) {
            return path;
        }
    }

    // Try to find using 'which' command on Unix-like systems
    if (platform === 'linux' || platform === 'darwin') {
        try {
            const chromiumPath = execSync('which chromium || which chromium-browser || which google-chrome', {
                encoding: 'utf8',
            }).trim();
            if (chromiumPath && existsSync(chromiumPath)) {
                return chromiumPath;
            }
        } catch {
            // Command failed, continue to error
        }
    }

    throw new Error(
        `Could not find Chrome/Chromium executable. Please install Chrome or Chromium, or set PUPPETEER_EXECUTABLE_PATH environment variable.`
    );
}

/**
 * Get browser launch options for Puppeteer
 */
export function getBrowserConfig() {
    return {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || getChromiumExecutablePath(),
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    };
}

/**
 * Creates a PDF from HTML content
 *
 * @param htmlContent
 * @param filename
 * @param outputPath
 * @param options - puppeteer options
 * @return string | Error
 */
export async function createPDF(
    htmlContent: string,
    filename = 'output.pdf',
    outputPath = 'src/storage/files',
    // eslint-disable-next-line unicorn/no-object-as-default-parameter
    options: PDFOptions = {
        format: 'A4',
        printBackground: true
    }
): Promise<string> {
    const browser = await puppeteer.launch(getBrowserConfig());
    try {
        const page = await browser.newPage();
        // Wait until there are no more than 0 network connections for at least 500 milliseconds:
        // The page is considered fully loaded when there has been a half-second period with no new network requests
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        await page.pdf({
            ...options,
            path: outputPath + '/' + filename,
        });
        return outputPath + '/' + filename;
    } finally {
        await browser.close();
    }
}