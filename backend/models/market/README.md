# Market Intelligence Module (Phase 1F — Milestone 15)

This module provides structured agricultural market data analysis and price trend evaluation for AgriSense, serving as an input for the future **Crop Ranking Engine** (Milestone 16).

---

## 1. Official Data Source Investigation

| Property | Details |
|---|---|
| **Official Source** | Open Government Data (OGD) Platform India (`data.gov.in`) & Directorate of Marketing & Inspection (DMI), Ministry of Agriculture (`AGMARKNET`) |
| **Portal URLs** | [https://data.gov.in](https://data.gov.in) / [https://agmarknet.gov.in](https://agmarknet.gov.in) |
| **Dataset Title** | Current Daily Price of Various Commodities from Agricultural Markets (Mandi) across India |
| **Resource Endpoint** | `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070` |
| **Commodity Coverage** | All major agricultural commodities (cereals, pulses, vegetables, fruits, spices, oilseeds) across mandis in India |
| **Market / Location Info** | State, District, Market (Mandi name) |
| **Price Fields Available** | `Min_Price`, `Max_Price`, `Modal_Price` |
| **Official Price Unit** | **`INR / Quintal`** (1 Quintal = 100 kg) *(Preserved as standard; never assumed as ₹/kg)* |
| **Date Information** | `Arrival_Date` (`DD/MM/YYYY` normalized to ISO `YYYY-MM-DD`) |
| **API Availability** | Yes, data.gov.in provides structured JSON/XML REST APIs |
| **Authentication** | API Key passed via `api-key` query parameter (`DATA_GOV_IN_API_KEY` via `.env`) |
| **Rate Limits** | 10,000 requests/day per registered API key on data.gov.in |
| **Historical Data** | Available via daily archival queries on Agmarknet & data.gov.in |

---

## 2. Architecture & Separation of Concerns

```text
External Data Source (Agmarknet / data.gov.in)
       ↓
Market Provider Adapter (LocalMarketDataProvider / AgmarknetApiProvider)
       ↓
Normalized Market Record (NormalizedMarketRecord)
       ↓
Market Intelligence Engine (MarketEngine)
       ↓
Price Analysis + Transparent Trend + Market Signal Score
```

### Key Principles:
1. **Network Independence**: The core engine processes `NormalizedMarketRecord` objects and does not depend on a live network connection for unit tests or deterministic analysis.
2. **Provider Separation**: Data retrieval and API format variations are isolated inside `market_provider.py`.
3. **Location Specificity**: Market prices are evaluated per crop, market (mandi), and state. Prices from one mandi are not treated as universal national prices.

---

## 3. Normalized Market Record Schema

| Field | Type | Description | Example |
|---|---|---|---|
| `crop` | `str` | Normalized commodity name | `"Tomato"` |
| `market` | `str` | Mandi / market name | `"Kolar"` |
| `state` | `Optional[str]` | State name | `"Karnataka"` |
| `district` | `Optional[str]` | District name | `"Kolar"` |
| `date` | `str` | ISO 8601 date (`YYYY-MM-DD`) | `"2026-09-12"` |
| `min_price` | `float` | Minimum recorded price for the day | `1800.0` |
| `max_price` | `float` | Maximum recorded price for the day | `2200.0` |
| `modal_price` | `float` | Modal (representative) price | `2000.0` |
| `unit` | `str` | Standardized unit from official source | `"INR/Quintal"` |
| `raw_source` | `str` | Source attribution | `"Agmarknet / data.gov.in"` |

---

## 4. Analysis Logic & Algorithms

### 4.1 Current Price & Price Range
- **Current Price**: Modal price from the latest chronological observation (`records[-1]`).
- **Price Range**: Direct reporting of `min_price`, `max_price`, and `modal_price` along with the standard unit (`INR/Quintal`).

### 4.2 Deterministic Price Trend
Calculated transparently by comparing the earliest and latest observations in the available chronological window:

$$\Delta P\% = \frac{\text{Modal Price}_{\text{latest}} - \text{Modal Price}_{\text{earliest}}}{\text{Modal Price}_{\text{earliest}}} \times 100$$

- **`Increasing`**: $\Delta P\% > +5.0\%$
- **`Decreasing`**: $\Delta P\% < -5.0\%$
- **`Stable`**: $-5.0\% \le \Delta P\% \le +5.0\%$
- **`Unavailable`**: If fewer than 2 historical observations exist.

> **Note**: This is a transparent historical change indicator, NOT an ML or predictive forecasting model.

### 4.3 Heuristic Market Score (Prototype Signal)
To support multi-criteria ranking in Milestone 16, a normalized score (0–100) is generated:
- Base score: $50.0$
- Trend Bonus:
  - `Increasing`: $+25.0 \implies 75.0$
  - `Stable`: $+10.0 \implies 60.0$
  - `Decreasing`: $-25.0 \implies 25.0$
  - `Unavailable`: $0.0 \implies 50.0$

> **Disclaimer**: *The market score is a heuristic prototype decision signal for crop ranking. It is NOT an economic probability or future price forecast.*

---

## 5. Providers & Usage

AgriSense provides two interchangeable providers satisfying the `BaseMarketProvider` interface:

### 5.1 `LocalMarketDataProvider` (Deterministic Offline)
Loads local files or in-memory fixtures. Used for offline unit tests and baseline development:
```python
from backend.models.market.providers.market_provider import LocalMarketDataProvider
from backend.models.market.engine.market_engine import MarketEngine

provider = LocalMarketDataProvider(data_file_path="backend/models/market/data/sample_market_data.json")
engine = MarketEngine(provider=provider)
result = engine.analyze_market(crop="Tomato", market="Kolar")
```

### 5.2 `AgmarknetApiProvider` (Live Government API)
Connects directly to the official `data.gov.in` / Agmarknet REST API. Requires an API key:
```python
import os
from backend.models.market.providers.market_provider import AgmarknetApiProvider
from backend.models.market.engine.market_engine import MarketEngine

# 1. Set DATA_GOV_IN_API_KEY in .env or pass directly:
provider = AgmarknetApiProvider(api_key=os.getenv("DATA_GOV_IN_API_KEY"))

# 2. Query live mandi prices:
engine = MarketEngine(provider=provider)
result = engine.analyze_market(crop="Tomato", market="Kolar", state="Karnataka")
```

---

## 6. Test Data Transparency

All test datasets stored in [`data/sample_market_data.json`](file:///d:/FSD_project/backend/models/market/data/sample_market_data.json) and in-memory test mocks are:
$$\textbf{SYNTHETIC TEST DATA — NOT REAL MARKET DATA}$$
Fabricated values are never presented as real market prices.
