# SuperSplat Annotation and Hot-Reload Demo

## Installation:
Python version supporting gaussian-splatting: 3.7.16
We use conda to manage our dependencies

```
conda create -n SuperSplatDemo python=3.7.16
conda activate SuperSplatDemo
```

Fetch and initialize all submodules (may require installing cuda libraries for gaussian-splatting)- This will probably fail, but will install enough libraries to run the demo!
```
cd ./examples/data_streaming
git submodule update --init --recursive

conda env update --name SuperSplatDemo --file ./dependencies/gaussian-splatting/environment.yml
```

## Usage:
Run demo through Splat_annotation.ipynb notebook.
Additionally, you will need to run the dataserver in external process, build and run this version of SuperSplat.