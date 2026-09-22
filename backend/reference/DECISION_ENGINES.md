# AgriSense — Decision & Scoring Engines Documentation

**Status**: `[IMPLEMENTED]` `[PROTOTYPE ASSUMPTIONS]`  
**Scope**: Non-ML Rule, Heuristic, and Decision Scoring Components  

---

## 1. Irrigation Decision Engine

### Overview & Philosophy
The Irrigation Engine evaluates whether a crop requires supplemental watering based on current soil moisture, ambient evaporative demand, and impending precipitation. It provides clear, actionable advice without fabricating continuous water volume estimates.

- **Location**: `backend/models/irrigation/engine/irrigation_engine.py`
- **Configuration**: `backend/models/irrigation/config/thresholds.json`
- **Inputs**:
  - `crop` (string)
  - `growth_stage` (string)
  - `soil_moisture` (float, 0–100%)
  - `temperature` (float, °C)
  - `humidity` (float, 0–100%)
  - `rain_probability` (float, 0–100%)
  - `expected_rainfall` (float, mm)
- **Outputs**:
  - `irrigation_required` (boolean)
  - `urgency` ('low', 'medium', 'high')
  - `reason` (detailed explanation string)
  - `context` (crop and growth stage summary)
- **Decision Logic**:
  1. If `soil_moisture` is above threshold (default: 30%), no irrigation is needed (`urgency: low`).
  2. If soil is dry but substantial rain is imminent (`rain_probability > 60%` AND `expected_rainfall >= 10mm`), irrigation is withheld to conserve water (`urgency: low`).
  3. If soil is dry and no rain is expected:
     - Under high atmospheric demand (`temperature > 35°C` AND `humidity < 40%`), triggers `urgency: high`.
     - Otherwise triggers `urgency: medium`.
- **Caveats**: Thresholds are prototype defaults and must be tailored to soil texture (clay vs sand) and crop coefficient ($K_c$) curves.

---

## 2. Fertilizer Decision Engine

### Overview & Philosophy
The Fertilizer Engine evaluates macronutrient availability and soil pH, identifying primary deficiencies and outputting nutritional advice. Crucially, it incorporates disease context to avoid recommending excessive nutrients (such as nitrogen) during active pathogen outbreaks.

- **Location**: `backend/models/fertilizer/engine/fertilizer_engine.py`
- **Configuration**: `backend/models/fertilizer/config/thresholds.json`
- **Inputs**:
  - `N`, `P`, `K` (floats, kg/ha)
  - `ph` (float, 0.0–14.0)
  - `crop` (string)
  - `growth_stage` (string)
  - `disease_status` (`{ "detected": bool, "disease": Optional[str] }`)
- **Outputs**:
  - `nutrient_status` (`{ "N": "low"|"adequate"|"high", "P": ..., "K": ... }`)
  - `ph_status` ('low', 'suitable', 'high')
  - `priority_nutrients` (list of low macronutrients)
  - `recommendation` (actionable guidance)
  - `caution` (disease-related warning if applicable)
  - `reasoning` (step-by-step agronomic justification)
- **Thresholds**:
  - Nitrogen: Low < 50, Adequate 50–100, High > 100
  - Phosphorus: Low < 30, Adequate 30–70, High > 70
  - Potassium: Low < 40, Adequate 40–90, High > 90
  - pH: Low < 6.0, Suitable 6.0–7.5, High > 7.5
- **Disease Caution Logic**: If `disease_status.detected == True`, injects:
  *"Caution: A disease ({disease}) was detected. Do not use fertilizer as a treatment for disease. Ensure nutrient application does not worsen the disease environment."*
- **Caveats**: Does not compute physical fertilizer bag quantities (e.g. Urea or DAP kg/acre).

---

## 3. Disease Risk Assessment Engine

### Overview & Philosophy
The Disease Risk Engine estimates the environmental predisposition for fungal and bacterial disease outbreaks using meteorological signals.

- **Location**: `backend/models/disease_risk/engine/disease_risk_engine.py`
- **Configuration**: `backend/models/disease_risk/config/risk_rules.json`
- **Inputs**:
  - `crop` (string)
  - `growth_stage` (string)
  - `temperature` (float, °C)
  - `humidity` (float, 0–100%)
  - `rainfall` (float, mm)
  - `recent_rainfall` (float, mm)
- **Outputs**:
  - `risk_level` ('Low', 'Medium', 'High')
  - `risk_score` (float 0.0 to 1.0 index)
  - `signals` (breakdown across humidity, temp, rainfall)
  - `reasoning` (explanatory strings)
  - `disclaimer` (clarifying non-pathogenic nature)
- **Scoring Weights**:
  - Humidity Signal: 35% weight
  - Temperature Signal: 25% weight
  - Rainfall Signal: 25% weight
  - Recent Rainfall Signal: 15% weight
- **Categorization**:
  - Score < 0.35 $\rightarrow$ 'Low'
  - 0.35 $\le$ Score < 0.70 $\rightarrow$ 'Medium'
  - Score $\ge$ 0.70 $\rightarrow$ 'High'
- **Caveats**: The risk score is a heuristic index, NOT an epidemiological infection probability. High environmental risk does not confirm disease presence.

---

## 4. Market Intelligence Engine

### Overview & Philosophy
The Market Intelligence Engine analyzes historical mandi price records to compute price trends, statistical ranges, and a standardized 0–100 market favorability score.

- **Location**: `backend/models/market/engine/market_engine.py`
- **Inputs**: `crop` (string), `market` (string), `state` (optional string).
- **Outputs**:
  - `current_price`: Latest chronological modal price observation (INR/Quintal).
  - `modal_price`: Median/modal price over observation window.
  - `price_range`: `{ min, max, unit }`.
  - `trend`: 'Increasing' (>5% change), 'Decreasing' (<-5% change), 'Stable' (within $\pm5\%$), or 'Unavailable'.
  - `market_score`: Heuristic favorability index (0–100):
    - Increasing: 75.0
    - Stable: 60.0
    - Decreasing: 25.0
    - Unavailable: 50.0 (neutral)
  - `data_available`: Boolean flag.
- **Caveats**: Historical price trends are backward-looking observations, NOT economic predictive forecasts or forward contract guarantees.

---

## 5. Crop Ranking Multi-Criteria Decision Engine

### Overview & Philosophy
The Crop Ranking Engine resolves the trade-off between biological agronomic suitability and local economic return, generating an integrated recommendation list.

- **Location**: `backend/models/crop_ranking/engine/crop_ranking_engine.py`
- **Inputs**:
  - Candidate crops with agronomic probabilities (from `CropRecommender.predict` or custom array)
  - `market_context` (`{ market, state, district }`)
  - `custom_weights` (optional, default: `{ agronomic: 0.7, market: 0.3 }`)
- **Combined Scoring Formula**:
  $$\text{Combined Score} = (0.7 \times \text{Model Confidence}) + (0.3 \times [\text{Market Score} / 100])$$
- **Missing Data Policy**: `FALLBACK_AGRONOMIC_PRIMARY`. If mandi data is unavailable for a crop, the combined score equals the agronomic probability without penalty.
- **Deterministic Ranking**: Sorted by `(-combined_score, -agronomic_signal, crop_name.lower())`.
