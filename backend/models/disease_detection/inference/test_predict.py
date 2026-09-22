import os
import sys

# Ensure UTF-8 output across Windows/Linux terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Suppress TensorFlow verbose GPU/C++ warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from predict import predict_disease, DiseaseInferenceError

def run_tests():
    print("=" * 80)
    print("AGRISENSE — DISEASE DETECTION INFERENCE TESTS")
    print("=" * 80)

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw_dir = os.path.join(base_dir, "dataset", "raw")

    # Sample images for testing based on known PlantVillage structure
    # We use os.listdir to find a real file in the directory to avoid hardcoding exact GUID filenames
    
    def get_first_image(class_folder: str) -> str:
        folder_path = os.path.join(raw_dir, class_folder)
        if not os.path.exists(folder_path):
            return None
        files = [f for f in os.listdir(folder_path) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        if not files:
            return None
        return os.path.join(folder_path, files[0])

    test_cases = [
        {"name": "Test A: Healthy Image (Potato)", "path": get_first_image("Potato___healthy")},
        {"name": "Test B: Diseased Image (Tomato Late Blight)", "path": get_first_image("Tomato___Late_blight")},
        {"name": "Test C: Different Crop (Corn Common Rust)", "path": get_first_image("Corn_(maize)___Common_rust_")},
        {"name": "Test D: Another Disease (Tomato Early Blight)", "path": get_first_image("Tomato___Early_blight")}
    ]

    print("\n--- 1. VALID INFERENCE TESTS ---")
    
    for case in test_cases:
        print(f"\n[{case['name']}]")
        img_path = case["path"]
        
        if not img_path:
            print("  [WARNING] Could not find test image for this class. Skipping.")
            continue
            
        print(f"  Image: {os.path.relpath(img_path, base_dir)}")
        
        try:
            result = predict_disease(img_path)
            
            print(f"  Predicted crop:    {result['crop']}")
            print(f"  Predicted disease: {result['predicted_disease']}")
            print(f"  Confidence:        {result['confidence']:.4f}")
            print("  Top 3:")
            for i, top in enumerate(result['top_3'], 1):
                print(f"    {i}. {top['display_name']} — {top['confidence']:.4f}")
                
            # Basic assertions
            assert 0 <= result['confidence'] <= 1, "Confidence out of bounds"
            assert len(result['top_3']) == 3, "Did not return exactly 3 top predictions"
            assert result['crop'] in ["Potato", "Tomato", "Corn (maize)"], "Crop parsing looks incorrect"
            
        except Exception as e:
            print(f"  [ERROR] {str(e)}")

    print("\n--- 2. ERROR HANDLING TESTS ---")
    
    error_cases = [
        {"name": "Nonexistent path", "path": os.path.join(raw_dir, "does_not_exist.jpg")},
        {"name": "Directory path", "path": raw_dir},
        {"name": "Invalid file format", "path": __file__} # Pass the python script itself
    ]
    
    for case in error_cases:
        print(f"\n[{case['name']}]")
        print(f"  Path: {case['path']}")
        
        try:
            predict_disease(case['path'])
            print("  [FAIL] Expected an error but inference succeeded!")
        except DiseaseInferenceError as e:
            print(f"  [PASS] Caught expected DiseaseInferenceError: {str(e)}")
        except Exception as e:
            print(f"  [FAIL] Caught wrong exception type: {type(e).__name__} - {str(e)}")

    print("\n" + "=" * 80)
    print("INFERENCE TESTING COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
