# WebMCP

SuperSplat registers 29 tools with the browser's native [WebMCP API](https://webmachinelearning.github.io/webmcp/). They operate on the open editor tab and share its selection, layers and undo history. There is no separate server, network listener, MCP bridge or arbitrary JavaScript execution tool. Browsers without WebMCP continue to run the editor normally.

The adapter uses `document.modelContext`, with feature detection for preview browsers that expose `navigator.modelContext`. Tool titles follow the editor language. WebMCP is experimental: browser availability and agent integration depend on the browser version. Native discovery and execution are covered by the browser tests described below.

## Tools

| Tools | Purpose |
| --- | --- |
| `get_scene`, `get_layer` | Inspect document, paginated layers, counts, bounds, properties, camera, viewport and history. |
| `get_histogram` | Read a GPU property distribution using the same values as the Data panel. |
| `set_selection` | Select all, clear or invert on an explicit layer. |
| `select_region` | Select or preview a world-space box, sphere or ellipsoid, including its outside. |
| `select_rectangle` | Select visible splats or through all depths within a viewport rectangle. |
| `select_property` | Select or preview an inclusive numeric property range. |
| `delete_selection`, `hide_selection`, `restore_splats` | Delete, hide or restore splats on a named layer. |
| `duplicate_selection`, `separate_selection` | Copy or move the selection into a new layer, retaining source data, transforms and colours. |
| `update_layer` | Rename, show/hide or explicitly activate a layer. |
| `transform` | Translate, rotate or uniformly scale a selection or layer in world space. |
| `apply_color`, `reset_color` | Compose or reset colour adjustments on an explicit scope. |
| `undo`, `redo` | Step through the shared editor history, including user edits. |
| `set_camera`, `focus_camera`, `pick_points` | Position the camera, frame content or find world positions under viewport points. |
| `set_view` | Change display preferences without changing splat data. |
| `get_timeline`, `set_timeline` | Inspect or set the timeline length, frame rate, playhead, playback, smoothness and looping. |
| `set_keyframes`, `move_keyframe`, `delete_keyframes` | Add, replace, move, copy or delete camera keyframes; each call is one undo entry. |
| `import_url` | Add a CORS-accessible PLY, SPLAT, SOG, SPZ or KSPLAT URL as an undoable layer. |
| `export_scene` | Download PLY, compressed PLY, SPLAT, SOG, SPZ, or a standalone HTML/ZIP viewer. |

The registered JSON schemas describe required arguments, ranges and defaults. Unknown arguments and invalid values produce errors rather than being silently coerced. `get_layer` lists the properties available on that layer, including its SH coefficients.

## Editing contract

Start with `get_scene` and use the returned numeric layer IDs. IDs identify layers in the current session; names are labels, not identifiers. Naming a target does not activate it. Transform and colour commands require `scope: "selection"` or `scope: "layer"`; an empty selection never falls back to the whole layer.

Edits run through `window.editor`, the same typed API and command queue used by editor actions. Each operation commits in one queue slot, and each successful data edit is one undo entry. Selection changes also enter history. No-op selections and previews do not add history. Results contain counts and layer state captured at the end of that operation. User actions can subsequently change the shared scene, so inspect again when needed.

`total` counts live instances, including hidden splats. `hidden` counts splats hidden within a layer, which remain in exports but are excluded from selection and colour edits. `deleted` counts removed instances; these are excluded from exports. Hiding an entire layer excludes it from export. Restoring deleted splats appends missing source splats in their original state; use undo to recover the exact edits that existed before deletion.

Camera, timeline settings, display settings, layer visibility and active-layer changes are session settings and do not create undo entries, although timeline settings are saved with the document. Renaming a layer and editing camera keyframes do create undo entries. `undo` and `redo` affect the shared history, not a separate agent history.

Coordinates use the editor's right-handed, Y-up world, in the model's units. Transform rotations are Euler degrees; inspected layer rotations are quaternions `[x,y,z,w]`. Rotation and scaling use the target bounds centre unless an explicit world-space `center` is supplied. Layer transforms include hidden splats; selection transforms do not.

### Preview and crop

Preview reports the number and world bounds of the matches without changing selection. For a crop, select the outside of the region to retain, then delete that selection. For example, using a layer ID returned by `get_scene`:

```json
{"layer":10,"shape":"box","center":[0,0,0],"size":[4,3,4],"outside":true,"preview":true}
```

Call `select_region` with these arguments to inspect the proposed removal, call it again with `preview: false` to select, then call `delete_selection` with `{"layer":10}`. `size` gives full extents. `footprint: 0` tests splat centres; `footprint: 1` tests the full footprint. Property previews support the same `outside` option.

### View-dependent operations

`get_scene` and camera commands return `viewport.viewToken`, the canvas CSS rectangle and render dimensions. Screen coordinates are normalized to that rectangle, with `(0,0)` at the top left and `(1,1)` at the bottom right. The agent obtains screenshots through its browser integration.

Rectangle selection and point picking require `viewToken`. Camera-dependent property selection (`camera-depth`, RGB and HSV) also requires it; `get_histogram` supplies a token for these properties. A changed camera or viewport produces `stale_view`, so the agent can inspect again instead of editing from outdated coordinates. These tokens describe the view, not a version of the model data.

Selection with `visibility: "visible"` uses the editor's depth picking and peeling behaviour on the named layer. `pick_points` returns composited Gaussian depth, which need not equal a splat centre or a solid mesh surface.

### Timeline and camera keyframes

Frames are zero-based integers: a 10-second animation at 30 fps has 300 frames, numbered 0-299, and seconds are `frame / frameRate`. `frameRate` is one of the timeline panel's rates: 1, 6, 12, 24, 30 or 60. `get_scene` includes a timeline summary. `get_timeline` returns the settings and the camera keyframes sorted by frame, each with its world `position`, `target`, `fov` and `inRange`.

`set_keyframes` writes one or more keys as a single undo entry. Each key takes `position` and `target` together, and `fov` in degrees. Omitted fields are captured from the current camera and an omitted `frame` is the playhead, as with the panel's Add Key. Keys identical to the existing ones are skipped, so repeating a call adds no history. Capturing during playback is refused with `timeline_playing`. `move_keyframe` moves or copies one key; an occupied destination fails with `key_exists` unless `overwrite: true` is passed. `delete_keyframes` changes nothing if any of its frames has no key (`key_not_found`).

`set_timeline` applies `frames`, `frameRate`, `smoothness` and `loop` before moving the playhead to `frame`. Seeking during playback continues from the new frame; `playing` starts or pauses playback. Shortening the timeline clamps the playhead and keeps keys beyond the end, marked `inRange: false`. They can be moved back into range or deleted, but keys cannot be created or moved beyond the end.

While keys exist, the camera follows the animation at the playhead, including after a seek to the current frame, so timeline commands return the resulting `camera` and a new `viewport.viewToken`. Playback moves the camera every frame: pause before using view-dependent tools. When a PLY sequence is loaded, a seek waits for that frame's splats before returning.

For example, to author a 10-second camera move between two explicit poses as one undoable edit, call `set_timeline` with:

```json
{"frames":300,"frameRate":30,"loop":false}
```

then `set_keyframes` with:

```json
{"keys":[{"frame":0,"position":[0,1,6],"target":[0,0,0],"fov":60},{"frame":299,"position":[6,2,0],"target":[0,0,0],"fov":45}]}
```

and preview it with `set_timeline` and `{"frame":0,"playing":true}`.

### Files and cancellation

URL import accepts HTTP(S) URLs without embedded credentials. Supply `filename` when a signed or extensionless URL does not identify its format. Cross-origin servers must permit browser access. The recommended LOD is used unless `lod` is specified, so automated imports do not open a LOD dialog.

Export requires an explicit filename, format and scope (`selection`, `layer` or `visible_layers`). It uses the existing editor exporters and preserves source SH bands unless requested otherwise. Viewer exports use the current camera and background. A successful export reports `download_requested`; browser download settings determine where or whether the file is saved. It does not grant access to arbitrary local paths. Project replacement, publishing, image and video rendering, and local file pickers are outside this tool set.

The native invocation signal is checked before queued mutations and again after asynchronous GPU queries. Cancellation before a commit leaves the edit unapplied. Once committed, an edit remains in history and can be undone. Loading and compression may finish their current work before cancellation is observed; a cancelled import is not attached, and the signal is checked again before an export requests its download. Native browser cancellation can reject its caller before the tool callback has finished cleaning up.

Successful tools return `{ "ok": true, ... }`. Failures return `{ "ok": false, "error": { "code": "...", "message": "..." } }`, including `invalid_input`, `layer_not_found`, `layer_removed`, `layer_hidden`, `empty_selection`, `stale_view`, `key_not_found`, `key_exists`, `timeline_playing`, `busy`, `cancelled` and `operation_failed`. Visual commands also report whether a subsequent frame rendered; `rendered: false` does not mean the edit failed.

## Development and verification

```sh
npm test
npm run fmt
npm run lint
npm run lint:locales
npm run build
node test/browser-webmcp.mjs
node test/browser-webmcp.mjs --without-webmcp
```

The browser test requires Node.js 22 or later and Chrome with WebGPU and the experimental `WebMCP`/`WebMCPTesting` features. It launches an isolated profile, serves a generated model on loopback, executes native tools, checks all output formats and export/reimport, authors and plays a camera animation, then closes the browser and deletes its temporary files. It does not use your existing browser profile. Set `CHROME_PATH` to override the browser executable. `WEBMCP_SCREENSHOT` can name a PNG output path for visual inspection. The disabled-feature run checks that ordinary editor import, selection and undo still work without WebMCP.

For interactive testing, run `npm run develop` and open the editor in a WebMCP-enabled browser. In builds with native testing enabled, DevTools can invoke a registered tool:

```js
const context = document.modelContext ?? navigator.modelContext;
const tools = await context.getTools();
const sceneTool = tools.find(tool => tool.name === 'get_scene');
const scene = JSON.parse(await context.executeTool(sceneTool, {}));
console.log(scene);
```

The Node tests cover input validation, explicit scopes, queue ordering, result snapshots, cancellation before commit, GPU-mask release, timeline and keyframe edits, and registration cleanup. The browser suite checks real rendering and GPU operations through native WebMCP without mocking the browser API.
