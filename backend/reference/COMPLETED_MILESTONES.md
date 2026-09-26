# AgriSense — Completed Milestones & Verification History

**Status**: `[AUDITED]`  
**Current Progress**: Milestones 1 through 18J Verified Complete.  

---

## Milestone Summary Table

| Milestone | Subsystem / Feature Area | Verification Status | Primary Artifacts / Evidence |
| :---: | :--- | :---: | :--- |
| **1–10** | **Crop Recommendation ML Pipeline** | `[VERIFIED]` | `saved_model/random_forest_model.pkl`, `predict.py`, `test_predict.py` |
| **11** | **Disease Detection ML Pipeline** | `[VERIFIED]` | `saved_model/disease_model.keras`, `predict.py`, `test_predict.py` |
| **12** | **Irrigation Decision Engine** | `[VERIFIED]` | `irrigation_engine.py`, `thresholds.json`, `test_irrigation_engine.py` |
| **13** | **Fertilizer Decision Engine** | `[VERIFIED]` | `fertilizer_engine.py`, `thresholds.json`, `test_fertilizer_engine.py` |
| **14** | **Disease Risk Assessment Engine** | `[VERIFIED]` | `disease_risk_engine.py`, `risk_rules.json`, `test_disease_risk_engine.py` |
| **15** | **Market Intelligence Engine** | `[VERIFIED]` | `market_engine.py`, `market_provider.py`, `test_market_engine.py` |
| **16** | **Crop Ranking Decision Engine** | `[VERIFIED]` | `crop_ranking_engine.py`, `ranking_config.json`, `test_crop_ranking_engine.py` |
| **17** | **Node.js Express ↔ Python Subprocess IPC**| `[VERIFIED]` | `server.js`, `aiRoutes.js`, `aiService.js`, `dispatcher.py`, `test_integration.js` (13/13 pass) |
| **18A** | **MongoDB Atlas Integration & Persistence** | `[VERIFIED]` | `Farm.js`, `farmService.js`, `db.js`, `test_persistence_atlas.js` (7/7 pass live on Atlas) |
| **18B** | **Shared Farm State Service** | `[VERIFIED]` | `sharedFarmStateService.js`, `farmController.js`, `farmRoutes.js`, `test_shared_farm_state.js` (7/7 pass) |
| **18D** | **Shared Farm State → Crop Recommendation Integration** | `[VERIFIED]` | `farmCropRecommendationService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_crop_recommendation.js` (10/10 pass) |
| **18E** | **Shared Farm State → Irrigation Recommendation Integration** | `[VERIFIED]` | `farmIrrigationService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_irrigation.js` (13/13 pass) |
| **18F** | **Shared Farm State → Fertilizer Recommendation Integration** | `[VERIFIED]` | `farmFertilizerService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_fertilizer.js` (18/18 pass) |
| **18G** | **Shared Farm State → Disease Risk Integration** | `[VERIFIED]` | `farmDiseaseRiskService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_disease_risk.js` (17/17 pass) |
| **18H** | **Shared Farm State → Market Intelligence Integration** | `[VERIFIED]` | `farmMarketService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_market.js` (17/17 pass) |
| **18I** | **Shared Farm State → Crop Ranking Integration** | `[VERIFIED]` | `farmCropRankingService.js`, `farmController.js`, `farmRoutes.js`, `test_farm_crop_ranking.js` (19/19 pass) |
| **18J** | **Disease Detection → Farm Disease Context Integration** | `[VERIFIED]` | `aiController.js`, `Farm.js`, `farmService.js`, `test_disease_detection_farm_context.js` (13/13 pass) |

---

## Detailed Milestone Descriptions

### Milestones 1–10: Crop Recommendation ML Pipeline `[VERIFIED]`
- **Scope**: Explored agricultural feature set (N, P, K, temperature, humidity, pH, rainfall across 2,200 rows and 22 classes).
- **Outcomes**: Trained, validated, and evaluated Random Forest, XGBoost, and Neural Network architectures. Selected Random Forest achieving 99.70% Test Accuracy and 99.70% Test Macro F1. Implemented canonical feature ordering enforcement and decoupled inference pipeline.

### Milestone 11: Plant Disease Detection Deep Learning Pipeline `[VERIFIED]`
- **Scope**: Filtered 10,490 PlantVillage images across 10 classes for Potato, Corn, and Tomato.
- **Outcomes**: Trained a 2-stage transfer learning MobileNetV2 architecture with custom classification head and class imbalance weighting. Achieved 96.95% Test Accuracy and 95.81% Test Macro F1. Implemented OpenCV/PIL input preprocessing and inference API.

### Milestone 12: Irrigation Decision Engine `[VERIFIED]`
- **Scope**: Built transparent heuristic rule engine consuming soil moisture, atmospheric demand, and rain forecast.
- **Outcomes**: Formulated dry-soil thresholds, high evaporative demand logic, and impending rain inhibition rules in `thresholds.json`.

### Milestone 13: Fertilizer Decision Engine `[VERIFIED]`
- **Scope**: Created agronomic soil deficiency evaluator for N, P, K, and pH.
- **Outcomes**: Implemented macronutrient classification, pH suitability checking, and a mandatory disease-caution safeguard that alerts farmers against treating viral or fungal leaf blights with fertilizers.

### Milestone 14: Disease Risk Assessment Engine `[VERIFIED]`
- **Scope**: Developed an environmental pre-condition scoring engine.
- **Outcomes**: Combined weighted meteorological signals (humidity, temperature, rainfall, recent rainfall) into a 0.0–1.0 risk index with explanatory reasoning strings.

### Milestone 15: Market Intelligence Engine `[VERIFIED]`
- **Scope**: Integrated mandi pricing observations and trend scoring.
- **Outcomes**: Built `NormalizedMarketRecord` schema, `AgmarknetApiProvider` for Government of India open data, `LocalMarketDataProvider` fallback, and trend momentum scoring.

### Milestone 16: Crop Ranking Decision Engine `[VERIFIED]`
- **Scope**: Unified biological agronomy with local economic market signals.
- **Outcomes**: Formulated multi-criteria weighted scoring ($0.7 \times \text{model confidence} + 0.3 \times \text{market signal}$). Established `FALLBACK_AGRONOMIC_PRIMARY` policy for missing market records and deterministic tie-breaking.

### Milestone 17: Node.js Express ↔ Python Integration Layer `[VERIFIED]`
- **Scope**: Built the production backend integration layer.
- **Outcomes**: Implemented Express REST routes, `aiService.js` subprocess execution engine with stdin/stdout streaming and timeout protection, unified `ai/dispatcher.py` dispatch hub, and an integration test suite covering all 7 AI tasks (13/13 tests pass).

### Milestone 18A: MongoDB Atlas Integration & Real Persistence Suite `[VERIFIED]`
- **Scope**: MongoDB Atlas cluster configuration, credential sanitization, process restart test suite, and Atlas persistence verification.
- **Outcomes**: Verified live connection to MongoDB Atlas (`agrisense.e4pyxxk.mongodb.net/agrisense`). Verified real CRUD operations, read-after-write consistency, cross-process restart persistence, and security sanitization (`test_persistence_atlas.js` passes 7/7 tests).

### Milestone 18B: Shared Farm State Service `[VERIFIED]`
- **Scope**: Dedicated service layer (`sharedFarmStateService.js`) returning normalized Shared Farm State via `farmService`.
- **Outcomes**: Encapsulated state transformation, handled `FARM_NOT_FOUND` and `INVALID_FARM_ID` errors, exposed `GET /api/farms/:farmId/shared-state` REST endpoint, and verified complete field mapping & data completeness (`test_shared_farm_state.js` passes 7/7 tests including live Atlas integration).

### Milestone 18D: Shared Farm State → Crop Recommendation Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the trained Crop Recommendation Random Forest inference model without model modification or retraining.
- **Outcomes**: Built `farmCropRecommendationService.js`, implemented input validation refusing silent default values (`INSUFFICIENT_FARM_DATA`), exposed `GET /api/farms/:farmId/crop-recommendation` REST endpoint, and verified real Atlas persistence + AI model inference (`test_farm_crop_recommendation.js` passes 10/10 tests).

### Milestone 18E: Shared Farm State → Irrigation Recommendation Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the Irrigation Decision Engine without modifying existing decision rules or adding ML/LLMs.
- **Outcomes**: Built `farmIrrigationService.js`, implemented feature extraction and missing value validation (`INSUFFICIENT_FARM_DATA`), exposed `GET /api/farms/:farmId/irrigation` REST endpoint, and verified real Atlas persistence + Irrigation Engine execution (`test_farm_irrigation.js` passes 13/13 tests).

### Milestone 18F: Shared Farm State → Fertilizer Recommendation Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the Fertilizer Decision Engine without modifying fertilizer rules.
- **Outcomes**: Built `farmFertilizerService.js`, implemented input feature mapping (N, P, K, pH, crop, growth stage, diseaseContext), preserved disease caution injection safeguard, exposed `GET /api/farms/:farmId/fertilizer` REST endpoint, and verified real Atlas persistence + Fertilizer Engine execution (`test_farm_fertilizer.js` passes 18/18 tests).

### Milestone 18G: Shared Farm State → Disease Risk Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the Disease Risk Decision Engine without modifying risk rules or replacing engine with ML/CV models.
- **Outcomes**: Built `farmDiseaseRiskService.js`, implemented feature mapping (crop, growthStage, temperature, humidity, rainfall, recentRainfall), enforced exact rainfall semantics, exposed `GET /api/farms/:farmId/disease-risk` REST endpoint, and verified real Atlas persistence + Disease Risk Engine execution (`test_farm_disease_risk.js` passes 17/17 tests).

### Milestone 18H: Shared Farm State → Market Intelligence Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the Market Intelligence Engine without modifying market engine logic, retraining models, or hardcoding prices.
- **Outcomes**: Built `farmMarketService.js`, implemented crop extraction from Shared Farm State with `INSUFFICIENT_FARM_DATA` validation, preserved live AGMARKNET vs. local fallback provider selection, exposed `GET /api/farms/:farmId/market` REST endpoint, enforced read-only invariant (no Farm mutations), and verified real Atlas persistence + Market Engine execution (`test_farm_market.js` passes 17/17 tests).

### Milestone 18I: Shared Farm State → Crop Ranking Integration `[VERIFIED]`
- **Scope**: Integrated persisted Shared Farm State into the multi-criteria Crop Ranking Decision Engine combining agronomic prediction confidence from the trained Random Forest model with market signals from the Market Intelligence Engine.
- **Outcomes**: Built `farmCropRankingService.js`, orchestrated Crop Recommendation and Crop Ranking execution via `aiService.js`, implemented strict input validation (`INSUFFICIENT_FARM_DATA`), location/market context fallback resolution, support for custom weights via query parameters (`agronomic_weight`, `market_weight`), exposed `GET /api/farms/:farmId/crop-ranking` REST endpoint, enforced read-only invariant, and verified real Atlas persistence + Crop Ranking execution (`test_farm_crop_ranking.js` passes 19/19 tests).

### Milestone 18J: Disease Detection → Farm Disease Context Integration `[VERIFIED]`
- **Scope**: Implemented runtime bridge connecting leaf image disease detection (MobileNetV2) to persisted `Farm.diseaseContext` in MongoDB Atlas and Shared Farm State without modifying model architecture or fertilizer rules.
- **Outcomes**: Enhanced `POST /api/ai/disease-detection` and `POST /api/ai/predict` to accept optional `farmId`, validated farm existence, executed deep learning inference, mapped detection results to canonical `{ detected, disease, confidence }`, persisted updates exclusively to `Farm.diseaseContext` (protecting `Farm.crop.name` from overwrite), preserved zero-mutation backward compatibility for requests without `farmId`, connected downstream Fertilizer advisory to auto-inject caution warnings upon disease detection, preserved independent Disease Risk engine semantics, and verified real Atlas persistence (`test_disease_detection_farm_context.js` passes 13/13 tests).
