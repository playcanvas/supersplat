import { localize } from './ui/localization';
import { Events } from './events';
import { serializePlyCompressed, ViewerSettings, SerializeSettings } from './splat-serialize';

type PublishSettings = {
    title: string;
    description: string;
    listed: boolean;
    viewerSettings: ViewerSettings;
    serializeSettings: SerializeSettings;
};

const origin = location.origin;

// check whether user is logged in
const testUserStatus = async () => {
    const urlResponse = await fetch(`${origin}/api/id`);
    return urlResponse.ok;
};

const publish = async (data: Uint8Array, publishSettings: PublishSettings) => {
    const filename = 'scene.ply';

    // get signed url
    const urlResponse = await fetch(`${origin}/api/upload/signed-url`, {
        method: 'POST',
        body: JSON.stringify({ filename }),
        headers: {
            "Content-Type": "application/json"
        }
    });

    if (!urlResponse.ok) {
        console.log(`failed to get signed url (${urlResponse.statusText})`);
        return;
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
        console.log(`failed to upload blob`);
        return;
    }

    const publishResponse = await fetch(`${origin}/api/splats/publish`, {
        method: 'POST',
        body: JSON.stringify({
            s3_key: json.s3Key,
            title: publishSettings.title,
            description: publishSettings.description,
            listed: publishSettings.listed,
            settings: publishSettings.viewerSettings
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!publishResponse.ok) {
        console.log(`failed to publish`);
        return;
    }

    return publishResponse.json();
};

const registerPublishEvents = (events: Events) => {
    events.function('scene.publish', async () => {
        const userValid = await testUserStatus();

        if (!userValid) {
            // use must be logged in to publish
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error'),
                message: localize('popup.please-log-in')
            });
        } else {
            // get publish options
            const publishSettings: PublishSettings = await events.invoke('show.publishSettingsDialog');

            if (!publishSettings) {
                return;
            }

            const splats = events.invoke('scene.splats');

            // serialize/compress
            let data: Uint8Array = null;
            await serializePlyCompressed(splats, publishSettings.serializeSettings, (chunk: Uint8Array) => data = chunk);

            // publish
            const response = await publish(data, publishSettings);
            console.log(response);
        }
    });
};

export { PublishSettings, registerPublishEvents };
