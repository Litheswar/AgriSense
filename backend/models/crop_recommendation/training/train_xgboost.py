"""
AgriSense — XGBoost Crop Recommendation Training & Evaluation
--------------------------------------------------------------
This script trains a baseline XGBoost (Extreme Gradient Boosting) classifier
on the unscaled agricultural features, evaluates generalization on the
validation split, analyzes gain-based feature importance, exports the model
in native JSON format, and verifies inference with realistic field profiles.
"""

import os
import sys
import json

# Ensure UTF-8 output encoding across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List
import xgboost as xgb
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
        "model_save_path": os.path.join(base_dir, "saved_model", "xgboost_model.json"),
        "encoder_path": os.path.join(base_dir, "saved_model", "label_encoder.pkl"),
        "metadata_path": os.path.join(base_dir, "saved_model", "metadata.json")
    }

def load_data(processed_dir: str):
    """
    Loads unscaled features and encoded targets for XGBoost.
    Like Random Forest, tree-based gradient boosting splits along single dimensions
    based on rank order and is invariant to monotonic feature scaling.
    """
    X_train = pd.read_csv(os.path.join(processed_dir, "X_train_unscaled.csv"))
    X_val = pd.read_csv(os.path.join(processed_dir, "X_val_unscaled.csv"))
    
    y_train = pd.read_csv(os.path.join(processed_dir, "y_train.csv"))["label_encoded"].values
    y_val = pd.read_csv(os.path.join(processed_dir, "y_val.csv"))["label_encoded"].values

    return X_train, X_val, y_train, y_val

def train_xgboost_model(
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    n_estimators: int = 100,
    learning_rate: float = 0.1,
    max_depth: int = 5,
    random_state: int = 42
) -> xgb.XGBClassifier:
    """
    Initializes and fits a baseline XGBClassifier for multiclass classification.
    - n_estimators=100: Number of sequential boosting rounds.
    - learning_rate=0.1: Shrinkage factor (eta) scaling tree contributions to prevent overfitting.
    - max_depth=5: Maximum tree depth for individual weak learners.
    - objective='multi:softprob': Outputs predicted class probabilities for each crop.
    - eval_metric='mlogloss': Multiclass log-loss evaluation metric.
    - random_state=42: Seed ensuring exact reproducibility.
    - n_jobs=-1: Utilizes all available CPU cores.
    """
    clf = xgb.XGBClassifier(
        n_estimators=n_estimators,
        learning_rate=learning_rate,
        max_depth=max_depth,
        objective="multi:softprob",
        eval_metric="mlogloss",
        random_state=random_state,
        n_jobs=-1
    )
    clf.fit(X_train, y_train)
    return clf

def evaluate_xgboost_model(
    model: xgb.XGBClassifier,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    target_names: List[str]
) -> Dict[str, Any]:
    """
    Evaluates the trained model on training and validation splits.
    Computes Accuracy, Macro/Weighted Precision, Recall, F1, and Confusion Matrix.
    """
    y_train_pred = model.predict(X_train)
    y_val_pred = model.predict(X_val)

    train_acc = accuracy_score(y_train, y_train_pred)
    val_acc = accuracy_score(y_val, y_val_pred)

    # Macro metrics treat each of the 22 classes equally (ideal for balanced datasets)
    macro_precision = precision_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_recall = recall_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_f1 = f1_score(y_val, y_val_pred, average="macro", zero_division=0)

    # Weighted metrics
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
    model: xgb.XGBClassifier,
    feature_names: List[str]
) -> pd.DataFrame:
    """
    Extracts gain-based feature importances from the XGBoost model.
    Gain measures the average improvement in accuracy / loss reduction brought by a feature
    to the branches it is on across all boosting trees.
    """
    importances = model.feature_importances_
    df_fi = pd.DataFrame({
        "Feature": feature_names,
        "Gain_Importance": importances,
        "Percentage": importances * 100.0
    }).sort_values(by="Gain_Importance", ascending=False).reset_index(drop=True)
    return df_fi

def save_trained_xgboost(model: xgb.XGBClassifier, save_path: str):
    """
    Persists the XGBoost model using the official recommended JSON format.
    Native JSON serialization preserves tree structures, thresholds, and booster configs
    without Python version / pickle vulnerability dependencies.
    """
    model.save_model(save_path)

def predict_crop(
    input_data: Dict[str, float],
    model: xgb.XGBClassifier,
    label_encoder: Any,
    expected_features: List[str]
) -> Dict[str, Any]:
    """
    Inference interface for XGBoost:
    1. Validates input keys.
    2. Enforces strict canonical feature order.
    3. Passes raw unscaled inputs directly to model.predict_proba.
    4. Decodes predicted index via LabelEncoder.
    5. Formulates top prediction and top-3 candidates with predicted class probabilities.
    """
    missing = [f for f in expected_features if f not in input_data]
    if missing:
        raise ValueError(f"Missing required features: {missing}")

    ordered_values = [input_data[f] for f in expected_features]
    X_input = pd.DataFrame([ordered_values], columns=expected_features)

    # Class probabilities from multi:softprob
    probabilities = model.predict_proba(X_input)[0]
    predicted_idx = int(np.argmax(probabilities))

    crop_name = label_encoder.inverse_transform([predicted_idx])[0]
    confidence = float(probabilities[predicted_idx])

    top3_indices = np.argsort(probabilities)[::-1][:3]
    top3_candidates = [
        {
            "crop": label_encoder.inverse_transform([idx])[0],
            "predicted_probability": round(float(probabilities[idx]) * 100.0, 2)
        }
        for idx in top3_indices
    ]

    return {
        "predicted_crop": crop_name,
        "predicted_probability": round(confidence * 100.0, 2),
        "top_3_candidates": top3_candidates
    }

def run_training_and_evaluation():
    paths = get_project_paths()

    print("=" * 75)
    print("AGRISENSE — XGBOOST CROP RECOMMENDATION TRAINING")
    print("=" * 75)

    # 1. Environment & Versions
    print(f"\n[Step 1] Library Versions:")
    print(f"         - XGBoost Version: {xgb.__version__}")
    print(f"         - Joblib Version:  {joblib.__version__}")

    # 2. Load Data
    print("\n[Step 2] Loading unscaled processed splits...")
    X_train, X_val, y_train, y_val = load_data(paths["processed_dir"])
    print(f"         - X_train shape: {X_train.shape}, y_train shape: {y_train.shape}")
    print(f"         - X_val shape:   {X_val.shape}, y_val shape:   {y_val.shape}")

    label_encoder = joblib.load(paths["encoder_path"])
    with open(paths["metadata_path"], "r") as f:
        metadata = json.load(f)
    classes = metadata["classes"]
    print(f"         - Total Classes: {len(classes)}")

    # 3. Train XGBoost Baseline
    print("\n[Step 3] Training XGBClassifier Baseline...")
    print("         Hyperparameters: n_estimators=100, learning_rate=0.1, max_depth=5")
    xgb_model = train_xgboost_model(
        X_train, y_train, n_estimators=100, learning_rate=0.1, max_depth=5, random_state=42
    )
    print("         Training complete.")

    # 4. Evaluate Performance
    print("\n[Step 4] Generalization Performance on Validation Split:")
    results = evaluate_xgboost_model(xgb_model, X_train, y_train, X_val, y_val, classes)

    print(f"         - Training Accuracy:   {results['train_accuracy'] * 100:.2f}%")
    print(f"         - Validation Accuracy: {results['val_accuracy'] * 100:.2f}%")
    print(f"         - Macro Precision:     {results['val_precision_macro'] * 100:.2f}%")
    print(f"         - Macro Recall:        {results['val_recall_macro'] * 100:.2f}%")
    print(f"         - Macro F1-Score:      {results['val_f1_macro'] * 100:.2f}%")
    print(f"         - Weighted F1-Score:   {results['val_f1_weighted'] * 100:.2f}%")

    print("\n[Step 5] Detailed Classification Report (Validation Split):")
    print(results["classification_report"])

    # 5. Confusion Matrix Diagnostics
    cm = results["confusion_matrix"]
    total_val_samples = len(y_val)
    correct = np.trace(cm)
    misclassified = total_val_samples - correct
    print(f"[Step 6] Confusion Matrix Diagnostic:")
    print(f"         - Total Validation Samples: {total_val_samples}")
    print(f"         - Correct Predictions:      {correct}")
    print(f"         - Misclassifications:       {misclassified}")

    misclassified_pairs = []
    for true_idx in range(len(classes)):
        for pred_idx in range(len(classes)):
            if true_idx != pred_idx and cm[true_idx, pred_idx] > 0:
                misclassified_pairs.append({
                    "true_crop": classes[true_idx],
                    "pred_crop": classes[pred_idx],
                    "count": int(cm[true_idx, pred_idx])
                })

    if misclassified_pairs:
        print("         - Misclassified Crop Pairs:")
        for pair in misclassified_pairs:
            print(f"           * True: {pair['true_crop']:12s} -> Predicted: {pair['pred_crop']:12s} ({pair['count']} sample(s))")
    else:
        print("         - Flawless diagonal: 0 misclassifications.")

    # Identify classes with lowest recall/precision
    recalls = [cm[i, i] / cm[i, :].sum() if cm[i, :].sum() > 0 else 0 for i in range(len(classes))]
    precisions = [cm[i, i] / cm[:, i].sum() if cm[:, i].sum() > 0 else 0 for i in range(len(classes))]
    
    weakest_recall_idx = np.argmin(recalls)
    weakest_precision_idx = np.argmin(precisions)
    print(f"\n         - Weakest Class Recall:    {classes[weakest_recall_idx]} ({recalls[weakest_recall_idx] * 100:.2f}%)")
    print(f"         - Weakest Class Precision: {classes[weakest_precision_idx]} ({precisions[weakest_precision_idx] * 100:.2f}%)")

    # 6. Feature Importance
    print("\n[Step 7] Gain-Based Feature Importance (XGBoost):")
    df_fi = analyze_feature_importance(xgb_model, EXPECTED_FEATURES)
    for _, row in df_fi.iterrows():
        bar = "=" * int(row["Percentage"] // 2)
        print(f"         {row['Feature']:12s}: {row['Gain_Importance']:.4f} ({row['Percentage']:5.2f}%) [{bar}]")

    print("\n         * Agronomic note on feature importance:")
    print("           Feature importance represents model reliance/usefulness for prediction")
    print("           in this dataset. It does NOT prove causal agronomic importance.")

    # 7. Model Serialization
    print(f"\n[Step 8] Saving trained XGBoost model in native JSON format...")
    save_trained_xgboost(xgb_model, paths["model_save_path"])
    print(f"         Model successfully serialized to: {paths['model_save_path']}")
    print(f"         File size: {os.path.getsize(paths['model_save_path']) / 1024:.2f} KB")

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
        prediction = predict_crop(test["data"], xgb_model, label_encoder, EXPECTED_FEATURES)
        print(f"\n      Test Case {i}: {test['description']}")
        print(f"        Inputs:                {test['data']}")
        print(f"        Predicted Crop:        {prediction['predicted_crop']}")
        print(f"        Predicted Probability: {prediction['predicted_probability']}% (Model confidence)")
        print(f"        Top 3 Candidates:")
        for candidate in prediction["top_3_candidates"]:
            print(f"          - {candidate['crop']:12s}: {candidate['predicted_probability']}%")

    print("\n" + "=" * 75)
    print("XGBOOST TRAINING & VALIDATION COMPLETE")
    print("=" * 75)

if __name__ == "__main__":
    run_training_and_evaluation()
