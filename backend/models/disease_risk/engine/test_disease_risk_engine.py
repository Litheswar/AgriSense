import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from disease_risk_engine import DiseaseRiskEngine, DiseaseRiskInputError


def run_tests():
    print("=" * 80)
    print("AGRISENSE — DISEASE RISK ENGINE TESTS")
    print("=" * 80)

    try:
        engine = DiseaseRiskEngine()
        print("[System] Engine loaded. Config status:", engine.config.get("status"))
    except Exception as e:
        print(f"[System] Failed to initialize engine: {e}")
        return

    # --- VALID TEST CASES ---
    # Threshold reference (from config/risk_rules.json PROTOTYPE values):
    #   humidity elevated >= 75%, high >= 90%  (weight 0.35)
    #   temperature favorable 15–30 °C         (weight 0.25)
    #   rainfall meaningful >= 5mm, elevated >= 15mm (weight 0.25)
    #   recent_rainfall meaningful >= 10mm, elevated >= 25mm (weight 0.15)
    #   Low: score <= 0.35 | Medium: 0.35 < score <= 0.65 | High: > 0.65

    test_cases = [
        {
            "name": "Test 1 — Low-risk conditions",
            "expected_level": "Low",
            "data": {
                "crop": "Tomato",
                "growth_stage": "Seedling",
                "temperature": 35.0,   # Outside 15–30 °C → 0.0 × 0.25
                "humidity": 40.0,      # Below 75% → 0.0 × 0.35
                "rainfall": 0.0,       # Below 5mm → 0.0 × 0.25
                "recent_rainfall": 0.0 # Below 10mm → 0.0 × 0.15
                # Expected score: 0.0  → Low
            }
        },
        {
            "name": "Test 2 — Elevated (Medium) risk conditions",
            "expected_level": "Medium",
            "data": {
                "crop": "Potato",
                "growth_stage": "Vegetative",
                "temperature": 22.0,   # In range 15–30 → 1.0 × 0.25 = 0.25
                "humidity": 80.0,      # >= 75% but < 90% → 0.5 × 0.35 = 0.175
                "rainfall": 7.0,       # >= 5mm but < 15mm → 0.5 × 0.25 = 0.125
                "recent_rainfall": 8.0 # Below 10mm → 0.0 × 0.15 = 0.0
                # Expected score: 0.25+0.175+0.125+0.0 = 0.55  → Medium
            }
        },
        {
            "name": "Test 3 — High-risk conditions",
            "expected_level": "High",
            "data": {
                "crop": "Tomato",
                "growth_stage": "Flowering",
                "temperature": 25.0,   # In range → 1.0 × 0.25 = 0.25
                "humidity": 92.0,      # >= 90% → 1.0 × 0.35 = 0.35
                "rainfall": 20.0,      # >= 15mm → 1.0 × 0.25 = 0.25
                "recent_rainfall": 30.0 # >= 25mm → 1.0 × 0.15 = 0.15
                # Expected score: 0.25+0.35+0.25+0.15 = 1.0 → High
            }
        },
        {
            "name": "Test 4 — Different crop (Corn)",
            "expected_level": "Medium",
            "data": {
                "crop": "Corn (maize)",
                "growth_stage": "Vegetative",
                "temperature": 28.0,   # In range → 0.25
                "humidity": 80.0,      # Elevated → 0.175
                "rainfall": 7.0,       # Meaningful → 0.125
                "recent_rainfall": 5.0 # Below 10mm → 0.0
                # Expected score: 0.55 → Medium
            },
            "verify_crop": "Corn (maize)"
        },
        {
            "name": "Test 5 — Different growth stage (Booting)",
            "expected_level": "Low",
            "data": {
                "crop": "Wheat",
                "growth_stage": "Booting",
                "temperature": 10.0,   # Outside range → 0.0
                "humidity": 55.0,      # Below 75% → 0.0
                "rainfall": 2.0,       # Below 5mm → 0.0
                "recent_rainfall": 3.0 # Below 10mm → 0.0
                # Expected score: 0.0 → Low
            },
            "verify_growth_stage": "Booting"
        }
    ]

    print("\n--- 1. VALID RISK ASSESSMENT TESTS ---")
    for case in test_cases:
        print(f"\n[{case['name']}]")
        try:
            result = engine.get_risk_assessment(case["data"])

            level_passed = (result["risk_level"] == case["expected_level"])
            crop_passed = (result["crop"] == case.get("verify_crop", result["crop"]))
            gs_passed = (result["growth_stage"] == case.get("verify_growth_stage", result["growth_stage"]))
            all_passed = level_passed and crop_passed and gs_passed

            status_str = "PASS" if all_passed else "FAIL"
            print(f"  [ {status_str} ] Expected level: {case['expected_level']}, Got: {result['risk_level']}")
            print(f"  Risk Score:   {result['risk_score']} (prototype index, not a probability)")
            print(f"  Crop:         {result['crop']}")
            print(f"  Growth Stage: {result['growth_stage']}")
            print(f"  Signals:      {result['signals']}")
            print(f"  Reasoning[0]: {result['reasoning'][0]}")
            print(f"  Disclaimer:   {result['disclaimer']}")

        except Exception as e:
            print(f"  [ FAIL ] Unexpected error: {e}")

    # --- INVALID TEST CASES ---
    print("\n--- 2. ERROR HANDLING TESTS ---")

    error_cases = [
        {
            "name": "Test 6 — Invalid humidity (150%)",
            "data": {
                "crop": "Tomato", "growth_stage": "Flowering",
                "temperature": 25.0, "humidity": 150.0,
                "rainfall": 5.0, "recent_rainfall": 10.0
            }
        },
        {
            "name": "Test 7 — Invalid temperature (out of validation range)",
            "data": {
                "crop": "Tomato", "growth_stage": "Flowering",
                "temperature": 99.0, "humidity": 80.0,
                "rainfall": 5.0, "recent_rainfall": 10.0
            }
        },
        {
            "name": "Test 8 — Missing field (humidity)",
            "data": {
                "crop": "Tomato", "growth_stage": "Flowering",
                "temperature": 25.0,
                # "humidity" missing
                "rainfall": 5.0, "recent_rainfall": 10.0
            }
        }
    ]

    for case in error_cases:
        print(f"\n[{case['name']}]")
        try:
            engine.get_risk_assessment(case["data"])
            print("  [ FAIL ] Expected DiseaseRiskInputError, but got success!")
        except DiseaseRiskInputError as e:
            print(f"  [ PASS ] Caught expected validation error: {e}")
        except Exception as e:
            print(f"  [ FAIL ] Wrong exception type: {type(e).__name__}: {e}")

    print("\n" + "=" * 80)
    print("DISEASE RISK ENGINE TESTING COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
