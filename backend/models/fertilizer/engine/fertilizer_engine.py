import os
import json
from typing import Dict, Any, List

class FertilizerInputError(Exception):
    """Exception raised for invalid inputs to the Fertilizer Engine."""
    pass

class FertilizerEngine:
    """
    Transparent Decision Engine for Fertilizer Recommendations.
    Consumes soil nutrients, crop context, and disease status to output
    a rule-based recommendation without inventing scientific quantities.
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
        Validates the input schema and types.
        """
        required_fields = {
            "N": (int, float),
            "P": (int, float),
            "K": (int, float),
            "ph": (int, float),
            "crop": str,
            "growth_stage": str,
            "disease_status": dict
        }

        # Check required fields and types
        for field, expected_type in required_fields.items():
            if field not in data:
                raise FertilizerInputError(f"Missing required field: '{field}'")
            if data[field] is None:
                raise FertilizerInputError(f"Field '{field}' cannot be None.")
            if not isinstance(data[field], expected_type):
                raise FertilizerInputError(f"Field '{field}' must be of type {expected_type}, got {type(data[field])}.")
        
        # Specific business logic validation
        if data["N"] < 0 or data["P"] < 0 or data["K"] < 0:
            raise FertilizerInputError("Nutrient values (N, P, K) cannot be negative.")
            
        if not (0.0 <= data["ph"] <= 14.0):
            raise FertilizerInputError(f"pH must be between 0 and 14. Got {data['ph']}")
            
        if not data["crop"].strip():
            raise FertilizerInputError("Crop name cannot be empty.")
            
        if not data["growth_stage"].strip():
            raise FertilizerInputError("Growth stage cannot be empty.")
            
        if "detected" not in data["disease_status"]:
            raise FertilizerInputError("disease_status must contain a 'detected' boolean field.")

    def classify_nutrients(self, n: float, p: float, k: float) -> Dict[str, str]:
        """
        Classifies N, P, K as 'low', 'adequate', or 'high'.
        """
        status = {}
        nutrients = {"N": n, "P": p, "K": k}
        
        for element, val in nutrients.items():
            thresh = self.thresholds["nutrients"][element]
            if val < thresh["low_threshold"]:
                status[element] = "low"
            elif val > thresh["high_threshold"]:
                status[element] = "high"
            else:
                status[element] = "adequate"
                
        return status

    def classify_ph(self, ph: float) -> str:
        """
        Classifies pH as 'low', 'suitable', or 'high'.
        """
        thresh = self.thresholds["ph"]
        if ph < thresh["low_threshold"]:
            return "low"
        elif ph > thresh["high_threshold"]:
            return "high"
        else:
            return "suitable"

    def determine_priorities(self, nutrient_status: Dict[str, str]) -> List[str]:
        """
        Identifies which nutrients require attention.
        """
        priorities = []
        for element, status in nutrient_status.items():
            if status == "low":
                priorities.append(element)
        return priorities

    def build_recommendation(self, 
                             nutrient_status: Dict[str, str], 
                             ph_status: str, 
                             priorities: List[str], 
                             crop: str, 
                             growth_stage: str, 
                             disease_status: dict) -> Dict[str, Any]:
        """
        Synthesizes the classifications and context into a final recommendation and reasoning.
        """
        reasoning = []
        recommendation = ""
        caution = None

        # Nutrient Reasoning
        for element in ["N", "P", "K"]:
            status = nutrient_status[element]
            reasoning.append(f"{element} is classified as {status} according to configured prototype thresholds.")

        if not priorities:
            recommendation = "No major nutrient deficiency indicated. Maintain current soil health practices."
            reasoning.append("All primary macronutrients (N, P, K) are adequate or high.")
        else:
            recommendation = f"Consider supplementing the following priority nutrients: {', '.join(priorities)}."
            reasoning.append(f"{', '.join(priorities)} identified as priority nutrient(s) due to low levels.")

        # pH Reasoning
        reasoning.append(f"pH is classified as {ph_status}.")
        if ph_status == "low":
            recommendation += " Additionally, consider soil amendments to raise pH for better nutrient availability."
        elif ph_status == "high":
            recommendation += " Additionally, consider soil amendments to lower pH."

        # Crop/Growth Stage Context
        reasoning.append(f"Recommendation provided in the context of {crop} at the {growth_stage} stage.")

        # Disease Context
        if disease_status.get("detected", False):
            disease_name = disease_status.get("disease", "an unknown disease")
            caution = (f"Caution: A disease ({disease_name}) was detected. "
                       "Do not use fertilizer as a treatment for disease. "
                       "Ensure nutrient application does not worsen the disease environment.")
            reasoning.append("Because disease status indicates a detected disease, fertilizer changes should not be treated as a disease treatment.")

        return {
            "crop": crop,
            "growth_stage": growth_stage,
            "nutrient_status": nutrient_status,
            "ph_status": ph_status,
            "priority_nutrients": priorities,
            "recommendation": recommendation.strip(),
            "caution": caution,
            "reasoning": reasoning
        }

    def get_recommendation(self, farm_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point for the Fertilizer Engine. 
        """
        self.validate_input(farm_state)
        
        nutrient_status = self.classify_nutrients(farm_state["N"], farm_state["P"], farm_state["K"])
        ph_status = self.classify_ph(farm_state["ph"])
        
        priorities = self.determine_priorities(nutrient_status)
        
        return self.build_recommendation(
            nutrient_status=nutrient_status,
            ph_status=ph_status,
            priorities=priorities,
            crop=farm_state["crop"],
            growth_stage=farm_state["growth_stage"],
            disease_status=farm_state["disease_status"]
        )
