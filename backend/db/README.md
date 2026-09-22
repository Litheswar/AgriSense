# Shared Farm State & MongoDB Data Layer (Milestone 18)

This directory contains the database models and persistent data layer for AgriSense.

---

## 1. Architectural Role & Philosophy

AgriSense uses a **Farm-Centered Data Architecture**. 

Rather than fragmenting data into isolated databases for each intelligence capability (crop recommendation, irrigation, fertilizer, disease, market), all agricultural intelligence engines consume a unified, shared entity: **`Farm`**.

```text
                               Farm
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
     Location                 Soil                    Crop
        │                       │                       │
 state / district           N / P / K / pH       name / stage / date
        │
        ├── Field Conditions
        │       └── Soil Moisture
        │
        ├── Weather Snapshot (Latest refreshable observation)
        │       └── Temp, Humidity, Rain, RainProb, ExpectedRain
        │
        ├── Disease Context (Latest detected or inspected status)
        │       └── Detected, Disease name, Confidence
        │
        └── Market Context (Regional mandi preferences)
                └── Market, State, District
```

---

## 2. Persistent vs. Refreshable vs. Derived Data

| Data Classification | Fields | Source of Truth | Lifecycle |
|---|---|---|---|
| **Persistent Farm Context** | Farm name, location, soil tests (N, P, K, pH), planted crop, growth stage, field moisture | Farmer / Soil testing lab | Permanent until updated by farmer |
| **Refreshable External Snapshot** | Weather parameters (temp, humidity, rain probability), Mandi market records | Weather APIs / Agmarknet | Periodically refreshed; represents latest known conditions |
| **Derived Intelligence Results** | Recommended crop, irrigation schedule, fertilizer advice, disease risk, crop ranking | Python AI / Decision Engines | Generated **on-demand** from farm state; never the root source of truth |

---

## 3. Directory Layout & Collision Prevention

To prevent confusion with [`backend/models/`](file:///d:/FSD_project/backend/models/) (which houses Python AI models and inference pipelines):
- MongoDB Mongoose models are isolated inside: **[`backend/db/models/Farm.js`](file:///d:/FSD_project/backend/db/models/Farm.js)**
- Database configuration is managed in: **[`backend/config/db.js`](file:///d:/FSD_project/backend/config/db.js)**
- Business services live in: **[`backend/services/farmService.js`](file:///d:/FSD_project/backend/services/farmService.js)**
- HTTP endpoints are mounted at: **`/api/farms`**

---

## 4. Prepared AI Engine Mappings (Milestone 19 Foundation)

The Farm document structure is mapped directly to the input schemas of all 7 existing AI components:

| Target AI Component | Required Inputs | Sourced From Farm Document |
|---|---|---|
| **Crop Recommendation** | `N, P, K, temperature, humidity, ph, rainfall` | `Farm.soil.nitrogen`, `Farm.soil.phosphorus`, `Farm.soil.potassium`, `Farm.soil.ph`, `Farm.weather.temperature`, `Farm.weather.humidity`, `Farm.weather.rainfall` |
| **Irrigation Recommendation** | `crop, growth_stage, soil_moisture, temperature, humidity, rain_probability, expected_rainfall` | `Farm.crop.name`, `Farm.crop.growthStage`, `Farm.fieldConditions.soilMoisture`, `Farm.weather.temperature`, `Farm.weather.humidity`, `Farm.weather.rainProbability`, `Farm.weather.expectedRainfall` |
| **Fertilizer Recommendation** | `N, P, K, ph, crop, growth_stage, disease_status` | `Farm.soil`, `Farm.crop.name`, `Farm.crop.growthStage`, `Farm.diseaseContext` |
| **Disease Risk** | `crop, growth_stage, temperature, humidity, rainfall, recent_rainfall` | `Farm.crop.name`, `Farm.crop.growthStage`, `Farm.weather.temperature`, `Farm.weather.humidity`, `Farm.weather.rainfall`, `Farm.weather.recentRainfall` |
| **Market Intelligence** | `crop, market, state, district` | `Farm.crop.name`, `Farm.marketContext.market`, `Farm.marketContext.state`, `Farm.marketContext.district` |
| **Crop Ranking** | Crop recommendation output + market context | Sourced by composing Crop Recommendation + Market Intelligence |

---

## 5. REST API Endpoints

### 5.1 Create Farm (`POST /api/farms`)
Creates a new farm and returns the generated document ID and normalized Shared Farm State.
```json
{
  "name": "Cauvery Green Valley Farm",
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
    "plantingDate": "2026-08-01",
    "growthStage": "vegetative"
  },
  "fieldConditions": {
    "soilMoisture": 35.0
  }
}
```

### 5.2 Get Farm (`GET /api/farms/:farmId`)
Retrieves the complete document and shared farm state snapshot.

### 5.3 Update Farm (`PATCH /api/farms/:farmId`)
Updates specific sub-fields (e.g. updating `soilMoisture` or `growthStage`) using clean PATCH semantics without overwriting unmodified farm attributes.

### 5.4 Delete Farm (`DELETE /api/farms/:farmId`)
Removes the farm document.

### 5.5 List Farms (`GET /api/farms`)
Lists all farms sorted by most recent updates.
