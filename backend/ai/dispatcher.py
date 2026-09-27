"""AgriSense — Python AI Dispatcher Layer (Milestone 17).

Single central entrypoint for dispatching structured JSON requests to the
appropriate underlying agricultural ML model or decision engine.

Supported Tasks:
- crop_recommendation
- disease_detection
- irrigation
- fertilizer
- disease_risk
- market
- crop_ranking
- health
"""

import sys
import os
import json
from typing import Dict, Any, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Lazy-loaded singletons for memory and startup efficiency
_crop_recommender = None
_disease_detector = None
_irrigation_engine = None
_fertilizer_engine = None
_disease_risk_engine = None
_market_engine = None
_crop_ranking_engine = None

SUPPORTED_TASKS = [
    "crop_recommendation",
    "disease_detection",
    "irrigation",
    "fertilizer",
    "disease_risk",
    "market",
    "crop_ranking",
    "health"
]


def get_crop_recommender():
    global _crop_recommender
    if _crop_recommender is None:
        from backend.models.crop_recommendation.inference.predict import CropRecommender
        _crop_recommender = CropRecommender()
    return _crop_recommender


def get_disease_detector():
    global _disease_detector
    if _disease_detector is None:
        from backend.models.disease_detection.inference.predict import DiseaseDetector
        _disease_detector = DiseaseDetector()
    return _disease_detector


def get_irrigation_engine():
    global _irrigation_engine
    if _irrigation_engine is None:
        from backend.models.irrigation.engine.irrigation_engine import IrrigationEngine
        _irrigation_engine = IrrigationEngine()
    return _irrigation_engine


def get_fertilizer_engine():
    global _fertilizer_engine
    if _fertilizer_engine is None:
        from backend.models.fertilizer.engine.fertilizer_engine import FertilizerEngine
        _fertilizer_engine = FertilizerEngine()
    return _fertilizer_engine


def get_disease_risk_engine():
    global _disease_risk_engine
    if _disease_risk_engine is None:
        from backend.models.disease_risk.engine.disease_risk_engine import DiseaseRiskEngine
        _disease_risk_engine = DiseaseRiskEngine()
    return _disease_risk_engine


def get_market_engine():
    global _market_engine
    if _market_engine is None:
        from backend.models.market.providers.market_provider import LocalMarketDataProvider, AgmarknetApiProvider
        from backend.models.market.engine.market_engine import MarketEngine

        # Use AgmarknetApiProvider if API key is configured, else fallback to LocalMarketDataProvider
        if os.getenv("DATA_GOV_IN_API_KEY"):
            provider = AgmarknetApiProvider()
        else:
            sample_data_path = os.path.join(
                PROJECT_ROOT, "backend", "models", "market", "data", "sample_market_data.json"
            )
            provider = LocalMarketDataProvider(data_file_path=sample_data_path)
        _market_engine = MarketEngine(provider=provider)
    return _market_engine


def get_crop_ranking_engine():
    global _crop_ranking_engine
    if _crop_ranking_engine is None:
        from backend.models.crop_ranking.engine.crop_ranking_engine import CropRankingEngine
        _crop_ranking_engine = CropRankingEngine(market_engine=get_market_engine())
    return _crop_ranking_engine


def dispatch_ai_task(task: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Validates task and input payload, invokes the appropriate model or engine,
    and returns a standardized JSON-serializable dictionary.
    """
    if not task or not isinstance(task, str):
        return {
            "success": False,
            "error": {
                "code": "INVALID_TASK",
                "message": f"Task must be a non-empty string. Supported tasks: {SUPPORTED_TASKS}"
            }
        }

    task_clean = task.strip().lower()
    if task_clean not in SUPPORTED_TASKS:
        return {
            "success": False,
            "error": {
                "code": "UNSUPPORTED_TASK",
                "message": f"Unsupported AI task '{task}'. Supported tasks: {SUPPORTED_TASKS}"
            }
        }

    input_data = payload or {}
    if not isinstance(input_data, dict):
        return {
            "success": False,
            "error": {
                "code": "INVALID_PAYLOAD",
                "message": f"Payload must be a JSON object / dictionary, received: {type(input_data).__name__}"
            }
        }

    try:
        # Task 1: Health Check
        if task_clean == "health":
            return {
                "success": True,
                "task": "health",
                "result": {
                    "status": "healthy",
                    "service": "agrisense-ai",
                    "supported_tasks": SUPPORTED_TASKS
                }
            }

        # Task 2: Crop Recommendation
        elif task_clean == "crop_recommendation":
            recommender = get_crop_recommender()
            result = recommender.predict(input_data)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 3: Disease Detection
        elif task_clean == "disease_detection":
            image_path = input_data.get("image_path")
            if not image_path:
                return {
                    "success": False,
                    "error": {
                        "code": "MISSING_IMAGE_PATH",
                        "message": "disease_detection requires 'image_path' field in payload."
                    }
                }
            detector = get_disease_detector()
            result = detector.predict(image_path)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 4: Irrigation Recommendation
        elif task_clean == "irrigation":
            engine = get_irrigation_engine()
            result = engine.get_recommendation(input_data)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 5: Fertilizer Recommendation
        elif task_clean == "fertilizer":
            engine = get_fertilizer_engine()
            result = engine.get_recommendation(input_data)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 6: Disease Risk Assessment
        elif task_clean == "disease_risk":
            engine = get_disease_risk_engine()
            result = engine.get_risk_assessment(input_data)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 7: Market Intelligence
        elif task_clean == "market":
            crop = input_data.get("crop")
            market = input_data.get("market")
            state = input_data.get("state")
            if not crop:
                return {
                    "success": False,
                    "error": {
                        "code": "MISSING_CROP",
                        "message": "Market analysis requires a non-empty 'crop' field."
                    }
                }
            engine = get_market_engine()
            result = engine.analyze_market(crop=crop, market=market, state=state)
            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

        # Task 8: Crop Ranking
        elif task_clean == "crop_ranking":
            ranking_engine = get_crop_ranking_engine()
            crop_rec_out = input_data.get("crop_recommendation_output")
            candidates = input_data.get("candidates")
            market_ctx = input_data.get("market_context")
            precomputed_market_results = input_data.get("precomputed_market_results")
            weights = input_data.get("custom_weights")

            if crop_rec_out:
                result = ranking_engine.rank_crops(
                    crop_recommendation_output=crop_rec_out,
                    market_context=market_ctx,
                    custom_weights=weights,
                    precomputed_market_results=precomputed_market_results
                )
            elif candidates:
                result = ranking_engine.rank_candidates(
                    candidates=candidates,
                    market_context=market_ctx,
                    custom_weights=weights,
                    precomputed_market_results=precomputed_market_results
                )
            else:
                return {
                    "success": False,
                    "error": {
                        "code": "MISSING_CANDIDATES",
                        "message": "Crop ranking requires either 'crop_recommendation_output' or 'candidates' list."
                    }
                }

            return {
                "success": True,
                "task": task_clean,
                "result": result
            }

    except Exception as e:
        error_type = type(e).__name__
        return {
            "success": False,
            "error": {
                "code": error_type,
                "message": str(e)
            }
        }


def main():
    """CLI handler for direct subprocess execution from Node.js."""
    raw_input_str = ""

    # Check CLI argument or stdin
    if len(sys.argv) > 1:
        raw_input_str = sys.argv[1]
    else:
        raw_input_str = sys.stdin.read().strip()

    if not raw_input_str:
        response = {
            "success": False,
            "error": {
                "code": "EMPTY_REQUEST",
                "message": "No JSON input received via CLI argument or stdin."
            }
        }
        print(json.dumps(response))
        sys.exit(0)

    try:
        request_obj = json.loads(raw_input_str)
    except json.JSONDecodeError as e:
        response = {
            "success": False,
            "error": {
                "code": "MALFORMED_JSON",
                "message": f"Failed to parse JSON input: {str(e)}"
            }
        }
        print(json.dumps(response))
        sys.exit(0)

    task = request_obj.get("task")
    payload = request_obj.get("input") or request_obj.get("payload") or {}

    response = dispatch_ai_task(task, payload)
    print(json.dumps(response))


if __name__ == "__main__":
    main()
