import { Events } from './events';
import { BufferWriter, GZipWriter } from './serialize/writer';
import { serializePlyCompressed, serializePly, ExperienceSettings, SerializeSettings } from './splat-serialize';
import { localize } from './ui/localization';

type PublishSettings = {
    title: string;
    description: string;
    listed: boolean;
    serializeSettings: SerializeSettings;
    experienceSettings: ExperienceSettings;
    format: 'compressed.ply' | 'sogs';
};

const origin = location.origin;

type User = {
    id: string;
    token: string;
    apiServer: string;
};

// check whether user is logged in
const getUser = async () => {
    try {
        const urlResponse = await fetch(`${origin}/api/id`);
        return urlResponse.ok && (await urlResponse.json() as User);
    } catch (e) {
        return null;
    }
};

type ProgressFunc = (loaded: number, total: number) => void;

const trackProgress = (xhr: XMLHttpRequest, progressFunc: ProgressFunc, byteLength?: number) => {
    const target = xhr.upload ?? xhr;
    const handler = (event: ProgressEvent) => {
        const total = event.lengthComputable ? event.total : byteLength;
        if (total) {
            progressFunc(event.loaded, total);
        }
    };
    const endHandler = (event: ProgressEvent) => {
        handler(event);
        target.removeEventListener('loadstart', handler);
        target.removeEventListener('progress', handler);
        target.removeEventListener('loadend', endHandler);
    };
    target.addEventListener('loadstart', handler);
    target.addEventListener('progress', handler);
    target.addEventListener('loadend', endHandler);
};

const publish = async (format: 'compressed.ply' | 'sogs', data: Uint8Array, publishSettings: PublishSettings, user: User, progressFunc: ProgressFunc) => {
    const filename = 'scene.ply';

    // get signed url
    const urlResponse = await fetch(`${user.apiServer}/upload/signed-url`, {
        method: 'POST',
        body: JSON.stringify({ filename }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`
        }
    });

    if (!urlResponse.ok) {
        throw new Error(`failed to get signed url (${urlResponse.statusText})`);
    }

    const json = await urlResponse.json();

    const uploadData = () => {
        return new Promise<boolean>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', json.signedUrl);
            xhr.setRequestHeader('Content-Type', 'binary/octet-stream');
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 400) {
                    resolve(true);
                } else {
                    reject(new Error(`Failed to upload data (${xhr.status} ${xhr.statusText})`));
                }
            };
            xhr.onerror = () => {
                reject(new Error('Network error'));
            };

            trackProgress(xhr, progressFunc, data.byteLength);

            try {
                xhr.send(data);
            } catch (e) {
                reject(e);
            }
        });

    };

    await uploadData();

    const publishResponse = await fetch(`${user.apiServer}/splats/publish`, {
        method: 'POST',
        body: JSON.stringify({
            s3Key: json.s3Key,
            title: publishSettings.title,
            description: publishSettings.description,
            listed: publishSettings.listed,
            settings: publishSettings.experienceSettings,
            format
        }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`
        }
    });

    if (!publishResponse.ok) {
        let msg;
        try {
            const err = await publishResponse.json();
            msg = err.error ?? msg;
        } catch (e) {
            msg = 'Failed to publish';
        }

        throw new Error(msg);
    }

    return await publishResponse.json();
};

const registerPublishEvents = (events: Events) => {

    events.function('publish.enabled', async () => {
        return !!(await getUser());
    });

    events.function('scene.publish', async (publishSettings: PublishSettings) => {
        const user = await getUser();

        if (!user || !publishSettings) {
            return false;
        }
        try {
            events.fire('progressStart', 'Publishing...');
            events.fire('progressUpdate', {
                text: localize('publish.converting'),
                progress: 0
            });

            // delay to allow spinner to show (hopefully 10ms is enough)
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });

            const splats = events.invoke('scene.splats');

            // serialize/compress
            const writer = new BufferWriter();
            const gzipWriter = new GZipWriter(writer);

            switch (publishSettings.format) {
                case 'compressed.ply':
                    await serializePlyCompressed(splats, publishSettings.serializeSettings, gzipWriter);
                    break;
                case 'sogs':
                    await serializePly(splats, publishSettings.serializeSettings, gzipWriter);
                    break;
            }

            await gzipWriter.close();
            const buffer = writer.close();

            const progressFunc = (loaded: number, total: number) => {
                events.fire('progressUpdate', {
                    text: localize('publish.uploading'),
                    progress: 100 * loaded / total
                });
            };

            // publish
            const response = await publish(publishSettings.format, buffer, publishSettings, user, progressFunc);

            if (!response) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('publish.failed'),
                    message: localize('publish.please-try-again')
                });
            } else {
                await events.invoke('showPopup', {
                    type: 'info',
                    header: localize('publish.succeeded'),
                    message: localize('publish.message'),
                    link: response.url
                });
            }
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('publish.failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            events.fire('progressEnd');
        }
    });
};

export { PublishSettings, registerPublishEvents };
