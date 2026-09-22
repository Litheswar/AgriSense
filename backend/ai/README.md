# AgriSense — Backend AI Integration Layer (Milestone 17)

This directory contains the bridge between the **Node.js Express backend** and the **Python AI / ML models and decision engines**.

---

## 1. Architectural Separation: Why Node.js and Python?

| Layer | Technology | Primary Responsibilities |
|---|---|---|
| **API & Web Backend** | **Node.js (Express)** | Client networking, HTTP routing, request validation, authentication (future), API rate limiting, serving React frontend. |
| **AI / Decision Layer** | **Python 3** | Scientific computing, scikit-learn, TensorFlow/Keras, pandas, NumPy, deterministic decision engines, and mandi market analysis. |

By separating Node.js and Python:
- The Node.js server stays lightweight, highly concurrent, and async-driven.
- Python models and libraries are isolated and called through a clean, strictly-typed JSON contract without polluting the Node.js runtime.

---

## 2. Request & Response Lifecycle

```text
React Frontend / API Client
          │
          │  1. HTTP POST /api/ai/crop-recommendation (JSON)
          ▼
   Express Server (server.js)
          │
          │  2. Express Route & Controller (aiController.js)
          ▼
   Node AI Service (aiService.js)
          │
          │  3. Formats task JSON & spawns / streams to Python (stdin)
          ▼
   Python Dispatcher (dispatcher.py)
          │
          │  4. Validates Task & Dispatches to Target Engine
          ▼
   Target Component (CropRecommender / Random Forest)
          │
          │  5. Model Inference (predict_proba)
          ▼
   Python Dispatcher (dispatcher.py)
          │
          │  6. Serializes clean JSON response to stdout
          ▼
   Node AI Service (aiService.js)
          │
          │  7. Parses JSON & handles any errors
          ▼
   Express Response (HTTP 200 / 400 JSON)
```

---

## 3. Supported AI Tasks & Endpoints

| Task Name | Dedicated Endpoint | Underlying Component | Input Format |
|---|---|---|---|
| `health` | `GET /api/ai/health` | System Health Check | None |
| `crop_recommendation` | `POST /api/ai/crop-recommendation` | Random Forest Classifier (`CropRecommender`) | `{"N": 90, "P": 42, "K": 43, "temperature": 20.8, "humidity": 82, "ph": 6.5, "rainfall": 202}` |
| `disease_detection` | `POST /api/ai/disease-detection` | MobileNetV2 CNN (`DiseaseDetector`) | `{"image_path": "path/to/leaf.jpg"}` |
| `irrigation` | `POST /api/ai/irrigation` | Decision Engine (`IrrigationEngine`) | `{"crop": "Tomato", "growth_stage": "vegetative", "soil_moisture": 25.0, ...}` |
| `fertilizer` | `POST /api/ai/fertilizer` | Decision Engine (`FertilizerEngine`) | `{"N": 30, "P": 15, "K": 40, "ph": 6.5, "crop": "Tomato", "growth_stage": "vegetative", "disease_status": {"detected": false}}` |
| `disease_risk` | `POST /api/ai/disease-risk` | Environmental Engine (`DiseaseRiskEngine`) | `{"crop": "Tomato", "growth_stage": "flowering", "temperature": 24, "humidity": 85, "rainfall": 15, "recent_rainfall": 30}` |
| `market` | `POST /api/ai/market` | Market Engine (`MarketEngine`) | `{"crop": "Tomato", "market": "Kolar", "state": "Karnataka"}` |
| `crop_ranking` | `POST /api/ai/crop-ranking` | Multi-Criteria Engine (`CropRankingEngine`) | `{"candidates": [{"crop": "Tomato", "probability": 0.6}, ...], "market_context": {"market": "Kolar", "state": "Karnataka"}}` |

All tasks can also be dispatched dynamically via the generic endpoint:
```http
POST /api/ai/predict
Content-Type: application/json

{
  "task": "crop_recommendation",
  "input": {
    "N": 90, "P": 42, "K": 43, "temperature": 20.8,
    "humidity": 82, "ph": 6.5, "rainfall": 202
  }
}
```

---

## 4. Security & Arbitrary Execution Prevention

1. **Strict Whitelisting**: `dispatcher.py` explicitly rejects any task not present in `SUPPORTED_TASKS`.
2. **No Arbitrary Code Execution**: No `eval()`, `exec()`, arbitrary shell command execution, or dynamic module loading based on user input.
3. **Internal Path Masking**: Errors return structured codes (`CropInferenceError`, `INVALID_PAYLOAD`, `MISSING_FIELD`) without leaking internal server paths or Python tracebacks to the client.

---

## 5. Error Handling Contract

When a request succeeds:
```json
{
  "success": true,
  "task": "crop_recommendation",
  "result": {
    "predicted_crop": "rice",
    "confidence": 0.92,
    "top_3": [
      { "crop": "rice", "probability": 0.92 },
      { "crop": "jute", "probability": 0.05 },
      { "crop": "maize", "probability": 0.01 }
    ]
  }
}
```

When an error occurs:
```json
{
  "success": false,
  "error": {
    "code": "CropInferenceError",
    "message": "Missing required feature(s): ['N']. Required features are: ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']"
  }
}
```

---

## 6. How this Architecture Supports the React Frontend

When the React frontend is developed (Milestone 18+):
- The frontend will simply make standard `fetch()` or `axios` calls to `http://localhost:5000/api/ai/...`.
- React does not need to know that Python exists.
- The Node.js Express server seamlessly coordinates data flow, manages CORS, and handles validation.
