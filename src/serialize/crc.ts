const crc32_table = (() => {
    const tbl = [];
    let c;
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        tbl[n] = c;
    }
    return tbl;
})();

class Crc {
    reset: () => void;
    update: (data: Uint8Array) => void;
    value: () => number;

    constructor() {
        let bits = -1;
        this.update = (data: Uint8Array) => {
            for (let i = 0; i < data.length; i++) {
                bits = (bits >>> 8) ^ crc32_table[(bits ^ data[i]) & 0xFF];
            }
        };
        this.value = () => (bits ^ (-1)) >>> 0;
    }
}

export { Crc };
