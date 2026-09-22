"""
AgriSense — Neural Network (MLP) Crop Recommendation Training & Evaluation
--------------------------------------------------------------------------
This script builds and trains a baseline Multi-Layer Perceptron (MLP) on the
standardized agricultural features, evaluates generalization on the validation
split, analyzes convergence diagnostics, saves the native Keras artifact,
and verifies inference with pre-fitted feature scaling.
"""

import os
import sys
import json

# Ensure UTF-8 output encoding across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Suppress TensorFlow verbose GPU/C++ warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for headless environments
import matplotlib.pyplot as plt

from typing import Dict, Any, List, Tuple
import tensorflow as tf
import keras
from keras import layers, callbacks

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
    """Resolves absolute paths for processed datasets, saved artifacts, and evaluation."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        "processed_dir": os.path.join(base_dir, "dataset", "processed"),
        "saved_model_dir": os.path.join(base_dir, "saved_model"),
        "evaluation_dir": os.path.join(base_dir, "evaluation"),
        "model_save_path": os.path.join(base_dir, "saved_model", "neural_network_model.keras"),
        "history_save_path": os.path.join(base_dir, "saved_model", "nn_training_history.json"),
        "plot_save_path": os.path.join(base_dir, "evaluation", "nn_training_curves.png"),
        "scaler_path": os.path.join(base_dir, "saved_model", "scaler.pkl"),
        "encoder_path": os.path.join(base_dir, "saved_model", "label_encoder.pkl"),
        "metadata_path": os.path.join(base_dir, "saved_model", "metadata.json")
    }

def load_data(processed_dir: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Loads SCALED features and encoded targets for the Neural Network.
    Unlike tree ensembles, neural networks update weights using gradient descent
    and require standardized features to prevent gradient dominance and numerical instability.
    """
    X_train = pd.read_csv(os.path.join(processed_dir, "X_train_scaled.csv")).values
    X_val = pd.read_csv(os.path.join(processed_dir, "X_val_scaled.csv")).values
    
    y_train = pd.read_csv(os.path.join(processed_dir, "y_train.csv"))["label_encoded"].values
    y_val = pd.read_csv(os.path.join(processed_dir, "y_val.csv"))["label_encoded"].values

    return X_train, X_val, y_train, y_val

def build_mlp_model(
    input_dim: int = 7, 
    num_classes: int = 22, 
    learning_rate: float = 0.003,
    random_seed: int = 42
) -> keras.Sequential:
    """
    Builds a baseline Multi-Layer Perceptron (MLP) architecture:
      Input(7)
        ↓
      Dense(64, ReLU)
        ↓
      Dense(32, ReLU)
        ↓
      Dense(22, Softmax)
    """
    tf.random.set_seed(random_seed)
    np.random.seed(random_seed)

    model = keras.Sequential([
        layers.Input(shape=(input_dim,), name="input_features"),
        layers.Dense(64, activation="relu", name="dense_hidden_1"),
        layers.Dense(32, activation="relu", name="dense_hidden_2"),
        layers.Dense(num_classes, activation="softmax", name="output_probabilities")
    ], name="crop_recommendation_mlp")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )
    return model

def train_mlp_model(
    model: keras.Sequential,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    epochs: int = 60,
    batch_size: int = 32,
    patience: int = 12
) -> Tuple[keras.Sequential, keras.callbacks.History]:
    """
    Trains the MLP model with EarlyStopping as a safeguard against overfitting.
    - EarlyStopping monitors 'val_loss'.
    - restore_best_weights=True ensures that when training halts, the weights from
      the epoch with the lowest validation loss are restored.
    """
    early_stop = callbacks.EarlyStopping(
        monitor="val_loss",
        patience=patience,
        restore_best_weights=True,
        verbose=1
    )

    history = model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=[early_stop],
        verbose=0
    )
    return model, history

def evaluate_mlp_model(
    model: keras.Sequential,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    target_names: List[str]
) -> Dict[str, Any]:
    """
    Evaluates the trained model on training and validation sets.
    Generates multi-class classification metrics and confusion matrix.
    """
    train_loss, train_acc = model.evaluate(X_train, y_train, verbose=0)
    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)

    # Class probabilities and predicted indices
    y_val_probs = model.predict(X_val, verbose=0)
    y_val_pred = np.argmax(y_val_probs, axis=1)

    macro_precision = precision_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_recall = recall_score(y_val, y_val_pred, average="macro", zero_division=0)
    macro_f1 = f1_score(y_val, y_val_pred, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_val, y_val_pred, average="weighted", zero_division=0)

    clf_report = classification_report(
        y_val, y_val_pred, target_names=target_names, digits=4
    )
    cm = confusion_matrix(y_val, y_val_pred)

    return {
        "train_loss": float(train_loss),
        "train_accuracy": float(train_acc),
        "val_loss": float(val_loss),
        "val_accuracy": float(val_acc),
        "val_precision_macro": float(macro_precision),
        "val_recall_macro": float(macro_recall),
        "val_f1_macro": float(macro_f1),
        "val_f1_weighted": float(weighted_f1),
        "classification_report": clf_report,
        "confusion_matrix": cm,
        "y_val_true": y_val,
        "y_val_pred": y_val_pred,
        "y_val_probs": y_val_probs
    }

def plot_and_save_diagnostics(
    history: keras.callbacks.History,
    plot_path: str,
    history_json_path: str
):
    """Generates training vs validation loss/accuracy curves and saves training history."""
    os.makedirs(os.path.dirname(plot_path), exist_ok=True)
    os.makedirs(os.path.dirname(history_json_path), exist_ok=True)

    hist = history.history
    epochs_range = range(1, len(hist["loss"]) + 1)

    # Save numeric history
    serializable_hist = {k: [float(v) for v in vals] for k, vals in hist.items()}
    with open(history_json_path, "w") as f:
        json.dump(serializable_hist, f, indent=2)

    # Plot
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    # Loss Curve
    ax1.plot(epochs_range, hist["loss"], label="Training Loss", color="#1f77b4", lw=2)
    ax1.plot(epochs_range, hist["val_loss"], label="Validation Loss", color="#ff7f0e", lw=2, linestyle="--")
    ax1.set_title("Training vs Validation Loss", fontsize=12, fontweight="bold")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Sparse Categorical Crossentropy")
    ax1.grid(True, alpha=0.3)
    ax1.legend()

    # Accuracy Curve
    ax2.plot(epochs_range, hist["accuracy"], label="Training Accuracy", color="#2ca02c", lw=2)
    ax2.plot(epochs_range, hist["val_accuracy"], label="Validation Accuracy", color="#d62728", lw=2, linestyle="--")
    ax2.set_title("Training vs Validation Accuracy", fontsize=12, fontweight="bold")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    ax2.grid(True, alpha=0.3)
    ax2.legend()

    plt.tight_layout()
    plt.savefig(plot_path, dpi=150)
    plt.close()

def predict_crop(
    raw_input_data: Dict[str, float],
    model: keras.Sequential,
    scaler: Any,
    label_encoder: Any,
    expected_features: List[str]
) -> Dict[str, Any]:
    """
    End-to-End Inference Pipeline for Neural Network:
      Raw Agricultural Features
                 ↓
      Feature Ordering & Validation
                 ↓
      Existing Scaler (scaler.transform)
                 ↓
      Scaled Features
                 ↓
      MLP (model.predict)
                 ↓
      Softmax Class Probabilities
                 ↓
      Decode Top Prediction via label_encoder
    """
    missing = [f for f in expected_features if f not in raw_input_data]
    if missing:
        raise ValueError(f"Missing required features: {missing}")

    ordered_values = [raw_input_data[f] for f in expected_features]
    raw_df = pd.DataFrame([ordered_values], columns=expected_features)

    # Standardize using the EXACT scaler fitted during Milestone 2
    scaled_input = scaler.transform(raw_df)

    # Neural Network Forward Pass
    probabilities = model.predict(scaled_input, verbose=0)[0]
    predicted_idx = int(np.argmax(probabilities))

    crop_name = label_encoder.inverse_transform([predicted_idx])[0]
    confidence = float(probabilities[predicted_idx])

    # Extract Top-3 Candidates
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
    print("AGRISENSE — NEURAL NETWORK (MLP) CROP RECOMMENDATION TRAINING")
    print("=" * 75)

    # 1. Environment & Versions
    print(f"\n[Step 1] Library Versions:")
    print(f"         - TensorFlow Version: {tf.__version__}")
    print(f"         - Keras Version:      {keras.__version__}")

    # 2. Load Processed Scaled Data
    print("\n[Step 2] Loading SCALED processed splits...")
    X_train, X_val, y_train, y_val = load_data(paths["processed_dir"])
    print(f"         - X_train (scaled) shape: {X_train.shape}, y_train shape: {y_train.shape}")
    print(f"         - X_val (scaled) shape:   {X_val.shape}, y_val shape:   {y_val.shape}")

    scaler = joblib.load(paths["scaler_path"])
    label_encoder = joblib.load(paths["encoder_path"])
    with open(paths["metadata_path"], "r") as f:
        metadata = json.load(f)
    classes = metadata["classes"]
    print(f"         - Total Features: {len(EXPECTED_FEATURES)}")
    print(f"         - Total Classes:  {len(classes)}")

    # 3. Model Architecture
    print("\n[Step 3] Constructing MLP Architecture:")
    print("         Input(7) -> Dense(64, ReLU) -> Dense(32, ReLU) -> Dense(22, Softmax)")
    mlp_model = build_mlp_model(
        input_dim=len(EXPECTED_FEATURES),
        num_classes=len(classes),
        learning_rate=0.003,
        random_seed=42
    )

    mlp_model.summary(print_fn=lambda x: print(f"         {x}"))
    total_params = mlp_model.count_params()
    print(f"\n         Total Trainable Parameters: {total_params:,}")

    # 4. Training with EarlyStopping
    epochs_requested = 60
    batch_size = 32
    patience = 12
    print(f"\n[Step 4] Training MLP (Epochs={epochs_requested}, Batch Size={batch_size}, Patience={patience})...")
    print("         - Safeguard: EarlyStopping(monitor='val_loss', restore_best_weights=True)")
    print("         - Reason: Halts training if val_loss ceases to improve, rolling back to the optimal checkpoint.")

    mlp_model, history = train_mlp_model(
        mlp_model, X_train, y_train, X_val, y_val,
        epochs=epochs_requested, batch_size=batch_size, patience=patience
    )
    epochs_completed = len(history.history["loss"])
    print(f"         Training completed in {epochs_completed} epochs.")

    # 5. Training Curves & Diagnostics
    print("\n[Step 5] Training Convergence Diagnostics:")
    final_train_loss = history.history["loss"][-1]
    final_val_loss = history.history["val_loss"][-1]
    best_val_loss = min(history.history["val_loss"])
    best_epoch = history.history["val_loss"].index(best_val_loss) + 1

    print(f"         - Final Training Loss:   {final_train_loss:.4f}")
    print(f"         - Final Validation Loss: {final_val_loss:.4f}")
    print(f"         - Best Validation Loss:  {best_val_loss:.4f} (at Epoch {best_epoch})")

    # Display epoch trajectory snapshots
    print("\n         Epoch Trajectory Snapshot:")
    print("         Epoch | Train Loss | Train Acc | Val Loss | Val Acc")
    print("         --------------------------------------------------")
    for ep in [1, 5, 10, 20, 30, epochs_completed]:
        if ep <= epochs_completed:
            idx = ep - 1
            t_l = history.history["loss"][idx]
            t_a = history.history["accuracy"][idx]
            v_l = history.history["val_loss"][idx]
            v_a = history.history["val_accuracy"][idx]
            print(f"         {ep:5d} |   {t_l:8.4f} |   {t_a*100:6.2f}% | {v_l:8.4f} | {v_a*100:6.2f}%")

    plot_and_save_diagnostics(history, paths["plot_save_path"], paths["history_save_path"])
    print(f"\n         Training curve plot saved to: {paths['plot_save_path']}")

    # 6. Evaluation on Validation Set
    print("\n[Step 6] Validation Performance Evaluation:")
    results = evaluate_mlp_model(mlp_model, X_train, y_train, X_val, y_val, classes)

    print(f"         - Training Accuracy:   {results['train_accuracy'] * 100:.2f}%")
    print(f"         - Validation Accuracy: {results['val_accuracy'] * 100:.2f}%")
    print(f"         - Macro Precision:     {results['val_precision_macro'] * 100:.2f}%")
    print(f"         - Macro Recall:        {results['val_recall_macro'] * 100:.2f}%")
    print(f"         - Macro F1-Score:      {results['val_f1_macro'] * 100:.2f}%")
    print(f"         - Weighted F1-Score:   {results['val_f1_weighted'] * 100:.2f}%")

    print("\n[Step 7] Detailed Classification Report (Validation Split):")
    print(results["classification_report"])

    # 7. Confusion Matrix Diagnostics
    cm = results["confusion_matrix"]
    total_val = len(y_val)
    correct = np.trace(cm)
    misclassified = total_val - correct
    print(f"[Step 8] Confusion Matrix Diagnostic:")
    print(f"         - Total Validation Samples: {total_val}")
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

    recalls = [cm[i, i] / cm[i, :].sum() if cm[i, :].sum() > 0 else 0 for i in range(len(classes))]
    precisions = [cm[i, i] / cm[:, i].sum() if cm[:, i].sum() > 0 else 0 for i in range(len(classes))]
    weakest_recall_idx = int(np.argmin(recalls))
    weakest_precision_idx = int(np.argmin(precisions))
    print(f"\n         - Weakest Class Recall:    {classes[weakest_recall_idx]} ({recalls[weakest_recall_idx] * 100:.2f}%)")
    print(f"         - Weakest Class Precision: {classes[weakest_precision_idx]} ({precisions[weakest_precision_idx] * 100:.2f}%)")

    # 8. Save Native Keras Model
    print(f"\n[Step 9] Saving trained Neural Network in native Keras format...")
    mlp_model.save(paths["model_save_path"])
    print(f"         Model successfully serialized to: {paths['model_save_path']}")
    print(f"         File size: {os.path.getsize(paths['model_save_path']) / 1024:.2f} KB")

    # 9. Sample Inference Verification
    print("\n[Step 10] Testing Inference Interface with Diverse Realistic Samples:")
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
        prediction = predict_crop(test["data"], mlp_model, scaler, label_encoder, EXPECTED_FEATURES)
        print(f"\n      Test Case {i}: {test['description']}")
        print(f"        Inputs:                {test['data']}")
        print(f"        Predicted Crop:        {prediction['predicted_crop']}")
        print(f"        Predicted Probability: {prediction['predicted_probability']}% (Model confidence)")
        print(f"        Top 3 Candidates:")
        for candidate in prediction["top_3_candidates"]:
            print(f"          - {candidate['crop']:12s}: {candidate['predicted_probability']}%")

    print("\n" + "=" * 75)
    print("NEURAL NETWORK TRAINING & VALIDATION COMPLETE")
    print("=" * 75)

if __name__ == "__main__":
    run_training_and_evaluation()
