"""
AgriSense — Disease Detection Transfer Learning Training & Evaluation
----------------------------------------------------------------------
Milestone 10: Train a CNN classifier for plant disease detection using
transfer learning on the PlantVillage multi-crop dataset (10 classes).

Architecture: MobileNetV2 (pretrained on ImageNet)
Strategy:
  1. Freeze pretrained convolutional base
  2. Add custom classification head
  3. Train head-only with class weights for imbalance
  4. Fine-tune top convolutional layers
  5. Evaluate on validation and test sets
"""

import os
import sys
import json
import time
from typing import Dict, Any, List, Tuple

# Ensure UTF-8 output across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Suppress TensorFlow verbose GPU/C++ warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

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
from sklearn.utils.class_weight import compute_class_weight


# ─────────────────────────────────────────────────────────────────────
# 1. PATH CONFIGURATION
# ─────────────────────────────────────────────────────────────────────

def get_project_paths() -> Dict[str, str]:
    """Resolves absolute paths relative to the disease_detection base directory."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        "base_dir": base_dir,
        "raw_dir": os.path.join(base_dir, "dataset", "raw"),
        "processed_dir": os.path.join(base_dir, "dataset", "processed"),
        "train_csv": os.path.join(base_dir, "dataset", "processed", "train.csv"),
        "val_csv": os.path.join(base_dir, "dataset", "processed", "val.csv"),
        "test_csv": os.path.join(base_dir, "dataset", "processed", "test.csv"),
        "metadata_json": os.path.join(base_dir, "dataset", "processed", "dataset_metadata.json"),
        "saved_model_dir": os.path.join(base_dir, "saved_model"),
        "evaluation_dir": os.path.join(base_dir, "evaluation"),
        "model_save_path": os.path.join(base_dir, "saved_model", "disease_model.keras"),
        "history_save_path": os.path.join(base_dir, "saved_model", "disease_training_history.json"),
        "training_metadata_path": os.path.join(base_dir, "saved_model", "training_metadata.json"),
        "training_curves_path": os.path.join(base_dir, "evaluation", "disease_training_curves.png"),
        "confusion_matrix_path": os.path.join(base_dir, "evaluation", "disease_confusion_matrix.png"),
    }


# ─────────────────────────────────────────────────────────────────────
# 2. DATA LOADING — tf.data PIPELINE
# ─────────────────────────────────────────────────────────────────────

IMG_SIZE = (224, 224)
BATCH_SIZE = 32
AUTOTUNE = tf.data.AUTOTUNE


def load_and_preprocess_image(image_path: tf.Tensor, label: tf.Tensor):
    """
    Loads a single image from disk, decodes JPEG, resizes to 224x224,
    and normalizes pixel values to [0.0, 1.0].
    """
    img_bytes = tf.io.read_file(image_path)
    img = tf.image.decode_jpeg(img_bytes, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
    img = tf.cast(img, tf.float32) / 255.0
    return img, label


def create_augmentation_layer():
    """
    Creates a Keras data augmentation pipeline applied ONLY during training.
    Uses the augmentation parameters defined in Milestone 9 metadata:
      - horizontal_flip: True
      - vertical_flip: True
      - random_rotation_factor: 0.08
      - random_zoom_factor: 0.08
      - random_contrast_factor: 0.1
    """
    return keras.Sequential([
        layers.RandomFlip("horizontal_and_vertical"),
        layers.RandomRotation(0.08),
        layers.RandomZoom(0.08),
        layers.RandomContrast(0.1),
    ], name="data_augmentation")


def build_dataset_from_manifest(
    csv_path: str,
    base_dir: str,
    is_training: bool = False,
    augmentation_layer=None,
    batch_size: int = BATCH_SIZE,
    shuffle_buffer: int = 2048
) -> tf.data.Dataset:
    """
    Builds a tf.data.Dataset from a CSV manifest file.

    The manifest has columns: image_path, class_name, class_id, md5_hash
    image_path is relative to the disease_detection base directory.

    For training: shuffles, augments, repeats.
    For validation/test: no shuffle, no augment, no repeat.
    """
    df = pd.read_csv(csv_path)

    # Build absolute image paths
    abs_paths = df["image_path"].apply(
        lambda p: os.path.join(base_dir, p).replace("\\", "/")
    ).values

    labels = df["class_id"].values.astype(np.int32)

    dataset = tf.data.Dataset.from_tensor_slices((abs_paths, labels))

    if is_training:
        dataset = dataset.shuffle(shuffle_buffer, seed=42, reshuffle_each_iteration=True)

    dataset = dataset.map(load_and_preprocess_image, num_parallel_calls=AUTOTUNE)

    if is_training and augmentation_layer is not None:
        def apply_augmentation(img, label):
            img = augmentation_layer(img, training=True)
            return img, label
        dataset = dataset.map(apply_augmentation, num_parallel_calls=AUTOTUNE)

    dataset = dataset.batch(batch_size)
    dataset = dataset.prefetch(AUTOTUNE)

    return dataset, len(df)


# ─────────────────────────────────────────────────────────────────────
# 3. MODEL ARCHITECTURE — MobileNetV2 TRANSFER LEARNING
# ─────────────────────────────────────────────────────────────────────

def build_mobilenetv2_model(
    num_classes: int = 10,
    input_shape: Tuple[int, int, int] = (224, 224, 3),
    dropout_rate: float = 0.3,
    initial_learning_rate: float = 1e-3
) -> keras.Model:
    """
    Builds a transfer learning model with MobileNetV2 as the frozen feature
    extractor and a custom classification head.

    Architecture:
      MobileNetV2 (frozen, ImageNet weights)
          ↓
      GlobalAveragePooling2D
          ↓
      Dense(256, ReLU)
          ↓
      BatchNormalization
          ↓
      Dropout(0.3)
          ↓
      Dense(128, ReLU)
          ↓
      BatchNormalization
          ↓
      Dropout(0.3)
          ↓
      Dense(num_classes, Softmax)

    Why MobileNetV2:
      - Lightweight architecture suitable for agricultural edge deployment
      - Excellent accuracy-to-parameter ratio
      - Inverted residual blocks with linear bottlenecks
      - ImageNet pretraining transfers well to plant disease patterns
    """
    # Load pretrained MobileNetV2 backbone WITHOUT top classification layers
    base_model = keras.applications.MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_shape=input_shape
    )

    # Freeze ALL convolutional layers for Phase 1 (head training)
    base_model.trainable = False

    # Build custom classification head
    inputs = keras.Input(shape=input_shape, name="input_image")
    x = base_model(inputs, training=False)  # training=False keeps BatchNorm in inference mode
    x = layers.GlobalAveragePooling2D(name="global_avg_pool")(x)
    x = layers.Dense(256, activation="relu", name="fc_1")(x)
    x = layers.BatchNormalization(name="bn_1")(x)
    x = layers.Dropout(dropout_rate, name="dropout_1")(x)
    x = layers.Dense(128, activation="relu", name="fc_2")(x)
    x = layers.BatchNormalization(name="bn_2")(x)
    x = layers.Dropout(dropout_rate, name="dropout_2")(x)
    outputs = layers.Dense(num_classes, activation="softmax", name="output_probabilities")(x)

    model = keras.Model(inputs, outputs, name="disease_mobilenetv2")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=initial_learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )

    return model, base_model


def compute_class_weights(train_csv_path: str) -> Dict[int, float]:
    """
    Computes balanced class weights to counter the ~12.5× class imbalance.
    Uses sklearn's compute_class_weight with 'balanced' strategy.
    """
    df = pd.read_csv(train_csv_path)
    labels = df["class_id"].values
    unique_classes = np.unique(labels)

    weights = compute_class_weight(
        class_weight="balanced",
        classes=unique_classes,
        y=labels
    )

    class_weight_dict = {int(cls): float(w) for cls, w in zip(unique_classes, weights)}
    return class_weight_dict


# ─────────────────────────────────────────────────────────────────────
# 4. TRAINING — PHASE 1: HEAD-ONLY, PHASE 2: FINE-TUNE
# ─────────────────────────────────────────────────────────────────────

def train_phase1_head_only(
    model: keras.Model,
    train_ds: tf.data.Dataset,
    val_ds: tf.data.Dataset,
    class_weights: Dict[int, float],
    train_size: int,
    epochs: int = 15,
    patience: int = 5
) -> keras.callbacks.History:
    """
    Phase 1: Train ONLY the custom classification head while keeping MobileNetV2
    convolutional layers frozen. This prevents catastrophic forgetting of learned
    ImageNet features while adapting the head to our domain.
    """
    steps_per_epoch = train_size // BATCH_SIZE

    early_stop = callbacks.EarlyStopping(
        monitor="val_loss",
        patience=patience,
        restore_best_weights=True,
        verbose=1
    )

    reduce_lr = callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=3,
        min_lr=1e-6,
        verbose=1
    )

    print("\n" + "=" * 70)
    print("PHASE 1: HEAD-ONLY TRAINING (MobileNetV2 Backbone Frozen)")
    print("=" * 70)

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        class_weight=class_weights,
        callbacks=[early_stop, reduce_lr],
        verbose=1
    )

    return history


def train_phase2_fine_tune(
    model: keras.Model,
    base_model: keras.Model,
    train_ds: tf.data.Dataset,
    val_ds: tf.data.Dataset,
    class_weights: Dict[int, float],
    train_size: int,
    fine_tune_from_layer: int = 100,
    epochs: int = 15,
    patience: int = 5,
    fine_tune_lr: float = 1e-4
) -> keras.callbacks.History:
    """
    Phase 2: Unfreeze the top layers of MobileNetV2 (from layer index onwards)
    and fine-tune with a lower learning rate.

    MobileNetV2 has 155 layers total. Unfreezing from layer 100 allows the top
    ~55 layers (the later inverted residual blocks) to adapt to disease-specific
    spatial patterns while preserving low-level feature detectors.
    """
    # Unfreeze top layers of the backbone
    base_model.trainable = True
    for layer in base_model.layers[:fine_tune_from_layer]:
        layer.trainable = False

    trainable_count = sum(1 for layer in base_model.layers if layer.trainable)
    frozen_count = sum(1 for layer in base_model.layers if not layer.trainable)
    print(f"\n         Fine-tuning: {trainable_count} layers unfrozen, {frozen_count} layers frozen")

    # Re-compile with lower learning rate to avoid catastrophic forgetting
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=fine_tune_lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )

    early_stop = callbacks.EarlyStopping(
        monitor="val_loss",
        patience=patience,
        restore_best_weights=True,
        verbose=1
    )

    reduce_lr = callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=3,
        min_lr=1e-7,
        verbose=1
    )

    print("\n" + "=" * 70)
    print("PHASE 2: FINE-TUNING (Top MobileNetV2 Layers Unfrozen)")
    print("=" * 70)

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        class_weight=class_weights,
        callbacks=[early_stop, reduce_lr],
        verbose=1
    )

    return history


# ─────────────────────────────────────────────────────────────────────
# 5. EVALUATION & DIAGNOSTICS
# ─────────────────────────────────────────────────────────────────────

def evaluate_model(
    model: keras.Model,
    dataset: tf.data.Dataset,
    class_names: List[str],
    split_name: str = "Validation"
) -> Dict[str, Any]:
    """
    Evaluates model on a given dataset split, computes per-class metrics,
    and returns a structured results dictionary.
    """
    all_labels = []
    all_preds = []
    all_probs = []

    for images, labels in dataset:
        probs = model.predict(images, verbose=0)
        preds = np.argmax(probs, axis=1)
        all_labels.extend(labels.numpy())
        all_preds.extend(preds)
        all_probs.extend(probs)

    all_labels = np.array(all_labels)
    all_preds = np.array(all_preds)

    acc = accuracy_score(all_labels, all_preds)
    macro_precision = precision_score(all_labels, all_preds, average="macro", zero_division=0)
    macro_recall = recall_score(all_labels, all_preds, average="macro", zero_division=0)
    macro_f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0)
    weighted_f1 = f1_score(all_labels, all_preds, average="weighted", zero_division=0)

    total_errors = int(np.sum(all_labels != all_preds))
    total_samples = len(all_labels)

    report_str = classification_report(
        all_labels, all_preds,
        target_names=class_names,
        digits=4,
        zero_division=0
    )
    cm = confusion_matrix(all_labels, all_preds)

    results = {
        "split": split_name,
        "accuracy": float(acc),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "total_samples": total_samples,
        "total_errors": total_errors,
        "confusion_matrix": cm.tolist(),
        "classification_report": report_str
    }

    return results


def plot_training_curves(
    history_phase1: keras.callbacks.History,
    history_phase2: keras.callbacks.History,
    save_path: str
):
    """
    Plots combined training curves across both phases (head-only + fine-tune).
    Shows loss and accuracy trends to diagnose convergence and overfitting.
    """
    os.makedirs(os.path.dirname(save_path), exist_ok=True)

    # Concatenate histories
    h1 = history_phase1.history
    h2 = history_phase2.history

    train_loss = h1["loss"] + h2["loss"]
    val_loss = h1["val_loss"] + h2["val_loss"]
    train_acc = h1["accuracy"] + h2["accuracy"]
    val_acc = h1["val_accuracy"] + h2["val_accuracy"]

    phase1_epochs = len(h1["loss"])
    total_epochs = len(train_loss)
    epochs_range = range(1, total_epochs + 1)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    fig.suptitle("Disease Detection — MobileNetV2 Training Curves", fontsize=14, fontweight="bold")

    # Loss plot
    ax1.plot(epochs_range, train_loss, "b-", linewidth=1.5, label="Train Loss", alpha=0.8)
    ax1.plot(epochs_range, val_loss, "r-", linewidth=1.5, label="Val Loss", alpha=0.8)
    ax1.axvline(x=phase1_epochs, color="gray", linestyle="--", alpha=0.6,
                label=f"Phase 1→2 Boundary (Epoch {phase1_epochs})")
    ax1.set_xlabel("Epoch", fontsize=11)
    ax1.set_ylabel("Loss", fontsize=11)
    ax1.set_title("Cross-Entropy Loss", fontsize=12)
    ax1.legend(fontsize=10)
    ax1.grid(axis="y", linestyle="--", alpha=0.4)

    # Accuracy plot
    ax2.plot(epochs_range, train_acc, "b-", linewidth=1.5, label="Train Accuracy", alpha=0.8)
    ax2.plot(epochs_range, val_acc, "r-", linewidth=1.5, label="Val Accuracy", alpha=0.8)
    ax2.axvline(x=phase1_epochs, color="gray", linestyle="--", alpha=0.6,
                label=f"Phase 1→2 Boundary (Epoch {phase1_epochs})")
    ax2.set_xlabel("Epoch", fontsize=11)
    ax2.set_ylabel("Accuracy", fontsize=11)
    ax2.set_title("Classification Accuracy", fontsize=12)
    ax2.legend(fontsize=10)
    ax2.grid(axis="y", linestyle="--", alpha=0.4)
    ax2.set_ylim([0.5, 1.02])

    plt.tight_layout()
    plt.savefig(save_path, dpi=160, bbox_inches="tight")
    plt.close()


def plot_confusion_matrix(
    cm: np.ndarray,
    class_names: List[str],
    save_path: str,
    split_name: str = "Validation"
):
    """Plots a heatmap confusion matrix for visual diagnosis of misclassifications."""
    os.makedirs(os.path.dirname(save_path), exist_ok=True)

    fig, ax = plt.subplots(figsize=(12, 10))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    ax.figure.colorbar(im, ax=ax, shrink=0.8)

    # Format class name labels
    formatted_names = [c.replace("___", "\n").replace("_", " ") for c in class_names]
    ax.set(
        xticks=np.arange(len(class_names)),
        yticks=np.arange(len(class_names)),
        xticklabels=formatted_names,
        yticklabels=formatted_names,
    )
    ax.set_xlabel("Predicted Label", fontsize=12)
    ax.set_ylabel("True Label", fontsize=12)
    ax.set_title(f"Disease Detection — {split_name} Set Confusion Matrix\n(MobileNetV2)", fontsize=13, fontweight="bold")

    plt.setp(ax.get_xticklabels(), rotation=40, ha="right", fontsize=8.5)
    plt.setp(ax.get_yticklabels(), fontsize=8.5)

    # Annotate cells with counts
    thresh = cm.max() / 2.0
    for i in range(len(class_names)):
        for j in range(len(class_names)):
            ax.text(j, i, format(cm[i, j], "d"),
                    ha="center", va="center", fontsize=9,
                    color="white" if cm[i, j] > thresh else "black")

    plt.tight_layout()
    plt.savefig(save_path, dpi=160, bbox_inches="tight")
    plt.close()


# ─────────────────────────────────────────────────────────────────────
# 6. INFERENCE VERIFICATION
# ─────────────────────────────────────────────────────────────────────

def verify_inference(
    model: keras.Model,
    test_ds: tf.data.Dataset,
    class_names: List[str],
    num_samples: int = 5
):
    """
    Performs a quick inference sanity check on a few test samples.
    Prints predicted class and confidence for visual verification.
    """
    print("\n" + "=" * 70)
    print("INFERENCE VERIFICATION — Sample Predictions")
    print("=" * 70)

    sample_batch = next(iter(test_ds))
    images, labels = sample_batch
    probs = model.predict(images[:num_samples], verbose=0)

    for i in range(min(num_samples, len(images))):
        pred_idx = np.argmax(probs[i])
        pred_conf = probs[i][pred_idx]
        true_idx = labels[i].numpy()
        status = "✓" if pred_idx == true_idx else "✗"
        print(f"  [{status}] Sample {i+1}: True={class_names[true_idx]:<50} "
              f"Pred={class_names[pred_idx]:<50} Confidence={pred_conf:.4f}")


# ─────────────────────────────────────────────────────────────────────
# 7. MAIN TRAINING PIPELINE
# ─────────────────────────────────────────────────────────────────────

def run_training():
    """Main entry point for Milestone 10 disease detection training."""
    paths = get_project_paths()
    start_time = time.time()

    print("=" * 80)
    print("AGRISENSE — DISEASE DETECTION TRANSFER LEARNING TRAINING")
    print("Milestone 10: MobileNetV2 on PlantVillage (10 Classes)")
    print("=" * 80)

    # ── Load metadata ──
    print("\n[Step 1] Loading Dataset Metadata...")
    with open(paths["metadata_json"], "r") as f:
        metadata = json.load(f)

    class_names = metadata["classes"]
    num_classes = metadata["num_classes"]
    class_to_idx = metadata["class_to_idx"]
    idx_to_class = metadata["idx_to_class"]
    split_counts = metadata["split_counts"]

    print(f"         Dataset: {metadata['dataset_name']}")
    print(f"         Classes: {num_classes}")
    print(f"         Train/Val/Test: {split_counts['train']} / {split_counts['val']} / {split_counts['test']}")
    print(f"         Image Target: {metadata['preprocessing_specification']['target_dimensions']}")
    print(f"         Normalization: {metadata['preprocessing_specification']['normalization']}")

    # ── Compute class weights ──
    print("\n[Step 2] Computing Class Weights for Imbalance Correction...")
    class_weights = compute_class_weights(paths["train_csv"])
    for cls_idx, weight in sorted(class_weights.items()):
        cls_name = idx_to_class[str(cls_idx)]
        print(f"         [{cls_idx}] {cls_name:<50} weight={weight:.4f}")

    # ── Build tf.data pipelines ──
    print("\n[Step 3] Building tf.data Pipelines...")
    augmentation = create_augmentation_layer()

    train_ds, train_size = build_dataset_from_manifest(
        paths["train_csv"], paths["base_dir"],
        is_training=True, augmentation_layer=augmentation
    )
    val_ds, val_size = build_dataset_from_manifest(
        paths["val_csv"], paths["base_dir"],
        is_training=False
    )
    test_ds, test_size = build_dataset_from_manifest(
        paths["test_csv"], paths["base_dir"],
        is_training=False
    )

    print(f"         Train pipeline: {train_size:,} images (shuffled + augmented)")
    print(f"         Val pipeline:   {val_size:,} images")
    print(f"         Test pipeline:  {test_size:,} images")

    # ── Build model ──
    print("\n[Step 4] Building MobileNetV2 Transfer Learning Model...")
    model, base_model = build_mobilenetv2_model(
        num_classes=num_classes,
        input_shape=(224, 224, 3),
        dropout_rate=0.3,
        initial_learning_rate=1e-3
    )

    total_params = model.count_params()
    trainable_params = sum(
        int(np.prod(w.shape)) for w in model.trainable_weights
    )
    non_trainable_params = total_params - trainable_params

    print(f"         Architecture: MobileNetV2 + Custom Head")
    print(f"         Total Parameters:         {total_params:,}")
    print(f"         Trainable Parameters:     {trainable_params:,}")
    print(f"         Non-trainable Parameters: {non_trainable_params:,}")

    model.summary(print_fn=lambda x: None)  # Suppress verbose summary

    # ── Phase 1: Head-Only Training ──
    history_phase1 = train_phase1_head_only(
        model, train_ds, val_ds, class_weights,
        train_size=train_size,
        epochs=15,
        patience=5
    )

    # Evaluate after Phase 1
    print("\n[Phase 1 Results]")
    phase1_val = evaluate_model(model, val_ds, class_names, "Validation (Phase 1)")
    print(f"         Val Accuracy: {phase1_val['accuracy']*100:.2f}%")
    print(f"         Val Macro F1: {phase1_val['macro_f1']*100:.2f}%")

    # ── Phase 2: Fine-Tuning ──
    history_phase2 = train_phase2_fine_tune(
        model, base_model, train_ds, val_ds, class_weights,
        train_size=train_size,
        fine_tune_from_layer=100,
        epochs=15,
        patience=5,
        fine_tune_lr=1e-4
    )

    # ── Final Evaluation ──
    print("\n" + "=" * 70)
    print("FINAL EVALUATION")
    print("=" * 70)

    # Validation evaluation
    print("\n[Step 5] Validation Set Evaluation...")
    val_results = evaluate_model(model, val_ds, class_names, "Validation")
    print(f"\n         Validation Accuracy:       {val_results['accuracy']*100:.2f}%")
    print(f"         Validation Macro Precision: {val_results['macro_precision']*100:.2f}%")
    print(f"         Validation Macro Recall:    {val_results['macro_recall']*100:.2f}%")
    print(f"         Validation Macro F1:        {val_results['macro_f1']*100:.2f}%")
    print(f"         Validation Weighted F1:     {val_results['weighted_f1']*100:.2f}%")
    print(f"         Validation Errors:          {val_results['total_errors']} / {val_results['total_samples']}")
    print(f"\n{val_results['classification_report']}")

    # Test evaluation
    print("\n[Step 6] Test Set Evaluation...")
    test_results = evaluate_model(model, test_ds, class_names, "Test")
    print(f"\n         Test Accuracy:       {test_results['accuracy']*100:.2f}%")
    print(f"         Test Macro Precision: {test_results['macro_precision']*100:.2f}%")
    print(f"         Test Macro Recall:    {test_results['macro_recall']*100:.2f}%")
    print(f"         Test Macro F1:        {test_results['macro_f1']*100:.2f}%")
    print(f"         Test Weighted F1:     {test_results['weighted_f1']*100:.2f}%")
    print(f"         Test Errors:          {test_results['total_errors']} / {test_results['total_samples']}")
    print(f"\n{test_results['classification_report']}")

    # ── Diagnostic Visualizations ──
    print("[Step 7] Generating Diagnostic Visualizations...")
    plot_training_curves(history_phase1, history_phase2, paths["training_curves_path"])
    print(f"         Training curves: {paths['training_curves_path']}")

    plot_confusion_matrix(
        np.array(val_results["confusion_matrix"]),
        class_names,
        paths["confusion_matrix_path"].replace(".png", "_val.png"),
        "Validation"
    )
    plot_confusion_matrix(
        np.array(test_results["confusion_matrix"]),
        class_names,
        paths["confusion_matrix_path"].replace(".png", "_test.png"),
        "Test"
    )
    print(f"         Confusion matrices saved to evaluation/")

    # ── Save Model & Artifacts ──
    print("\n[Step 8] Saving Model Artifacts...")
    os.makedirs(paths["saved_model_dir"], exist_ok=True)

    model.save(paths["model_save_path"])
    print(f"         Model saved: {paths['model_save_path']}")

    # Save combined training history
    combined_history = {
        "phase1": {k: [float(v) for v in vals] for k, vals in history_phase1.history.items()},
        "phase2": {k: [float(v) for v in vals] for k, vals in history_phase2.history.items()},
    }
    with open(paths["history_save_path"], "w") as f:
        json.dump(combined_history, f, indent=2)
    print(f"         Training history: {paths['history_save_path']}")

    # Save training metadata
    elapsed = time.time() - start_time
    training_metadata = {
        "model_name": "MobileNetV2 Transfer Learning",
        "task": "Plant Disease Classification (10 Classes)",
        "dataset": metadata["dataset_name"],
        "architecture": {
            "backbone": "MobileNetV2 (ImageNet pretrained)",
            "head": "GAP → Dense(256) → BN → Dropout(0.3) → Dense(128) → BN → Dropout(0.3) → Dense(10, softmax)",
            "fine_tune_from_layer": 100,
            "total_backbone_layers": len(base_model.layers),
            "total_params": int(total_params),
            "input_shape": [224, 224, 3]
        },
        "training": {
            "phase1_head_only_epochs": len(history_phase1.history["loss"]),
            "phase2_fine_tune_epochs": len(history_phase2.history["loss"]),
            "batch_size": BATCH_SIZE,
            "phase1_learning_rate": 1e-3,
            "phase2_learning_rate": 1e-4,
            "class_weights": class_weights,
            "augmentation": metadata["preprocessing_specification"]["augmentation_training_only"]
        },
        "validation_results": {
            "accuracy": val_results["accuracy"],
            "macro_f1": val_results["macro_f1"],
            "weighted_f1": val_results["weighted_f1"],
            "total_errors": val_results["total_errors"],
            "total_samples": val_results["total_samples"]
        },
        "test_results": {
            "accuracy": test_results["accuracy"],
            "macro_f1": test_results["macro_f1"],
            "weighted_f1": test_results["weighted_f1"],
            "total_errors": test_results["total_errors"],
            "total_samples": test_results["total_samples"]
        },
        "class_mapping": idx_to_class,
        "training_time_seconds": round(elapsed, 1),
        "tensorflow_version": tf.__version__,
        "keras_version": keras.__version__
    }

    with open(paths["training_metadata_path"], "w") as f:
        json.dump(training_metadata, f, indent=2)
    print(f"         Training metadata: {paths['training_metadata_path']}")

    # ── Inference Verification ──
    verify_inference(model, test_ds, class_names, num_samples=5)

    # ── Final Summary ──
    print("\n" + "=" * 80)
    print("MILESTONE 10 — TRAINING COMPLETED SUCCESSFULLY")
    print("=" * 80)
    print(f"\n  Model:              MobileNetV2 Transfer Learning")
    print(f"  Total Parameters:   {total_params:,}")
    print(f"  Phase 1 Epochs:     {len(history_phase1.history['loss'])}")
    print(f"  Phase 2 Epochs:     {len(history_phase2.history['loss'])}")
    print(f"  Validation Acc:     {val_results['accuracy']*100:.2f}%")
    print(f"  Validation F1:      {val_results['macro_f1']*100:.2f}%")
    print(f"  Test Accuracy:      {test_results['accuracy']*100:.2f}%")
    print(f"  Test Macro F1:      {test_results['macro_f1']*100:.2f}%")
    print(f"  Test Errors:        {test_results['total_errors']} / {test_results['total_samples']}")
    print(f"  Training Time:      {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"\n  Saved Artifacts:")
    print(f"    Model:            {paths['model_save_path']}")
    print(f"    History:          {paths['history_save_path']}")
    print(f"    Metadata:         {paths['training_metadata_path']}")
    print(f"    Training Curves:  {paths['training_curves_path']}")


if __name__ == "__main__":
    run_training()
