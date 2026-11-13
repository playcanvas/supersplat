// The file types the editor imports, in one place. Import, the import review,
// the pickers, the drop overlay and URL import all read from here, so a new
// format added here is recognised everywhere at once. src/manifest.json can't
// import this; a test keeps its file handlers in step.

// single files that load as one splat model
const modelExtensions = ['.ply', '.splat', '.ksplat', '.spz', '.sog'];

// a SuperSplat project, which replaces the scene when opened
const documentExtension = '.ssproj';

// Multi-file models, named by a main file. Streamed SOG (lod-meta.json) and LCC
// (.lcc, .lcc2) take their whole folder, since their chunks may sit in
// subfolders; unpacked SOG (meta.json) takes the json and webp files beside it.
const lcc = ['.lcc', '.lcc2'];
const isTreeBundleMain = (base: string) => base === 'lod-meta.json' || lcc.some((ext) => base.endsWith(ext));
const isFlatBundleMain = (base: string) => base === 'meta.json';
const isFlatBundleMember = (base: string) => base.endsWith('.json') || base.endsWith('.webp');

// the files a multi-file model can include, for pickers
const bundleExtensions = [...lcc, '.bin', '.json', '.webp'];

// camera poses: colmap images.txt or an inria cameras json
const isPosesFile = (base: string) => base === 'images.txt' || base.endsWith('.json');

// frameNNNN.ply or frameNNNN.compressed.ply: prefix, frame number, extension
const frameRegex = /^(.*?)(\d+)((?:\.compressed)?\.ply)$/i;

const basename = (filename: string) => filename.substring(filename.lastIndexOf('/') + 1);

const isModelFile = (filename: string) => modelExtensions.some((ext) => filename.toLowerCase().endsWith(ext));

// the single-file model formats by name, for messages: "PLY, SPLAT, ..."
const modelFormatNames = modelExtensions.map((ext) => ext.substring(1).toUpperCase()).join(', ');

// every extension a file picker should offer
const importExtensions = [...modelExtensions, documentExtension, ...bundleExtensions, '.txt'];

// the formats the drop overlay lists as accepted
const dropFormats = [...modelExtensions, '.lcc', documentExtension];

export {
    basename,
    documentExtension,
    dropFormats,
    frameRegex,
    importExtensions,
    isFlatBundleMain,
    isFlatBundleMember,
    isModelFile,
    isPosesFile,
    isTreeBundleMain,
    modelExtensions,
    modelFormatNames
};
