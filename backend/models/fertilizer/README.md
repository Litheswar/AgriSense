# Fertilizer Recommendation Engine (Phase 1D)

This directory contains the transparent, rule-based Fertilizer Decision Engine for AgriSense.

Unlike the core Crop Recommendation model, this engine evaluates soil nutrient status (N, P, K) and pH against configurable thresholds to provide transparent, explainable recommendations without inventing unvalidated agricultural prescriptions.

## Architecture

```text
Input (Soil NPK, pH, Crop, Disease Status)
 ↓
Validation (Data types, logical boundaries)
 ↓
Nutrient Classification (Categorize N, P, K as low/adequate/high)
 ↓
pH Classification (Categorize pH as low/suitable/high)
 ↓
Context Injection (Crop, Growth Stage)
 ↓
Disease Context Evaluation (Include cautions if disease is detected)
 ↓
Recommendation (Prioritized nutrients and actions)
 ↓
Explanation (Transparent reasoning linked to rules)
```

## Configuration

Thresholds are maintained externally in `config/thresholds.json`.

**Important Status:** Currently, the thresholds for N, P, K, and pH are **PROTOTYPE ASSUMPTIONS**. They are generic placeholders meant to test the engine's decision pathways. They are not scientifically validated for all crops, soil types, or regions, and should be replaced with verified agronomic datasets prior to production deployment.

## Usage

```python
from engine.fertilizer_engine import FertilizerEngine

engine = FertilizerEngine()

farm_state = {
    "N": 15.0,
    "P": 40.0,
    "K": 50.0,
    "ph": 6.5,
    "crop": "Corn",
    "growth_stage": "Vegetative",
    "disease_status": {
        "detected": False, 
        "disease": None, 
        "confidence": 0.0
    }
}

recommendation = engine.get_recommendation(farm_state)
```
