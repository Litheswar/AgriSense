# AgriSense — Module Connections & Dependency Matrix

**Status**: `[AUDITED]`  
**Classification Types Permitted**: `DIRECT`, `SHARED CONTEXT`, `PLANNED`  

---

## 1. High-Level Dependency Topology

```
                  ┌─────────────────────────────────────────┐
                  │           Shared Farm State             │
                  │      (backend/db/models/Farm.js)        │
                  └────────────────────┬────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │ [SHARED CONTEXT]            │ [SHARED CONTEXT]            │ [SHARED CONTEXT]
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│Crop Recommender  │          │Irrigation Engine │          │Fertilizer Engine │
│ (Random Forest)  │          │   (Rule-based)   │          │   (Rule-based)   │
└────────┬─────────┘          └──────────────────┘          └────────▲─────────┘
         │                                                           │ [PLANNED BRIDGE]
         │ [DIRECT RUNTIME]                                          │ (via disease_status)
         ▼                                                  ┌────────┴─────────┐
┌──────────────────┐                                        │Disease Detection │
│Crop Ranking      │◄─────────────────┐                     │  (MobileNetV2)   │
│     Engine       │ [DIRECT RUNTIME] │                     └──────────────────┘
└──────────────────┘                  │
                              ┌───────┴──────────┐
                              │  Market Engine   │
                              │ (Local/Agmarknet)│
                              └──────────────────┘
```

---

## 2. Connection Type Classifications

### A. DIRECT Connections
An actual runtime dependency consisting of an explicit code import, function invocation, service delegation, or subprocess task invocation.

1. **Crop Recommendation → Crop Ranking**:
   - **Type**: `DIRECT`
   - **Status**: `[IMPLEMENTED]`
   - **Evidence**: `backend/models/crop_ranking/engine/crop_ranking_engine.py` (`rank_crops()` method directly accepts the dictionary returned by `CropRecommender.predict()` and extracts candidate crops and probabilities).
   - **Data Exchanged**:
     ```json
     {
       "top_3": [
         { "crop": "rice", "probability": 0.97 },
         { "crop": "jute", "probability": 0.03 }
       ]
     }
     ```

2. **Market Engine → Crop Ranking**:
   - **Type**: `DIRECT`
   - **Status**: `[IMPLEMENTED]`
   - **Evidence**: `backend/ai/dispatcher.py` (lines 111–115: `CropRankingEngine(market_engine=get_market_engine())`) and `backend/models/crop_ranking/engine/crop_ranking_engine.py` (lines 189–195: `self.market_engine.analyze_market(crop=crop_name, market=market_name, state=state_name)`).
   - **Data Exchanged**:
     ```json
     {
       "crop": "Tomato",
       "market": "Kolar",
       "current_price": 2300.0,
       "trend": "Increasing",
       "market_score": 75.0,
       "data_available": true
     }
     ```

3. **Node.js Express Controller → aiService → Python Dispatcher**:
   - **Type**: `DIRECT`
   - **Status**: `[IMPLEMENTED]`
   - **Evidence**: `backend/controllers/aiController.js` → `backend/services/aiService.js` (`executeViaSubprocess`) → `backend/ai/dispatcher.py` (`dispatch_ai_task`).

4. **Farm Model → Shared Farm State Transformation**:
   - **Type**: `DIRECT`
   - **Status**: `[IMPLEMENTED]`
   - **Evidence**: `backend/db/models/Farm.js` (`FarmSchema.methods.toSharedFarmState()` directly transforms Mongoose document to standard JSON object).

---

### B. SHARED CONTEXT Connections
Two or more modules interact with normalized data structures conforming to the same schema or domain context without directly invoking one another.

1. **Farm / Shared Farm State ↔ AI Engines**:
   - **Type**: `SHARED CONTEXT`
   - **Status**: `[IMPLEMENTED SCHEMA / UNBRIDGED RUNTIME]`
   - **Evidence**: `backend/db/models/Farm.js` lines 213–238.
   - **Details**:
     - `Farm.soil` ({ nitrogen, phosphorus, potassium, ph }) maps to `{ N, P, K, ph }` required by Crop Recommendation and Fertilizer engines.
     - `Farm.weather` ({ temperature, humidity, rainfall }) maps to environmental inputs required by Crop Recommendation, Irrigation, and Disease Risk engines.
     - `Farm.crop` ({ name, growthStage }) maps to crop context required by Irrigation, Fertilizer, Disease Risk, and Market engines.
     - `Farm.fieldConditions` ({ soilMoisture }) maps to soil moisture required by the Irrigation engine.
     - `Farm.diseaseContext` ({ detected, disease, confidence }) maps to `disease_status` in the Fertilizer engine.

---

### C. PLANNED Connections
Architecturally intended relationships where runtime bridging has not yet been implemented in code.

1. **Weather API (Open-Meteo) → Irrigation Engine**:
   - **Type**: `PLANNED`
   - **Status**: `[PLANNED]`
   - **Reality**: No Open-Meteo client exists. Irrigation engine currently consumes weather parameters provided manually or through test payloads.

2. **Weather API (Open-Meteo) → Disease Risk Engine**:
   - **Type**: `PLANNED`
   - **Status**: `[PLANNED]`
   - **Reality**: No weather service client exists. Disease risk engine requires temperature, humidity, rainfall to be passed in the API request body.

3. **Disease Detection (CNN) → Fertilizer Engine**:
   - **Type**: `PLANNED`
   - **Status**: `[PARTIAL / PLANNED BRIDGE]`
   - **Reality**: The Fertilizer Engine accepts a `disease_status` dictionary and applies caution logic. However, there is NO automated pipeline that classifies an image, updates `Farm.diseaseContext`, and invokes `fertilizer_engine`. The connection exists only via manual payload parameterization.

4. **Automated Farm State Execution Pipeline (`/api/farms/:id/evaluate`)**:
   - **Type**: `PLANNED`
   - **Status**: `[PLANNED]`
   - **Reality**: The Express controller currently requires the client to supply inputs directly to `/api/ai/:task`. An automated route pulling a Farm document from DB, converting it via `toSharedFarmState()`, and broadcasting to all AI engines is planned for Milestone 19/20.

---

## 3. Comprehensive Connection Matrix

| Source Module | Target Module | Connection Type | Current Status | Data Exchanged | Code & Test Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CropRecommender` | `CropRankingEngine` | `DIRECT` | `[IMPLEMENTED]` | `top_3` candidates list, crop labels, probability floats (0.0–1.0) | `crop_ranking_engine.py:132-156`, `test_crop_ranking_engine.py:Test 11` |
| `MarketEngine` | `CropRankingEngine` | `DIRECT` | `[IMPLEMENTED]` | `market_score` (0–100), `trend`, `current_price` | `crop_ranking_engine.py:189-207`, `dispatcher.py:114` |
| `aiController.js` | `aiService.js` | `DIRECT` | `[IMPLEMENTED]` | Task string, input JSON payload | `aiController.js:47-165`, `test_integration.js:Tests 1-13` |
| `aiService.js` | `dispatcher.py` | `DIRECT` | `[IMPLEMENTED]` | Stdin JSON string, stdout JSON response | `aiService.js:24-105`, `dispatcher.py:291-330` |
| `Farm.js` Document | `SharedFarmState` | `DIRECT` | `[IMPLEMENTED]` | Normalized farm dictionary | `Farm.js:213-238`, `test_farm.js:Test 1, Test 10` |
| `SharedFarmState` | `CropRecommender` | `SHARED CONTEXT` | `[PARTIAL]` | `soil.N, P, K, ph`, `weather.temp, hum, rain` | Schema compatible; automatic endpoint planned |
| `SharedFarmState` | `IrrigationEngine` | `SHARED CONTEXT` | `[PARTIAL]` | `soilMoisture`, `weather.*`, `crop.*` | Schema compatible; automatic endpoint planned |
| `SharedFarmState` | `FertilizerEngine` | `SHARED CONTEXT` | `[PARTIAL]` | `soil.N, P, K, ph`, `crop.*`, `diseaseContext` | Schema compatible; automatic endpoint planned |
| `SharedFarmState` | `DiseaseRiskEngine`| `SHARED CONTEXT` | `[PARTIAL]` | `weather.*`, `crop.*` | Schema compatible; automatic endpoint planned |
| `SharedFarmState` | `MarketEngine` | `SHARED CONTEXT` | `[PARTIAL]` | `crop.name`, `marketContext.market, state` | Schema compatible; automatic endpoint planned |
| `DiseaseDetector` | `FertilizerEngine` | `PLANNED` | `[PARTIAL]` | `diseaseContext` → `disease_status` | Interface supported; runtime bridge planned |
| `WeatherService` | `IrrigationEngine` | `PLANNED` | `[NOT IMPLEMENTED]`| `rain_probability`, `expected_rainfall` | No weather service implemented in repository |
| `WeatherService` | `DiseaseRiskEngine`| `PLANNED` | `[NOT IMPLEMENTED]`| `temperature`, `humidity`, `rainfall` | No weather service implemented in repository |

---

## 4. Mathematical Data Transformations

### Market Score Normalization in Crop Ranking
Within `CropRankingEngine.rank_candidates()`, the market score is transformed to a normalized unit signal:
```
Market Score (0.0 to 100.0)
             ↓
    Divide by 100.0
             ↓
Market Signal (0.0 to 1.0)
```
Combined multi-criteria calculation:
$$\text{Combined Score} = (w_{\text{agronomic}} \times S_{\text{agronomic}}) + (w_{\text{market}} \times S_{\text{market}})$$
Where default weights are:
$$w_{\text{agronomic}} = 0.7, \quad w_{\text{market}} = 0.3$$
**Verified Example from Code & Tests**:
- Candidate: Tomato
- Model Probability ($S_{\text{agronomic}}$): `0.60`
- Market Score: `75.0` $\rightarrow S_{\text{market}} = 75.0 / 100.0 = 0.75$
- Combined Score: $(0.7 \times 0.60) + (0.3 \times 0.75) = 0.42 + 0.225 = \mathbf{0.6450}$

---

## 5. End-to-End Farmer User Scenario

This scenario demonstrates the lifecycle of a farmer's decision workflow, clearly delineating implemented vs. planned stages:

### Step 1: Farm Registration & Soil Profiling `[IMPLEMENTED]`
- Farmer registers farm via `POST /api/farms`.
- System records location (Kolar, Karnataka), soil nutrients (N: 90, P: 42, K: 43, pH: 6.5), and initial field conditions.
- Stored via `farmService` (in MongoDB if online, or memory store fallback).

### Step 2: Crop Recommendation `[IMPLEMENTED]`
- Farmer requests crop advice via `POST /api/ai/crop-recommendation`.
- System executes Random Forest model, outputting predicted crop `rice` (confidence 0.92) with top-3 alternatives.

### Step 3: Market-Aware Crop Ranking `[IMPLEMENTED]`
- Farmer requests multi-criteria ranking via `POST /api/ai/crop-ranking`.
- Candidates (`Tomato` prob: 0.6, `Potato` prob: 0.4) are cross-referenced with mandi prices in Kolar.
- Due to an increasing market trend (score 75), `Tomato` secures rank #1.

### Step 4: Weather Ingestion `[PLANNED]`
- *Currently*: Farmer or test payload manually supplies weather data (`temperature: 28.5`, `humidity: 65.0`).
- *Planned*: Automated background job queries Open-Meteo for the farm's latitude/longitude and updates `Farm.weather`.

### Step 5: Irrigation Advisory `[IMPLEMENTED]`
- Farmer checks irrigation status via `POST /api/ai/irrigation`.
- Soil moisture (25%) is below threshold; high temperature (38°C) triggers high urgency advisory.

### Step 6: Leaf Disease Detection `[IMPLEMENTED]`
- Farmer uploads an image of a symptomatic leaf via `POST /api/ai/disease-detection`.
- MobileNetV2 classifies `Tomato___Late_blight` with 96.55% confidence.

### Step 7: Automatic Disease Caution in Fertilizer Advisory `[PLANNED RUNTIME BRIDGE]`
- *Currently Implemented*: If `disease_status: { detected: true, disease: "Late blight" }` is included in `POST /api/ai/fertilizer`, the engine outputs a prominent caution warning against using fertilizer as pesticide.
- *Planned*: Automatic update of `Farm.diseaseContext` immediately upon Step 6 inference completion.
