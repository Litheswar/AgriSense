"""Market Intelligence Engine for AgriSense (Phase 1F - Milestone 15).

Analyzes normalized agricultural market data to determine current prices, price ranges,
transparent deterministic price trends, and a prototype market signal score for crop ranking.
"""

import json
import os
from typing import Dict, Any, List, Optional

try:
    from backend.models.market.providers.market_provider import (
        BaseMarketProvider,
        NormalizedMarketRecord,
        MarketDataError,
    )
except ImportError:
    from providers.market_provider import (
        BaseMarketProvider,
        NormalizedMarketRecord,
        MarketDataError,
    )


class MarketEngine:
    """Transparent, deterministic Market Intelligence Engine."""

    def __init__(
        self,
        provider: BaseMarketProvider,
        config_path: Optional[str] = None,
        custom_config: Optional[Dict[str, Any]] = None
    ):
        self.provider = provider
        self.config = self._load_config(config_path, custom_config)

    def _load_config(
        self,
        config_path: Optional[str],
        custom_config: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Load configuration from file or use defaults."""
        if custom_config is not None:
            return custom_config

        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, "config", "market_config.json")

        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                raise MarketDataError(f"Failed to load market config file from {config_path}: {e}")

        # Fallback default configuration
        return {
            "status": "PROTOTYPE_ASSUMPTION",
            "analysis_parameters": {
                "trend_threshold_percent": 5.0,
                "min_history_points_for_trend": 2,
                "default_currency": "INR",
                "supported_units": ["INR/Quintal", "INR/kg", "INR/Ton"]
            },
            "market_score_parameters": {
                "base_score": 50.0,
                "trend_bonus": {
                    "Increasing": 25.0,
                    "Stable": 10.0,
                    "Decreasing": -25.0,
                    "Unavailable": 0.0
                },
                "score_range": {"min": 0.0, "max": 100.0},
                "disclaimer": "Market score is a heuristic prototype decision signal for crop ranking. It is NOT an economic probability or future price forecast."
            }
        }

    def analyze_market(
        self,
        crop: str,
        market: Optional[str] = None,
        state: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze market data for a given crop, market, and state.
        
        Args:
            crop: Name of the agricultural commodity (e.g., 'Tomato', 'Wheat')
            market: Specific mandi / market name (optional)
            state: State name (optional)
            
        Returns:
            Structured dictionary containing current price, price range, trend, price change %, and market score.
        """
        if not crop or not isinstance(crop, str) or not crop.strip():
            raise MarketDataError("A non-empty crop name must be provided for market analysis.")

        crop_clean = crop.strip()
        records = self.provider.get_records(crop=crop_clean, market=market, state=state)

        # Handle missing data
        if not records:
            return {
                "status": "UNAVAILABLE",
                "crop": crop_clean,
                "market": market,
                "state": state,
                "data_available": False,
                "message": f"No market data available for crop '{crop_clean}'" + (f" in market '{market}'" if market else "") + ".",
                "current_price": None,
                "price_range": None,
                "trend": "Unavailable",
                "price_change_percent": None,
                "market_score": None,
                "history_points": 0,
                "disclaimer": self.config.get("market_score_parameters", {}).get("disclaimer", "")
            }

        # Records are sorted chronologically by provider
        latest_record = records[-1]
        analysis_params = self.config.get("analysis_parameters", {})
        min_history_points = analysis_params.get("min_history_points_for_trend", 2)
        trend_threshold = analysis_params.get("trend_threshold_percent", 5.0)

        # Calculate Price Trend
        trend, change_pct, trend_reason = self._calculate_trend(records, min_history_points, trend_threshold)

        # Calculate Heuristic Market Score
        market_score = self._calculate_market_score(trend)

        return {
            "status": "SUCCESS",
            "crop": latest_record.crop,
            "market": latest_record.market,
            "state": latest_record.state,
            "district": latest_record.district,
            "data_available": True,
            "latest_date": latest_record.date,
            "current_price": latest_record.modal_price,
            "price_range": {
                "min_price": latest_record.min_price,
                "max_price": latest_record.max_price,
                "modal_price": latest_record.modal_price,
                "unit": latest_record.unit
            },
            "trend": trend,
            "price_change_percent": change_pct,
            "trend_reason": trend_reason,
            "market_score": market_score,
            "history_points": len(records),
            "raw_source": latest_record.raw_source,
            "disclaimer": self.config.get("market_score_parameters", {}).get("disclaimer", "")
        }

    def _calculate_trend(
        self,
        records: List[NormalizedMarketRecord],
        min_history_points: int,
        trend_threshold: float
    ) -> tuple[str, Optional[float], str]:
        """Deterministic price trend calculation comparing historical records."""
        if len(records) < min_history_points:
            return (
                "Unavailable",
                None,
                f"Insufficient historical data: {len(records)} record(s) available, minimum {min_history_points} required."
            )

        earliest = records[0]
        latest = records[-1]

        if earliest.modal_price <= 0:
            return (
                "Unavailable",
                None,
                f"Base price from {earliest.date} is non-positive ({earliest.modal_price}), cannot calculate relative change."
            )

        change_pct = round(((latest.modal_price - earliest.modal_price) / earliest.modal_price) * 100.0, 2)

        if change_pct > trend_threshold:
            trend = "Increasing"
            reason = f"Modal price increased by {change_pct:+0.2f}% from {earliest.modal_price} to {latest.modal_price} {latest.unit} ({earliest.date} to {latest.date})."
        elif change_pct < -trend_threshold:
            trend = "Decreasing"
            reason = f"Modal price decreased by {change_pct:+0.2f}% from {earliest.modal_price} to {latest.modal_price} {latest.unit} ({earliest.date} to {latest.date})."
        else:
            trend = "Stable"
            reason = f"Modal price changed by {change_pct:+0.2f}% (within ±{trend_threshold}% stability threshold) between {earliest.date} and {latest.date}."

        return trend, change_pct, reason

    def _calculate_market_score(self, trend: str) -> float:
        """Calculate a prototype market signal score for crop ranking."""
        score_params = self.config.get("market_score_parameters", {})
        base_score = float(score_params.get("base_score", 50.0))
        trend_bonuses = score_params.get("trend_bonus", {
            "Increasing": 25.0,
            "Stable": 10.0,
            "Decreasing": -25.0,
            "Unavailable": 0.0
        })
        bonus = float(trend_bonuses.get(trend, 0.0))
        raw_score = base_score + bonus

        score_range = score_params.get("score_range", {"min": 0.0, "max": 100.0})
        min_score = float(score_range.get("min", 0.0))
        max_score = float(score_range.get("max", 100.0))

        return max(min_score, min(max_score, raw_score))
