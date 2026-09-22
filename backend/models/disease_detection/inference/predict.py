import os
import json
import numpy as np
from PIL import Image, UnidentifiedImageError
import tensorflow as tf
import keras

class DiseaseInferenceError(Exception):
    """Custom exception for disease inference errors (e.g., invalid inputs)."""
    pass

class DiseaseDetector:
    """
    Reusable inference module for the AgriSense Disease Detection model.
    Uses a singleton-style loaded model to avoid reloading on every prediction.
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(DiseaseDetector, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_dir: str = None):
        if self._initialized:
            return

        # Resolve paths
        if model_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_dir = os.path.join(base_dir, "saved_model")
        
        self.model_path = os.path.join(model_dir, "disease_model.keras")
        self.metadata_path = os.path.join(model_dir, "training_metadata.json")

        self._verify_artifacts()
        
        # Load metadata
        with open(self.metadata_path, "r") as f:
            metadata = json.load(f)
            
        self.class_mapping = metadata["class_mapping"]
        self.input_shape = metadata["architecture"]["input_shape"]
        self.target_size = (self.input_shape[0], self.input_shape[1])
        
        # Load model using modern Keras 3 API
        try:
            self.model = keras.saving.load_model(self.model_path, compile=False)
        except Exception as e:
            raise DiseaseInferenceError(f"Failed to load model from {self.model_path}. Error: {str(e)}")
            
        self._initialized = True

    def _verify_artifacts(self):
        if not os.path.exists(self.model_path):
            raise DiseaseInferenceError(f"Model artifact not found at {self.model_path}")
        if not os.path.exists(self.metadata_path):
            raise DiseaseInferenceError(f"Metadata artifact not found at {self.metadata_path}")

    def _parse_class_name(self, class_name: str) -> tuple[str, str]:
        """
        Parses the canonical PlantVillage class name into crop and disease.
        Example: Tomato___Late_blight -> (Tomato, Late blight)
        Example: Potato___healthy -> (Potato, Healthy)
        """
        if "___" not in class_name:
            return "Unknown", class_name
            
        crop_part, disease_part = class_name.split("___", 1)
        
        # Clean up crop name
        crop = crop_part.replace("_", " ").strip()
        
        # Clean up disease name
        disease = disease_part.replace("_", " ").strip()
        if disease.lower() == "healthy":
            disease = "Healthy"
        elif disease == "Cercospora leaf spot Gray leaf spot":
             disease = "Cercospora / Gray leaf spot" # Just to make it slightly cleaner, or leave it as is.
             
        return crop, disease

    def validate_and_load_image(self, image_path: str) -> np.ndarray:
        """
        Validates the input path and loads the image, applying exact training preprocessing.
        """
        if not image_path:
            raise DiseaseInferenceError("Image path cannot be empty.")
            
        if not os.path.exists(image_path):
            raise DiseaseInferenceError(f"Image not found at path: {image_path}")
            
        if not os.path.isfile(image_path):
            raise DiseaseInferenceError(f"Path is not a valid file: {image_path}")

        try:
            # 1. Load image and convert to RGB
            img = Image.open(image_path).convert("RGB")
        except UnidentifiedImageError:
            raise DiseaseInferenceError(f"File is not a valid or supported image format: {image_path}")
        except Exception as e:
            raise DiseaseInferenceError(f"Failed to read image at {image_path}. Error: {str(e)}")

        # 2. Resize to required dimensions (224x224) using BILINEAR interpolation like tf.image.resize
        img = img.resize(self.target_size, Image.Resampling.BILINEAR)
        
        # 3. Convert to float32 array
        img_array = np.array(img, dtype=np.float32)
        
        # 4. Normalize to [0.0, 1.0] (matching training preprocessing)
        img_array = img_array / 255.0
        
        # 5. Add batch dimension -> (1, 224, 224, 3)
        img_array = np.expand_dims(img_array, axis=0)
        
        return img_array

    def predict(self, image_path: str) -> dict:
        """
        Runs the full inference pipeline for a given image path.
        """
        # Validate and preprocess
        img_array = self.validate_and_load_image(image_path)
        
        # Check unexpected shape just in case
        expected_shape = (1, self.target_size[0], self.target_size[1], 3)
        if img_array.shape != expected_shape:
            raise DiseaseInferenceError(f"Unexpected preprocessed shape {img_array.shape}, expected {expected_shape}")

        # Run inference
        probs = self.model.predict(img_array, verbose=0)[0]
        
        # Get top 3 predictions
        top_3_indices = np.argsort(probs)[::-1][:3]
        
        top_3_results = []
        for idx in top_3_indices:
            idx_str = str(idx)
            canonical_name = self.class_mapping[idx_str]
            crop, disease = self._parse_class_name(canonical_name)
            confidence = float(probs[idx])
            
            top_3_results.append({
                "canonical_name": canonical_name,
                "crop": crop,
                "disease": disease,
                "confidence": confidence,
                "display_name": f"{crop} {disease}"
            })

        # Primary prediction is the top 1
        best_prediction = top_3_results[0]

        return {
            "predicted_disease": best_prediction["disease"],
            "crop": best_prediction["crop"],
            "confidence": best_prediction["confidence"],
            "canonical_name": best_prediction["canonical_name"],
            "top_3": top_3_results
        }


def predict_disease(image_path: str) -> dict:
    """
    Convenience function to run disease inference.
    Initializes the DiseaseDetector (singleton) and runs prediction.
    """
    detector = DiseaseDetector()
    return detector.predict(image_path)
