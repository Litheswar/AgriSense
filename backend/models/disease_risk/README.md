# Disease Risk Engine (Phase 1E)

This directory contains the transparent, rule-based Environmental Disease Risk Engine for AgriSense.

## Critical Distinction

AgriSense has **two separate** disease-related capabilities:

| Component | Location | Input | Output |
|---|---|---|---|
| **Disease Detection** | `backend/models/disease_detection/` | Leaf photograph | Detected disease + confidence |
| **Disease Risk** | `backend/models/disease_risk/` | Environmental conditions | Environmental risk level |

**Environmental disease risk does NOT confirm disease presence. Actual disease detection requires image-based analysis via the MobileNetV2 Disease Detection module.**

## Architecture

```text
Input (Crop, Growth Stage, Temperature, Humidity, Rainfall, Recent Rainfall)
 ↓
Validation (Types, physical bounds)
 ↓
Environmental Signal Evaluation (Per-factor weighted scores)
 ↓
Risk Score Aggregation (Sum of weighted signal contributions)
 ↓
Risk Classification (Low / Medium / High)
 ↓
Explanation (Transparent reasoning per signal)
```

## Risk Scoring

The engine calculates a **prototype composite risk score** (0.0–1.0) as a weighted sum of individual factor signals:

| Factor | Weight | Source |
|---|---|---|
| Humidity | 0.35 | PROTOTYPE_ASSUMPTION |
| Temperature | 0.25 | PROTOTYPE_ASSUMPTION |
| Rainfall | 0.25 | PROTOTYPE_ASSUMPTION |
| Recent Rainfall | 0.15 | PROTOTYPE_ASSUMPTION |

**This score is NOT a calibrated disease probability.** It is a transparent index for comparing environmental conditions against configured thresholds.

## Configuration Status

All numerical thresholds in `config/risk_rules.json` are currently **PROTOTYPE ASSUMPTIONS** requiring review by a plant pathologist or agronomist before production use.

## Usage

```python
from engine.disease_risk_engine import DiseaseRiskEngine

engine = DiseaseRiskEngine()

farm_state = {
    "crop": "Tomato",
    "growth_stage": "Flowering",
    "temperature": 25.0,    # °C
    "humidity": 92.0,       # %
    "rainfall": 20.0,       # mm
    "recent_rainfall": 30.0 # mm (accumulated recent period)
}

assessment = engine.get_risk_assessment(farm_state)
```
