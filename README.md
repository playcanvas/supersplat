# SuperSplat

The PlayCanvas SuperSplat tool is used to edit gaussian splat PLY files.

<img width="1696" alt="super-splat" src="https://github.com/playcanvas/super-splat/assets/11276292/f86cb5a2-649c-49db-9ea2-aa85b5b40b27">

See https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/ for more information on gaussian splats.

A live version of this tool is available at:
https://playcanvas.com/supersplat/editor

## Loading Scenes

To load a Gaussian splat PLY file, drag & drop it onto the application page.

Alternatively, use the File menu at the top left of the screen and choose "Open".

<img width="317" alt="SuperSplatFileMenu" src="https://github.com/playcanvas/supersplat/assets/11276292/9efe950c-d79d-42c9-bbc6-5f6ca82772e7">

If you disable the "Load all PLY data" option before loading the file, then the PLY data not required by the editor is excluded (for example the spherical harmonic data). This can save on browser memory.

## Editing Scenes

Once a PLY file is loaded you can use the selection tools to modify splat selection and then delete splats from the scene.

You can also reorient the scene using the SCENE Position/Rotation/Scale controls.

## Saving results

Once you're done editing the scene, click the Export -> "Ply file" button to export the edited splat scene to the local file system.

## Current limitations

This editor is in beta and so currently has some limitations:

- Only supports Gaussian splat PLY files
- Spherical harmonic data is not rotated on export

## Local Development

The steps required to clone the repo and run a local development server are as follows:

```sh
git clone https://github.com/playcanvas/super-splat.git
cd super-splat
npm i
npm run develop
```

The last command `npm run develop` will build and run a local version of the editor on port 3000. Changes to the source are detected and the editor is automatically rebuilt.

To access the local editor instance, open a browser tab and navigate to `http://localhost:3000`.
