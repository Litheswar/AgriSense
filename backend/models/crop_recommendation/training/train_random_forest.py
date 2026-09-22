"""
AgriSense — Random Forest Crop Recommendation Training & Evaluation
-------------------------------------------------------------------
This script trains a baseline Random Forest Classifier on the unscaled
agricultural feature dataset, evaluates its generalization performance on
the validation set, analyzes impurity-based feature importance, saves the model
artifact, and verifies inference.
"""

import os
import sys
import json

# Ensure UTF-8 output encoding across all operating systems
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix
)

# Canonical Feature Definition
EXPECTED_FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]

def get_project_paths() -> Dict[str, str]:
    """Resolves absolute paths for processed datasets and saved model artifacts."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        "processed_dir": os.path.join(base_dir, "dataset", "processed"),
        "saved_model_dir": os.path.join(base_dir, "saved_model"),
        "model_save_path": os.path.join(base_dir, "saved_model", "random_forest_model.pkl"),
        "encoder_path": os.path.join(base_dir, "saved_model", "label_encoder.pkl"),
        "metadata_path": os.path.join(base_dir, "saved_model", "metadata.json")
    }

def load_data(processed_dir: str):
    """
    Loads UNMODIFIED, UNSCALED features and encoded targets for Random Forest.
    Random Forest partitions feature space along orthogonal hyperplanes and is
    invariant to monotonic scaling.
    """
    X_train = pd.read_csv(os.path.join(processed_dir, "X_train_unscaled.csv"))
    X_val = pd.read_csv(os.path.join(processed_dir, "X_val_unscaled.csv"))
    
    y_train = pd.read_csv(os.path.join(processed_dir, "y_train.csv"))["label_encoded"].values
    y_val = pd.read_csv(os.path.join(processed_dir, "y_val.csv"))["label_encoded"].values

    return X_train, X_val, y_train, y_val

def train_rf_model(
    X_train: pd.DataFrame, 
    y_train: np.ndarray, 
    n_estimators: int = 100, 
    random_state: int = 42
) -> RandomForestClassifier:
    """
    Initializes and fits a baseline RandomForestClassifier.
    - n_estimators=100: Standard robust ensemble size balancing variance reduction and compute.
    - criterion='gini': Standard impurity measurement for multi-class classification.
    - random_state=42: Fixed seed ensuring full reproducibility.
    """
    rf = RandomForestClassifier(
        n_estimators=n_estimators,
        criterion="gini",
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=random_state,
        n_jobs=-1
    )
    rf.fit(X_train, y_train)
    return rf

def evaluate_rf_model(
    model: RandomForestClassifier,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    target_names: List[str]
) -> Dict[str, Any]:
    """
    Evaluates the model on both training and validation splits.
    Reports Accuracy, Macro/Weighted Precision, Recall, F1, and Confusion Matrix.
    """
    y_train_pred = model.predict(X_train)
    y_val_pred = model.predict(X_val)

    train_acc = accuracy_score(y_train, y_train_pred)
    val_acc = accuracy_score(y_val, y_val_pred)
    
    # Macro metrics treat each of the 22 classes equally (ideal for balanced datasets)
    macro_precision = precision_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_recall = recall_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_f1 = f1_score(y_val, y_val_pred, average="macro", zero_division=0)

    # Weighted metrics weight scores by class frequency (identical to macro here due to perfect balance)
    weighted_f1 = f1_score(y_val, y_val_pred, average="weighted", zero_division=0)

    clf_report = classification_report(
        y_val, y_val_pred, target_names=target_names, digits=4
    )
    cm = confusion_matrix(y_val, y_val_pred)

    return {
        "train_accuracy": train_acc,
        "val_accuracy": val_acc,
        "val_precision_macro": macro_precision,
        "val_recall_macro": macro_recall,
        "val_f1_macro": macro_f1,
        "val_f1_weighted": weighted_f1,
        "classification_report": clf_report,
        "confusion_matrix": cm,
        "y_val_true": y_val,
        "y_val_pred": y_val_pred
    }

def analyze_feature_importance(
    model: RandomForestClassifier, 
    feature_names: List[str]
) -> pd.DataFrame:
    """
    Computes Gini-based feature importance (Mean Decrease in Impurity - MDI).
    Note: MDI measures how much each feature contributed to reducing split impurity
    across all 100 decision trees. It indicates model reliance, NOT causal agronomy.
    """
    importances = model.feature_importances_
    df_fi = pd.DataFrame({
        "Feature": feature_names,
        "Importance": importances,
        "Percentage": importances * 100.0
    }).sort_values(by="Importance", ascending=False).reset_index(drop=True)
    return df_fi

def save_trained_rf(model: RandomForestClassifier, save_path: str):
    """Persists the trained model artifact using joblib."""
    joblib.dump(model, save_path)

def predict_crop(
    input_data: Dict[str, float],
    model: RandomForestClassifier,
    label_encoder: Any,
    expected_features: List[str]
) -> Dict[str, Any]:
    """
    Clean, decoupled inference function:
    1. Validates input schema.
    2. Enforces canonical feature ordering.
    3. Feeds raw unscaled features directly into Random Forest.
    4. Predicts class indices and class probabilities.
    5. Decodes the predicted index into human-readable crop name.
    """
    # 1. Validation
    missing = [f for f in expected_features if f not in input_data]
    if missing:
        raise ValueError(f"Missing required features: {missing}")

    # 2. Strict feature ordering
    ordered_values = [input_data[f] for f in expected_features]
    X_input = pd.DataFrame([ordered_values], columns=expected_features)

    # 3. Model Prediction
    predicted_idx = model.predict(X_input)[0]
    probabilities = model.predict_proba(X_input)[0]

    # 4. Decoding
    crop_name = label_encoder.inverse_transform([predicted_idx])[0]
    confidence = float(probabilities[predicted_idx])

    # Top-3 Agronomic Suitability Candidates
    top3_indices = np.argsort(probabilities)[::-1][:3]
    top3_candidates = [
        {
            "crop": label_encoder.inverse_transform([idx])[0],
            "suitability_score": round(float(probabilities[idx]) * 100.0, 2)
        }
        for idx in top3_indices
    ]

    return {
        "predicted_crop": crop_name,
        "confidence": round(confidence * 100.0, 2),
        "top_3_suitable_crops": top3_candidates
    }

def run_training_and_evaluation():
    paths = get_project_paths()

    print("=" * 75)
    print("AGRISENSE — RANDOM FOREST CROP RECOMMENDATION TRAINING")
    print("=" * 75)

    # 1. Load Data
    print("\n[Step 1] Loading unscaled processed splits...")
    X_train, X_val, y_train, y_val = load_data(paths["processed_dir"])
    print(f"         X_train shape: {X_train.shape}, y_train shape: {y_train.shape}")
    print(f"         X_val shape:   {X_val.shape}, y_val shape:   {y_val.shape}")

    # Load encoder and metadata
    label_encoder = joblib.load(paths["encoder_path"])
    with open(paths["metadata_path"], "r") as f:
        metadata = json.load(f)
    classes = metadata["classes"]
    print(f"         Total Crop Classes: {len(classes)}")

    # 2. Train Model
    print("\n[Step 2] Training RandomForestClassifier (n_estimators=100, random_state=42)...")
    rf_model = train_rf_model(X_train, y_train, n_estimators=100, random_state=42)
    print("         Training complete.")

    # 3. Model Architecture & Parameters
    print("\n[Step 3] Model Hyperparameters & Configuration:")
    print(f"         - Number of Trees (n_estimators): {rf_model.n_estimators}")
    print(f"         - Criterion:                      {rf_model.criterion}")
    print(f"         - Max Depth:                      {rf_model.max_depth} (Unbounded)")
    print(f"         - Min Samples Split:              {rf_model.min_samples_split}")
    print(f"         - Min Samples Leaf:               {rf_model.min_samples_leaf}")
    print(f"         - Random State:                   {rf_model.random_state}")

    # 4. Model Evaluation
    print("\n[Step 4] Generalization Performance on Validation Split:")
    results = evaluate_rf_model(rf_model, X_train, y_train, X_val, y_val, classes)

    print(f"         - Training Accuracy:   {results['train_accuracy'] * 100:.2f}%")
    print(f"         - Validation Accuracy: {results['val_accuracy'] * 100:.2f}%")
    print(f"         - Macro Precision:     {results['val_precision_macro'] * 100:.2f}%")
    print(f"         - Macro Recall:        {results['val_recall_macro'] * 100:.2f}%")
    print(f"         - Macro F1-Score:      {results['val_f1_macro'] * 100:.2f}%")
    print(f"         - Weighted F1-Score:   {results['val_f1_weighted'] * 100:.2f}%")

    print("\n[Step 5] Classification Report (Validation Split):")
    print(results["classification_report"])

    # 5. Confusion Matrix Summary
    cm = results["confusion_matrix"]
    total_val_samples = len(y_val)
    correct_predictions = np.trace(cm)
    misclassified = total_val_samples - correct_predictions
    print(f"[Step 6] Confusion Matrix Diagnostic:")
    print(f"         - Total Validation Samples: {total_val_samples}")
    print(f"         - Correct Predictions:      {correct_predictions}")
    print(f"         - Misclassifications:       {misclassified}")
    if misclassified > 0:
        print("         - Misclassified Instances:")
        for true_idx in range(len(classes)):
            for pred_idx in range(len(classes)):
                if true_idx != pred_idx and cm[true_idx, pred_idx] > 0:
                    print(f"           * True: {classes[true_idx]:12s} -> Predicted: {classes[pred_idx]:12s} ({cm[true_idx, pred_idx]} sample(s))")
    else:
        print("         - Flawless diagonal: 0 misclassifications across all 22 classes.")

    # 6. Feature Importance
    print("\n[Step 7] Impurity-Based Feature Importance (Mean Decrease in Impurity):")
    df_fi = analyze_feature_importance(rf_model, EXPECTED_FEATURES)
    for _, row in df_fi.iterrows():
        bar = "=" * int(row["Percentage"] // 2)
        print(f"         {row['Feature']:12s}: {row['Importance']:.4f} ({row['Percentage']:5.2f}%) [{bar}]")

    # 7. Save Model
    print(f"\n[Step 8] Saving trained Random Forest model artifact...")
    save_trained_rf(rf_model, paths["model_save_path"])
    print(f"         Model successfully serialized to: {paths['model_save_path']}")
    print(f"         File size: {os.path.getsize(paths['model_save_path']) / (1024 * 1024):.2f} MB")

    # 8. Sample Inference Tests
    print("\n[Step 9] Testing Inference Interface with Diverse Realistic Samples:")
    
    test_cases = [
        {
            "description": "Tropical Wet / Paddy Field (High rainfall, humidity, warm)",
            "data": {"N": 90, "P": 42, "K": 43, "temperature": 23.5, "humidity": 82.0, "ph": 6.5, "rainfall": 230.0}
        },
        {
            "description": "High Potassium / Temperate Fruit (Apple profile)",
            "data": {"N": 25, "P": 130, "K": 200, "temperature": 21.0, "humidity": 92.0, "ph": 6.0, "rainfall": 110.0}
        },
        {
            "description": "Dry Arid / Leguminous Pulse (Chickpea profile)",
            "data": {"N": 38, "P": 68, "K": 79, "temperature": 18.2, "humidity": 16.8, "ph": 7.3, "rainfall": 75.0}
        },
        {
            "description": "Cash Crop / Warm Subtropical (Cotton profile)",
            "data": {"N": 120, "P": 48, "K": 20, "temperature": 24.5, "humidity": 80.2, "ph": 6.8, "rainfall": 85.0}
        }
    ]

    for i, test in enumerate(test_cases, 1):
        prediction = predict_crop(test["data"], rf_model, label_encoder, EXPECTED_FEATURES)
        print(f"\n      Test Case {i}: {test['description']}")
        print(f"        Inputs:     {test['data']}")
        print(f"        Prediction: {prediction['predicted_crop']} (Confidence: {prediction['confidence']}%)")
        print(f"        Top 3 Suitability:")
        for candidate in prediction["top_3_suitable_crops"]:
            print(f"          - {candidate['crop']:12s}: {candidate['suitability_score']}%")

    print("\n" + "=" * 75)
    print("RANDOM FOREST TRAINING & VALIDATION COMPLETE")
    print("=" * 75)

if __name__ == "__main__":
    run_training_and_evaluation()
