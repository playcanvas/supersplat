from scene.gaussian_model import GaussianModel
from gsplatlabels import GSplatLabels
import torch
from torch import nn
import os
import io
import numpy as np
from pathlib import Path
from plyfile import PlyData, PlyElement
from websocket import WebSocketProxy
from utils.system_utils import mkdir_p

class AnnotatedModel(GaussianModel):
    def __init__(self, sh_degree:int):
        self.fileName: str = ""
        self.labelData: GSplatLabels = None
        self._class_id = torch.empty(0)

        super().__init__(sh_degree)

    def load_ply(self, path):
        super().load_ply(path)
        self.fileName = os.path.basename(path)

    def load_labels(self, path):
        """Load labels from a JSON file and initialize _class_id from them."""
        # Load labels from the JSON file
        self.labelData = GSplatLabels.load_from_json(path)
        
        # Assuming the labelData has the class_id in each annotation
        # Extract class_ids from the annotations and store them in _class_id tensor
        point_annotations = self.labelData.labels[0].point_annotations.copy()
        
        class_ids = point_annotations[..., np.newaxis]  # Expand dims for tensor shape
        self._class_id = nn.Parameter(torch.tensor(class_ids, dtype=torch.float, device="cuda").requires_grad_(False))

    def load_np_labels(self, labels):
        class_ids = labels.copy()[..., np.newaxis]  # Expand dims for tensor shape
        self._class_id = nn.Parameter(torch.tensor(class_ids, dtype=torch.float, device="cuda").requires_grad_(False))

    def initialize_empty_labels(self):
        self.labelData = GSplatLabels.load_from_name(self.fileName) # Must provide name that matches the ply filename.
        point_annotations = self.labelData.labels[0].point_annotations.copy()
        class_ids = point_annotations[..., np.newaxis]  # Expand dims for tensor shape
        self._class_id = nn.Parameter(torch.tensor(class_ids, dtype=torch.float, device="cuda").requires_grad_(False))

    def commit_labels(self):
        # Detach _class_id from GPU, convert to NumPy array and save it in the labels
        class_ids = self._class_id.detach().cpu().numpy()
        # Assuming class_ids correspond to the annotations in the order they were loaded
        self.labelData.labels[0].point_annotations = class_ids.copy().reshape(-1)

    def save_labels(self, path):
        """Save labels to a JSON file from _class_id tensor."""
        # Commit labels to dataset from memory
        self.commit_labels()
        # Save labelData back to the JSON file
        self.labelData.save_to_json(path)

    ## Websocket proxy API methods
    def upload_ply(self):
        """Uploads the current model data to the API"""
        ply_data = self.save_ply_to_memory()  # Create in-memory ply data
        return WebSocketProxy.upload_ply_data(ply_data, self.fileName)

    def upload_labels(self):
        """
        Upload the labels dictionary as a JSON message.
        """
        # Save the latest labels to the label dataset from numpy array.
        self.commit_labels()
        # Upload json dictionary to websocket
        labels_data = self.labelData.to_dict()
        return WebSocketProxy.upload_labels_data(labels_data)
    
    def save_ply_to_memory(self):
        """Uses the existing save_ply method to save the .ply data into a memory buffer."""
        # Create a BytesIO object to act as an in-memory file
        memory_file = io.BytesIO()

        # Write current ply data to memory file
        self.save_ply(memory_file)

        # Get the bytes content from the memory file
        memory_file.seek(0)  # Move the pointer to the beginning of the file
        return memory_file.getvalue()
    
    # Override super 'save_ply' method to support in-memory files
    def save_ply(self, path):
        if isinstance(path, (str, Path)):
            # This is a file path, so create directories if necessary
            mkdir_p(os.path.dirname(path))
        elif isinstance(path, io.BytesIO):
            # Skip directory creation for in-memory file
            pass
        else:
            raise TypeError("Expected str, bytes, or os.PathLike object, not {}".format(type(path)))

        xyz = self._xyz.detach().cpu().numpy()
        normals = np.zeros_like(xyz)
        f_dc = self._features_dc.detach().transpose(1, 2).flatten(start_dim=1).contiguous().cpu().numpy()
        f_rest = self._features_rest.detach().transpose(1, 2).flatten(start_dim=1).contiguous().cpu().numpy()
        opacities = self._opacity.detach().cpu().numpy()
        scale = self._scaling.detach().cpu().numpy()
        rotation = self._rotation.detach().cpu().numpy()

        dtype_full = [(attribute, 'f4') for attribute in self.construct_list_of_attributes()]

        elements = np.empty(xyz.shape[0], dtype=dtype_full)
        attributes = np.concatenate((xyz, normals, f_dc, f_rest, opacities, scale, rotation), axis=1)
        elements[:] = list(map(tuple, attributes))
        el = PlyElement.describe(elements, 'vertex')
        PlyData([el]).write(path)
    
    @property
    def get_class_id(self):
        return self._class_id

class DatasetParams():
    def __init__(self, ply_source, ply_dest, label_source, label_dest):
        self.sh_degree = 3
        self.ply_source = Path(ply_source)
        self.ply_dest = Path(ply_dest)
        self.label_source = Path(label_source)
        self.label_dest = Path(label_dest)