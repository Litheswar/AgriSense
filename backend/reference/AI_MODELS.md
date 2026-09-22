# AgriSense — Machine Learning Models Documentation

**Status**: `[IMPLEMENTED]`  
**Audited Scope**: Strictly Machine Learning Models (`crop_recommendation` and `disease_detection`).  

> [!IMPORTANT]
> The remaining 5 components in AgriSense (`irrigation`, `fertilizer`, `disease_risk`, `market`, and `crop_ranking`) are **deterministic heuristic and rule-based decision engines**, NOT machine learning models. Refer to [DECISION_ENGINES.md](file:///d:/FSD_project/backend/reference/DECISION_ENGINES.md) for their specifications.

---

## Model 1: Crop Recommendation Classifier

### Architecture & Pipeline Overview
The Crop Recommendation subsystem is an agronomic classifier trained to recommend the optimal crop for given soil chemistry and environmental parameters.

```
Agricultural Inputs {N, P, K, temp, humidity, ph, rainfall}
                          │
                          ▼
            Input Type & Bounds Validation
                          │
                          ▼
       Canonical Feature Ordering Enforcement (DataFrame)
                          │
                          ▼
             Random Forest Classifier (predict_proba)
                          │
                          ▼
            Label Encoder Inverse Transformation
                          │
                          ▼
   JSON Output: { predicted_crop, confidence, top_3 candidates }
```

### Technical Specifications
- **Model Type**: Scikit-Learn `RandomForestClassifier` (100 estimators).
- **Target Classes (22)**:
  `apple`, `banana`, `blackgram`, `chickpea`, `coconut`, `coffee`, `cotton`, `grapes`, `jute`, `kidneybeans`, `lentil`, `maize`, `mango`, `mothbeans`, `mungbean`, `muskmelon`, `orange`, `papaya`, `pigeonpeas`, `pomegranate`, `rice`, `watermelon`.
- **Input Features (7 Canonical Columns)**:
  1. `N`: Nitrogen content ratio in soil (kg/ha)
  2. `P`: Phosphorus content ratio in soil (kg/ha)
  3. `K`: Potassium content ratio in soil (kg/ha)
  4. `temperature`: Ambient temperature (°C)
  5. `humidity`: Relative humidity (%)
  6. `ph`: Soil pH value (0.0–14.0)
  7. `rainfall`: Precipitation depth (mm)
- **Feature Ordering Safety**:
  Regardless of the insertion order in the input JSON dictionary, `validate_and_order_features()` guarantees that features are structured into a 2D Pandas DataFrame adhering strictly to the canonical sequence expected by the pickled estimator.
- **Model Artifacts**:
  - Model: `backend/models/crop_recommendation/saved_model/random_forest_model.pkl` (3.53 MB)
  - Label Encoder: `backend/models/crop_recommendation/saved_model/label_encoder.pkl` (696 B)
  - Metadata: `backend/models/crop_recommendation/saved_model/metadata.json`
  - Model Selection Log: `backend/models/crop_recommendation/saved_model/model_selection.json`

### Agronomic Caveat
Model output probability reflects the statistical similarity of input parameters to training profiles. It does **not** constitute an agronomic guarantee of harvest yield, profitability, or suitability across unmeasured variables (e.g. soil drainage, salinity, local pests).

---

## Model 2: Plant Disease Detection (Deep Learning)

### Architecture & Pipeline Overview
The Plant Disease Detection subsystem employs Convolutional Neural Network (CNN) transfer learning to classify foliar diseases from RGB leaf imagery.

```
                      Input Image Path (JPG/PNG)
                                  │
                                  ▼
                   OpenCV / PIL Image Decoding
                                  │
                                  ▼
                     Resize to 224 × 224 × 3 RGB
                                  │
                                  ▼
           MobileNetV2 Feature Extractor (ImageNet Pretrained)
                                  │
                                  ▼
                      Global Average Pooling 2D
                                  │
                                  ▼
                    Dense(256) → BatchNorm → Dropout(0.3)
                                  │
                                  ▼
                    Dense(128) → BatchNorm → Dropout(0.3)
                                  │
                                  ▼
                      Dense(10, Softmax Activation)
                                  │
                                  ▼
             JSON: { crop, predicted_disease, confidence, top_3 }
```

### Technical Specifications
- **Backbone**: Keras `MobileNetV2` with ImageNet pre-trained weights (154 backbone layers, 2,621,642 total parameters).
- **Fine-Tuning**: Layer cutoff `fine_tune_from_layer = 100`. First 100 layers frozen; subsequent layers fine-tuned during Phase 2 training.
- **Input Dimension**: `(224, 224, 3)` normalized floating-point RGB tensor.
- **Supported Crops and Diseases (10 Classes)**:
  1. `Corn (maize) Cercospora / Gray leaf spot` (`Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot`)
  2. `Corn (maize) Common rust` (`Corn_(maize)___Common_rust_`)
  3. `Corn (maize) Northern Leaf Blight` (`Corn_(maize)___Northern_Leaf_Blight`)
  4. `Corn (maize) Healthy` (`Corn_(maize)___healthy`)
  5. `Potato Early blight` (`Potato___Early_blight`)
  6. `Potato Late blight` (`Potato___Late_blight`)
  7. `Potato Healthy` (`Potato___healthy`)
  8. `Tomato Early blight` (`Tomato___Early_blight`)
  9. `Tomato Late blight` (`Tomato___Late_blight`)
  10. `Tomato Healthy` (`Tomato___healthy`)
- **Training Strategy**:
  - Two-stage training: Phase 1 (13 epochs, head only, LR=0.001) + Phase 2 (15 epochs, fine-tuning, LR=0.0001).
  - Inverse frequency class weighting applied to counter sample imbalance (e.g. Potato healthy weight 6.93 vs. Tomato late blight 0.55).
  - Preprocessing augmentations: Horizontal/vertical flips, subtle rotation, zoom, contrast jitter.
- **Model Artifacts**:
  - Model: `backend/models/disease_detection/saved_model/disease_model.keras` (28.9 MB)
  - Metadata: `backend/models/disease_detection/saved_model/training_metadata.json`
  - Training History: `backend/models/disease_detection/saved_model/disease_training_history.json`

### Field Application Caveat
The model was trained on the PlantVillage dataset under controlled laboratory lighting and uniform backgrounds. Field performance on images featuring background clutter, multi-leaf overlaps, partial shadows, or co-occurring pathogens will exhibit lower accuracy than benchmark figures.
