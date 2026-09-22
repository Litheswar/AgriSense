# AgriSense — Model Evaluation & Performance Benchmarks

**Status**: `[VERIFIED FROM SAVED ARTIFACTS]`  
**Source Metadata**:
- `backend/models/crop_recommendation/saved_model/model_selection.json`
- `backend/models/disease_detection/saved_model/training_metadata.json`

---

## 1. Crop Recommendation Model Evaluation

### Comparative Algorithm Evaluation
During model selection, three architectures were trained and evaluated on identical stratified splits (70% train / 15% validation / 15% test; 1,540 / 330 / 330 rows):

| Model Candidate | Test Accuracy | Test Macro F1 | Val Accuracy | Val Macro F1 | Artifact Size | Selected? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Random Forest** | **99.70%** | **99.70%** | **99.09%** | **99.09%** | **3.53 MB** | **YES** |
| **XGBoost** | 98.48% | 98.47% | 98.79% | 98.78% | 1.49 MB | No |
| **Neural Network** | 98.18% | 98.18% | 98.48% | 98.48% | 0.06 MB | No |

### Verified Random Forest Benchmark Metrics
Extracted directly from `model_selection.json`:
- **Test Dataset Size**: 330 samples (stratified 15 samples per class across 22 classes)
- **Test Accuracy**: `99.70%` (0.9970)
- **Test Macro Precision**: `99.72%` (0.9972)
- **Test Macro Recall**: `99.70%` (0.9970)
- **Test Macro F1 Score**: `99.70%` (0.9970)
- **Test Weighted F1 Score**: `99.70%` (0.9970)
- **Total Test Errors**: `1` (only 1 misclassification out of 330 test samples)
- **Validation Accuracy**: `99.09%` (0.9909)
- **Validation Macro F1**: `99.09%` (0.9909)

### Evaluation Artifacts
- Confusion Matrix (Test): `backend/models/crop_recommendation/evaluation/random_forest_test_confusion_matrix.png`
- Confusion Matrix (XGBoost): `backend/models/crop_recommendation/evaluation/xgboost_test_confusion_matrix.png`
- Training History (NN): `backend/models/crop_recommendation/saved_model/nn_training_history.json`

---

## 2. Plant Disease Detection Model Evaluation

### MobileNetV2 Benchmark Metrics
Extracted directly from `training_metadata.json`:
- **Total Dataset Size**: 10,490 unique images across 10 classes
- **Split Ratio**: 70% Train (~7,343 images) / 15% Validation (1,573 images) / 15% Test (1,574 images)

| Metric | Validation Split (1,573 samples) | Test Split (1,574 samples) |
| :--- | :--- | :--- |
| **Accuracy** | **97.65%** (0.97648) | **96.95%** (0.96950) |
| **Macro F1 Score** | **97.14%** (0.97141) | **95.81%** (0.95810) |
| **Weighted F1 Score** | **97.64%** (0.97636) | **96.93%** (0.96934) |
| **Misclassified Samples**| 37 / 1,573 | 48 / 1,574 |

### Training History Summary
- **Phase 1 (Dense Classification Head)**: 13 epochs (stopped via early stopping at epoch 13). Initial learning rate: 0.001.
- **Phase 2 (Fine-Tuning Layers 100–154)**: 15 epochs. Learning rate: 0.0001.
- **Total Training Duration**: 5,401.7 seconds (~90 minutes).
- **Environment**: TensorFlow 2.21.0, Keras 3.14.1.

### Evaluation Artifacts
- Test Confusion Matrix: `backend/models/disease_detection/evaluation/disease_confusion_matrix_test.png`
- Validation Confusion Matrix: `backend/models/disease_detection/evaluation/disease_confusion_matrix_val.png`
- Training Curves (Loss & Accuracy): `backend/models/disease_detection/evaluation/disease_training_curves.png`
- Dataset Split Distribution: `backend/models/disease_detection/evaluation/class_distribution_split.png`
- Preprocessing & Augmentation Samples: `backend/models/disease_detection/evaluation/preprocessing_and_augmentation_samples.png`

---

## 3. Metrics Availability Declaration

In accordance with strict verification rules:
- **Per-Class Precision/Recall Tables**: Encoded graphically in `disease_confusion_matrix_test.png` and `random_forest_test_confusion_matrix.png`. Raw tabular CSV per class: *Not available in current artifacts*.
- **Field Trial / Outdoor Real-World Accuracy**: *Not available in current artifacts* (future field benchmarking planned).
