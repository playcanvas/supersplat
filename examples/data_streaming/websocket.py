# Websocket Proxy API handler
import os
import json
import requests

class WebSocketProxy():
    WEBSOCKET_PROXY_API_ENDPOINT: str = "http://localhost:3002/send-point-cloud"
    # Message headers
    PLY = "PLY"
    LABELS = "LABELS"

    @classmethod
    def construct_ply_message(cls, blob):
        header = cls.PLY.encode('utf-8')
        header_padded = header.ljust(64, b'\x00')
        return header_padded + blob
    
    @classmethod
    def construct_labels_message(cls, blob):
        header = cls.LABELS.encode('utf-8')
        header_padded = header.ljust(64, b'\x00')
        return header_padded + blob
    
    # Upload methods for model files
    @classmethod
    def upload_ply_file(cls, ply_path: str):
        """Uploads the model data to the websocket proxy API by preparing and sending the .ply file."""
        file_name = os.path.basename(ply_path)

        # Read the file content
        with open(ply_path, 'rb') as f:
            data = f.read()

        return cls.upload_ply_data(data, file_name)

    @classmethod
    def upload_labels_file(cls, labels_path: str):
        """Uploads the model data to the websocket proxy API by preparing and sending the .json file."""
        # Load labels content
        with open(labels_path, 'r') as f:
            labels_dict = json.load(f)

        return cls.upload_labels_data(labels_dict)
    
    @classmethod
    def upload_ply_data(cls, data:bytes, file_name:str):
        """Prepares the binary blob from the model's ply file for uploading."""
        file_name_encoded = file_name.encode('utf-8')
        file_name_padded = file_name_encoded.ljust(64, b'\x00')  # Pad to 64 bytes with null bytes

        message = WebSocketProxy.construct_ply_message(file_name_padded + data)
        return requests.post(WebSocketProxy.WEBSOCKET_PROXY_API_ENDPOINT, data=message).json()
    
    @classmethod
    def upload_labels_data(cls, labels_dict:dict):
        """Prepares the binary blob from the model's label json file for uploading."""
        file_name = labels_dict["dataset"]["samples"][0]["name"].encode('utf-8')
        file_name_padded = file_name.ljust(64, b'\x00')  # Pad to 64 bytes with null bytes

        labels_json = json.dumps(labels_dict)
        labels_data = labels_json.encode('utf-8')

        message = WebSocketProxy.construct_labels_message(file_name_padded + labels_data)
        return requests.post(WebSocketProxy.WEBSOCKET_PROXY_API_ENDPOINT, data=message).json()

