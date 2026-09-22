# AgriSense — Completed Milestones & Verification History

**Status**: `[AUDITED]`  
**Current Progress**: Milestones 1 through 18B Verified Complete.  

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
