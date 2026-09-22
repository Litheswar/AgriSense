# AgriSense — Backend Integration & REST API Reference

**Status**: `[IMPLEMENTED]`  
**Host**: `http://localhost:5000`  
**Data Format**: `application/json`  

---

## 1. AI & Decision Support Endpoints (`/api/ai`)

All AI requests are routed through `backend/routes/aiRoutes.js` to `backend/controllers/aiController.js` and executed via `backend/services/aiService.js`.

### 1.1 Health Check
- **Endpoint**: `GET /api/ai/health`
- **Response**:
  ```json
  {
    "success": true,
    "task": "health",
    "result": {
      "status": "healthy",
      "service": "agrisense-ai",
      "supported_tasks": [
        "crop_recommendation",
        "disease_detection",
        "irrigation",
        "fertilizer",
        "disease_risk",
        "market",
        "crop_ranking",
        "health"
      ]
    }
  }
  ```

### 1.2 General Task Prediction
- **Endpoint**: `POST /api/ai/predict`
- **Request Body**: `{ "task": "crop_recommendation", "input": { ... } }`

### 1.3 Crop Recommendation
- **Endpoint**: `POST /api/ai/crop-recommendation`
- **Request Body**:
  ```json
  {
    "N": 90.0,
    "P": 42.0,
    "K": 43.0,
    "temperature": 20.8,
    "humidity": 82.0,
    "ph": 6.5,
    "rainfall": 202.0
  }
  ```
- **Response**:
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

### 1.4 Plant Disease Detection
- **Endpoint**: `POST /api/ai/disease-detection`
- **Request Body**: `{ "image_path": "path/to/leaf_image.jpg" }`
- **Response**:
  ```json
  {
    "success": true,
    "task": "disease_detection",
    "result": {
      "crop": "Potato",
      "predicted_disease": "Healthy",
      "confidence": 0.9999,
      "top_3": [ ... ]
    }
  }
  ```

### 1.5 Irrigation Advisory
- **Endpoint**: `POST /api/ai/irrigation`
- **Request Body**:
  ```json
  {
    "crop": "Tomato",
    "growth_stage": "vegetative",
    "soil_moisture": 25.0,
    "temperature": 38.0,
    "humidity": 30.0,
    "rain_probability": 5.0,
    "expected_rainfall": 0.0
  }
  ```

### 1.6 Fertilizer Advisory
- **Endpoint**: `POST /api/ai/fertilizer`
- **Request Body**:
  ```json
  {
    "N": 20.0,
    "P": 40.0,
    "K": 50.0,
    "ph": 6.5,
    "crop": "Tomato",
    "growth_stage": "vegetative",
    "disease_status": { "detected": false }
  }
  ```

### 1.7 Disease Risk Assessment
- **Endpoint**: `POST /api/ai/disease-risk`
- **Request Body**:
  ```json
  {
    "crop": "Tomato",
    "growth_stage": "flowering",
    "temperature": 24.0,
    "humidity": 85.0,
    "rainfall": 15.0,
    "recent_rainfall": 30.0
  }
  ```

### 1.8 Market Intelligence
- **Endpoint**: `POST /api/ai/market`
- **Request Body**:
  ```json
  {
    "crop": "Tomato",
    "market": "Kolar",
    "state": "Karnataka"
  }
  ```

### 1.9 Crop Ranking
- **Endpoint**: `POST /api/ai/crop-ranking`
- **Request Body**:
  ```json
  {
    "candidates": [
      { "crop": "Tomato", "probability": 0.6 },
      { "crop": "Potato", "probability": 0.4 }
    ],
    "market_context": { "market": "Kolar", "state": "Karnataka" }
  }
  ```

---

## 2. Farm Management & State Endpoints (`/api/farms`)

Provides persistence for farm profiles and transforms documents into the canonical Shared Farm State structure.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/farms` | Create a new Farm document and receive initialized Shared Farm State |
| `GET` | `/api/farms` | List all registered farms |
| `GET` | `/api/farms/:farmId` | Retrieve a farm and its transformed Shared Farm State |
| `PATCH` | `/api/farms/:farmId` | Incrementally update specific fields (e.g. soilMoisture, crop, weather) |
| `PUT` | `/api/farms/:farmId` | Replace/update farm document |
| `DELETE` | `/api/farms/:farmId` | Delete farm document |

### Sample Farm Creation Request (`POST /api/farms`)
```json
{
  "name": "Cauvery Valley Farm",
  "location": {
    "state": "Karnataka",
    "district": "Kolar",
    "village": "Mulbagal",
    "latitude": 13.16,
    "longitude": 78.39
  },
  "soil": {
    "nitrogen": 90.0,
    "phosphorus": 42.0,
    "potassium": 43.0,
    "ph": 6.5
  },
  "crop": {
    "name": "Tomato",
    "growthStage": "vegetative"
  },
  "fieldConditions": {
    "soilMoisture": 35.0
  },
  "weather": {
    "temperature": 28.5,
    "humidity": 65.0,
    "rainfall": 12.0
  }
}
```

---

## 3. Error Handling & Timeout Protocol

1. **Subprocess Timeout**:
   - Default: `30,000ms` (configurable via `AI_TIMEOUT_MS`).
   - If a Python subprocess runs longer than 30s, the process is forcefully killed via `pythonProcess.kill()`, returning HTTP 500:
     ```json
     {
       "success": false,
       "error": {
         "code": "TIMEOUT",
         "message": "AI task 'crop_recommendation' timed out after 30000ms."
       }
     }
     ```
2. **Missing or Invalid Input**:
   - Returns HTTP 400 with the exact error code from Python (`CropInferenceError`, `IrrigationInputError`, `FertilizerInputError`, etc.).
3. **Database Security Guard**:
   - Any root key starting with `$` (e.g. MongoDB injection vectors like `$where`, `$gt`) is explicitly stripped and rejected with `PROHIBITED_OPERATOR`.
4. **Authentication Notice**:
   - There is **no authentication or session middleware** implemented in the current repository. All endpoints are openly accessible for developer evaluation.
