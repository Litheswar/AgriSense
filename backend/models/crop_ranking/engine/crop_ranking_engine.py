"""AgriSense — Crop Ranking Decision Engine (Phase 1G - Milestone 16).

Combines Crop Recommendation model predictions (model confidence signal) with
Market Intelligence signals (transparent historical trend & mandi pricing)
into a structured, multi-criteria ranked crop decision list.
"""

import json
import os
from typing import Dict, Any, List, Optional

try:
    from backend.models.market.engine.market_engine import MarketEngine
except ImportError:
    try:
        from models.market.engine.market_engine import MarketEngine
    except ImportError:
        MarketEngine = Any


class CropRankingInputError(ValueError):
    """Exception raised when ranking inputs or weights fail validation."""
    pass


class CropRankingEngine:
    """Multi-criteria decision engine for ranking candidate crops."""

    def __init__(
        self,
        market_engine: Optional[Any] = None,
        config_path: Optional[str] = None,
        custom_config: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize Crop Ranking Engine.
        
        Args:
            market_engine: Optional instance of MarketEngine to query market signals.
            config_path: Optional path to ranking_config.json.
            custom_config: Optional custom configuration dictionary.
        """
        self.market_engine = market_engine
        self.config = self._load_config(config_path, custom_config)

    def _load_config(
        self,
        config_path: Optional[str],
        custom_config: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Load configuration from JSON or use defaults."""
        if custom_config is not None:
            return custom_config

        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, "config", "ranking_config.json")

        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                raise CropRankingInputError(f"Failed to load ranking config from {config_path}: {e}")

        # Default fallback config
        return {
            "status": "PROTOTYPE_ASSUMPTION",
            "weights": {"agronomic": 0.7, "market": 0.3},
            "missing_market_data_policy": {
                "policy": "FALLBACK_AGRONOMIC_PRIMARY"
            },
            "disclaimer": "Crop ranking is a prototype decision-support tool."
        }

    def validate_weights(self, weights: Dict[str, float]) -> None:
        """Validate that weights are numeric, non-negative, and sum to 1.0."""
        if not isinstance(weights, dict):
            raise CropRankingInputError(f"Weights must be a dictionary, got: {type(weights).__name__}")

        if "agronomic" not in weights or "market" not in weights:
            raise CropRankingInputError("Weights dictionary must contain 'agronomic' and 'market' keys.")

        for key in ["agronomic", "market"]:
            val = weights[key]
            if val is None or not isinstance(val, (int, float)):
                raise CropRankingInputError(f"Weight for '{key}' must be numeric, got: {val!r}")
            if val < 0.0 or val > 1.0:
                raise CropRankingInputError(f"Weight for '{key}' must be between 0.0 and 1.0, got: {val}")

        total_weight = weights["agronomic"] + weights["market"]
        if abs(total_weight - 1.0) > 1e-4:
            raise CropRankingInputError(f"Ranking weights must sum to 1.0, got sum: {total_weight:.4f}")

    def validate_candidates(self, candidates: List[Dict[str, Any]]) -> None:
        """Validate candidate crops list."""
        if not isinstance(candidates, list):
            raise CropRankingInputError(f"Candidates must be a list of dictionaries, got: {type(candidates).__name__}")

        if len(candidates) == 0:
            raise CropRankingInputError("Candidate crops list cannot be empty.")

        for i, cand in enumerate(candidates):
            if not isinstance(cand, dict):
                raise CropRankingInputError(f"Candidate #{i+1} must be a dictionary, got: {type(cand).__name__}")

            crop_name = cand.get("crop")
            if not crop_name or not isinstance(crop_name, str) or not crop_name.strip():
                raise CropRankingInputError(f"Candidate #{i+1} missing valid non-empty 'crop' name.")

            prob = cand.get("probability", cand.get("confidence"))
            if prob is None:
                raise CropRankingInputError(f"Candidate #{i+1} ('{crop_name}') missing 'probability' or 'confidence'.")

            try:
                numeric_prob = float(prob)
            except (ValueError, TypeError):
                raise CropRankingInputError(f"Candidate #{i+1} ('{crop_name}') probability must be numeric, got: {prob!r}")

            if numeric_prob < 0.0 or numeric_prob > 1.0:
                raise CropRankingInputError(
                    f"Candidate #{i+1} ('{crop_name}') probability must be between 0.0 and 1.0, got: {numeric_prob}"
                )

    def rank_crops(
        self,
        crop_recommendation_output: Dict[str, Any],
        market_context: Optional[Dict[str, Any]] = None,
        custom_weights: Optional[Dict[str, float]] = None,
        precomputed_market_results: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Rank candidate crops from a CropRecommender inference output dictionary.
        
        Args:
            crop_recommendation_output: Dict returned by CropRecommender.predict (containing 'top_3' or 'candidates')
            market_context: Optional dict with location context (e.g. {'market': 'Kolar', 'state': 'Karnataka'})
            custom_weights: Optional dict overriding default weights (e.g. {'agronomic': 0.6, 'market': 0.4})
        """
        if not isinstance(crop_recommendation_output, dict):
            raise CropRankingInputError("Crop recommendation output must be a dictionary.")

        candidates = crop_recommendation_output.get("top_3") or crop_recommendation_output.get("candidates")
        if candidates is None:
            # Check if top-level single prediction is provided
            pred_crop = crop_recommendation_output.get("predicted_crop")
            conf = crop_recommendation_output.get("confidence")
            if pred_crop and conf is not None:
                candidates = [{"crop": pred_crop, "probability": conf}]
            else:
                raise CropRankingInputError("Crop recommendation output contains no 'top_3' or 'candidates' list.")

        return self.rank_candidates(
            candidates=candidates,
            market_context=market_context,
            custom_weights=custom_weights,
            precomputed_market_results=precomputed_market_results
        )

    def rank_candidates(
        self,
        candidates: List[Dict[str, Any]],
        market_context: Optional[Dict[str, Any]] = None,
        custom_weights: Optional[Dict[str, float]] = None,
        precomputed_market_results: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Rank an explicit list of candidate crops with agronomic and market signals.
        """
        self.validate_candidates(candidates)

        weights = custom_weights or self.config.get("weights", {"agronomic": 0.7, "market": 0.3})
        self.validate_weights(weights)

        agronomic_weight = float(weights["agronomic"])
        market_weight = float(weights["market"])

        market_ctx = market_context or {}
        market_name = market_ctx.get("market")
        state_name = market_ctx.get("state")
        district_name = market_ctx.get("district")

        def lookup_key(crop: Any, market: Any, state: Any) -> tuple[str, str, str]:
            return tuple(str(value or "").strip().casefold() for value in (crop, market, state))

        precomputed = {}
        for entry in precomputed_market_results or []:
            if isinstance(entry, dict) and isinstance(entry.get("query"), dict) and isinstance(entry.get("result"), dict):
                query = entry["query"]
                precomputed[lookup_key(query.get("crop"), query.get("market"), query.get("state"))] = entry["result"]

        evaluated_candidates = []

        for cand in candidates:
            crop_name = cand["crop"].strip()
            prob = float(cand.get("probability", cand.get("confidence")))
            agronomic_signal = round(prob, 4)

            # Query Market Engine if available
            market_res = None
            cached_result = precomputed.get(lookup_key(crop_name, market_name, state_name))
            if cached_result is not None:
                market_res = cached_result
            elif self.market_engine is not None:
                try:
                    market_res = self.market_engine.analyze_market(
                        crop=crop_name,
                        market=market_name,
                        state=state_name
                    )
                except Exception:
                    market_res = None

            if market_res and market_res.get("data_available") and market_res.get("market_score") is not None:
                market_score_100 = float(market_res["market_score"])
                market_signal = round(market_score_100 / 100.0, 4)
                market_trend = market_res.get("trend", "Unavailable")
                current_price = market_res.get("current_price")
                market_source = market_res.get("raw_source")
                market_record_date = market_res.get("latest_date")
                price_range = market_res.get("price_range") or {}
                price_unit = price_range.get("unit", "INR/Quintal")
                market_data_available = True

                # Weighted Combined Score
                combined_score = round(
                    (agronomic_weight * agronomic_signal) + (market_weight * market_signal),
                    4
                )
                explanation = (
                    f"Ranked using model confidence {agronomic_signal:.2f} (weight {agronomic_weight}) and "
                    f"{market_trend.lower()} market signal {market_signal:.2f} (weight {market_weight}). "
                    f"Combined score: {combined_score:.4f}."
                )
            else:
                # Missing Market Data Fallback Policy:
                # Combined score is based on agronomic confidence directly without artificial 0-penalty.
                market_signal = None
                market_trend = "Unavailable"
                current_price = None
                market_source = None
                market_record_date = None
                price_unit = None
                market_data_available = False

                combined_score = agronomic_signal
                explanation = (
                    f"Market data unavailable for '{crop_name}' in target market. "
                    f"Ranked on model confidence {agronomic_signal:.2f} alone (fallback policy). "
                    f"Combined score: {combined_score:.4f}."
                )

            evaluated_candidates.append({
                "crop": crop_name,
                "agronomic_signal": agronomic_signal,
                "market_signal": market_signal,
                "combined_score": combined_score,
                "market_data_available": market_data_available,
                "market_trend": market_trend,
                "current_price": current_price,
                "price_unit": price_unit,
                "market_source": market_source,
                "market_record_date": market_record_date,
                "explanation": explanation
            })

        # Deterministic sorting:
        # 1. Combined score descending
        # 2. Agronomic signal descending (tie-breaker)
        # 3. Alphabetical crop name ascending (tie-breaker)
        evaluated_candidates.sort(
            key=lambda x: (-x["combined_score"], -x["agronomic_signal"], x["crop"].lower())
        )

        # Assign 1-indexed ranks
        ranked_crops = []
        for rank_idx, item in enumerate(evaluated_candidates, start=1):
            item_with_rank = {"rank": rank_idx, **item}
            ranked_crops.append(item_with_rank)

        return {
            "status": "SUCCESS",
            "ranked_crops": ranked_crops,
            "weights": {
                "agronomic": agronomic_weight,
                "market": market_weight
            },
            "market_context": {
                "market": market_name,
                "state": state_name,
                "district": district_name
            },
            "missing_market_data_policy": self.config.get(
                "missing_market_data_policy", {}
            ).get("policy", "FALLBACK_AGRONOMIC_PRIMARY"),
            "disclaimer": self.config.get("disclaimer", "")
        }
