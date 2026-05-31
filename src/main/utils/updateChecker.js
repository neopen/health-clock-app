const { net } = require('electron');
const { app } = require('electron');

function compareVersions(current, latest) {
    const currentParts = current.replace(/^v/, '').split('.').map(Number);
    const latestParts = latest.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const a = currentParts[i] || 0;
        const b = latestParts[i] || 0;
        if (a < b) return -1;
        if (a > b) return 1;
    }
    return 0;
}

function checkForUpdate() {
    return new Promise((resolve) => {
        const currentVersion = app.getVersion();
        console.log('[UpdateChecker] Current version:', currentVersion);

        const request = net.request({
            method: 'GET',
            url: 'https://api.github.com/repos/neopen/active-break-clock/releases/latest'
        });

        request.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    const latestVersion = release.tag_name || release.name || '';
                    const downloadUrl = release.html_url || 'https://github.com/neopen/active-break-clock/releases';

                    console.log('[UpdateChecker] Latest version:', latestVersion);
                    console.log('[UpdateChecker] Download URL:', downloadUrl);

                    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;

                    resolve({
                        hasUpdate,
                        currentVersion,
                        latestVersion,
                        releaseUrl: downloadUrl,
                        releaseNotes: release.body || ''
                    });
                } catch (e) {
                    console.error('[UpdateChecker] Failed to parse response:', e);
                    resolve({
                        hasUpdate: false,
                        currentVersion,
                        latestVersion: null,
                        releaseUrl: null,
                        releaseNotes: null,
                        error: e.message
                    });
                }
            });
        });

        request.on('error', (e) => {
            console.error('[UpdateChecker] Network error:', e);
            resolve({
                hasUpdate: false,
                currentVersion,
                latestVersion: null,
                releaseUrl: null,
                releaseNotes: null,
                error: e.message
            });
        });

        request.end();
    });
}

function checkForUpdateWithRetry(maxRetries = 2, delayMs = 1000) {
    return new Promise(async (resolve) => {
        let lastError = null;
        for (let i = 0; i < maxRetries; i++) {
            const result = await checkForUpdate();
            if (!result.error || i === maxRetries - 1) {
                resolve(result);
                return;
            }
            lastError = result.error;
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
        resolve({
            hasUpdate: false,
            currentVersion: app.getVersion(),
            latestVersion: null,
            releaseUrl: null,
            releaseNotes: null,
            error: lastError
        });
    });
}

module.exports = {
    checkForUpdate,
    checkForUpdateWithRetry,
    compareVersions
};