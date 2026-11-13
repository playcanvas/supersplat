// Sort a set of picked or dropped files into the things they make up (sequences,
// multi-file models, single models, documents, poses, unsupported files), so a
// mixed set can be reviewed before it is imported.

type ImportGroupKind = 'document' | 'bundle' | 'sequence' | 'model' | 'poses' | 'unsupported';

type ImportGroup = {
    kind: ImportGroupKind;
    // indices into the analysed filenames, in import order
    files: number[];
    // display name: the filename, the bundle's main file or the sequence's frame range
    name: string;
    // bundle only: the folder holding the bundle, with trailing delimiter ('' at the root)
    dir?: string;
};

const modelExtensions = ['.ply', '.splat', '.sog', '.ksplat', '.spz'];

// frameNNNN.ply or frameNNNN.compressed.ply: prefix, frame number, extension
const frameRegex = /^(.*?)(\d+)((?:\.compressed)?\.ply)$/i;

const splitPath = (filename: string) => {
    const i = filename.lastIndexOf('/');
    return { dir: filename.substring(0, i + 1), base: filename.substring(i + 1) };
};

// A sequence's frame range, keeping the digits its first and last frame share
// outside the brackets: frame_0001.ply … frame_0005.ply is frame_000[1-5].ply
const sequenceName = (first: string, last: string) => {
    const { dir, base } = splitPath(first);
    const [, prefix, from, ext] = base.match(frameRegex);
    const to = splitPath(last).base.match(frameRegex)[2];
    let shared = 0;
    if (from.length === to.length) {
        while (shared < from.length - 1 && from[shared] === to[shared]) shared++;
    }
    return `${dir}${prefix}${from.substring(0, shared)}[${from.substring(shared)}-${to.substring(shared)}]${ext}`;
};

const kindOrder: ImportGroupKind[] = ['document', 'bundle', 'sequence', 'model', 'poses', 'unsupported'];

const analyzeImport = (filenames: string[]): ImportGroup[] => {
    const lower = filenames.map((f) => f.toLowerCase());
    const claimed = new Array<boolean>(filenames.length).fill(false);
    const groups: ImportGroup[] = [];

    const claim = (indices: number[]) => {
        indices.forEach((i) => {
            claimed[i] = true;
        });
        return indices;
    };

    // Multi-file models. Streamed SOG and LCC take their whole folder, since their
    // chunks may sit in subfolders (streamed SOG chunks have their own meta.json).
    // Unpacked SOG takes the json and webp files beside its meta.json.
    const bundleMains = (test: (base: string) => boolean) =>
        lower
            .map((f, i) => ({ i, ...splitPath(f) }))
            .filter((f) => test(f.base))
            .sort((a, b) => a.dir.length - b.dir.length);

    const addBundles = (test: (base: string) => boolean, member: (f: string, dir: string) => boolean) => {
        for (const main of bundleMains(test)) {
            if (claimed[main.i]) continue;
            const members = lower.map((_, i) => i).filter((i) => !claimed[i] && member(lower[i], main.dir));
            // main file first, the rest in their given order
            const files = claim([main.i, ...members.filter((i) => i !== main.i)]);
            groups.push({
                kind: 'bundle',
                files,
                name: filenames[main.i],
                dir: filenames[main.i].substring(0, main.dir.length)
            });
        }
    };

    const inTree = (f: string, dir: string) => f.startsWith(dir);
    addBundles((base) => base === 'lod-meta.json' || base.endsWith('.lcc') || base.endsWith('.lcc2'), inTree);
    addBundles(
        (base) => base === 'meta.json',
        (f, dir) => {
            const { dir: d, base } = splitPath(f);
            return d === dir && (base.endsWith('.json') || base.endsWith('.webp'));
        }
    );

    // PLY sequences: numbered frames sharing a folder and filename prefix
    const sequences = new Map<string, { i: number; frame: number }[]>();
    lower.forEach((f, i) => {
        if (claimed[i]) return;
        const { dir, base } = splitPath(f);
        const match = base.match(frameRegex);
        if (!match) return;
        const key = dir + match[1];
        if (!sequences.has(key)) sequences.set(key, []);
        sequences.get(key).push({ i, frame: parseInt(match[2], 10) });
    });
    for (const frames of sequences.values()) {
        if (frames.length < 2) continue;
        frames.sort((a, b) => a.frame - b.frame);
        groups.push({
            kind: 'sequence',
            files: claim(frames.map((f) => f.i)),
            name: sequenceName(filenames[frames[0].i], filenames[frames[frames.length - 1].i])
        });
    }

    // single files
    const unsupported: number[] = [];
    lower.forEach((f, i) => {
        if (claimed[i]) return;
        const { base } = splitPath(f);
        const kind: ImportGroupKind = f.endsWith('.ssproj')
            ? 'document'
            : modelExtensions.some((ext) => f.endsWith(ext))
              ? 'model'
              : base === 'images.txt' || f.endsWith('.json')
                ? 'poses'
                : 'unsupported';
        if (kind === 'unsupported') {
            unsupported.push(i);
        } else {
            groups.push({ kind, files: [i], name: filenames[i] });
        }
    });
    if (unsupported.length) {
        groups.push({ kind: 'unsupported', files: unsupported, name: unsupported.map((i) => filenames[i]).join(', ') });
    }

    // documents first, since loading one replaces the scene; otherwise keep the order found
    return groups
        .map((group, order) => ({ group, order }))
        .sort((a, b) => kindOrder.indexOf(a.group.kind) - kindOrder.indexOf(b.group.kind) || a.order - b.order)
        .map((g) => g.group);
};

// A single file, or one multi-file model, imports directly. Anything else is reviewed
// first, including a lone sequence, which the user may want as separate models.
const needsReview = (fileCount: number, groups: ImportGroup[]) =>
    fileCount > 1 && !(groups.length === 1 && groups[0].kind === 'bundle');

export { analyzeImport, needsReview };
export type { ImportGroup, ImportGroupKind };
