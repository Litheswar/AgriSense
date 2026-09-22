"""
AgriSense - Crop Recommendation Dataset Inspection & EDA Script
---------------------------------------------------------------
This script performs an initial Exploratory Data Analysis (EDA) on
the crop recommendation dataset without modifying the data or training models.
"""

import os
import pandas as pd
import numpy as np

def inspect_dataset(csv_path: str):
    print("=" * 70)
    print("AGRISENSE — CROP RECOMMENDATION DATASET INSPECTION")
    print("=" * 70)
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at path: {csv_path}")

    # 1. Load Dataset
    df = pd.read_csv(csv_path)
    print(f"\n[1] File Path: {csv_path}")
    print(f"    Dataset Shape: {df.shape[0]} rows, {df.shape[1]} columns")

    # 2. Columns & Data Types
    print("\n[2] Features & Data Types:")
    dtype_info = pd.DataFrame({
        'Data Type': df.dtypes,
        'Non-Null Count': df.notnull().sum(),
        'Missing Values': df.isnull().sum(),
        'Missing Ratio (%)': (df.isnull().sum() / len(df)) * 100
    })
    print(dtype_info.to_string())

    # 3. Duplicate Rows
    duplicates = df.duplicated().sum()
    print(f"\n[3] Duplicate Rows: {duplicates}")

    # 4. Preview Data
    print("\n[4] First 5 Rows:")
    print(df.head().to_string(index=False))

    # 5. Descriptive Statistics for Numerical Features
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    print(f"\n[5] Summary Statistics for Numerical Features ({len(num_cols)} features):")
    stats = df[num_cols].describe().T[['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max']]
    # Add skewness for distributional insight
    stats['skewness'] = df[num_cols].skew()
    print(stats.round(2).to_string())

    # 6. Target Variable Analysis
    target_col = 'label' if 'label' in df.columns else df.columns[-1]
    classes = df[target_col].unique()
    class_counts = df[target_col].value_counts()
    
    print(f"\n[6] Target Variable ('{target_col}'):")
    print(f"    Total Unique Crop Classes: {len(classes)}")
    print(f"    Class Balance (Samples per crop):")
    print(class_counts.to_string())

    # Check if perfectly balanced
    is_balanced = class_counts.nunique() == 1
    if is_balanced:
        print(f"\n    Result: Perfectly balanced! Every crop has exactly {class_counts.iloc[0]} samples.")
    else:
        print(f"\n    Result: Imbalanced classes detected.")

    print("\n" + "=" * 70)
    print("INSPECTION COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_file = os.path.join(current_dir, "crop_data.csv")
    inspect_dataset(dataset_file)
