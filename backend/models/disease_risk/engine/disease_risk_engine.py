import os
import json
from typing import Dict, Any, List, Tuple

class DiseaseRiskInputError(Exception):
    """Custom exception raised for invalid inputs to the Disease Risk Engine."""
    pass

class DiseaseRiskEngine:
    """
    Transparent Environmental Disease Risk Assessment Engine.

    IMPORTANT DISTINCTION:
    This engine evaluates environmental conditions to estimate the probability
    that conditions are FAVORABLE for disease development. It does NOT detect
    whether a disease is actually present on a plant. Actual disease detection
    requires image analysis via the Disease Detection module (MobileNetV2).

    Environmental disease risk does not confirm disease presence.
    Actual disease detection requires image-based Disease Detection.
    """

    def __init__(self, config_path: str = None):
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, "config", "risk_rules.json")

        with open(config_path, "r") as f:
            self.config = json.load(f)

    def validate_input(self, data: Dict[str, Any]) -> None:
        """
        Validates input schema, types, and physically meaningful ranges.
        """
        required_fields = {
            "crop": str,
            "growth_stage": str,
            "temperature": (int, float),
            "humidity": (int, float),
            "rainfall": (int, float),
            "recent_rainfall": (int, float)
        }

        for field, expected_type in required_fields.items():
            if field not in data:
                raise DiseaseRiskInputError(f"Missing required field: '{field}'")
            if data[field] is None:
                raise DiseaseRiskInputError(f"Field '{field}' cannot be None.")
            if not isinstance(data[field], expected_type):
                raise DiseaseRiskInputError(
                    f"Field '{field}' must be numeric or string as required, "
                    f"got {type(data[field]).__name__}."
                )

        if not data["crop"].strip():
            raise DiseaseRiskInputError("Crop name cannot be empty.")

        if not data["growth_stage"].strip():
            raise DiseaseRiskInputError("Growth stage cannot be empty.")

        val_cfg = self.config["validation"]
        temp = data["temperature"]
        if not (val_cfg["temperature_min_celsius"] <= temp <= val_cfg["temperature_max_celsius"]):
            raise DiseaseRiskInputError(
                f"Temperature is out of the physically meaningful validation range "
                f"({val_cfg['temperature_min_celsius']} to {val_cfg['temperature_max_celsius']} °C). "
                f"Got {temp}"
            )

        if not (0.0 <= data["humidity"] <= 100.0):
            raise DiseaseRiskInputError(
                f"Humidity must be between 0 and 100%. Got {data['humidity']}"
            )

        if data["rainfall"] < 0.0:
            raise DiseaseRiskInputError(
                f"Rainfall cannot be negative. Got {data['rainfall']}"
            )

        if data["recent_rainfall"] < 0.0:
            raise DiseaseRiskInputError(
                f"Recent rainfall cannot be negative. Got {data['recent_rainfall']}"
            )

    def evaluate_humidity_signal(self, humidity: float) -> Tuple[float, str]:
        """
        Evaluates the humidity risk signal based on configured thresholds.
        Returns a (weighted_score_contribution, description) pair.
        """
        cfg = self.config["risk_signals"]["humidity"]
        weight = cfg["weight"]

        if humidity >= cfg["high_threshold_percent"]:
            signal = 1.0
            description = (
                f"Humidity ({humidity}%) is above the configured high-risk threshold "
                f"({cfg['high_threshold_percent']}%), contributing an elevated humidity risk signal."
            )
        elif humidity >= cfg["elevated_threshold_percent"]:
            signal = 0.5
            description = (
                f"Humidity ({humidity}%) is above the configured elevated-risk threshold "
                f"({cfg['elevated_threshold_percent']}%), contributing a moderate humidity risk signal."
            )
        else:
            signal = 0.0
            description = (
                f"Humidity ({humidity}%) is below the configured elevated-risk threshold "
                f"({cfg['elevated_threshold_percent']}%). Humidity risk signal is low."
            )

        return signal * weight, description

    def evaluate_temperature_signal(self, temperature: float) -> Tuple[float, str]:
        """
        Evaluates the temperature risk signal. Many common fungal and bacterial
        pathogens prefer a moderate temperature band; this is a generic prototype.
        """
        cfg = self.config["risk_signals"]["temperature"]
        weight = cfg["weight"]

        fav_min = cfg["favorable_min_celsius"]
        fav_max = cfg["favorable_max_celsius"]

        if fav_min <= temperature <= fav_max:
            signal = 1.0
            description = (
                f"Temperature ({temperature} °C) is within the configured prototype "
                f"favorable range ({fav_min}–{fav_max} °C), contributing a temperature risk signal."
            )
        else:
            signal = 0.0
            description = (
                f"Temperature ({temperature} °C) is outside the configured prototype "
                f"favorable range ({fav_min}–{fav_max} °C). Temperature risk signal is low."
            )

        return signal * weight, description

    def evaluate_rainfall_signal(self, rainfall: float) -> Tuple[float, str]:
        """
        Evaluates the rainfall risk signal.
        """
        cfg = self.config["risk_signals"]["rainfall"]
        weight = cfg["weight"]

        if rainfall >= cfg["elevated_mm"]:
            signal = 1.0
            description = (
                f"Rainfall ({rainfall} mm) is above the configured elevated threshold "
                f"({cfg['elevated_mm']} mm), contributing an elevated rainfall risk signal."
            )
        elif rainfall >= cfg["meaningful_mm"]:
            signal = 0.5
            description = (
                f"Rainfall ({rainfall} mm) is above the configured meaningful threshold "
                f"({cfg['meaningful_mm']} mm), contributing a moderate rainfall risk signal."
            )
        else:
            signal = 0.0
            description = f"Rainfall ({rainfall} mm) is low. Rainfall risk signal is minimal."

        return signal * weight, description

    def evaluate_recent_rainfall_signal(self, recent_rainfall: float) -> Tuple[float, str]:
        """
        Evaluates the recent rainfall risk signal (e.g., accumulated over last few days).
        """
        cfg = self.config["risk_signals"]["recent_rainfall"]
        weight = cfg["weight"]

        if recent_rainfall >= cfg["elevated_mm"]:
            signal = 1.0
            description = (
                f"Recent rainfall ({recent_rainfall} mm) is above the configured elevated threshold "
                f"({cfg['elevated_mm']} mm), contributing an elevated recent-rainfall risk signal."
            )
        elif recent_rainfall >= cfg["meaningful_mm"]:
            signal = 0.5
            description = (
                f"Recent rainfall ({recent_rainfall} mm) is above the configured meaningful threshold "
                f"({cfg['meaningful_mm']} mm), contributing a moderate recent-rainfall risk signal."
            )
        else:
            signal = 0.0
            description = (
                f"Recent rainfall ({recent_rainfall} mm) is low. "
                "Recent-rainfall risk signal is minimal."
            )

        return signal * weight, description

    def calculate_risk_score(self, signals: List[Tuple[float, str]]) -> float:
        """
        Sums the weighted signal contributions into an overall prototype risk score.
        The score is NOT a calibrated probability — it is a prototype composite index
        between 0.0 (no configured signals triggered) and 1.0 (all signals at maximum).
        """
        return sum(score for score, _ in signals)

    def classify_risk(self, score: float) -> str:
        """
        Converts the prototype score into a categorical risk level.
        """
        cls_cfg = self.config["risk_classification"]
        if score <= cls_cfg["low_max_score"]:
            return "Low"
        elif score <= cls_cfg["medium_max_score"]:
            return "Medium"
        else:
            return "High"

    def get_risk_assessment(self, farm_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point. Takes normalized farm state and returns an
        explainable, transparent environmental disease risk assessment.
        """
        # 1. Validation
        self.validate_input(farm_state)

        crop = farm_state["crop"]
        growth_stage = farm_state["growth_stage"]

        # 2. Signal Evaluation
        humidity_result = self.evaluate_humidity_signal(farm_state["humidity"])
        temperature_result = self.evaluate_temperature_signal(farm_state["temperature"])
        rainfall_result = self.evaluate_rainfall_signal(farm_state["rainfall"])
        recent_result = self.evaluate_recent_rainfall_signal(farm_state["recent_rainfall"])

        signals = [humidity_result, temperature_result, rainfall_result, recent_result]

        # 3. Scoring
        risk_score = self.calculate_risk_score(signals)

        # 4. Classification
        risk_level = self.classify_risk(risk_score)

        # 5. Explanation
        reasoning = [desc for _, desc in signals]
        reasoning.append(
            f"Assessment provided in context of {crop} at {growth_stage} stage. "
            "Note: Crop- and disease-specific rules are not yet configured for this prototype."
        )

        return {
            "crop": crop,
            "growth_stage": growth_stage,
            "risk_level": risk_level,
            "risk_score": round(risk_score, 4),
            "risk_score_note": (
                "This score is a prototype composite index (0.0–1.0), "
                "NOT a calibrated disease probability."
            ),
            "signals": {
                "humidity": round(humidity_result[0], 4),
                "temperature": round(temperature_result[0], 4),
                "rainfall": round(rainfall_result[0], 4),
                "recent_rainfall": round(recent_result[0], 4)
            },
            "reasoning": reasoning,
            "disclaimer": (
                "Environmental disease risk does not confirm disease presence. "
                "Actual disease detection requires image-based analysis."
            )
        }
