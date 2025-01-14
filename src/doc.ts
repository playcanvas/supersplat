import { Events } from './events';
import { ZipArchive } from './serialize/zip';

const registerDocEvents = (events: Events) => {
    events.function('doc.load', async () => {
        
    });

    events.function('doc.save', async () => {
        const json: any = {

        };

        const files: {
            filename: string,
            data: Uint8Array
        }[] = [];

        events.fire('doc.serialize', { json, files });

        const jsonData = JSON.stringify(json);
        const zipArchive = new ZipArchive(write);
        await zipArchive.file('document.json');
        for (let i = 0; i < files.length; ++i) {
            await zipArchive.file(files[i].filename);
            await zipArchive.fileData(files[i].data);
        }
        await zipArchive.end();
    });
};

export { registerDocEvents };
