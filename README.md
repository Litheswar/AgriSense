# AgriSense — Intelligent Agricultural Decision Support System

AgriSense is an AI-powered agricultural decision support platform that integrates machine learning models, rule-based decision engines, and real-time data sources to provide comprehensive farming intelligence.

---

## Capabilities

| Module | Type | Status |
|---|---|---|
| **Crop Recommendation** | ML — Random Forest / XGBoost / Neural Network | `[IMPLEMENTED]` |
| **Disease Detection** | DL — MobileNetV2 (Transfer Learning) | `[IMPLEMENTED]` |
| **Irrigation Recommendation** | Rule-based Decision Engine | `[IMPLEMENTED]` |
| **Fertilizer Recommendation** | Rule-based Decision Engine | `[IMPLEMENTED]` |
| **Disease Risk Assessment** | Rule-based Decision Engine | `[IMPLEMENTED]` |
| **Market Intelligence** | Data Provider + Decision Engine | `[PARTIAL]` — local fallback active |
| **Crop Ranking** | Composite Decision Engine | `[IMPLEMENTED]` |
| **Shared Farm State** | MongoDB Persistence Layer | `[IMPLEMENTED]` |
| **Node.js ↔ Python AI** | Subprocess IPC + HTTP Server | `[IMPLEMENTED]` |

---

## Architecture

```
┌──────────────────┐
│   React Frontend │  (Planned)
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Node.js/Express  │  REST API + Farm State Management
│  Backend Server   │  MongoDB Atlas Persistence
└────────┬─────────┘
         │  Subprocess IPC / HTTP
┌────────▼─────────┐
│  Python AI Layer  │  Dispatcher → ML Models + Decision Engines
│  (ai_server.py)   │
└────────┬─────────┘
         │
┌────────▼──────────────────────────────────────────┐
│  ML Models              │  Decision Engines        │
│  • Crop Recommendation  │  • Irrigation            │
│  • Disease Detection    │  • Fertilizer            │
│                         │  • Disease Risk          │
│                         │  • Market Intelligence   │
│                         │  • Crop Ranking          │
└─────────────────────────┴──────────────────────────┘
```

---

## Quick Start

### Prerequisites

- **Node.js** v18+
- **Python** 3.10+ with: `scikit-learn`, `tensorflow`, `keras`, `pandas`, `numpy`, `joblib`, `Pillow`, `xgboost`
- **MongoDB** Atlas account or local MongoDB instance

### 1. Clone the Repository

```bash
git clone https://github.com/Litheswar/AgriSense.git
cd AgriSense
```

### 2. Install Node.js Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `backend/.env` and set:

| Variable | Description | Required |
|---|---|---|
| `PORT` | Express server port (default: `5000`) | Optional |
| `MONGODB_URI` | MongoDB connection string | **Yes** |
| `PYTHON_PATH` | Python executable (default: `python`) | Optional |
| `AI_SERVER_URL` | Python AI server URL (default: `http://127.0.0.1:5001`) | Optional |
| `AI_TIMEOUT_MS` | Subprocess timeout in ms (default: `30000`) | Optional |
| `DATA_GOV_IN_API_KEY` | Government of India Open Data API key | Optional |

**Example MongoDB URI (use your own credentials):**
```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/agrisense?retryWrites=true&w=majority
```

> ⚠️ **Never commit your `.env` file.** It contains sensitive credentials. Use `.env.example` as a template.

### 4. Start the Backend Server

```bash
cd backend
npm start
```

The server starts at `http://localhost:5000` by default.

### 5. Start the Python AI Server (Optional — for HTTP mode)

```bash
python backend/ai/ai_server.py
```

The AI server starts at `http://127.0.0.1:5001` by default.

---

## Running Tests

### Node.js Tests

```bash
cd backend

# Run all tests
npm test

# Individual suites
npm run test:ai           # AI integration tests (13 tests)
npm run test:farm         # Farm CRUD tests (10 tests)
npm run test:shared-state # Shared Farm State tests
npm run test:persistence  # MongoDB Atlas persistence tests
```

### Python Unit Tests

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

---

## Trained Models

The following trained model artifacts are **included in this repository** for inference:

### Crop Recommendation (`backend/models/crop_recommendation/saved_model/`)

| File | Size | Purpose |
|---|---|---|
| `random_forest_model.pkl` | 3.4 MB | Primary classifier (Random Forest) |
| `xgboost_model.json` | 1.5 MB | Alternative classifier (XGBoost) |
| `neural_network_model.keras` | 64 KB | Alternative classifier (Neural Network) |
| `label_encoder.pkl` | 696 B | Label decoding |
| `scaler.pkl` | 1 KB | Feature scaling |
| `metadata.json` | 2.2 KB | Model metadata |
| `model_selection.json` | 2 KB | Model comparison results |

### Disease Detection (`backend/models/disease_detection/saved_model/`)

| File | Size | Storage | Purpose |
|---|---|---|---|
| `disease_model.keras` | 28.9 MB | **Git LFS** | MobileNetV2 classifier |
| `training_metadata.json` | 2.2 KB | Normal Git | Class mapping & architecture |

---

## Datasets

### Crop Recommendation Dataset

Included in the repository at `backend/models/crop_recommendation/dataset/`:
- `crop_data.csv` — 2,200 rows covering 22 Indian crops with soil and climate features
- `processed/` — preprocessed train/validation/test splits

### Disease Detection Dataset (PlantVillage)

> **The raw PlantVillage image dataset is NOT included in this repository.**

The dataset contains ~10,504 images across 10 disease/healthy classes for corn, potato, and tomato plants.

**To obtain the dataset:**
1. Download the PlantVillage dataset from [Kaggle](https://www.kaggle.com/datasets/emmarex/plantdisease) or the [PlantVillage Project](https://plantvillage.psu.edu/)
2. Extract the relevant class folders into `backend/models/disease_detection/dataset/raw/`
3. Run the preprocessing script: `python backend/models/disease_detection/preprocessing/prepare_dataset.py`

The processed metadata and split CSVs are included for reference at `backend/models/disease_detection/dataset/processed/`.

---

## Project Structure

```
AgriSense/
├── README.md
├── .gitignore
├── .gitattributes
└── backend/
    ├── server.js                    # Express entry point
    ├── package.json
    ├── .env.example                 # Environment template
    ├── config/                      # App & DB configuration
    ├── controllers/                 # HTTP controllers
    ├── routes/                      # Express routes
    ├── services/                    # Business logic services
    ├── db/                          # MongoDB models & data layer
    ├── ai/                          # Python AI dispatcher & server
    ├── models/
    │   ├── crop_recommendation/     # ML pipeline (RF/XGB/NN)
    │   ├── disease_detection/       # DL pipeline (MobileNetV2)
    │   ├── irrigation/              # Decision engine
    │   ├── fertilizer/              # Decision engine
    │   ├── disease_risk/            # Decision engine
    │   ├── market/                  # Data provider + engine
    │   └── crop_ranking/            # Composite ranking engine
    ├── tests/                       # Node.js test suites
    └── reference/                   # Project documentation
```

---

## Reference Documentation

Detailed project documentation is available in `backend/reference/`:

| Document | Description |
|---|---|
| `PROJECT_STATUS.md` | Comprehensive status dashboard |
| `SYSTEM_ARCHITECTURE.md` | End-to-end runtime topology |
| `MODULE_CONNECTIONS.md` | Dependencies and connection matrix |
| `AI_MODELS.md` | ML model details |
| `MODEL_EVALUATION.md` | Evaluation metrics and confusion matrices |
| `DATASETS.md` | Dataset profiles and statistics |
| `DECISION_ENGINES.md` | Rule/scoring engine documentation |
| `API_INTEGRATIONS.md` | External API integrations |
| `BACKEND_INTEGRATION.md` | Express routes, IPC, error handling |
| `COMPLETED_MILESTONES.md` | Milestone history (1–18) |
| `PENDING_WORK.md` | Remaining engineering tasks |
| `ASSUMPTIONS_AND_LIMITATIONS.md` | Operational caveats |
| `FILE_MAP.md` | Repository file hierarchy |

---

## Current Status

- **Milestone 18A** — MongoDB Atlas Connectivity & Persistence: ✅ **Implemented and Verified**
- **Frontend Integration** — `[PLANNED]`
- **Weather API Integration** — `[NOT LIVE VERIFIED]`
- **Farm → AI Pipeline Automation** — `[PLANNED]`

See `backend/reference/PROJECT_STATUS.md` for the full status breakdown.

---

## License

ISC
