import os
import sys

# Ensure UTF-8 output across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from irrigation_engine import IrrigationEngine, IrrigationInputError

def run_tests():
    print("=" * 80)
    print("AGRISENSE — IRRIGATION ENGINE TESTS")
    print("=" * 80)

    try:
        engine = IrrigationEngine()
        print("[System] Engine loaded successfully with configuration status:", engine.config.get("status"))
    except Exception as e:
        print(f"[System] Failed to initialize engine: {e}")
        return

    # --- VALID TEST CASES ---
    
    test_cases = [
        {
            "name": "Test 1 — Dry soil + no meaningful rain",
            "expected_decision": True,
            "data": {
                "crop": "Tomato",
                "growth_stage": "Flowering",
                "soil_moisture": 25.0, # Dry (<30)
                "temperature": 28.0,
                "humidity": 55.0,
                "rain_probability": 20.0, # No meaningful rain
                "expected_rainfall": 0.0
            }
        },
        {
            "name": "Test 2 — Adequate soil moisture",
            "expected_decision": False,
            "data": {
                "crop": "Potato",
                "growth_stage": "Tuber Initiation",
                "soil_moisture": 50.0, # Adequate (30-60)
                "temperature": 22.0,
                "humidity": 65.0,
                "rain_probability": 10.0,
                "expected_rainfall": 0.0
            }
        },
        {
            "name": "Test 3 — Dry soil + substantial expected rainfall",
            "expected_decision": False,
            "data": {
                "crop": "Corn (maize)",
                "growth_stage": "Vegetative",
                "soil_moisture": 28.0, # Dry (<30)
                "temperature": 25.0,
                "humidity": 80.0,
                "rain_probability": 85.0, # Meaningful rain (>60)
                "expected_rainfall": 15.0 # Substantial rain (>5mm)
            }
        },
        {
            "name": "Test 4 — Different crop/growth stage (High environmental demand)",
            "expected_decision": True,
            "data": {
                "crop": "Wheat",
                "growth_stage": "Booting",
                "soil_moisture": 20.0, # Dry
                "temperature": 38.0, # High temp (>35)
                "humidity": 30.0, # Low humidity (<40)
                "rain_probability": 0.0,
                "expected_rainfall": 0.0
            }
        }
    ]

    print("\n--- 1. VALID DECISION TESTS ---")
    for case in test_cases:
        print(f"\n[{case['name']}]")
        try:
            result = engine.get_recommendation(case["data"])
            
            decision = result["irrigation_required"]
            passed = (decision == case["expected_decision"])
            status_str = "PASS" if passed else "FAIL"
            
            print(f"  [ {status_str} ] Expected: {case['expected_decision']}, Got: {decision}")
            print(f"  Urgency:  {result['urgency']}")
            print(f"  Reason:   {result['reason']}")
            print(f"  Context:  {result['factors']['context']}")
            
        except Exception as e:
            print(f"  [ FAIL ] Unexpected error: {e}")

    # --- INVALID TEST CASES ---
    
    print("\n--- 2. ERROR HANDLING TESTS ---")
    
    error_cases = [
        {
            "name": "Test 5 — Invalid soil moisture (-10)",
            "data": {
                "crop": "Tomato",
                "growth_stage": "Vegetative",
                "soil_moisture": -10.0, # Invalid
                "temperature": 25.0,
                "humidity": 50.0,
                "rain_probability": 0.0,
                "expected_rainfall": 0.0
            }
        },
        {
            "name": "Test 6 — Missing field (temperature)",
            "data": {
                "crop": "Tomato",
                "growth_stage": "Vegetative",
                "soil_moisture": 45.0,
                # "temperature" is missing
                "humidity": 50.0,
                "rain_probability": 0.0,
                "expected_rainfall": 0.0
            }
        },
        {
            "name": "Test 7 — Empty crop name",
            "data": {
                "crop": "  ", # Empty
                "growth_stage": "Vegetative",
                "soil_moisture": 45.0,
                "temperature": 25.0,
                "humidity": 50.0,
                "rain_probability": 0.0,
                "expected_rainfall": 0.0
            }
        }
    ]

    for case in error_cases:
        print(f"\n[{case['name']}]")
        try:
            engine.get_recommendation(case["data"])
            print("  [ FAIL ] Expected IrrigationInputError, but got success!")
        except IrrigationInputError as e:
            print(f"  [ PASS ] Caught expected validation error: {str(e)}")
        except Exception as e:
            print(f"  [ FAIL ] Caught wrong exception type: {type(e).__name__} - {str(e)}")

    print("\n" + "=" * 80)
    print("IRRIGATION ENGINE TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
