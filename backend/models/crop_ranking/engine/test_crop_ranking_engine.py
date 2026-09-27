"""AgriSense — Crop Ranking Decision Engine Unit & Integration Test Suite (Milestone 16).

Verifies:
1. Normal ranking combining agronomic and market signals.
2. Agronomic signal dominance under heavy agronomic weighting.
3. Market signal altering rank order compared to agronomic signal alone.
4. Missing market data fallback (no artificial 0-penalty).
5. Location-aware market filtering (market/state).
6. Deterministic tie-breaking on identical scores.
7. Validation of invalid probability values (> 1.0 or < 0.0).
8. Validation of invalid weights (sum != 1.0 or negative).
9. Validation of empty candidate lists.
10. Fallback behavior when all market data is unavailable.
11. Complete Integration Test: CropRecommender (Random Forest) -> Local MarketEngine -> CropRankingEngine.
"""

import os
import sys
import json

# Ensure UTF-8 output across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.models.market.providers.market_provider import LocalMarketDataProvider
from backend.models.market.engine.market_engine import MarketEngine
from backend.models.crop_ranking.engine.crop_ranking_engine import (
    CropRankingEngine,
    CropRankingInputError
)
from backend.models.crop_recommendation.inference.predict import CropRecommender


def test_suite():
    passed = 0
    failed = 0
    total = 12

    print("=" * 80)
    print("AGRISENSE CROP RANKING ENGINE — UNIT & INTEGRATION TEST SUITE (MILESTONE 16)")
    print("=" * 80)

    # Setup standard mock local market engine
    mock_market_data = [
        # Tomato in Kolar: Increasing trend (+15%), market_score = 75.0
        {"crop": "Tomato", "market": "Kolar", "state": "Karnataka", "date": "2026-09-01", "min_price": 100, "max_price": 120, "modal_price": 100, "unit": "INR/Quintal"},
        {"crop": "Tomato", "market": "Kolar", "state": "Karnataka", "date": "2026-09-10", "min_price": 110, "max_price": 130, "modal_price": 115, "unit": "INR/Quintal"},
        # Potato in Kolar: Decreasing trend (-16.7%), market_score = 25.0
        {"crop": "Potato", "market": "Kolar", "state": "Karnataka", "date": "2026-09-01", "min_price": 110, "max_price": 130, "modal_price": 120, "unit": "INR/Quintal"},
        {"crop": "Potato", "market": "Kolar", "state": "Karnataka", "date": "2026-09-10", "min_price": 90, "max_price": 110, "modal_price": 100, "unit": "INR/Quintal"},
        # Maize in Kolar: Stable trend (+2%), market_score = 60.0
        {"crop": "Maize", "market": "Kolar", "state": "Karnataka", "date": "2026-09-01", "min_price": 95, "max_price": 105, "modal_price": 100, "unit": "INR/Quintal"},
        {"crop": "Maize", "market": "Kolar", "state": "Karnataka", "date": "2026-09-10", "min_price": 96, "max_price": 106, "modal_price": 102, "unit": "INR/Quintal"},
        # Tomato in Azadpur (Delhi): Stable trend, modal 2500
        {"crop": "Tomato", "market": "Azadpur", "state": "Delhi", "date": "2026-09-10", "min_price": 2400, "max_price": 2600, "modal_price": 2500, "unit": "INR/Quintal"}
    ]
    provider = LocalMarketDataProvider(in_memory_records=mock_market_data)
    market_engine = MarketEngine(provider=provider)

    # Test 1: Normal ranking with multiple candidates
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [
            {"crop": "Tomato", "probability": 0.60},
            {"crop": "Maize", "probability": 0.30},
            {"crop": "Potato", "probability": 0.10}
        ]
        res = engine.rank_candidates(candidates, market_context={"market": "Kolar", "state": "Karnataka"})

        assert res["status"] == "SUCCESS"
        assert len(res["ranked_crops"]) == 3
        assert res["ranked_crops"][0]["crop"] == "Tomato"
        assert res["ranked_crops"][0]["rank"] == 1
        # Tomato: 0.7*0.60 + 0.3*0.75 = 0.42 + 0.225 = 0.6450
        assert res["ranked_crops"][0]["combined_score"] == 0.6450
        print("  [PASS] Test 1: Normal ranking evaluated multi-criteria candidates successfully.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 1: {e}")
        failed += 1

    # Test 2: Agronomic signal dominates under heavy agronomic weighting
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [
            {"crop": "Potato", "probability": 0.90},  # market_signal = 0.25 (decreasing)
            {"crop": "Tomato", "probability": 0.10}   # market_signal = 0.75 (increasing)
        ]
        # Weights: 0.9 agronomic, 0.1 market
        # Potato: 0.9*0.90 + 0.1*0.25 = 0.81 + 0.025 = 0.835
        # Tomato: 0.9*0.10 + 0.1*0.75 = 0.09 + 0.075 = 0.165
        res = engine.rank_candidates(
            candidates,
            market_context={"market": "Kolar", "state": "Karnataka"},
            custom_weights={"agronomic": 0.9, "market": 0.1}
        )
        assert res["ranked_crops"][0]["crop"] == "Potato"
        assert res["ranked_crops"][0]["combined_score"] == 0.8350
        print("  [PASS] Test 2: Heavy agronomic weighting ensures agronomic signal dominance.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 2: {e}")
        failed += 1

    # Test 3: Market signal changes ranking order
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [
            {"crop": "Potato", "probability": 0.40},  # Agronomic rank #1, market_signal = 0.25 (decreasing)
            {"crop": "Tomato", "probability": 0.38}   # Agronomic rank #2, market_signal = 0.75 (increasing)
        ]
        # Weights: 0.7 agronomic, 0.3 market
        # Potato: 0.7*0.40 + 0.3*0.25 = 0.280 + 0.075 = 0.3550
        # Tomato: 0.7*0.38 + 0.3*0.75 = 0.266 + 0.225 = 0.4910
        res = engine.rank_candidates(
            candidates,
            market_context={"market": "Kolar", "state": "Karnataka"},
            custom_weights={"agronomic": 0.7, "market": 0.3}
        )
        assert res["ranked_crops"][0]["crop"] == "Tomato"
        assert res["ranked_crops"][0]["combined_score"] == 0.4910
        assert res["ranked_crops"][1]["crop"] == "Potato"
        assert res["ranked_crops"][1]["combined_score"] == 0.3550
        print("  [PASS] Test 3: Market signal successfully changed ranking order (Tomato flipped Potato).")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 3: {e}")
        failed += 1

    # Test 4: Missing market data fallback (no artificial 0 penalty)
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [
            {"crop": "Lentil", "probability": 0.55}  # No market data in mock
        ]
        res = engine.rank_candidates(candidates, market_context={"market": "Kolar", "state": "Karnataka"})
        assert res["ranked_crops"][0]["market_data_available"] is False
        assert res["ranked_crops"][0]["market_signal"] is None
        assert res["ranked_crops"][0]["combined_score"] == 0.5500  # Equal to agronomic signal, not 0.7*0.55 + 0 = 0.385
        assert "fallback policy" in res["ranked_crops"][0]["explanation"]
        print("  [PASS] Test 4: Missing market data uses transparent agronomic fallback without zero-penalty.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 4: {e}")
        failed += 1

    # Test 5: Location filtering isolation
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [{"crop": "Tomato", "probability": 0.50}]
        
        res_kolar = engine.rank_candidates(candidates, market_context={"market": "Kolar", "state": "Karnataka"})
        res_delhi = engine.rank_candidates(candidates, market_context={"market": "Azadpur", "state": "Delhi"})

        assert res_kolar["ranked_crops"][0]["market_trend"] == "Increasing"
        assert res_delhi["ranked_crops"][0]["market_trend"] == "Unavailable"  # Only 1 observation in Azadpur mock
        print("  [PASS] Test 5: Location context correctly routes market analysis per mandi/state.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 5: {e}")
        failed += 1

    # Test 6: Deterministic tie-breaking
    try:
        engine = CropRankingEngine(market_engine=None)  # No market engine, pure agronomic
        candidates = [
            {"crop": "Wheat", "probability": 0.50},
            {"crop": "Barley", "probability": 0.50}
        ]
        res = engine.rank_candidates(candidates)
        # Equal score: tie-breaker is alphabetical crop name -> Barley before Wheat
        assert res["ranked_crops"][0]["crop"] == "Barley"
        assert res["ranked_crops"][1]["crop"] == "Wheat"
        print("  [PASS] Test 6: Deterministic tie-breaking resolves identical scores cleanly.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 6: {e}")
        failed += 1

    # Test 7: Invalid probability validation
    try:
        engine = CropRankingEngine()
        bad_candidates = [{"crop": "Tomato", "probability": 1.5}]
        try:
            engine.rank_candidates(bad_candidates)
            print("  [FAIL] Test 7: Expected CropRankingInputError on prob > 1.0, but none was raised.")
            failed += 1
        except CropRankingInputError:
            print("  [PASS] Test 7: Invalid probability (> 1.0) raises CropRankingInputError as required.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 7: {e}")
        failed += 1

    # Test 8: Invalid weights validation
    try:
        engine = CropRankingEngine()
        candidates = [{"crop": "Tomato", "probability": 0.5}]
        try:
            engine.rank_candidates(candidates, custom_weights={"agronomic": 0.8, "market": 0.5})
            print("  [FAIL] Test 8: Expected CropRankingInputError on sum(weights) > 1.0, but none was raised.")
            failed += 1
        except CropRankingInputError:
            print("  [PASS] Test 8: Invalid weights (sum != 1.0) raises CropRankingInputError as required.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 8: {e}")
        failed += 1

    # Test 9: Empty candidate list validation
    try:
        engine = CropRankingEngine()
        try:
            engine.rank_candidates([])
            print("  [FAIL] Test 9: Expected CropRankingInputError on empty candidates, but none was raised.")
            failed += 1
        except CropRankingInputError:
            print("  [PASS] Test 9: Empty candidate list raises CropRankingInputError as required.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 9: {e}")
        failed += 1

    # Test 10: No market data for any candidate
    try:
        engine = CropRankingEngine(market_engine=market_engine)
        candidates = [
            {"crop": "Jute", "probability": 0.70},
            {"crop": "Coffee", "probability": 0.30}
        ]
        res = engine.rank_candidates(candidates, market_context={"market": "Kolar", "state": "Karnataka"})
        assert res["ranked_crops"][0]["crop"] == "Jute"
        assert res["ranked_crops"][0]["combined_score"] == 0.7000
        assert res["ranked_crops"][1]["crop"] == "Coffee"
        assert res["ranked_crops"][1]["combined_score"] == 0.3000
        print("  [PASS] Test 10: All candidates with missing market data handled gracefully via fallback policy.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 10: {e}")
        failed += 1

    # Test 11: End-to-End Integration Test (CropRecommender RF -> MarketEngine -> CropRankingEngine)
    try:
        recommender = CropRecommender()
        # Realistic soil input (high N, P, K suitable for rice or maize)
        raw_soil_input = {
            "N": 90.0,
            "P": 42.0,
            "K": 43.0,
            "temperature": 20.87,
            "humidity": 82.0,
            "ph": 6.5,
            "rainfall": 202.9
        }
        pred_output = recommender.predict(raw_soil_input)
        assert "predicted_crop" in pred_output
        assert "top_3" in pred_output
        assert len(pred_output["top_3"]) == 3

        # Feed real model output into RankingEngine
        engine = CropRankingEngine(market_engine=market_engine)
        ranking_output = engine.rank_crops(
            crop_recommendation_output=pred_output,
            market_context={"market": "Kolar", "state": "Karnataka"}
        )

        assert ranking_output["status"] == "SUCCESS"
        assert len(ranking_output["ranked_crops"]) == 3
        assert ranking_output["ranked_crops"][0]["rank"] == 1
        assert 0.0 <= ranking_output["ranked_crops"][0]["combined_score"] <= 1.0
        print("  [PASS] Test 11: Complete End-to-End pipeline (CropRecommender RF -> MarketEngine -> CropRankingEngine) passed.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 11: {e}")
        failed += 1

    # Test 12: Reuse the Composite Evaluation market result for an identical crop/context.
    try:
        class CountingMarketEngine:
            def __init__(self, wrapped):
                self.wrapped = wrapped
                self.calls = []
            def analyze_market(self, crop, market=None, state=None):
                self.calls.append((crop, market, state))
                return self.wrapped.analyze_market(crop=crop, market=market, state=state)

        counting = CountingMarketEngine(market_engine)
        cached = market_engine.analyze_market(crop="Tomato", market="Kolar", state="Karnataka")
        engine = CropRankingEngine(market_engine=counting)
        result = engine.rank_candidates(
            [{"crop": "Tomato", "probability": 0.9}, {"crop": "Potato", "probability": 0.6}],
            market_context={"market": "Kolar", "state": "Karnataka"},
            precomputed_market_results=[{
                "query": {"crop": "Tomato", "market": "Kolar", "state": "Karnataka"},
                "result": cached
            }]
        )
        assert counting.calls == [("Potato", "Kolar", "Karnataka")], counting.calls
        tomato = next(item for item in result["ranked_crops"] if item["crop"] == "Tomato")
        assert tomato["market_data_available"] is True
        print("  [PASS] Test 12: Reused matching composite market result; only distinct candidate queried the provider.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 12: {e}")
        failed += 1

    print("=" * 80)
    print(f"TEST SUMMARY: {passed}/{total} PASSED, {failed}/{total} FAILED")
    print("=" * 80)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    test_suite()
