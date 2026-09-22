# AgriSense — Pending Engineering Work & Roadmap

**Status**: `[ROADMAP]`  
**Basis**: Grounded in audited codebase gaps and documented project milestones.  

---

## 1. High-Priority Engineering Tasks

### Task 1: Live MongoDB Production Connectivity
- **Objective**: Establish and verify a live connection to a running MongoDB database instance.
- **Current State**: Code, schema, CRUD endpoints, and in-memory fallback are complete and pass 10/10 tests. However, local mongod is offline (`ECONNREFUSED`).
- **Required Steps**:
  1. Provision a local MongoDB service or MongoDB Atlas cloud cluster.
  2. Configure `MONGODB_URI` in `.env`.
  3. Run `test_farm.js` to verify live read-after-write persistence, indexing, and connection pooling.

### Task 2: Automated Shared Farm State → AI Execution Pipeline
- **Objective**: Create dedicated routes that fetch a `Farm` document and automatically evaluate it across all AI engines.
- **Current State**: Client must manually map Farm fields into separate `/api/ai/*` requests.
- **Required Steps**:
  1. Add `GET /api/farms/:farmId/recommend-crop`: Automatically extracts `soil` and `weather` from the farm document and calls `predictCrop()`.
  2. Add `GET /api/farms/:farmId/irrigation-advisory`: Automatically pulls `soilMoisture` and `weather` and calls `recommendIrrigation()`.
  3. Add `POST /api/farms/:farmId/full-audit`: Single composite endpoint executing all relevant engines for that farm.

### Task 3: Automatic Disease Detection → Fertilizer Context Pipeline
- **Objective**: Automatically update `Farm.diseaseContext` following a disease detection event.
- **Current State**: The Fertilizer Engine accepts a `disease_status` dictionary, but no automated runtime pipeline updates the Farm state from `aiService.detectDisease()`.
- **Required Steps**:
  1. Extend `POST /api/ai/disease-detection` to optionally accept `farmId`.
  2. Upon classification, update `Farm.diseaseContext` with detected disease name and confidence.
  3. Ensure subsequent fertilizer advisory calls automatically inherit this disease context.

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
