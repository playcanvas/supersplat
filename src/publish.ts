import { Events } from './events';
import { BufferWriter, GZipWriter } from './serialize/writer';
import { serializePlyCompressed, ExperienceSettings, SerializeSettings } from './splat-serialize';
import { localize } from './ui/localization';

type PublishSettings = {
    title: string;
    description: string;
    listed: boolean;
    serializeSettings: SerializeSettings;
    experienceSettings: ExperienceSettings;
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

const publish = async (data: Uint8Array, publishSettings: PublishSettings, user: User) => {
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

    // upload the file to S3
    const uploadResponse = await fetch(json.signedUrl, {
        method: 'PUT',
        body: data,
        headers: {
            'Content-Type': 'binary/octet-stream'
        }
    });

    if (!uploadResponse.ok) {
        throw new Error('failed to upload blob');
    }

    const publishResponse = await fetch(`${user.apiServer}/splats/publish`, {
        method: 'POST',
        body: JSON.stringify({
            s3Key: json.s3Key,
            title: publishSettings.title,
            description: publishSettings.description,
            listed: publishSettings.listed,
            settings: publishSettings.experienceSettings
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
    events.function('scene.publish', async () => {
        const user = await getUser();

        if (!user) {
            // use must be logged in to publish
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error'),
                message: localize('publish.please-log-in')
            });
        } else {
            // get publish options
            const publishSettings: PublishSettings = await events.invoke('show.publishSettingsDialog');

            if (!publishSettings) {
                return;
            }

            try {
                events.fire('startSpinner');

                // delay to allow spinner to show (hopefully 10ms is enough)
                await new Promise((resolve) => {
                    setTimeout(resolve, 10);
                });

                const splats = events.invoke('scene.splats');

                // serialize/compress
                const writer = new BufferWriter();
                const gzipWriter = new GZipWriter(writer);
                await serializePlyCompressed(splats, publishSettings.serializeSettings, gzipWriter);
                await gzipWriter.close();
                const buffer = writer.close();

                // publish
                const response = await publish(buffer, publishSettings, user);

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
                events.fire('stopSpinner');
            }
        }
    });
};

export { PublishSettings, registerPublishEvents };
