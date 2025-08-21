import { Crc } from './crc';
import { Writer } from './writer';

// https://gist.github.com/rvaiya/4a2192df729056880a027789ae3cd4b7

class ZipWriter implements Writer {
    // start a new file
    start: (filename: string) => Promise<void>;

    // write func
    write: (data: Uint8Array) => Promise<void>;

    // finish the archive by writing the footer
    close: () => Promise<void>;

    // helper function to start and write file contents
    async file(filename: string, content: string | Uint8Array | Uint8Array[]) {
        // start a new file
        await this.start(filename);

        // write file content
        if (typeof content === 'string') {
            await this.write(new TextEncoder().encode(content));
        } else if (content instanceof Uint8Array) {
            await this.write(content);
        } else {
            for (let i = 0; i < content.length; i++) {
                await this.write(content[i]);
            }
        }
    }

    // write uncompressed data to a zip file using the passed-in writer
    constructor(writer: Writer) {
        const textEncoder = new TextEncoder();
        const files: { filename: Uint8Array, crc: Crc, sizeBytes: number }[] = [];

        const date = new Date();
        const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

        const writeHeader = async (filename: string) => {
            const filenameBuf = textEncoder.encode(filename);
            const nameLen = filenameBuf.length;

            const header = new Uint8Array(30 + nameLen);
            const view = new DataView(header.buffer);

            view.setUint32(0, 0x04034b50, true);
            view.setUint16(4, 20, true);            // version needed to extract = 2.0
            view.setUint16(6, 0x8 | 0x800, true);   // indicate crc and size comes after, utf-8 encoding
            view.setUint16(8, 0, true);             // method = 0 (store)
            view.setUint16(10, dosTime, true);
            view.setUint16(12, dosDate, true);
            view.setUint16(26, nameLen, true);
            header.set(filenameBuf, 30);

            await writer.write(header);

            files.push({ filename: filenameBuf, crc: new Crc(), sizeBytes: 0 });
        };

        const writeFooter = async () => {
            const file = files[files.length - 1];
            const { crc, sizeBytes } = file;
            const data = new Uint8Array(16);
            const view = new DataView(data.buffer);
            view.setUint32(0, 0x08074b50, true);
            view.setUint32(4, crc.value(), true);
            view.setUint32(8, sizeBytes, true);
            view.setUint32(12, sizeBytes, true);
            await writer.write(data);
        };

        this.start = async (filename: string) => {
            // write previous file footer
            if (files.length > 0) {
                await writeFooter();
            }

            await writeHeader(filename);
        };

        this.write = async (data: Uint8Array) => {
            const file = files[files.length - 1];
            file.sizeBytes += data.length;
            file.crc.update(data);
            await writer.write(data);
        };

        this.close = async () => {
            // write last file's footer
            await writeFooter();

            // write cd records
            let offset = 0;
            for (const file of files) {
                const { filename, crc, sizeBytes } = file;
                const nameLen = filename.length;

                const cdr = new Uint8Array(46 + nameLen);
                const view = new DataView(cdr.buffer);
                view.setUint32(0, 0x02014b50, true);
                view.setUint16(4, 20, true);
                view.setUint16(6, 20, true);
                view.setUint16(8, 0x8 | 0x800, true);
                view.setUint16(10, 0, true);
                view.setUint16(12, dosTime, true);
                view.setUint16(14, dosDate, true);
                view.setUint32(16, crc.value(), true);
                view.setUint32(20, sizeBytes, true);
                view.setUint32(24, sizeBytes, true);
                view.setUint16(28, nameLen, true);
                view.setUint32(42, offset, true);
                cdr.set(filename, 46);

                await writer.write(cdr);

                offset += 30 + nameLen + sizeBytes + 16; // 30 local header + name + data + 16 descriptor
            }
            const filenameLength = files.reduce((tot, file) => tot + file.filename.length, 0);
            const dataLength = files.reduce((tot, file) => tot + file.sizeBytes, 0);

            // write eocd record
            const eocd = new Uint8Array(22);
            const eocdView = new DataView(eocd.buffer);
            eocdView.setUint32(0, 0x06054b50, true);
            eocdView.setUint16(8, files.length, true);
            eocdView.setUint16(10, files.length, true);
            eocdView.setUint32(12, filenameLength + files.length * 46, true);
            eocdView.setUint32(16, filenameLength + files.length * (30 + 16) + dataLength, true);

            await writer.write(eocd);
        };
    }
}

export { ZipWriter };
