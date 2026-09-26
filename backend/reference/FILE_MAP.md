# AgriSense — Functional Repository File Map

**Status**: `[AUDITED]`  
**Rule**: Summarizes functional source directories and architecture components without enumerating node_modules, cache artifacts, or individual dataset image files.

---

## Root Layout
```text
D:/FSD_project/
├── .gitignore                          # Standard git ignore file (ignores .env, caches, node_modules)
├── .kiro/                              # Historical specification repository
│   └── specs/
│       ├── agri-reference-docs/        # Historical draft specifications
│       └── agri-reference-docs-enhanced/ # Updated specifications matching audited reality
└── backend/                            # AgriSense Backend & AI subsystem
```

---

## Backend Directory Hierarchy (`/backend`)

```text
backend/
├── .env.example                        # Template environment variables configuration
├── package.json                        # Node dependencies (express, cors, dotenv, mongoose)
├── package-lock.json                   # Deterministic lockfile
├── server.js                           # Main Express HTTP application entry point
├── test_integration.js                 # Complete 13-test integration suite (AI + Subprocess IPC)
│
├── ai/                                 # Central Python AI Dispatcher
│   ├── README.md                       # AI integration documentation
│   ├── ai_server.py                    # Optional fast-path local HTTP microservice (port 5001)
│   └── dispatcher.py                   # Central Python dispatch hub (stdin/stdout JSON IPC)
│
├── config/                             # Node.js configuration modules
│   ├── aiConfig.js                     # Subprocess paths, timeouts (30s), and Python interpreter
│   └── db.js                           # Mongoose connection manager with offline fallback handling
│
├── controllers/                        # Express HTTP controller layer
│   ├── aiController.js                 # Maps HTTP requests to aiService tasks
│   └── farmController.js               # Maps CRUD requests and shared-state queries to farmService/sharedFarmStateService
│
├── db/                                 # Persistence & Data Modeling Layer
│   ├── README.md                       # Shared Farm State architecture documentation
│   └── models/
│       └── Farm.js                     # Mongoose Schema, validation, and toSharedFarmState()
│
├── routes/                             # Express route definitions
│   ├── aiRoutes.js                     # /api/ai endpoints (health, predict, 7 AI tasks)
│   └── farmRoutes.js                   # /api/farms endpoints (CRUD, shared-state, crop-rec, irrigation, fertilizer, disease-risk, market, crop-ranking)
│
├── services/                           # Business logic & IPC execution
│   ├── aiService.js                    # Child process spawning, streaming, and error normalization
│   ├── farmService.js                  # Dual-mode repository (live MongoDB or memory-store Map)
│   ├── sharedFarmStateService.js       # Unified service boundary providing canonical Shared Farm State
│   ├── farmCropRecommendationService.js # Integration service connecting Shared Farm State to Crop Recommendation ML model
│   ├── farmIrrigationService.js        # Integration service connecting Shared Farm State to Irrigation Decision Engine
│   ├── farmFertilizerService.js        # Integration service connecting Shared Farm State to Fertilizer Decision Engine
│   ├── farmDiseaseRiskService.js       # Integration service connecting Shared Farm State to Disease Risk Decision Engine
│   ├── farmMarketService.js            # Integration service connecting Shared Farm State to Market Intelligence Engine
│   └── farmCropRankingService.js       # Integration service connecting Shared Farm State to Crop Ranking Decision Engine
│
├── tests/                              # Specialized test suites
│   ├── test_farm.js                    # 10-test Farm CRUD, validation, and Shared State suite
│   ├── test_persistence_atlas.js      # 7-test MongoDB Atlas persistence & process restart suite
│   ├── test_shared_farm_state.js      # 7-test Shared Farm State Service & REST endpoint suite
│   ├── test_farm_crop_recommendation.js # 10-test Farm Shared State to Crop Recommendation integration suite
│   ├── test_farm_irrigation.js         # 13-test Farm Shared State to Irrigation Decision Engine integration suite
│   ├── test_farm_fertilizer.js         # 18-test Farm Shared State to Fertilizer Decision Engine integration suite
│   ├── test_farm_disease_risk.js       # 17-test Farm Shared State to Disease Risk Engine integration suite
│   ├── test_farm_market.js             # 17-test Farm Shared State to Market Intelligence Engine integration suite
│   ├── test_farm_crop_ranking.js       # 19-test Farm Shared State to Crop Ranking Engine integration suite
│   └── test_disease_detection_farm_context.js # 13-test Disease Detection → Farm Disease Context integration suite
│
├── reference/                          # 14-File Authoritative Reference Documentation Hub
│   ├── README.md                       # Documentation navigation hub and status legend
│   ├── PROJECT_STATUS.md               # Audited status dashboard across all subsystems
│   ├── SYSTEM_ARCHITECTURE.md          # Multi-tier topology, IPC, and error handling
│   ├── MODULE_CONNECTIONS.md           # Dependency matrix, transformations, and farmer scenario
│   ├── AI_MODELS.md                    # Machine learning models (Random Forest, MobileNetV2)
│   ├── MODEL_EVALUATION.md             # Benchmark metrics from saved artifacts
│   ├── DATASETS.md                     # Dataset characteristics and split statistics
│   ├── API_INTEGRATIONS.md             # Third-party integrations (Market & Weather status)
│   ├── DECISION_ENGINES.md             # Rule-based decision engines specifications
│   ├── BACKEND_INTEGRATION.md          # REST API endpoints, payloads, and error codes
│   ├── COMPLETED_MILESTONES.md         # Chronological milestones 1 through 18J
│   ├── PENDING_WORK.md                 # Concrete roadmap for upcoming engineering tasks
│   ├── ASSUMPTIONS_AND_LIMITATIONS.md  # Safety, agronomic, and boundary caveats
│   └── FILE_MAP.md                     # This functional repository map
│
└── models/                             # The 7 Agricultural AI & Decision Engine Components
    ├── crop_recommendation/            # ML Component 1: Crop Recommendation
    │   ├── README.md                   # Model documentation
    │   ├── evaluation/                 # Confusion matrices and evaluation plots
    │   ├── inference/                  # Production inference pipeline (predict.py, test_predict.py)
    │   ├── preprocessing/              # Scaling, validation, and feature ordering logic
    │   ├── saved_model/                # Pickled Random Forest (3.53 MB), scaler, encoder, metadata
    │   └── training/                   # Training scripts (Random Forest, XGBoost, Neural Net)
    │
    ├── disease_detection/              # ML Component 2: Plant Disease Detection
    │   ├── README.md                   # Model documentation
    │   ├── dataset/                    # 10,490 PlantVillage images (raw & processed)
    │   ├── evaluation/                 # Confusion matrices, training curves, class distributions
    │   ├── inference/                  # Inference pipeline (predict.py, test_predict.py)
    │   ├── preprocessing/              # Image resizing, normalization, and augmentation scripts
    │   ├── saved_model/                # Keras MobileNetV2 model (28.9 MB) and training metadata
    │   └── training/                   # Two-stage transfer learning training script
    │
    ├── irrigation/                     # Decision Engine 3: Irrigation Advisory
    │   ├── README.md                   # Engine documentation
    │   ├── config/                     # thresholds.json (soil moisture, evaporative demand)
    │   └── engine/                     # irrigation_engine.py & test_irrigation_engine.py
    │
    ├── fertilizer/                     # Decision Engine 4: Fertilizer Advisory
    │   ├── README.md                   # Engine documentation
    │   ├── config/                     # thresholds.json (N, P, K, pH threshold bands)
    │   └── engine/                     # fertilizer_engine.py & test_fertilizer_engine.py
    │
    ├── disease_risk/                   # Decision Engine 5: Disease Risk Assessment
    │   ├── README.md                   # Engine documentation
    │   ├── config/                     # risk_rules.json (humidity, temp, rainfall weights)
    │   └── engine/                     # disease_risk_engine.py & test_disease_risk_engine.py
    │
    ├── market/                         # Decision Engine 6: Market Intelligence
    │   ├── README.md                   # Engine documentation
    │   ├── config/                     # market_config.json
    │   ├── data/                       # sample_market_data.json (deterministic local fallback)
    │   ├── engine/                     # market_engine.py & test_market_engine.py
    │   └── providers/                  # market_provider.py (AgmarknetApiProvider & LocalMarketDataProvider)
    │
    └── crop_ranking/                   # Decision Engine 7: Crop Ranking
        ├── README.md                   # Engine documentation
        ├── config/                     # ranking_config.json (0.7 agronomic + 0.3 market weights)
        └── engine/                     # crop_ranking_engine.py & test_crop_ranking_engine.py
