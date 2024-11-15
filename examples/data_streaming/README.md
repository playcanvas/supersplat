# SuperSplat Annotation and Hot-Reload Demo

## Installation:
Python version supporting gaussian-splatting: 3.7.16
We use conda to manage our dependencies

```
conda create -n SuperSplatDemo python=3.7.16
```

Fetch and initialize all submodules - This will probably fail, but will install enough libraries to run the demo!
```
git submodule update --init --recursive

conda env update --name SuperSplatDemo --file ./dependencies/gaussian-splatting/environment.yml
```

## Usage:
Run demo through Splat_annotation.ipynb notebook.
Additionally, you will need to run the dataserver in external process, build and run this version of SuperSplat.