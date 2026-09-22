"""
AgriSense — Crop Recommendation Production Inference Pipeline
--------------------------------------------------------------
This module provides a production-ready, decoupled inference interface for the
selected Random Forest crop recommendation model.

Architecture & Flow:
  Raw Agricultural Input (Dictionary)
                 ↓
      Input Validation & Type Check
                 ↓
      Canonical Feature Ordering [N, P, K, temp, humidity, ph, rainfall]
                 ↓
      Random Forest Classifier (predict_proba)
                 ↓
      Softmax Class Probabilities
                 ↓
      Label Encoder (Inverse Transformation)
                 ↓
      Structured Recommendation Output (Top Prediction + Top-3 Candidates)
"""

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

class CropInferenceError(ValueError):
    """Custom exception raised when inference input fails schema or type validation."""
    pass

class CropRecommender:
    """
    Encapsulates the trained Random Forest model and associated label encoder
    to provide cached, high-throughput inference without redundant disk I/O.
    """

    def __init__(self, saved_model_dir: Optional[str] = None):
        """
        Initializes the recommender by loading model artifacts from saved_model_dir.
        If no directory is provided, it resolves to the standard project layout.
        """
        if saved_model_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            saved_model_dir = os.path.join(base_dir, "saved_model")

        self.saved_model_dir = saved_model_dir
        self.model_path = os.path.join(saved_model_dir, "random_forest_model.pkl")
        self.encoder_path = os.path.join(saved_model_dir, "label_encoder.pkl")
        self.metadata_path = os.path.join(saved_model_dir, "metadata.json")

        self._load_artifacts()

    def _load_artifacts(self):
        """Loads and verifies model, encoder, and schema metadata."""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Trained Random Forest model not found at: {self.model_path}")
        if not os.path.exists(self.encoder_path):
            raise FileNotFoundError(f"Label encoder artifact not found at: {self.encoder_path}")
        if not os.path.exists(self.metadata_path):
            raise FileNotFoundError(f"Model metadata not found at: {self.metadata_path}")

        self.model = joblib.load(self.model_path)
        self.label_encoder = joblib.load(self.encoder_path)

        with open(self.metadata_path, "r") as f:
            self.metadata = json.load(f)

        self.expected_features: List[str] = self.metadata.get(
            "features", ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
        )
        self.classes: List[str] = self.metadata.get("classes", list(self.label_encoder.classes_))

    def validate_and_order_features(self, raw_input: Dict[str, Any]) -> np.ndarray:
        """
        Validates input structure and constructs a 2D numpy array with features
        arranged in the exact canonical order expected by the model.

        Guarantees:
        1. Input is a dictionary.
        2. All required features are present.
        3. No None or empty values.
        4. All values are convertible to float.
        5. Ignores arbitrary dictionary insertion order.
        """
        if not isinstance(raw_input, dict):
            raise CropInferenceError(f"Input must be a dictionary of features, received: {type(raw_input).__name__}")

        # Check for missing features
        missing = [feat for feat in self.expected_features if feat not in raw_input]
        if missing:
            raise CropInferenceError(f"Missing required feature(s): {missing}. Required features are: {self.expected_features}")

        ordered_values: List[float] = []
        for feat in self.expected_features:
            val = raw_input[feat]
            if val is None:
                raise CropInferenceError(f"Feature '{feat}' cannot be None.")
            
            try:
                numeric_val = float(val)
            except (ValueError, TypeError):
                raise CropInferenceError(f"Invalid non-numeric value for '{feat}': {val!r} (expected a number).")

            # Check for NaN or Inf
            if np.isnan(numeric_val) or np.isinf(numeric_val):
                raise CropInferenceError(f"Feature '{feat}' contains invalid numeric value: {numeric_val}.")

            ordered_values.append(numeric_val)

        # Return DataFrame with explicit feature column names to match model training signature
        return pd.DataFrame([ordered_values], columns=self.expected_features)

    def predict(self, raw_input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes prediction on raw agricultural features:
        1. Validates and enforces canonical feature order.
        2. Computes class probabilities via model.predict_proba.
        3. Decodes class indices into crop names.
        4. Returns top recommendation and top-3 candidates.
        """
        # Validate and prepare unscaled feature array
        X_input = self.validate_and_order_features(raw_input)

        # Obtain class probability distribution
        probabilities = self.model.predict_proba(X_input)[0]

        # Top predicted class index
        top_idx = int(np.argmax(probabilities))
        predicted_crop = self.label_encoder.inverse_transform([top_idx])[0]
        confidence = round(float(probabilities[top_idx]), 4)

        # Top 3 Candidate Crops
        top3_indices = np.argsort(probabilities)[::-1][:3]
        top_3_candidates = [
            {
                "crop": self.label_encoder.inverse_transform([idx])[0],
                "probability": round(float(probabilities[idx]), 4)
            }
            for idx in top3_indices
        ]

        return {
            "predicted_crop": predicted_crop,
            "confidence": confidence,
            "top_3": top_3_candidates
        }

# Module-level singleton instance for zero-boilerplate imports
_default_recommender: Optional[CropRecommender] = None

def get_recommender() -> CropRecommender:
    """Returns the singleton instance of CropRecommender, initializing it on first call."""
    global _default_recommender
    if _default_recommender is None:
        _default_recommender = CropRecommender()
    return _default_recommender

def predict_crop(raw_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience function for external services to execute crop recommendation.
    Reuses cached model and transformers without re-reading from disk.
    """
    recommender = get_recommender()
    return recommender.predict(raw_input)
