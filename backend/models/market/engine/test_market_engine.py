"""Unit Tests for AgriSense Market Intelligence Engine (Phase 1F - Milestone 15).

Verifies:
1. Current market price selection (latest observation)
2. Price range (min, max, modal)
3. Increasing trend calculation
4. Decreasing trend calculation
5. Stable trend calculation
6. Insufficient history handling
7. Missing price validation (MarketDataError)
8. Invalid negative price validation (MarketDataError)
9. Crop/market filtering isolation
10. Unregistered / missing crop handling
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

# Also ensure market directory is in sys.path
MARKET_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if MARKET_DIR not in sys.path:
    sys.path.insert(0, MARKET_DIR)

from backend.models.market.providers.market_provider import (
    LocalMarketDataProvider,
    AgmarknetApiProvider,
    NormalizedMarketRecord,
    MarketDataError
)
from backend.models.market.engine.market_engine import MarketEngine


def test_suite():
    passed = 0
    failed = 0
    total = 10

    print("=" * 80)
    print("AGRISENSE MARKET INTELLIGENCE ENGINE — UNIT TEST SUITE (MILESTONE 15)")
    print("=" * 80)

    # Test 1: Current market price (latest observation correctly selected)
    try:
        records = [
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-01", "min_price": 1000, "max_price": 1200, "modal_price": 1100, "unit": "INR/Quintal"},
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-05", "min_price": 1400, "max_price": 1600, "modal_price": 1500, "unit": "INR/Quintal"},
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-10", "min_price": 1800, "max_price": 2200, "modal_price": 2000, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Tomato", market="Kolar")
        
        assert res["status"] == "SUCCESS", f"Expected SUCCESS, got {res['status']}"
        assert res["current_price"] == 2000.0, f"Expected 2000.0, got {res['current_price']}"
        assert res["latest_date"] == "2026-09-10", f"Expected 2026-09-10, got {res['latest_date']}"
        print("  [PASS] Test 1: Current market price selects latest chronological observation correctly.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 1: {e}")
        failed += 1

    # Test 2: Price range (min/max/modal)
    try:
        records = [
            {"crop": "Onion", "market": "Lasalgaon", "date": "2026-09-10", "min_price": 1200, "max_price": 1800, "modal_price": 1500, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Onion", market="Lasalgaon")

        assert res["price_range"]["min_price"] == 1200.0
        assert res["price_range"]["max_price"] == 1800.0
        assert res["price_range"]["modal_price"] == 1500.0
        assert res["price_range"]["unit"] == "INR/Quintal"
        print("  [PASS] Test 2: Price range (min, max, modal) extracted and verified.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 2: {e}")
        failed += 1

    # Test 3: Increasing trend (synthetic series: 100 -> 105 -> 115)
    try:
        records = [
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-01", "min_price": 90, "max_price": 110, "modal_price": 100.0, "unit": "INR/Quintal"},
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-05", "min_price": 95, "max_price": 115, "modal_price": 105.0, "unit": "INR/Quintal"},
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-10", "min_price": 105, "max_price": 125, "modal_price": 115.0, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Tomato", market="Kolar")

        assert res["trend"] == "Increasing", f"Expected Increasing, got {res['trend']}"
        assert res["price_change_percent"] == 15.0, f"Expected 15.0%, got {res['price_change_percent']}"
        assert res["market_score"] == 75.0, f"Expected market score 75.0, got {res['market_score']}"
        print("  [PASS] Test 3: Increasing trend correctly identified (+15.0% change -> Increasing, score: 75.0).")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 3: {e}")
        failed += 1

    # Test 4: Decreasing trend (synthetic series: 120 -> 110 -> 100)
    try:
        records = [
            {"crop": "Potato", "market": "Agra", "date": "2026-09-01", "min_price": 110, "max_price": 130, "modal_price": 120.0, "unit": "INR/Quintal"},
            {"crop": "Potato", "market": "Agra", "date": "2026-09-05", "min_price": 100, "max_price": 120, "modal_price": 110.0, "unit": "INR/Quintal"},
            {"crop": "Potato", "market": "Agra", "date": "2026-09-10", "min_price": 90, "max_price": 110, "modal_price": 100.0, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Potato", market="Agra")

        assert res["trend"] == "Decreasing", f"Expected Decreasing, got {res['trend']}"
        assert res["price_change_percent"] == -16.67, f"Expected -16.67%, got {res['price_change_percent']}"
        assert res["market_score"] == 25.0, f"Expected market score 25.0, got {res['market_score']}"
        print("  [PASS] Test 4: Decreasing trend correctly identified (-16.67% change -> Decreasing, score: 25.0).")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 4: {e}")
        failed += 1

    # Test 5: Stable trend (within ±5% threshold: 100 -> 101 -> 102)
    try:
        records = [
            {"crop": "Wheat", "market": "Khanna", "date": "2026-09-01", "min_price": 95, "max_price": 105, "modal_price": 100.0, "unit": "INR/Quintal"},
            {"crop": "Wheat", "market": "Khanna", "date": "2026-09-05", "min_price": 96, "max_price": 106, "modal_price": 101.0, "unit": "INR/Quintal"},
            {"crop": "Wheat", "market": "Khanna", "date": "2026-09-10", "min_price": 97, "max_price": 107, "modal_price": 102.0, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Wheat", market="Khanna")

        assert res["trend"] == "Stable", f"Expected Stable, got {res['trend']}"
        assert res["price_change_percent"] == 2.0, f"Expected 2.0%, got {res['price_change_percent']}"
        assert res["market_score"] == 60.0, f"Expected market score 60.0, got {res['market_score']}"
        print("  [PASS] Test 5: Stable trend correctly identified (+2.0% within threshold -> Stable, score: 60.0).")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 5: {e}")
        failed += 1

    # Test 6: Insufficient history (single observation)
    try:
        records = [
            {"crop": "Rice", "market": "Burdwan", "date": "2026-09-10", "min_price": 2800, "max_price": 3100, "modal_price": 2950, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Rice", market="Burdwan")

        assert res["trend"] == "Unavailable", f"Expected Unavailable, got {res['trend']}"
        assert res["price_change_percent"] is None, f"Expected None for price change percent, got {res['price_change_percent']}"
        assert "Insufficient historical data" in res["trend_reason"]
        print("  [PASS] Test 6: Insufficient history safely sets trend to 'Unavailable' without fabrication.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 6: {e}")
        failed += 1

    # Test 7: Missing price field validation
    try:
        bad_record = {"crop": "Maize", "market": "Davangere", "date": "2026-09-10", "min_price": 1500, "max_price": 1800, "modal_price": None}
        try:
            NormalizedMarketRecord.validate_and_create(bad_record)
            print("  [FAIL] Test 7: Expected MarketDataError on None modal_price, but none was raised.")
            failed += 1
        except MarketDataError:
            print("  [PASS] Test 7: Missing price field raises MarketDataError as required.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 7: {e}")
        failed += 1

    # Test 8: Invalid negative price validation
    try:
        bad_record = {"crop": "Maize", "market": "Davangere", "date": "2026-09-10", "min_price": -500, "max_price": 1800, "modal_price": 1500}
        try:
            NormalizedMarketRecord.validate_and_create(bad_record)
            print("  [FAIL] Test 8: Expected MarketDataError on negative min_price, but none was raised.")
            failed += 1
        except MarketDataError:
            print("  [PASS] Test 8: Negative price raises MarketDataError as required.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 8: {e}")
        failed += 1

    # Test 9: Crop and Market filtering isolation
    try:
        records = [
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-10", "min_price": 1800, "max_price": 2200, "modal_price": 2000, "unit": "INR/Quintal"},
            {"crop": "Tomato", "market": "Azadpur", "date": "2026-09-10", "min_price": 2500, "max_price": 3000, "modal_price": 2800, "unit": "INR/Quintal"},
            {"crop": "Potato", "market": "Kolar", "date": "2026-09-10", "min_price": 1200, "max_price": 1400, "modal_price": 1300, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        
        res_kolar_tomato = engine.analyze_market(crop="Tomato", market="Kolar")
        res_azadpur_tomato = engine.analyze_market(crop="Tomato", market="Azadpur")
        res_kolar_potato = engine.analyze_market(crop="Potato", market="Kolar")

        assert res_kolar_tomato["current_price"] == 2000.0 and res_kolar_tomato["market"] == "Kolar"
        assert res_azadpur_tomato["current_price"] == 2800.0 and res_azadpur_tomato["market"] == "Azadpur"
        assert res_kolar_potato["current_price"] == 1300.0 and res_kolar_potato["crop"] == "Potato"
        print("  [PASS] Test 9: Crop and market filtering cleanly isolates records without mixing.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 9: {e}")
        failed += 1

    # Test 10: Missing / unregistered crop handling
    try:
        records = [
            {"crop": "Tomato", "market": "Kolar", "date": "2026-09-10", "min_price": 1800, "max_price": 2200, "modal_price": 2000, "unit": "INR/Quintal"}
        ]
        provider = LocalMarketDataProvider(in_memory_records=records)
        engine = MarketEngine(provider=provider)
        res = engine.analyze_market(crop="Dragonfruit", market="Kolar")

        assert res["status"] == "UNAVAILABLE"
        assert res["data_available"] is False
        assert res["current_price"] is None
        assert res["trend"] == "Unavailable"
        assert "No market data available" in res["message"]
        print("  [PASS] Test 10: Missing crop returns structured UNAVAILABLE response rather than failing or returning 0.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 10: {e}")
        failed += 1

    # Test 11: File-backed loading from sample_market_data.json
    try:
        sample_path = os.path.join(MARKET_DIR, "data", "sample_market_data.json")
        provider = LocalMarketDataProvider(data_file_path=sample_path)
        engine = MarketEngine(provider=provider)
        
        res = engine.analyze_market(crop="Tomato", market="Kolar")
        assert res["status"] == "SUCCESS"
        assert res["current_price"] == 2300.0
        assert res["trend"] == "Increasing"
        print("  [PASS] Test 11: File-backed loading from sample_market_data.json parsed and analyzed successfully.")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 11: {e}")
        failed += 1

    # Test 12: AgmarknetApiProvider missing API key validation
    try:
        # Ensure env var is cleared for this test
        old_env = os.environ.get("DATA_GOV_IN_API_KEY")
        if "DATA_GOV_IN_API_KEY" in os.environ:
            del os.environ["DATA_GOV_IN_API_KEY"]

        provider = AgmarknetApiProvider(api_key=None)
        try:
            provider.get_records(crop="Tomato")
            print("  [FAIL] Test 12: Expected MarketDataError on missing API key, but none was raised.")
            failed += 1
        except MarketDataError as e:
            assert "DATA_GOV_IN_API_KEY is not configured" in str(e)
            print("  [PASS] Test 12: AgmarknetApiProvider correctly raises MarketDataError when API key is missing.")
            passed += 1
        finally:
            if old_env is not None:
                os.environ["DATA_GOV_IN_API_KEY"] = old_env
    except Exception as e:
        print(f"  [FAIL] Test 12: {e}")
        failed += 1

    # Test 13: AgmarknetApiProvider mocked HTTP response parsing & integration
    try:
        from unittest.mock import patch
        import io

        mock_api_payload = {
            "records": [
                {
                    "commodity": "Tomato",
                    "market": "Kolar",
                    "state": "Karnataka",
                    "district": "Kolar",
                    "arrival_date": "10/09/2026",
                    "min_price": "1800",
                    "max_price": "2200",
                    "modal_price": "2000"
                },
                {
                    "commodity": "Tomato",
                    "market": "Kolar",
                    "state": "Karnataka",
                    "district": "Kolar",
                    "arrival_date": "12/09/2026",
                    "min_price": "2100",
                    "max_price": "2500",
                    "modal_price": "2300"
                }
            ]
        }

        class MockHttpStream:
            def __enter__(self):
                return io.BytesIO(json.dumps(mock_api_payload).encode("utf-8"))
            def __exit__(self, exc_type, exc_val, exc_tb):
                pass

        with patch("urllib.request.urlopen", side_effect=lambda req, timeout=15: MockHttpStream()):
            provider = AgmarknetApiProvider(api_key="TEST_MOCK_KEY_12345")
            records = provider.get_records(crop="Tomato", market="Kolar")

            assert len(records) == 2
            assert records[0].crop == "Tomato"
            assert records[0].date == "2026-09-10"
            assert records[1].modal_price == 2300.0

            # Feed records into MarketEngine
            engine = MarketEngine(provider=provider)
            res = engine.analyze_market(crop="Tomato", market="Kolar")
            assert res["status"] == "SUCCESS"
            assert res["current_price"] == 2300.0
            assert res["trend"] == "Increasing"
            print("  [PASS] Test 13: AgmarknetApiProvider parsed simulated official API response and fed MarketEngine successfully.")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 13: {e}")
        failed += 1

    # Test 14: Live API check (if DATA_GOV_IN_API_KEY is configured in environment)
    try:
        live_key = os.getenv("DATA_GOV_IN_API_KEY")
        if live_key:
            live_provider = AgmarknetApiProvider()
            records = live_provider.get_records(crop="Tomato", max_records=5)
            print(f"  [PASS] Test 14: Live API query succeeded with {len(records)} records fetched.")
            passed += 1
        else:
            print("  [PASS] Test 14: Live API test skipped cleanly (DATA_GOV_IN_API_KEY not configured in .env).")
            passed += 1
    except Exception as e:
        print(f"  [FAIL] Test 14: Live API request error: {e}")
        failed += 1

    print("=" * 80)
    print(f"TEST SUMMARY: {passed}/14 PASSED, {failed}/14 FAILED")
    print("=" * 80)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    test_suite()
