import os
import sys

# Ensure UTF-8 output across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fertilizer_engine import FertilizerEngine, FertilizerInputError

def run_tests():
    print("=" * 80)
    print("AGRISENSE — FERTILIZER ENGINE TESTS")
    print("=" * 80)

    try:
        engine = FertilizerEngine()
        print("[System] Engine loaded successfully with configuration status:", engine.config.get("status"))
    except Exception as e:
        print(f"[System] Failed to initialize engine: {e}")
        return

    # --- VALID TEST CASES ---
    
    test_cases = [
        {
            "name": "Test 1 — Low N, adequate P/K",
            "data": {
                "N": 15.0, # Low (<30)
                "P": 40.0, # Adequate (25-60)
                "K": 50.0, # Adequate (30-80)
                "ph": 6.5, # Suitable (5.5-7.5)
                "crop": "Corn",
                "growth_stage": "Vegetative",
                "disease_status": {"detected": False, "disease": None, "confidence": 0.0}
            },
            "verify": lambda res: "N" in res["priority_nutrients"] and len(res["priority_nutrients"]) == 1
        },
        {
            "name": "Test 2 — Adequate N/P/K",
            "data": {
                "N": 45.0,
                "P": 40.0,
                "K": 50.0,
                "ph": 6.5,
                "crop": "Tomato",
                "growth_stage": "Flowering",
                "disease_status": {"detected": False, "disease": None, "confidence": 0.0}
            },
            "verify": lambda res: len(res["priority_nutrients"]) == 0 and "No major nutrient deficiency indicated" in res["recommendation"]
        },
        {
            "name": "Test 3 — Multiple nutrient issues",
            "data": {
                "N": 10.0, # Low
                "P": 10.0, # Low
                "K": 50.0, # Adequate
                "ph": 6.5,
                "crop": "Potato",
                "growth_stage": "Tuber Initiation",
                "disease_status": {"detected": False, "disease": None, "confidence": 0.0}
            },
            "verify": lambda res: "N" in res["priority_nutrients"] and "P" in res["priority_nutrients"] and len(res["priority_nutrients"]) == 2
        },
        {
            "name": "Test 4 — High nutrient value",
            "data": {
                "N": 90.0, # High (>80)
                "P": 40.0,
                "K": 50.0,
                "ph": 6.5,
                "crop": "Corn",
                "growth_stage": "Maturity",
                "disease_status": {"detected": False, "disease": None, "confidence": 0.0}
            },
            "verify": lambda res: res["nutrient_status"]["N"] == "high" and "N" not in res["priority_nutrients"]
        },
        {
            "name": "Test 5 — pH outside configured suitable range",
            "data": {
                "N": 45.0,
                "P": 40.0,
                "K": 50.0,
                "ph": 4.5, # Low (<5.5)
                "crop": "Tomato",
                "growth_stage": "Vegetative",
                "disease_status": {"detected": False, "disease": None, "confidence": 0.0}
            },
            "verify": lambda res: res["ph_status"] == "low" and "amendments to raise pH" in res["recommendation"]
        },
        {
            "name": "Test 6 — Disease detected",
            "data": {
                "N": 45.0,
                "P": 40.0,
                "K": 50.0,
                "ph": 6.5,
                "crop": "Potato",
                "growth_stage": "Vegetative",
                "disease_status": {"detected": True, "disease": "Late blight", "confidence": 0.96}
            },
            "verify": lambda res: res["caution"] is not None and "Late blight" in res["caution"] and "Because disease status indicates a detected disease" in " ".join(res["reasoning"])
        }
    ]

    print("\n--- 1. VALID DECISION TESTS ---")
    for case in test_cases:
        print(f"\n[{case['name']}]")
        try:
            result = engine.get_recommendation(case["data"])
            
            passed = case["verify"](result)
            status_str = "PASS" if passed else "FAIL"
            
            print(f"  [ {status_str} ]")
            print(f"  Nutrient Status: {result['nutrient_status']}")
            print(f"  pH Status:       {result['ph_status']}")
            print(f"  Priorities:      {result['priority_nutrients']}")
            print(f"  Recommendation:  {result['recommendation']}")
            if result['caution']:
                print(f"  Caution:         {result['caution']}")
            
        except Exception as e:
            print(f"  [ FAIL ] Unexpected error: {e}")


    # --- INVALID TEST CASES ---
    
    print("\n--- 2. ERROR HANDLING TESTS ---")
    
    error_cases = [
        {
            "name": "Test 7 — Missing N/P/K",
            "data": {
                # "N" missing
                "P": 40.0,
                "K": 50.0,
                "ph": 6.5,
                "crop": "Tomato",
                "growth_stage": "Vegetative",
                "disease_status": {"detected": False}
            }
        },
        {
            "name": "Test 8 — Invalid pH",
            "data": {
                "N": 40.0,
                "P": 40.0,
                "K": 50.0,
                "ph": 15.0, # Invalid (>14)
                "crop": "Tomato",
                "growth_stage": "Vegetative",
                "disease_status": {"detected": False}
            }
        }
    ]

    for case in error_cases:
        print(f"\n[{case['name']}]")
        try:
            engine.get_recommendation(case["data"])
            print("  [ FAIL ] Expected FertilizerInputError, but got success!")
        except FertilizerInputError as e:
            print(f"  [ PASS ] Caught expected validation error: {str(e)}")
        except Exception as e:
            print(f"  [ FAIL ] Caught wrong exception type: {type(e).__name__} - {str(e)}")

    print("\n" + "=" * 80)
    print("FERTILIZER ENGINE TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
