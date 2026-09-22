# Irrigation Recommendation Engine (Phase 1C)

This directory contains the transparent, rule-based Irrigation Decision Engine for AgriSense.

Unlike the Crop Recommendation and Disease Detection modules which rely on Machine Learning, this engine uses explicit configurable thresholds to interpret the Shared Farm State and output explainable irrigation advice.

## Architecture

```text
Input (Shared Farm State)
 ↓
Validation (Type checking, boundary checking)
 ↓
Factor Analysis (Dryness signal, Rain opportunity, Environmental demand)
 ↓
Rule Evaluation (Combines factors into decision logic)
 ↓
Recommendation (Boolean flag, urgency, reason)
 ↓
Explanation (Transparent output of context and justification)
```

## Configuration

All thresholds are isolated in `config/thresholds.json`.

**Important:** These threshold values are currently **PROTOTYPE ASSUMPTIONS**. They are configurable placeholders and must be validated against specific crops, soil types, and regional agronomic data before production use. They are not yet scientifically validated thresholds.

## Usage

```python
from engine.irrigation_engine import IrrigationEngine

# Initialize the engine (loads configuration)
engine = IrrigationEngine()

farm_state = {
    "crop": "Tomato",
    "growth_stage": "Flowering",
    "soil_moisture": 25.0,     # %
    "temperature": 28.0,       # °C
    "humidity": 55.0,          # %
    "rain_probability": 20.0,  # %
    "expected_rainfall": 0.0   # mm
}

# Returns a structured dictionary with decision, urgency, and reasoning
recommendation = engine.get_recommendation(farm_state)
```
