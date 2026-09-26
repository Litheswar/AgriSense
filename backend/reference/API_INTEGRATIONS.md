# AgriSense — External API Integrations

**Status**: `[AUDITED]`  
**Scope**: External Third-Party Agricultural & Meteorological Services  

---

## 1. Meteorological / Weather Integration

| Property | Status / Specification |
| :--- | :--- |
| **Intended Provider** | Open-Meteo Historical & Forecast Weather API |
| **Implementation Status** | **`[NOT IMPLEMENTED]`** |
| **API Client File** | *None exists in repository* |
| **Service Layer Integration**| *None exists in repository* |
| **Node.js Express Route** | *None exists in repository* |
| **Integration with Engines** | Irrigation & Disease Risk engines receive weather via request body payloads. |
| **Database Storage** | `FarmSchema.weather` stores `temperature`, `humidity`, `rainfall`, `rainProbability`, `expectedRainfall`. |

### Detailed Audit Finding
Although previous architecture planning selected **Open-Meteo** as the zero-cost meteorological provider, exhaustive repository code inspection reveals **zero** API client files, network fetching routines, or background polling services for weather.

- **Current Operational Reality**: Environmental and weather variables required by the Irrigation and Disease Risk decision engines must be supplied directly in HTTP request payloads by client applications or test runners.
- **Planned Work**: An asynchronous weather fetching service that accepts `latitude` and `longitude` from `Farm.location` and updates `Farm.weather` will be built in a future milestone.

---

## 2. Agricultural Market Intelligence Integration

| Property | Status / Specification |
| :--- | :--- |
| **Primary Live Provider** | Government of India AGMARKNET via `data.gov.in` |
| **Endpoint URL** | `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070` |
| **Environment Variable** | `DATA_GOV_IN_API_KEY` |
| **Provider Implementation** | `backend/models/market/providers/market_provider.py` (`AgmarknetApiProvider`) |
| **Offline Local Fallback** | `LocalMarketDataProvider` reading `backend/models/market/data/sample_market_data.json` |
| **Farm Integration Service**| `backend/services/farmMarketService.js` (`GET /api/farms/:farmId/market`) |
| **Live Network Verification**| **`[NOT LIVE VERIFIED]`** |
| **Unit Test Coverage** | 14/14 tests pass (`test_market_engine.py`), 17/17 tests pass (`test_farm_market.js`) |

### Architecture & Provider Fallback Flow

```
                      Client Request: { crop: "Tomato", market: "Kolar" }
                                              │
                                              ▼
                                   Market Engine Initialized
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
           Is DATA_GOV_IN_API_KEY set?                        No API Key
                         │                                         │
                         ▼                                         ▼
               AgmarknetApiProvider                      LocalMarketDataProvider
                         │                                         │
                         ▼                                         ▼
            GET api.data.gov.in/...                      Read sample_market_data.json
                         │                                         │
                         ▼                                         ▼
               HTTP 200 JSON Response                   Parse Local JSON Records
                         └────────────────────┬────────────────────┘
                                              │
                                              ▼
                                NormalizedMarketRecord
                     [crop, market, state, date, min, modal, max, unit]
                                              │
                                              ▼
                               Market Engine Analysis & Trend
                               [current_price, trend, market_score]
```

### Normalization Pipeline
Both providers produce normalized records conforming to `NormalizedMarketRecord`:
- `crop`: Cleaned lowercase crop name
- `market`: Cleaned mandi name
- `state`: Cleaned state name
- `date`: ISO standard `YYYY-MM-DD`
- `min_price`, `max_price`, `modal_price`: Non-negative floats in INR
- `unit`: Standardized to `'INR/Quintal'`

### Verified Offline & Fallback Mechanics
1. If `DATA_GOV_IN_API_KEY` is not present in `.env`, `dispatcher.py` automatically initializes `LocalMarketDataProvider`.
2. If `AgmarknetApiProvider` is invoked without a key, it throws `MarketDataError: DATA_GOV_IN_API_KEY is not configured.`
3. If an unknown crop is requested, `MarketEngine` safely returns a structured `status: 'UNAVAILABLE'` response with `data_available: false` rather than returning a 0 or crashing.

### Live Verification Declaration
Because no production `DATA_GOV_IN_API_KEY` is provided in the repository environment, **no live network HTTP requests against `api.data.gov.in` have been executed or verified**. All tests pass against the simulated API response parser and local sample data.
