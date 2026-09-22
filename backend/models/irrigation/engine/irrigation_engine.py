import os
import json
from typing import Dict, Any, Tuple

class IrrigationInputError(Exception):
    """Custom exception raised for invalid inputs to the Irrigation Engine."""
    pass

class IrrigationEngine:
    """
    Transparent Decision Engine for Irrigation Recommendations.
    Consumes Shared Farm State and provides explainable irrigation advice based
    on configurable thresholds rather than opaque ML models.
    """

    def __init__(self, config_path: str = None):
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, "config", "thresholds.json")
            
        with open(config_path, "r") as f:
            self.config = json.load(f)
            
        self.thresholds = self.config

    def validate_input(self, data: Dict[str, Any]) -> None:
        """
        Validates the input schema, types, and physically meaningful ranges.
        Raises IrrigationInputError if validation fails.
        """
        required_fields = {
            "crop": str,
            "growth_stage": str,
            "soil_moisture": (int, float),
            "temperature": (int, float),
            "humidity": (int, float),
            "rain_probability": (int, float),
            "expected_rainfall": (int, float)
        }

        # Check required fields and types
        for field, expected_type in required_fields.items():
            if field not in data:
                raise IrrigationInputError(f"Missing required field: '{field}'")
            if data[field] is None:
                raise IrrigationInputError(f"Field '{field}' cannot be None.")
            if not isinstance(data[field], expected_type):
                raise IrrigationInputError(f"Field '{field}' must be of type {expected_type}, got {type(data[field])}.")
        
        # Specific business logic validation
        if not data["crop"].strip():
            raise IrrigationInputError("Crop name cannot be empty.")
            
        if not data["growth_stage"].strip():
            raise IrrigationInputError("Growth stage cannot be empty.")
            
        if not (0.0 <= data["soil_moisture"] <= 100.0):
            raise IrrigationInputError(f"Soil moisture must be between 0 and 100%. Got {data['soil_moisture']}")
            
        if not (-20.0 <= data["temperature"] <= 60.0):
            raise IrrigationInputError(f"Temperature is out of physically meaningful bounds (-20 to 60 °C). Got {data['temperature']}")
            
        if not (0.0 <= data["humidity"] <= 100.0):
            raise IrrigationInputError(f"Humidity must be between 0 and 100%. Got {data['humidity']}")
            
        if not (0.0 <= data["rain_probability"] <= 100.0):
            raise IrrigationInputError(f"Rain probability must be between 0 and 100%. Got {data['rain_probability']}")
            
        if data["expected_rainfall"] < 0.0:
            raise IrrigationInputError(f"Expected rainfall cannot be negative. Got {data['expected_rainfall']}")

    def evaluate_factors(self, data: Dict[str, Any]) -> Dict[str, str]:
        """
        Analyzes individual factors against configured thresholds to build context.
        """
        factors = {
            "soil": "adequate",
            "rain_forecast": "none",
            "environmental_demand": "normal",
            "context": f"{data['crop']} at {data['growth_stage']} stage"
        }

        # Evaluate Soil Dryness
        sm = data["soil_moisture"]
        sm_config = self.thresholds["soil_moisture"]
        if sm < sm_config["dry_threshold_percent"]:
            factors["soil"] = "dry"
        elif sm > sm_config["adequate_threshold_percent"]:
            factors["soil"] = "saturated"
            
        # Evaluate Rain Opportunity
        rp = data["rain_probability"]
        er = data["expected_rainfall"]
        rf_config = self.thresholds["weather_forecast"]
        
        if (rp >= rf_config["meaningful_rain_probability_percent"] and 
            er >= rf_config["substantial_expected_rainfall_mm"]):
            factors["rain_forecast"] = "substantial"
        elif rp >= rf_config["meaningful_rain_probability_percent"]:
            factors["rain_forecast"] = "light"
            
        # Evaluate Environmental Demand
        temp = data["temperature"]
        hum = data["humidity"]
        ed_config = self.thresholds["environmental_demand"]
        
        if temp > ed_config["high_temperature_celsius"] and hum < ed_config["low_humidity_percent"]:
            factors["environmental_demand"] = "high"
            
        return factors

    def evaluate_rules(self, factors: Dict[str, str]) -> Tuple[bool, str, str]:
        """
        Combines analyzed factors into a final irrigation decision and explanation.
        """
        irrigation_required = False
        urgency = "low"
        reason = "Soil moisture is adequate and no immediate action is required."

        if factors["soil"] == "dry":
            if factors["rain_forecast"] == "substantial":
                irrigation_required = False
                urgency = "low"
                reason = "Soil is dry, but substantial rain is expected. Consider delaying irrigation to utilize natural rainfall."
            else:
                irrigation_required = True
                if factors["environmental_demand"] == "high":
                    urgency = "high"
                    reason = "Soil is dry, environmental demand is high (hot/dry), and no substantial rain is expected. Immediate irrigation is highly recommended."
                else:
                    urgency = "medium"
                    reason = "Soil is dry and no substantial rain is expected. Irrigation is recommended."
        
        elif factors["soil"] == "adequate":
            if factors["environmental_demand"] == "high" and factors["rain_forecast"] == "none":
                irrigation_required = False
                urgency = "low"
                reason = "Soil moisture is currently adequate, but monitor closely due to high environmental demand and lack of expected rain."
            else:
                irrigation_required = False
                urgency = "low"
                reason = "Soil moisture is adequate. No immediate irrigation indicated."
                
        elif factors["soil"] == "saturated":
            irrigation_required = False
            urgency = "none"
            reason = "Soil is currently well-saturated. Do not irrigate to avoid waterlogging."
            if factors["rain_forecast"] == "substantial":
                reason += " Substantial rain is also expected, ensure proper drainage."

        return irrigation_required, urgency, reason

    def get_recommendation(self, farm_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point for the Irrigation Engine. 
        Takes normalized farm state and outputs a transparent recommendation.
        """
        # 1. Validation
        self.validate_input(farm_state)
        
        # 2. Factor Analysis
        evaluated_factors = self.evaluate_factors(farm_state)
        
        # 3. Rule Evaluation
        required, urgency, explanation = self.evaluate_rules(evaluated_factors)
        
        # 4. Return structured response
        return {
            "irrigation_required": required,
            "urgency": urgency,
            "reason": explanation,
            "factors": evaluated_factors,
            "metadata": {
                "engine_status": self.thresholds.get("status", "UNKNOWN"),
                "crop_context": evaluated_factors["context"]
            }
        }
