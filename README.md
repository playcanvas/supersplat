# SuperSplat - 3D Gaussian Splat Editor

SuperSplat is a free and open source tool for inspecting and editing 3D Gaussian Splats. It is built on web technologies and runs in the browser, so there's nothing to download or install.

A live version of this tool is available at: https://playcanvas.com/supersplat/editor

<img width="1414" alt="supersplat" src="https://github.com/user-attachments/assets/dc41179e-afe6-4600-9879-b03bd7088709">

See https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/ for more information on gaussian splats.

## Loading Scenes

To load a Gaussian splat PLY file, drag & drop it onto the application page. Alternatively, use the Scene menu and choose "Open".

<img width="369" alt="SuperSplatFileMenu" src="https://github.com/user-attachments/assets/3161bf8e-3eb3-4ffe-a931-ac6c0b9b348d">

If you disable the "Load all PLY data" option before loading the file, then the PLY data not required by the editor is excluded (for example the spherical harmonic data). This can save on browser memory.

## Editing Scenes

Once a PLY file is loaded, you will see it appear in the SCENE MANAGER panel. Use this panel to hide splats, remove them from the scene, orientate them and select the current splat for editing.

<img width="320" alt="Screenshot 2024-08-08 at 14 07 25" src="https://github.com/user-attachments/assets/2e300ee7-bf29-4e99-9cd6-830969394f07">

Use the bottom toolbar to access the selection tools, tranform tools and undo/redo.

<img width="465" alt="Screenshot 2024-08-08 at 14 17 48" src="https://github.com/user-attachments/assets/0f65858b-7d6b-402b-b006-3da1510242d6">

The SPLAT DATA panel plots various scene properties on a histogram display. You can select splats directly by dragging on the histogram view. Use the Shift key to add to the current selection and Ctrl key to remove from the current selection.

<img width="1301" alt="Screenshot 2024-08-08 at 14 02 08" src="https://github.com/user-attachments/assets/41f1040c-5719-4dc0-81d0-daed5664d2e6">

## Saving Results

Once you're done editing the scene, use the Scene menu to Save, Save As and Export the scene to the local file system. Only visible splats are written.

## Local Development

The steps required to clone the repo and run a local development server are as follows:

```sh
git clone https://github.com/playcanvas/supersplat.git
cd supersplat
npm i
npm run develop
```

The last command `npm run develop` will build and run a local version of the editor on port 3000. Changes to the source are detected and the editor is automatically rebuilt.

To access the local editor instance, open a browser tab and navigate to `http://localhost:3000`.
