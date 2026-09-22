# AgriSense — System Status Dashboard

**Audit Date**: 2026-09-22  
**Primary Agent**: Antigravity  
**System Architecture**: Node.js Express ↔ Python Subprocess IPC  
**Database Architecture**: Mongoose / MongoDB Atlas with In-Memory Repository Fallback  

---

## 1. Executive Status Summary

| Area | Verified Status | Summary |
| :--- | :--- | :--- |
| **Crop Recommendation (ML)** | `[IMPLEMENTED]` | Random Forest (100 trees, 22 classes). Model inference & validation verified. |
| **Disease Detection (ML)** | `[IMPLEMENTED]` | MobileNetV2 (ImageNet backbone, 10 classes). Preprocessing, inference, top-3 verified. |
| **Irrigation Engine** | `[IMPLEMENTED]` `[PROTOTYPE ASSUMPTION]` | Rule-based decision engine. Dry soil + rain probability rules verified. |
| **Fertilizer Engine** | `[IMPLEMENTED]` `[PROTOTYPE ASSUMPTION]` | Rule-based N/P/K & pH deficiency classifier with disease caution flag verified. |
| **Disease Risk Engine** | `[IMPLEMENTED]` `[PROTOTYPE ASSUMPTION]` | Heuristic environmental risk scoring (0.0–1.0) verified. |
| **Market Intelligence Engine** | `[IMPLEMENTED]` `[NOT LIVE VERIFIED]` | Trend and score calculation verified. Agmarknet provider implemented; local fallback active. |
| **Crop Ranking Engine** | `[IMPLEMENTED]` `[PROTOTYPE ASSUMPTION]` | Multi-criteria weighted ranking (0.7 agronomic + 0.3 market) verified. |
| **Node.js ↔ Python IPC** | `[IMPLEMENTED]` | Stdin/stdout JSON subprocess IPC in `aiService.js` verified (13/13 tests pass). |
| **Farm Model & CRUD** | `[IMPLEMENTED]` | Mongoose `Farm` schema, CRUD endpoints, and validation verified. |
| **Shared Farm State Service** | `[IMPLEMENTED]` | Service boundary (`sharedFarmStateService.js`), REST endpoint, and transformation verified (7/7 tests pass). |
| **Database Fallback** | `[IMPLEMENTED]` | In-memory repository pattern in `farmService.js` verified (10/10 tests pass). |
| **MongoDB Atlas Integration**| `[IMPLEMENTED]` | Mongoose SRV configuration in `backend/.env` & `backend/config/db.js`. Sanitized logging active. |
| **Live Atlas Connectivity** | `[VERIFIED]` | Verified live connectivity and real CRUD operations against MongoDB Atlas (`agrisense` DB). |
| **Weather API (Open-Meteo)** | `[NOT IMPLEMENTED]` | Zero weather client or API code exists. Weather fields are schema/input only. |
| **Milestone 18 Readiness** | `[IMPLEMENTED AND VERIFIED]` | Milestone 18A (Atlas Persistence) & Milestone 18B (Shared Farm State Service) implemented and fully verified. |

---

## 2. Detailed Component Audit

### Component 1: Crop Recommendation (ML Model)
- **Algorithm**: Random Forest Classifier (100 estimators, max_depth=None).
- **Inputs**: 7 continuous numerical features: `N`, `P`, `K`, `temperature`, `humidity`, `ph`, `rainfall`.
- **Output**: `predicted_crop` (string), `confidence` (float 0–1), `top_3` candidates list with probabilities.
- **Artifacts**: `saved_model/random_forest_model.pkl` (3.53 MB), `label_encoder.pkl` (696 B), `metadata.json`.
- **Verified Metrics**: Test Accuracy 99.70%, Test Macro F1 99.70% (evaluated on 330 test samples).
- **Caveat**: Model probability represents classification confidence on historical dataset, NOT absolute agronomic suitability across untyped microclimates.

### Component 2: Disease Detection (ML Model)
- **Algorithm**: MobileNetV2 with Transfer Learning (154 backbone layers, GAP → Dense(256) → Dense(128) → Dense(10)).
- **Input**: Plant leaf image file path (224×224 RGB, normalized).
- **Supported Crops/Classes (10)**:
  - Potato: Early blight, Late blight, Healthy
  - Tomato: Early blight, Late blight, Healthy
  - Corn/Maize: Cercospora/Gray leaf spot, Common rust, Northern Leaf Blight, Healthy
- **Artifacts**: `saved_model/disease_model.keras` (28.9 MB), `training_metadata.json`.
- **Verified Metrics**: Test Accuracy 96.95%, Test Macro F1 95.81%, Test Weighted F1 96.93% (1,574 test samples).
- **Caveat**: High laboratory accuracy on PlantVillage controlled-background images does NOT guarantee equal field performance under complex outdoor lighting or occlusions.

### Component 3: Irrigation Decision Engine (Non-ML)
- **Type**: Deterministic heuristic rule engine (NOT ML).
- **Inputs**: `crop`, `growth_stage`, `soil_moisture`, `temperature`, `humidity`, `rain_probability`, `expected_rainfall`.
- **Output**: `irrigation_required` (boolean), `urgency` ('low', 'medium', 'high'), `reason` (string).
- **Rule Set**: Configured via `config/thresholds.json`. Triggers on low soil moisture (<30%), environmental stress (>35°C, <40% humidity), and inhibits irrigation if rain probability >60% with expected rainfall >=10mm.
- **Caveat**: Prototype thresholds require empirical validation with soil moisture tension sensors and local crop water requirement curves.

### Component 4: Fertilizer Decision Engine (Non-ML)
- **Type**: Rule- and knowledge-based decision engine (NOT ML).
- **Inputs**: `N`, `P`, `K`, `ph`, `crop`, `growth_stage`, `disease_status` (`{ detected: bool, disease: str }`).
- **Output**: `nutrient_status` ({N, P, K: low/adequate/high}), `ph_status`, `priority_nutrients` list, `recommendation` text, `caution` text.
- **Rule Set**: Configured via `config/thresholds.json`. Identifies macronutrient deficits and suitable pH ranges (6.0–7.5). If `disease_status.detected == true`, injects a mandatory caution disclaiming fertilizer as disease cure.
- **Caveat**: Prototype scoring does not compute physical mass dosage (kg/ha) or formulate chemical/organic blends.

### Component 5: Disease Risk Scoring Engine (Non-ML)
- **Type**: Environmental heuristic risk index (NOT ML).
- **Inputs**: `crop`, `growth_stage`, `temperature`, `humidity`, `rainfall`, `recent_rainfall`.
- **Output**: `risk_level` ('Low', 'Medium', 'High'), `risk_score` (0.0–1.0 index), `signals` breakdown, `reasoning` list, `disclaimer`.
- **Rule Set**: Configured via `config/risk_rules.json`. Weights humidity (35%), temperature (25%), rainfall (25%), and recent rainfall (15%).
- **Caveat**: Risk score is a synthetic heuristic index, NOT a calibrated epidemiological infection probability. High environmental risk does not prove pathogen presence.

### Component 6: Market Intelligence Engine (Non-ML)
- **Type**: Historical mandi price analyzer and trend scoring engine (NOT ML).
- **Inputs**: `crop`, `market` (mandi name), `state` (optional).
- **Outputs**: `current_price` (latest observation), `modal_price`, `price_range`, `trend` ('Increasing', 'Decreasing', 'Stable', 'Unavailable'), `market_score` (0–100 index).
- **Data Providers**:
  - `AgmarknetApiProvider`: Configured for `api.data.gov.in` resource `9ef84268-d588-465a-a308-a864a43d0070`. Requires `DATA_GOV_IN_API_KEY`.
  - `LocalMarketDataProvider`: Deterministic file-backed fallback reading `data/sample_market_data.json`.
- **Current Runtime Status**: In the absence of a live API key, the system runs on `LocalMarketDataProvider`. Live HTTP requests are `[NOT LIVE VERIFIED]`.

### Component 7: Crop Ranking Decision Engine (Non-ML)
- **Type**: Multi-criteria weighted decision scoring engine (NOT ML).
- **Inputs**: Either `crop_recommendation_output` (direct from `CropRecommender.predict`) or explicit `candidates` list, plus `market_context` ({market, state}).
- **Formula**:
  $$\text{Combined Score} = (0.7 \times \text{Agronomic Signal}) + (0.3 \times \text{Market Signal})$$
  Where:
  - $\text{Agronomic Signal} = \text{Crop model classification probability } (0.0 - 1.0)$
  - $\text{Market Signal} = \text{Market score } / 100.0 \ (0.0 - 1.0)$
- **Missing Data Policy**: `FALLBACK_AGRONOMIC_PRIMARY`. When market data is unavailable for a crop, $\text{Combined Score} = \text{Agronomic Signal}$ without an artificial zero-penalty.
- **Tie Breaking**: Deterministic sort on: `(-combined_score, -agronomic_signal, crop_name.lower())`.

---

## 3. Database & Shared Farm State Status

### MongoDB Code vs Connectivity Matrix
| Layer | Implementation State | Verification Method |
| :--- | :--- | :--- |
| Mongoose ODM | `[IMPLEMENTED]` | `package.json` specifies `"mongoose": "^9.10.0"`. |
| Connection Module | `[IMPLEMENTED]` | `backend/config/db.js` handles connect, disconnect, and error trapping. |
| Farm Schema & Model | `[IMPLEMENTED]` | `backend/db/models/Farm.js` with validation on location, soil, weather, crop. |
| In-Memory Fallback | `[IMPLEMENTED]` | `backend/services/farmService.js` stores documents in `Map` when MongoDB is offline. |
| Shared State Transform | `[IMPLEMENTED]` | `FarmSchema.methods.toSharedFarmState()` transforms document to normalized state. |
| Shared State Service | `[IMPLEMENTED]` | `backend/services/sharedFarmStateService.js` retrieves state via `farmService`. |
| Farm CRUD & State API | `[IMPLEMENTED]` | `backend/controllers/farmController.js` and `backend/routes/farmRoutes.js`. |
| Shared State Tests | `[VERIFIED]` | `node backend/tests/test_shared_farm_state.js` passes 7/7 tests (including real Atlas). |
| Live MongoDB Atlas | `[VERIFIED]` | Live MongoDB Atlas cluster connected and verified with real CRUD operations. |

---

## 4. Test Suite Summary

| Test Suite | Total Tests | Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- |
| Python: Crop Recommendation | 10 assertions | 10 | 0 | `[PASS]` |
| Python: Disease Detection | 7 test cases | 7 | 0 | `[PASS]` |
| Python: Irrigation Engine | 7 test cases | 7 | 0 | `[PASS]` |
| Python: Fertilizer Engine | 8 test cases | 8 | 0 | `[PASS]` |
| Python: Disease Risk Engine | 8 test cases | 8 | 0 | `[PASS]` |
| Python: Market Intelligence | 14 test cases | 14 | 0 | `[PASS]` |
| Python: Crop Ranking Engine | 11 test cases | 11 | 0 | `[PASS]` |
| Node.js: AI Integration Suite | 13 tests | 13 | 0 | `[PASS]` |
| Node.js: Farm CRUD Suite | 10 tests | 10 | 0 | `[PASS]` |
| Node.js: Shared Farm State Suite | 7 tests | 7 | 0 | `[PASS]` |
| **Combined (`npm test`)** | **30 tests** | **30** | **0** | **`[100% PASS]`** |
