import { Events } from './events';
import { Writer, GZipWriter } from './serialize/writer';
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

class PublishWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => Promise<any>;

    static async create(publishSettings: PublishSettings, user: User) {
        const filename = 'scene.ply';

        // start upload
        const startResponse = await fetch(`${user.apiServer}/upload/start-upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${user.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileName: filename })
        });

        const startJson = await startResponse.json();

        const result = new PublishWriter();

        const uploadBuf = new Uint8Array(10 * 1024 * 1024); // 10MB buffer
        const parts: { PartNumber: number, ETag: string }[] = [];
        let partNumber = 1;
        let cursor = 0;

        const upload = async () => {
            if (cursor === 0) return;

            // get signed url for this part
            const urlResponse = await fetch(`${user.apiServer}/upload/signed-urls`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadId: startJson.uploadId,
                    key: startJson.key,
                    parts: 1,
                    partBase: partNumber
                })
            });

            if (!urlResponse.ok) {
                throw new Error(`failed to get signed url (${urlResponse.statusText})`);
            }

            const urlJson = await urlResponse.json();

            const uploadResponse = await fetch(urlJson.signedUrls[0], {
                method: 'PUT',
                body: uploadBuf.slice(0, cursor),
                headers: {
                    'Content-Type': 'binary/octet-stream'
                }
            });

            if (!uploadResponse.ok) {
                throw new Error(`failed to upload data (${uploadResponse.statusText})`);
            }

            parts.push({
                PartNumber: partNumber,
                ETag: uploadResponse.headers.get('etag').replace(/^"|"$/g, '')
            });

            cursor = 0;
            partNumber++;
        };

        result.write = async (data: Uint8Array) => {
            let readcursor = 0;

            while (data.byteLength - readcursor > 0) {
                const readSize = data.byteLength - readcursor;
                const writeSize = uploadBuf.byteLength - cursor;
                const copySize = Math.min(readSize, writeSize);

                uploadBuf.set(data.subarray(readcursor, readcursor + copySize), cursor);

                readcursor += copySize;
                cursor += copySize;

                if (cursor === uploadBuf.byteLength) {
                    await upload();
                }
            }
        };

        result.close = async () => {
            // final upload
            await upload();

            // complete the multipart upload
            const completeResult = await fetch(`${user.apiServer}/upload/complete-upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadId: startJson.uploadId,
                    key: startJson.key,
                    parts
                })
            });

            if (!completeResult.ok) {
                throw new Error(`failed to complete upload (${completeResult.statusText})`);
            }

            const completeJson = await completeResult.json();

            const publishResponse = await fetch(`${user.apiServer}/splats/publish`, {
                method: 'POST',
                body: JSON.stringify({
                    s3Key: startJson.key,
                    title: publishSettings.title,
                    description: publishSettings.description,
                    listed: publishSettings.listed,
                    settings: publishSettings.experienceSettings,
                    format: publishSettings.format
                }),
                headers: {
                    'Authorization': `Bearer ${user.token}`,
                    'Content-Type': 'application/json'
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

        return result;
    }
}

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

            const progressFunc = (loaded: number, total: number) => {
                events.fire('progressUpdate', {
                    text: localize('publish.uploading'),
                    progress: 100 * loaded / total
                });
            };

            // create the writer chain: gzip->stream->upload
            const publishWriter = await PublishWriter.create(publishSettings, user);
            const gzipWriter = new GZipWriter(publishWriter);

            const splats = events.invoke('scene.splats');

            // serialize
            switch (publishSettings.format) {
                case 'compressed.ply':
                    await serializePlyCompressed(splats, publishSettings.serializeSettings, gzipWriter, progressFunc);
                    break;
                case 'sogs':
                    await serializePly(splats, publishSettings.serializeSettings, gzipWriter, progressFunc);
                    break;
            }

            await gzipWriter.close();
            const response = await publishWriter.close();

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
