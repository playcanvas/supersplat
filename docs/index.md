# SuperSplat User Guide

Welcome to the SuperSplat User Guide.

SuperSplat is an open source, browser-based 3D Gaussian Splat Editor. You can use it to view, inspect, transform, combine, crop, clean up and optimize 3D Gaussian Splats.

## Installing SuperSplat

SuperSplat is a web app so you do not need to install it. Simply point your browser at:

https://playcanvas.com/supersplat/editor

However, for your convenience, you can also install SuperSplat as a PWA (Progressive Web App). This will make SuperSplat appear and behave more like a native application. An app icon for SuperSplat will be generated on your desktop or home screen. Furthermore, .ply files will be associated with the SuperSplat PWA, enabling you to launch SuperSplat more quickly.

## Loading Splats

SuperSplat loads splats from .ply files. Only .ply files containing 3D Gaussian Splat data can be loaded. If you attempt to load any other type of data from a .ply file, it will fail.

There are two ways that you can load a .ply file:

1. Drag and drop one or more .ply files from your file system into SuperSplat's client area.
2. Select the `Scene` > `Open` menu item and select one or more .ply files from your file system.
3. Use the `load` query parameter. This is in the form: `https://playcanvas.com/supersplat/editor?load=<PLY_URL>`. An example would be:

    https://playcanvas.com/supersplat/editor?load=https://raw.githubusercontent.com/willeastcott/assets/main/dragon.compressed.ply

    This is a useful mechanism for sharing splats with other people (say on social platforms like X and LinkedIn).

## Saving Splats

To save the currently loaded scene, select the `Scene` > `Save` or `Save As` menu items. This will save a `.ply` file to your file system.

SuperSplat can also export to two additional formats via the `Scene` > `Export` sub-menu:

* **Compressed Ply**: A lightweight, compressed format that is far smaller than the equivalent uncompressed .ply file. It quantizes splat data and drops spherical harmonics from the output file. See [this article](https://blog.playcanvas.com/compressing-gaussian-splats/) for more details on the format.
* **Splat File**: Another compressed format, although not as efficient as the compressed ply format.

## Controlling the Camera

The camera controls in SuperSplat are as follows:

| Control                                         | Description                     |
| ----------------------------------------------- | ------------------------------- |
| Left Mouse Button<br>Shift + Right Mouse Button | Orbit camera                    |
| Middle Mouse Button<br>Alt + Right Mouse Button | Dolly camera                    |
| Right Mouse Button                              | Pan camera                      |
| Left/Right Arrow Keys                           | Strafe camera left/right        |
| Up/Down Arrow Keys                              | Dolly camera forwards/backwards |
| F Key                                           | Frame selection                 |

To set the target point for orbiting the camera, double click anywhere in the 3D view.

## Visualizing Splats

Splats can be rendered in two 'modes':

* **Centers Mode**: A blue dot is rendered at the center of each Gaussian.
* **Rings Mode**: A ring is rendered at the outer boundary of each Gaussian.

You can disable rendering of the centers or rings (depending on the active mode) by pressing Space. This allows you to view the scene as it would normally appear.

You can control the pixel size of the center dots in the VIEW OPTIONS panel.

## Selecting and Deleting Splats

Cropping splats or deleting unwanted Gaussians is a key function of SuperSplat. To help with this, there are 3 selection tools available:

* **Picker Select**: Click to select, or click + drag to rect select.
* **Brush Select**: Click and drag a selection circle. Change the brush size with the `[` and `]` keys.
* **Sphere Select**: Activate a sphere volume to add or remove splats from the current selection. Double click on any splat to reposition the sphere volume.

Once you are happy with your selection, you can delete it with the Delete key.

## Transforming Splats

SuperSplat can translate, rotate and scale splats. To do this, select a splat in the Scene Manager and activate one of the gizmos via the horizontal icon bar.

To achieve fine grain control over the transform of the selected splat, you can use the TRANSFORM panel (below the SCENE MANAGER panel).

To set the origin of the currently active gizmo, double click anywhere in the 3D view.

## Merging Splats

It is possible to merge multiple .ply files together and output a single, combine .ply file. Simply load any number of .ply files into Scene Manager, perform whatever transformations and edits you require, and then save the result via the `Scene` > `Save` menu item.

## Inspecting Splat Data

The Data Panel can be used to analyze the contents of your splat scenes. Initially, it is collapsed at the bottom of the application's window. To open it, click on the panel's header or press the 'D' key.

The Data Panel plots various scene properties on a histogram display. You can select splats directly by dragging on the histogram view. Use the Shift key to add to the current selection and the Ctrl key to remove from the current selection.
