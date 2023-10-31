# Super Splat

![](https://github.com/playcanvas/super-splat/assets/697563/b68bfc02-c651-4488-8ad7-80868decfdee)

The PlayCanvas Super Splat tool is for editing gaussian splat PLY files.

See https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/ for more information on gaussian splats.

A live version of this tool is available at:
https://playcanvas.com/super-splat

# Editing Scenes

To load a gaussian splat PLY file, drag & drop it onto the application page. Alternatively you can click the "Choose file" button bottom right.

Once a PLY file is loaded you can use the selection tools to modify splat selection and then delete splats from the scene.

You can also reorient the scene using the "Scene Orientation" controls.

# Saving results

Once you're done editing the scene, click the Export -> "Ply file" button to export the edited splat scene to the local file system.

# Current limitations

This editor is in beta and so currently has a number of limitations:
- Only supports gaussian splat PLY files
- Spherical harmonic data is not saved on export
