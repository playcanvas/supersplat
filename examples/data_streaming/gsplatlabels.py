# Annotation Definitions

import json
from typing import List
import numpy as np

class Category:
    def __init__(self, name: str, id: int, color: list, attributes: list = None):
        self.name = name
        self.id = id
        self.color = color
        self.attributes = attributes if attributes is not None else []

    def to_dict(self):
        # Only include fields that have values
        return {
            "name": self.name,
            "id": self.id,
            "color": self.color,
            "attributes": self.attributes,
        }

    @classmethod
    def from_dict(cls, data):
        return cls(data["name"], data["id"], data["color"], data.get("attributes", []))


class Annotation:
    def __init__(self, id: int, category_id: int, attributes: list = None, is_hidden: bool = False):
        self.id = id
        self.category_id = category_id
        self.attributes = attributes if attributes is not None else []
        self.is_hidden = is_hidden

    def to_dict(self):
        return {
            "id": self.id,
            "category_id": self.category_id,
            "attributes": self.attributes,
            "isHidden": self.is_hidden,
        }

    @classmethod
    def from_dict(cls, data):
        return cls(data["id"], data["category_id"], data.get("attributes", []), data.get("isHidden", False))


class Label:
    def __init__(self, name: str = "ground-truth", annotations: List[Annotation] = [], point_annotations: np.ndarray = np.array([], dtype='int16')):
        self.name = name
        self.annotations = annotations  # List of Annotation objects
        self.point_annotations = point_annotations  # int16 numpy array

    def to_dict(self):
        return {
            "format_version": "0.1",
            "annotations": [annotation.to_dict() for annotation in self.annotations],
            "point_annotations": self.point_annotations.tolist(),  # Convert to list for JSON serialization
        }

    @classmethod
    def from_dict(cls, labelname, data):
        annotations = [Annotation.from_dict(ann) for ann in data["attributes"]["annotations"]]
        point_annotations = np.array(data["attributes"]["point_annotations"], dtype=np.int16).reshape(-1)  # Convert list back to int16 array
        return cls(labelname, annotations, point_annotations)


class GSplatLabels():
    MAX_UNIFORM_COLORS = 256

    def __init__(self, data):
        # Initialize empty Label class if only name is provided
        if isinstance(data, str):
            self.name = data
            self.categories = []
            self.labels = [Label()]
        else:
            self.name = data["dataset"]["samples"][0]["name"]
            # Parsing categories
            self.categories = [Category.from_dict(cat) for cat in data["dataset"]["task_attributes"]["categories"]]

            # Parsing labels (from the first sample as per the given structure)
            self.labels = [
                Label.from_dict(labelname, data) for labelname, data in data["dataset"]["samples"][0]["labels"].items()
            ]

    def generate_n_categories(self, n: int):
        """Generates n different categories with unique colors."""
        categories = []
        annotations = []
        for i in range(n):
            # Create a unique color for each category
            # Colors will cycle through a uniformly distributed range of RGB values
            color = [
                int(255 * ((i * 37) % 256) / 255),   # Red
                int(255 * ((i * 67 + 120) % 256) / 255),   # Green
                int(255 * ((i * 97 + 240) % 256) / 255)    # Blue
            ]

            category = {
                "name": f"Category {i + 1}",
                "id": i + 1,
                "color": color,
                "attributes": []  # Optional attributes for the category
            }
            categories.append(Category.from_dict(category))

            annotation = {
                  "id": i + 1,
                  "category_id": i + 1,
                  "attributes": {},
                  "isHidden": False
            }
            annotations.append(Annotation.from_dict(annotation))

        self.categories = categories
        for label in self.labels:
            label.annotations = annotations

    def concatenated_colors(self):
        # Flatten all color arrays from categories and normalize the color values (0-255 to 0-1)
        color_array = []
        for category in self.categories:
            color_array.extend([c / 255 for c in category.color])  # Normalize by dividing by 255

        max_length = self.MAX_UNIFORM_COLORS * 3
        if len(color_array) < max_length:
            # Pad the array with zeros (black color)
            color_array.extend([0] * (max_length - len(color_array)))

        return np.array(color_array, dtype=np.float32)

    @property
    def number_of_categories(self):
        return len(self.categories)

    def to_dict(self):
        # Using Label format from: https://docs.segments.ai/reference/label-types#segmentation-label
        return {
            "created_at" : "2024-10-21 13:03:17.282112+00:00",
            "dataset": {
                "category": "Other / mixed",
                "created_at": "2024-10-21 12:02:05.860726+00:00",
                "description": "",
                "labelsets": [
                    {
                        "created_at": "2024-10-21 12:02:05.870215+00:00",
                        "description": "",
                        "is_groundtruth": True,
                        "name": "ground-truth"
                    }
                ],
                "name": "UNK",
                "owner": "UNK",
                "task_attributes": {
                    "categories": [category.to_dict() for category in self.categories],
                    "format_version": "0.1"
                },
                "samples": [
                    {
                        "name": self.name,
                        "metadata": {},
                        "uuid": "UNK",
                        "attributes": {
                        },
                        "labels": {
                            label.name: {
                                "label_status": "LABELED",
                                "attributes": label.to_dict()
                            } for label in self.labels
                        }
                        
                    }
                ],
                "task_type": "pointcloud-segmentation",
                "tasks": {
                    "ground-truth": {
                        "attributes": {
                        },
                        "description": "",
                        "task_type": ""
                    }
                }
            },
            "description": "",
            "name": "UNK"
        }

    def save_to_json(self, file_path: str):
        """Save the GSplatLabels object to a JSON file, excluding missing fields."""
        data = self.to_dict()
        with open(file_path, 'w') as json_file:
            json.dump(data, json_file, indent=4)

    @classmethod
    def load_from_json(cls, file_path: str):
        """Load the GSplatLabels object from a JSON file."""
        with open(file_path, 'r') as json_file:
            data = json.load(json_file)
        return cls(data)
    
    @classmethod
    def load_from_name(cls, name):
        return cls(name)
    