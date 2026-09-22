# AgriSense — Dataset Profiles & Verification

**Status**: `[VERIFIED FROM CODE & ARTIFACTS]`  

---

## 1. Crop Recommendation Dataset

### Dataset Characteristics
- **Total Records**: 2,200 rows
- **Classes**: 22 crops (exactly 100 samples per class; perfectly balanced)
- **Features**: 7 numerical input features, 1 categorical target label (`label`)
- **Missing Values**: 0 (no null, NaN, or infinite entries)
- **Duplicate Records**: 0

### Features Breakdown
| Feature Name | Description | Units | Minimum | Maximum | Mean | Std Dev |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `N` | Soil Nitrogen ratio | kg/ha | 0.0 | 140.0 | 50.46 | 37.02 |
| `P` | Soil Phosphorus ratio | kg/ha | 5.0 | 145.0 | 53.29 | 32.83 |
| `K` | Soil Potassium ratio | kg/ha | 5.0 | 205.0 | 48.13 | 50.70 |
| `temperature` | Ambient air temperature | °C | 8.83 | 43.68 | 25.58 | 5.12 |
| `humidity` | Relative ambient humidity | % | 14.26 | 99.98 | 71.44 | 22.28 |
| `ph` | Soil acidity / alkalinity | pH units | 3.50 | 9.94 | 6.47 | 0.78 |
| `rainfall` | Precipitation depth | mm | 20.21 | 298.56 | 103.35 | 54.95 |

### Partitioning & Preprocessing
- **Split Ratio**: 70% Train (1,540 rows) / 15% Validation (330 rows) / 15% Test (330 rows).
- **Stratification**: Stratified by crop class (exactly 70 train, 15 val, 15 test per crop class).
- **Scaling**: A `StandardScaler` was fitted on the training split (`scaler.pkl`), but the selected Random Forest model operates directly on raw unscaled features without loss of accuracy, preserving direct interpretability.

---

## 2. Plant Disease Detection Dataset (PlantVillage Core)

### Dataset Scope
Extracted from the open-access PlantVillage agricultural research dataset, specifically filtered for 3 high-priority commercial food crops across 10 disease/healthy conditions:
- **Total Images**: 10,490 unique RGB images.
- **Image Resolution**: Scaled to 224 × 224 pixels.
- **Color Channels**: 3 (RGB).

### Class Distribution & Split
| Class Index | Canonical Directory / Class Name | Crop | Health / Disease Status | Total Images | Train (70%) | Val (15%) | Test (15%) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| 0 | `Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot` | Corn | Cercospora / Gray leaf spot | 513 | 359 | 77 | 77 |
| 1 | `Corn_(maize)___Common_rust_` | Corn | Common rust | 1,192 | 834 | 179 | 179 |
| 2 | `Corn_(maize)___Northern_Leaf_Blight` | Corn | Northern Leaf Blight | 985 | 690 | 148 | 147 |
| 3 | `Corn_(maize)___healthy` | Corn | Healthy | 1,162 | 813 | 174 | 175 |
| 4 | `Potato___Early_blight` | Potato | Early blight | 1,000 | 700 | 150 | 150 |
| 5 | `Potato___Late_blight` | Potato | Late blight | 1,000 | 700 | 150 | 150 |
| 6 | `Potato___healthy` | Potato | Healthy | 152 | 106 | 23 | 23 |
| 7 | `Tomato___Early_blight` | Tomato | Early blight | 1,000 | 700 | 150 | 150 |
| 8 | `Tomato___Late_blight` | Tomato | Late blight | 1,909 | 1,336 | 286 | 287 |
| 9 | `Tomato___healthy` | Tomato | Healthy | 1,577 | 1,104 | 236 | 237 |
| **Total** | | | | **10,490** | **7,342** | **1,573** | **1,575** |

### Imbalance Management
Due to the rarity of certain classes (notably `Potato___healthy` with only 152 images), class weighting was computed during training using:
$$W_c = \frac{N_{\text{samples}}}{N_{\text{classes}} \times N_c}$$
Weights ranged from `0.55` (for Tomato late blight) to `6.93` (for Potato healthy), preventing majority-class bias.

### Dataset Limitations
1. **Monoculture Laboratory Conditions**: Leaves were photographed severed from plants on uniform gray/black paper backdrops.
2. **Pathogen Simplicity**: Single pathogen infections only; co-infections are absent.
3. **Lighting Uniformity**: Consistent diffused lighting; lacks solar glare, shadows, and wet-leaf specular highlights typical of field conditions.
