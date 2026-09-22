"""
AgriSense — Crop Recommendation Preprocessing Pipeline
-------------------------------------------------------
This module prepares raw agricultural data for model training and evaluation.

Architectural Design:
1. RAW DATA: Loaded without premature transformations.
2. STRATIFIED SPLITTING: Split into Train (70%), Validation (15%), and Test (15%)
   using stratified sampling so each of the 22 crop classes is equally represented.
3. MODEL-SPECIFIC PREPROCESSING:
   - Tree Ensembles (Random Forest, XGBoost): Receive unscaled numerical features.
   - Neural Network: Receives standardized features using StandardScaler fitted
     STRICTLY on the training split (zero data leakage).
4. TARGET ENCODING:
   - Encodes 22 categorical crop labels into zero-indexed integers [0, 21].
   - Exports the LabelEncoder, explicit JSON mappings, and feature metadata
     to `saved_model/` for inference consistency.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

# Default Feature Schema
EXPECTED_FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET_COLUMN = "label"

def load_dataset(csv_path: str) -> pd.DataFrame:
    """Loads and validates the raw crop recommendation dataset."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset file not found at: {csv_path}")
    df = pd.read_csv(csv_path)
    
    # Validate columns
    missing_cols = set(EXPECTED_FEATURES + [TARGET_COLUMN]) - set(df.columns)
    if missing_cols:
        raise ValueError(f"Dataset is missing required columns: {missing_cols}")
        
    return df

def create_stratified_splits(
    df: pd.DataFrame, 
    test_size: float = 0.15, 
    val_size: float = 0.15, 
    random_state: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.Series]:
    """
    Splits the dataset into Train, Validation, and Test partitions using
    two-step stratified sampling on the target column.
    
    Default:
    - Train: 70% (1,540 samples, 70 per class)
    - Val:   15% (330 samples, 15 per class)
    - Test:  15% (330 samples, 15 per class)
    """
    X = df[EXPECTED_FEATURES].copy()
    y = df[TARGET_COLUMN].copy()

    # Step 1: Separate Train (1 - (val_size + test_size)) from Temp
    temp_size = val_size + test_size
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, 
        test_size=temp_size, 
        random_state=random_state, 
        stratify=y
    )

    # Step 2: Split Temp into Validation and Test (50% each of the 30% remainder)
    val_proportion = val_size / temp_size
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, 
        test_size=(1.0 - val_proportion), 
        random_state=random_state, 
        stratify=y_temp
    )

    return X_train, X_val, X_test, y_train, y_val, y_test

def encode_targets(
    y_train: pd.Series, 
    y_val: pd.Series, 
    y_test: pd.Series
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, LabelEncoder, Dict[str, Any]]:
    """
    Fits LabelEncoder on y_train classes and transforms train, val, and test targets.
    Produces bidirectional mapping dictionaries for downstream inference.
    """
    encoder = LabelEncoder()
    y_train_encoded = encoder.fit_transform(y_train)
    y_val_encoded = encoder.transform(y_val)
    y_test_encoded = encoder.transform(y_test)

    # Human-readable mapping dictionary
    mapping = {
        "class_to_idx": {cls: int(idx) for idx, cls in enumerate(encoder.classes_)},
        "idx_to_class": {int(idx): cls for idx, cls in enumerate(encoder.classes_)},
        "classes": encoder.classes_.tolist()
    }

    return y_train_encoded, y_val_encoded, y_test_encoded, encoder, mapping

def scale_features(
    X_train: pd.DataFrame, 
    X_val: pd.DataFrame, 
    X_test: pd.DataFrame
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, StandardScaler]:
    """
    Fits StandardScaler STRICTLY on X_train, then transforms X_train, X_val, and X_test.
    Prevents any data leakage from evaluation splits into the scaler parameters.
    """
    scaler = StandardScaler()
    scaler.fit(X_train)

    X_train_scaled = scaler.transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)

    return X_train_scaled, X_val_scaled, X_test_scaled, scaler

def save_artifacts(
    output_dirs: Dict[str, str],
    X_train: pd.DataFrame,
    X_val: pd.DataFrame,
    X_test: pd.DataFrame,
    X_train_scaled: np.ndarray,
    X_val_scaled: np.ndarray,
    X_test_scaled: np.ndarray,
    y_train: pd.Series,
    y_val: pd.Series,
    y_test: pd.Series,
    y_train_encoded: np.ndarray,
    y_val_encoded: np.ndarray,
    y_test_encoded: np.ndarray,
    scaler: StandardScaler,
    encoder: LabelEncoder,
    mapping: Dict[str, Any]
):
    """
    Persists splits, transformers, and schema metadata to their designated directories.
    - Raw & scaled splits -> backend/models/crop_recommendation/dataset/processed/
    - Scaler, encoder & metadata -> backend/models/crop_recommendation/saved_model/
    """
    processed_dir = output_dirs["processed"]
    saved_model_dir = output_dirs["saved_model"]
    os.makedirs(processed_dir, exist_ok=True)
    os.makedirs(saved_model_dir, exist_ok=True)

    # 1. Save Unscaled Feature Sets (for Random Forest, XGBoost)
    X_train.to_csv(os.path.join(processed_dir, "X_train_unscaled.csv"), index=False)
    X_val.to_csv(os.path.join(processed_dir, "X_val_unscaled.csv"), index=False)
    X_test.to_csv(os.path.join(processed_dir, "X_test_unscaled.csv"), index=False)

    # 2. Save Scaled Feature Sets (for Neural Network)
    pd.DataFrame(X_train_scaled, columns=EXPECTED_FEATURES).to_csv(
        os.path.join(processed_dir, "X_train_scaled.csv"), index=False
    )
    pd.DataFrame(X_val_scaled, columns=EXPECTED_FEATURES).to_csv(
        os.path.join(processed_dir, "X_val_scaled.csv"), index=False
    )
    pd.DataFrame(X_test_scaled, columns=EXPECTED_FEATURES).to_csv(
        os.path.join(processed_dir, "X_test_scaled.csv"), index=False
    )

    # 3. Save Targets (both string labels and encoded integers)
    pd.DataFrame({"label": y_train.values, "label_encoded": y_train_encoded}).to_csv(
        os.path.join(processed_dir, "y_train.csv"), index=False
    )
    pd.DataFrame({"label": y_val.values, "label_encoded": y_val_encoded}).to_csv(
        os.path.join(processed_dir, "y_val.csv"), index=False
    )
    pd.DataFrame({"label": y_test.values, "label_encoded": y_test_encoded}).to_csv(
        os.path.join(processed_dir, "y_test.csv"), index=False
    )

    # 4. Save Transformers
    joblib.dump(scaler, os.path.join(saved_model_dir, "scaler.pkl"))
    joblib.dump(encoder, os.path.join(saved_model_dir, "label_encoder.pkl"))

    # 5. Save Metadata & Mappings for Inference
    metadata = {
        "features": EXPECTED_FEATURES,
        "target": TARGET_COLUMN,
        "num_classes": len(encoder.classes_),
        "classes": mapping["classes"],
        "class_to_idx": mapping["class_to_idx"],
        "idx_to_class": mapping["idx_to_class"],
        "split_counts": {
            "train": len(y_train),
            "val": len(y_val),
            "test": len(y_test)
        },
        "scaler_params": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
            "var": scaler.var_.tolist()
        }
    }
    with open(os.path.join(saved_model_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

def load_processed_splits(processed_dir: str):
    """
    Convenience loader for training scripts to load unscaled or scaled splits directly.
    """
    X_train_unscaled = pd.read_csv(os.path.join(processed_dir, "X_train_unscaled.csv"))
    X_val_unscaled = pd.read_csv(os.path.join(processed_dir, "X_val_unscaled.csv"))
    X_test_unscaled = pd.read_csv(os.path.join(processed_dir, "X_test_unscaled.csv"))

    X_train_scaled = pd.read_csv(os.path.join(processed_dir, "X_train_scaled.csv"))
    X_val_scaled = pd.read_csv(os.path.join(processed_dir, "X_val_scaled.csv"))
    X_test_scaled = pd.read_csv(os.path.join(processed_dir, "X_test_scaled.csv"))

    y_train_df = pd.read_csv(os.path.join(processed_dir, "y_train.csv"))
    y_val_df = pd.read_csv(os.path.join(processed_dir, "y_val.csv"))
    y_test_df = pd.read_csv(os.path.join(processed_dir, "y_test.csv"))

    return {
        "unscaled": (X_train_unscaled, X_val_unscaled, X_test_unscaled),
        "scaled": (X_train_scaled, X_val_scaled, X_test_scaled),
        "y": (y_train_df["label_encoded"].values, y_val_df["label_encoded"].values, y_test_df["label_encoded"].values),
        "y_labels": (y_train_df["label"].values, y_val_df["label"].values, y_test_df["label"].values)
    }

def run_preprocessing_pipeline():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw_csv = os.path.join(base_dir, "dataset", "crop_data.csv")
    output_dirs = {
        "processed": os.path.join(base_dir, "dataset", "processed"),
        "saved_model": os.path.join(base_dir, "saved_model")
    }

    print("=" * 70)
    print("AGRISENSE — RUNNING PREPROCESSING PIPELINE")
    print("=" * 70)

    # 1. Load raw data
    print("\n[Step 1] Loading raw dataset...")
    df = load_dataset(raw_csv)
    print(f"         Loaded {len(df)} rows.")

    # 2. Stratified Split
    print("\n[Step 2] Performing Stratified Train/Val/Test Split (70% / 15% / 15%)...")
    X_train, X_val, X_test, y_train, y_val, y_test = create_stratified_splits(df)
    print(f"         Train set: {X_train.shape[0]} samples")
    print(f"         Validation set: {X_val.shape[0]} samples")
    print(f"         Test set: {X_test.shape[0]} samples")

    # 3. Target Encoding
    print("\n[Step 3] Fitting LabelEncoder on target classes...")
    y_train_enc, y_val_enc, y_test_enc, encoder, mapping = encode_targets(y_train, y_val, y_test)
    print(f"         Total classes encoded: {len(encoder.classes_)}")
    print(f"         First 5 classes: {encoder.classes_[:5]}")
    print(f"         Encoded indices: {y_train_enc[:5]}")

    # 4. Feature Scaling (Fitted ONLY on X_train)
    print("\n[Step 4] Fitting StandardScaler strictly on X_train (No Data Leakage)...")
    X_train_scaled, X_val_scaled, X_test_scaled, scaler = scale_features(X_train, X_val, X_test)
    print("         Scaler mean values across features:")
    for feat, mean_val in zip(EXPECTED_FEATURES, scaler.mean_):
        print(f"           - {feat:12s}: {mean_val:8.2f}")

    # 5. Sanity Checks
    print("\n[Step 5] Running Sanity Checks:")
    train_means = X_train_scaled.mean(axis=0)
    train_stds = X_train_scaled.std(axis=0)
    print(f"         X_train_scaled mean ~ 0: {np.allclose(train_means, 0, atol=1e-7)}")
    print(f"         X_train_scaled std  ~ 1: {np.allclose(train_stds, 1, atol=1e-7)}")
    
    # Check class balance across splits
    train_counts = pd.Series(y_train).value_counts().unique()
    val_counts = pd.Series(y_val).value_counts().unique()
    test_counts = pd.Series(y_test).value_counts().unique()
    print(f"         Train class balance: {train_counts} per crop (Uniform: {len(train_counts) == 1})")
    print(f"         Val class balance:   {val_counts} per crop (Uniform: {len(val_counts) == 1})")
    print(f"         Test class balance:  {test_counts} per crop (Uniform: {len(test_counts) == 1})")

    # 6. Save Artifacts
    print("\n[Step 6] Saving splits, transformers, and inference metadata...")
    save_artifacts(
        output_dirs,
        X_train, X_val, X_test,
        X_train_scaled, X_val_scaled, X_test_scaled,
        y_train, y_val, y_test,
        y_train_enc, y_val_enc, y_test_enc,
        scaler, encoder, mapping
    )
    print("         Saved unscaled and scaled CSV splits to: backend/models/crop_recommendation/dataset/processed/")
    print("         Saved scaler.pkl, label_encoder.pkl, and metadata.json to: backend/models/crop_recommendation/saved_model/")

    print("\n" + "=" * 70)
    print("PREPROCESSING PIPELINE COMPLETED SUCCESSFULLY")
    print("=" * 70)

if __name__ == "__main__":
    run_preprocessing_pipeline()
