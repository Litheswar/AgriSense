# AgriSense — Reference Documentation Hub

Welcome to the authoritative reference documentation system for the **AgriSense Intelligent Agricultural Decision Support System**.

This documentation suite reflects the **audited repository state** verified against actual source code, database models, ML model artifacts, decision engine rule configurations, and regression test suites.

---

## Status Markers Legend

Every subsystem, integration, and feature throughout this documentation is tagged with an explicit status indicator:

| Status Marker | Definition | Operational Reality |
| :--- | :--- | :--- |
| `[IMPLEMENTED]` | Code exists, is functional, and passes automated tests. | Ready and functioning within the current environment. |
| `[PARTIAL]` | Core logic or interfaces exist, but runtime integration is incomplete. | Requires bridging or client-side orchestration. |
| `[PLANNED]` | Architecturally designed for future milestones; not yet implemented in code. | No functional runtime code exists in the repository. |
| `[NOT IMPLEMENTED]` | Feature or external service client does not exist in the repository. | Absent from codebase; mock/placeholder may or may not exist. |
| `[NOT LIVE VERIFIED]` | Code/provider is implemented, but live network requests against third-party production endpoints have not been executed or verified. | Tested via deterministic mocks or offline fallbacks only. |
| `[PROTOTYPE ASSUMPTION]` | Heuristic thresholds or weights used for decision scoring; not scientifically calibrated agronomic truths. | Requires local agronomist validation before field use. |

---

## Documentation Navigation Table

The 13 supporting reference documents are organized into functional clusters:

| Document | Category | Description | Primary Status |
| :--- | :--- | :--- | :--- |
| [PROJECT_STATUS.md](file:///d:/FSD_project/backend/reference/PROJECT_STATUS.md) | Overview | Comprehensive status dashboard across all 7 AI engines and data layers | `[AUDITED]` |
| [SYSTEM_ARCHITECTURE.md](file:///d:/FSD_project/backend/reference/SYSTEM_ARCHITECTURE.md) | Architecture | End-to-end runtime topology: Express, Python Dispatcher, IPC | `[IMPLEMENTED]` |
| [MODULE_CONNECTIONS.md](file:///d:/FSD_project/backend/reference/MODULE_CONNECTIONS.md) | Architecture | Direct dependencies, shared context, and planned connection matrix | `[AUDITED]` |
| [AI_MODELS.md](file:///d:/FSD_project/backend/reference/AI_MODELS.md) | ML Core | Machine learning models (Random Forest & MobileNetV2) | `[IMPLEMENTED]` |
| [MODEL_EVALUATION.md](file:///d:/FSD_project/backend/reference/MODEL_EVALUATION.md) | ML Core | Verified evaluation metrics, confusion matrices, and split statistics | `[VERIFIED]` |
| [DATASETS.md](file:///d:/FSD_project/backend/reference/DATASETS.md) | Data | Dataset profiles (Crop 2,200 rows, PlantVillage 10,490 images) | `[VERIFIED]` |
| [DECISION_ENGINES.md](file:///d:/FSD_project/backend/reference/DECISION_ENGINES.md) | Engines | Rule/scoring engines (Irrigation, Fertilizer, Disease Risk, Market, Ranking) | `[IMPLEMENTED]` |
| [API_INTEGRATIONS.md](file:///d:/FSD_project/backend/reference/API_INTEGRATIONS.md) | Integrations | External APIs: Market (Agmarknet) & Weather (Open-Meteo) | `[PARTIAL]` |
| [BACKEND_INTEGRATION.md](file:///d:/FSD_project/backend/reference/BACKEND_INTEGRATION.md) | Backend | Express routes, controllers, services, subprocess IPC, and error handling | `[IMPLEMENTED]` |
| [COMPLETED_MILESTONES.md](file:///d:/FSD_project/backend/reference/COMPLETED_MILESTONES.md) | History | Chronological log of Milestones 1 through 18 | `[VERIFIED]` |
| [PENDING_WORK.md](file:///d:/FSD_project/backend/reference/PENDING_WORK.md) | Roadmap | Real remaining engineering tasks and next milestone priorities | `[ROADMAP]` |
| [ASSUMPTIONS_AND_LIMITATIONS.md](file:///d:/FSD_project/backend/reference/ASSUMPTIONS_AND_LIMITATIONS.md) | Quality & Safety | Agronomic boundaries, non-calibrated scores, and operational caveats | `[IMPORTANT]` |
| [FILE_MAP.md](file:///d:/FSD_project/backend/reference/FILE_MAP.md) | Repository | Functional directory and source file hierarchy | `[VERIFIED]` |

---

## Quick Start & Verification

### Prerequisites
- Node.js (v18+)
- Python 3.10+ with `scikit-learn`, `tensorflow`, `keras`, `pandas`, `numpy`, `joblib` installed

### Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```
Key configuration parameters:
- `PORT`: Express server port (default: `5000`)
- `PYTHON_PATH`: Python executable (default: `python`)
- `AI_TIMEOUT_MS`: Subprocess timeout in milliseconds (default: `30000`)
- `MONGODB_URI`: MongoDB connection string (default: `mongodb://localhost:27017/agrisense`)
- `DATA_GOV_IN_API_KEY`: Government of India Open Data API key (optional for live mandi prices)

### Running Full Regression Tests
From the `backend/` directory:
```bash
# Run all 10 integration and decision test suites (137 tests, 100% pass)
npm test

# Run individual suites
npm run test:ai                # Milestone 17 (AI Subprocess IPC)
npm run test:farm              # Milestone 18 (Farm CRUD & Schema Validation)
npm run test:persistence       # Milestone 18A (MongoDB Atlas Persistence & Restart)
npm run test:shared-state      # Milestone 18B (Shared Farm State Service)
npm run test:farm-crop         # Milestone 18D (Shared Farm State -> Crop Recommendation)
npm run test:farm-irrigation   # Milestone 18E (Shared Farm State -> Irrigation Advisory)
npm run test:farm-fertilizer   # Milestone 18F (Shared Farm State -> Fertilizer Advisory)
npm run test:farm-disease-risk # Milestone 18G (Shared Farm State -> Disease Risk Assessment)
npm run test:farm-market       # Milestone 18H (Shared Farm State -> Market Intelligence)
npm run test:farm-crop-ranking # Milestone 18I (Shared Farm State -> Crop Ranking Engine)
npm run test:disease-context   # Milestone 18J (Disease Detection -> Farm Disease Context)
```

### Running Python Unit Tests
From the repository root:
```bash
# ML Models
python backend/models/crop_recommendation/inference/test_predict.py
python backend/models/disease_detection/inference/test_predict.py

# Decision Engines
python backend/models/irrigation/engine/test_irrigation_engine.py
python backend/models/fertilizer/engine/test_fertilizer_engine.py
python backend/models/disease_risk/engine/test_disease_risk_engine.py
python backend/models/market/engine/test_market_engine.py
python backend/models/crop_ranking/engine/test_crop_ranking_engine.py
```
