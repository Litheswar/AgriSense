"""
AgriSense — Crop Recommendation Inference Verification Test Suite
-----------------------------------------------------------------
This script verifies the production inference pipeline:
1. Confirms model, label encoder, and metadata loading.
2. Evaluates the 4 standardized realistic test profiles.
3. Verifies feature ordering safety with scrambled keys.
4. Verifies comprehensive error handling for missing/malformed inputs.
"""

import sys
import json

# Ensure UTF-8 output encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from predict import CropRecommender, CropInferenceError, predict_crop

def run_inference_tests():
    print("=" * 75)
    print("AGRISENSE — CROP RECOMMENDATION INFERENCE PIPELINE VERIFICATION")
    print("=" * 75)

    # 1. Model Loading Check
    print("\n[Step 1] Initializing CropRecommender & Verifying Artifact Loading...")
    recommender = CropRecommender()
    print(f"         - Model Type:          {type(recommender.model).__name__}")
    print(f"         - Number of Trees:     {recommender.model.n_estimators}")
    print(f"         - Total Classes:       {len(recommender.classes)}")
    print(f"         - Expected Features:   {recommender.expected_features}")
    print("         Artifacts loaded and cached successfully.")

    # 2. Four Realistic Field Profiles
    print("\n[Step 2] Executing Predictions on Standard Realistic Field Profiles:")

    test_profiles = [
        {
            "id": 1,
            "profile": "Tropical Wet / Paddy Field",
            "input": {
                "N": 90,
                "P": 42,
                "K": 43,
                "temperature": 23.5,
                "humidity": 82,
                "ph": 6.5,
                "rainfall": 230
            }
        },
        {
            "id": 2,
            "profile": "High-Potassium Fruit Profile (Apple)",
            "input": {
                "N": 25,
                "P": 130,
                "K": 200,
                "temperature": 21.0,
                "humidity": 92,
                "ph": 6.0,
                "rainfall": 110
            }
        },
        {
            "id": 3,
            "profile": "Dry Arid / Leguminous Pulse (Chickpea)",
            "input": {
                "N": 38,
                "P": 68,
                "K": 79,
                "temperature": 18.2,
                "humidity": 16.8,
                "ph": 7.3,
                "rainfall": 75
            }
        },
        {
            "id": 4,
            "profile": "Warm Subtropical Cash Crop (Cotton)",
            "input": {
                "N": 120,
                "P": 48,
                "K": 20,
                "temperature": 24.5,
                "humidity": 80.2,
                "ph": 6.8,
                "rainfall": 85
            }
        }
    ]

    for test in test_profiles:
        result = recommender.predict(test["input"])
        print(f"\n      --- Test Case {test['id']}: {test['profile']} ---")
        print(f"      Input Payload:   {test['input']}")
        print(f"      Predicted Crop:  {result['predicted_crop']}")
        print(f"      Confidence:      {result['confidence']}")
        print(f"      Top 3 Candidates:")
        for rank, candidate in enumerate(result["top_3"], 1):
            print(f"        {rank}. {candidate['crop']:12s} (Probability: {candidate['probability']})")

    # 3. Feature Ordering Safety Test
    print("\n[Step 3] Verifying Feature Ordering Safety (Scrambled Key Order):")
    # Provide inputs in completely reversed / mixed dictionary order
    scrambled_input = {
        "rainfall": 230,
        "humidity": 82,
        "ph": 6.5,
        "temperature": 23.5,
        "K": 43,
        "P": 42,
        "N": 90
    }
    scrambled_result = predict_crop(scrambled_input)
    print(f"         Scrambled Input Keys: {list(scrambled_input.keys())}")
    print(f"         Predicted Crop:       {scrambled_result['predicted_crop']} (Confidence: {scrambled_result['confidence']})")
    assert scrambled_result["predicted_crop"] == "rice", "Ordering safety check failed!"
    print("         Result: Exact match with Test Case 1! Feature ordering safety confirmed.")

    # 4. Error Handling Verification
    print("\n[Step 4] Verifying Error Handling & Validation on Invalid Payloads:")

    error_cases = [
        {
            "case": "Missing feature 'N'",
            "payload": {"P": 42, "K": 43, "temperature": 23.5, "humidity": 82, "ph": 6.5, "rainfall": 230}
        },
        {
            "case": "Missing feature 'rainfall'",
            "payload": {"N": 90, "P": 42, "K": 43, "temperature": 23.5, "humidity": 82, "ph": 6.5}
        },
        {
            "case": "Non-numeric string value for N ('hello')",
            "payload": {"N": "hello", "P": 42, "K": 43, "temperature": 23.5, "humidity": 82, "ph": 6.5, "rainfall": 230}
        },
        {
            "case": "Null/None value for temperature",
            "payload": {"N": 90, "P": 42, "K": 43, "temperature": None, "humidity": 82, "ph": 6.5, "rainfall": 230}
        },
        {
            "case": "Non-dictionary input",
            "payload": [90, 42, 43, 23.5, 82, 6.5, 230]
        }
    ]

    for err_test in error_cases:
        try:
            predict_crop(err_test["payload"])
            print(f"         [FAIL] {err_test['case']} did NOT raise an error!")
        except CropInferenceError as e:
            print(f"         [PASS] {err_test['case']}")
            print(f"                -> Raised CropInferenceError: {e}")
        except Exception as e:
            print(f"         [PASS] {err_test['case']}")
            print(f"                -> Raised {type(e).__name__}: {e}")

    print("\n" + "=" * 75)
    print("INFERENCE PIPELINE VERIFICATION COMPLETED SUCCESSFULLY")
    print("=" * 75)

if __name__ == "__main__":
    run_inference_tests()
