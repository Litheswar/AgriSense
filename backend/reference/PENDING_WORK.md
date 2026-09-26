# AgriSense — Pending Engineering Work & Roadmap

**Status**: `[ROADMAP]`  
**Basis**: Grounded in audited codebase gaps and documented project milestones.  

---

## 1. High-Priority Engineering Tasks

### Task 1: Live MongoDB Production Connectivity `[COMPLETED]`
- **Objective**: Establish and verify a live connection to a running MongoDB database instance.
- **Current State**: Live connection to MongoDB Atlas (`agrisense`) verified complete. `test_persistence_atlas.js` passes 7/7 tests on live Atlas cluster.

### Task 2: Automated Shared Farm State → AI Execution Pipelines `[COMPLETED]`
- **Objective**: Create dedicated service boundaries and endpoints connecting Shared Farm State to AI modules.
- **Current State**: 
  - **Crop Recommendation Pipeline**: `[COMPLETED AND VERIFIED]` via `farmCropRecommendationService.js` and `GET /api/farms/:farmId/crop-recommendation`.
  - **Irrigation Advisory Pipeline**: `[COMPLETED AND VERIFIED]` via `farmIrrigationService.js` and `GET /api/farms/:farmId/irrigation`.
  - **Fertilizer Advisory Pipeline**: `[COMPLETED AND VERIFIED]` via `farmFertilizerService.js` and `GET /api/farms/:farmId/fertilizer`.
  - **Disease Risk Advisory Pipeline**: `[COMPLETED AND VERIFIED]` via `farmDiseaseRiskService.js` and `GET /api/farms/:farmId/disease-risk`.
  - **Market Intelligence Pipeline**: `[COMPLETED AND VERIFIED]` via `farmMarketService.js` and `GET /api/farms/:farmId/market`.
  - **Crop Ranking Pipeline**: `[COMPLETED AND VERIFIED]` via `farmCropRankingService.js` and `GET /api/farms/:farmId/crop-ranking`.

### Task 3: Automatic Disease Detection → Fertilizer Context Pipeline `[COMPLETED]`
- **Objective**: Automatically update `Farm.diseaseContext` following a disease detection event.
- **Current State**: `[COMPLETED AND VERIFIED]` via Milestone 18J. `POST /api/ai/disease-detection` and `POST /api/ai/predict` accept optional `farmId`, run MobileNetV2 inference, persist `{ detected, disease, confidence }` directly into `Farm.diseaseContext` on MongoDB Atlas, and downstream `GET /api/farms/:farmId/fertilizer` automatically inherits this disease context and injects the caution safeguard. `test_disease_detection_farm_context.js` passes 13/13 tests.

---

## 2. Medium-Priority Integration Tasks

### Task 4: Meteorological / Weather Service Integration
- **Objective**: Implement an Open-Meteo client to automate weather data ingestion.
- **Current State**: Completely absent (`[NOT IMPLEMENTED]`). Weather data must be provided manually.
- **Required Steps**:
  1. Create `backend/services/weatherService.js`.
  2. Implement HTTP client querying Open-Meteo API using `latitude` and `longitude` from `Farm.location`.
  3. Cache forecasts and update `Farm.weather` on a periodic schedule.

### Task 5: Live AGMARKNET Market API Key Verification
- **Objective**: Execute and verify live market data retrieval against the official Government of India portal.
- **Current State**: `AgmarknetApiProvider` is implemented, but unverified due to lack of `DATA_GOV_IN_API_KEY`.
- **Required Steps**:
  1. Obtain a verified API key from `data.gov.in`.
  2. Add `DATA_GOV_IN_API_KEY` to `.env`.
  3. Execute `AgmarknetApiProvider.get_records()` and verify JSON schema against live responses.

---

## 3. Future Architectural Milestones

### Task 6: Authentication & Multi-Tenancy
- **Objective**: Secure farmer records and API access.
- **Current State**: Zero authentication or role-based access control.
- **Required Steps**: Implement JWT-based authentication, user registration, and associate `Farm` documents with an authenticated `userId`.

### Task 7: Frontend React Application Integration
- **Objective**: Connect the client UI to the verified backend APIs.
- **Required Steps**: Build farmer dashboard displaying Soil Nutrient Status, Weather Widget, Irrigation Alerts, Disease Leaf Scanner, and Market Mandi Price Tracker.

### Task 8: Conversational AI Agriculture Assistant
- **Objective**: Provide an interactive natural language assistant for farmers.
- **Required Steps**: Implement an LLM-based agricultural conversational agent grounded in the verified Shared Farm State and engine recommendations.
