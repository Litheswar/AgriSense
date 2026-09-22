# Crop Ranking Engine (Phase 1G — Milestone 16)

This module implements the **Crop Ranking Decision Engine** for AgriSense, combining model confidence predictions from the Crop Recommendation Random Forest with transparent mandi price trends from the Market Intelligence component.

---

## 1. Architecture

```text
Soil & Environmental Data
           ↓
Crop Recommendation Model (Random Forest)
           ↓
Top-3 Candidate Crops (with model confidence probabilities)
           │
           ├──────────────────────────────┐
           ↓                              ↓
Agronomic Signal Normalization    Market Intelligence Lookup (per Mandi/State)
  (Probability → 0.0–1.0)                 ↓
           │                      Market Signal Normalization
           │                       (Score 0–100 → 0.0–1.0)
           │                              │
           └──────────────┬───────────────┘
                          ↓
              Crop Ranking Decision Engine
                          ↓
              Ranked Candidate Crop List
```

---

## 2. Signal Transformation & Ranking Formula

### 2.1 Agronomic Signal (Model Confidence)
Extracted directly from the Crop Recommendation Random Forest classifier probability distribution:
$$\text{Agronomic Signal} = P(\text{Crop} \mid \text{Features}) \in [0.0, 1.0]$$
> **Note**: *This reflects model classification confidence, not a scientifically calibrated absolute agronomic yield potential.*

### 2.2 Market Signal
Normalized from Market Intelligence heuristic score ($0.0 \le \text{Score} \le 100.0$):
$$\text{Market Signal} = \frac{\text{Market Score}}{100.0} \in [0.0, 1.0]$$

### 2.3 Weighted Combined Score
When market data is available for the candidate crop:
$$\text{Combined Score} = (w_{\text{agronomic}} \times \text{Agronomic Signal}) + (w_{\text{market}} \times \text{Market Signal})$$

- Default Prototype Weights: $w_{\text{agronomic}} = 0.7$, $w_{\text{market}} = 0.3$ ($w_{\text{agronomic}} + w_{\text{market}} = 1.0$)

---

## 3. Missing Market Data Policy (`FALLBACK_AGRONOMIC_PRIMARY`)

Agricultural market records are not guaranteed for every commodity or mandi. 

**Policy**:
- If market data is unavailable for a candidate crop in the target mandi/state, **the crop is NOT penalized with a market score of 0**.
- Instead, the combined score equals the **agronomic signal directly**:
  $$\text{Combined Score} = \text{Agronomic Signal}$$
- The output explicitly marks `market_data_available: false`, `market_signal: null`, and adds an explanatory note in the ranking metadata.

---

## 4. Deterministic Tie-Breaking
When candidates produce identical combined scores, ties are resolved deterministically:
1. **Primary**: Combined score descending
2. **Secondary**: Agronomic signal descending
3. **Tertiary**: Alphabetical crop name ascending

---

## 5. Output Schema

```json
{
  "status": "SUCCESS",
  "ranked_crops": [
    {
      "rank": 1,
      "crop": "Tomato",
      "agronomic_signal": 0.60,
      "market_signal": 0.75,
      "combined_score": 0.6450,
      "market_data_available": true,
      "market_trend": "Increasing",
      "current_price": 2300.0,
      "price_unit": "INR/Quintal",
      "explanation": "Ranked using model confidence 0.60 (weight 0.7) and increasing market signal 0.75 (weight 0.3). Combined score: 0.6450."
    }
  ],
  "weights": {
    "agronomic": 0.7,
    "market": 0.3
  },
  "market_context": {
    "market": "Kolar",
    "state": "Karnataka",
    "district": null
  },
  "missing_market_data_policy": "FALLBACK_AGRONOMIC_PRIMARY",
  "disclaimer": "Crop ranking is a prototype decision-support tool. Crop model confidence reflects classifier probability rather than comprehensive agronomic suitability, and market scores reflect historical signals rather than guaranteed future prices or profitability."
}
```

---

## 6. Critical Limitations

1. **Model Confidence vs. Suitability**: Random Forest prediction probabilities reflect classification confidence on the training feature distribution, not scientifically calibrated multi-season agronomic yield potential.
2. **Prototype Market Signal**: Market scores are heuristic indicators based on recent historical mandi price changes; they do NOT constitute econometric forecasting.
3. **Price Fluctuations**: Current mandi price does not guarantee future harvest-time selling prices.
4. **Location Dependency**: Market prices and commodity coverage vary heavily across Mandis and States.
5. **Decision Support Only**: Ranking is intended as advisory decision support, not an automated financial or economic guarantee.
6. **Prototype Weights**: The $0.7 / 0.3$ weighting is a prototype baseline and requires regional agricultural validation.
7. **No Profit Calculation**: The engine does NOT estimate farmer net income, production costs, or gross profit margins.
