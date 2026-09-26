# AgriSense — System Assumptions, Constraints & Limitations

**Status**: `[IMPORTANT SAFETY & AGRONOMIC DISCLOSURE]`  

---

## 1. Machine Learning Limitations

### 1.1 Crop Recommendation Probability vs. Agronomic Reality
- **Assumption**: The Random Forest model outputs a normalized class probability distribution across 22 crops.
- **Limitation**: Model confidence indicates statistical similarity to the 2,200 historical dataset training rows. It does **not** represent a guaranteed biological germination success, agronomic suitability across microclimates, or economic profitability. Unmodeled variables such as soil salinity, drainage, irrigation canal access, slope, and pest histories heavily influence actual crop viability.

### 1.2 Disease Detection Laboratory Bias (PlantVillage)
- **Assumption**: The MobileNetV2 deep learning classifier achieved 96.95% accuracy on test images.
- **Limitation**: Images in PlantVillage were photographed severed from living plants on clean gray/black paper backdrops under diffused lighting. Real-world farm conditions feature complex leaf overlaps, motion blur, partial shadows, solar glare, and co-occurring secondary fungal or insect damage, which significantly degrade convolutional feature activations.

---

## 2. Decision Engine Heuristics & Assumptions

### 2.1 Prototype Irrigation Thresholds
- **Assumption**: Soil moisture below 30% triggers irrigation, and expected rainfall $\ge 10\text{ mm}$ inhibits it.
- **Limitation**: These values are hardcoded prototype thresholds (`config/thresholds.json`). In real agricultural science, critical moisture depletion depends on soil texture (sand, loam, clay) and root zone depth. The engine does not compute actual crop evapotranspiration ($ET_c$) using the Penman-Monteith equation.

### 2.2 Prototype Fertilizer Guidance
- **Assumption**: Fixed numerical bands classify N, P, K into low, adequate, and high categories.
- **Limitation**: The engine provides qualitative guidance (e.g. "consider supplementing N"), not physical chemical formulations (e.g. "apply 45 kg Urea per hectare at 30 days after sowing"). It must not replace official Soil Health Card recommendations from agricultural extension officers.

### 2.3 Environmental Disease Risk Index
- **Assumption**: High humidity (>75%) and rainfall create elevated disease risk.
- **Limitation**: The output is a synthetic heuristic index (0.0 to 1.0), **not** an epidemiological spore germination probability. High risk does not prove disease presence, and low risk does not guarantee plant health.

### 2.4 Market Intelligence & Mandi Pricing
- **Assumption**: Historical modal price trends predict near-term market favorability.
- **Limitation**: Agricultural mandi prices are subject to extreme volatility caused by transport strikes, unseasonal rains, bumper harvests, and export policy shifts. The market score (0–100) is a backward-looking heuristic index, NOT an economic forecast.

---

## 3. Infrastructure & Integration Boundaries

### 3.1 Absent Weather API Client
- **Current State**: Open-Meteo was conceptually chosen, but zero weather API clients or background polling routines exist in the repository. All meteorological inputs are currently dependent on client-submitted HTTP request bodies.

### 3.2 Unverified Live Market API
- **Current State**: `AgmarknetApiProvider` is coded, but in the absence of a configured `DATA_GOV_IN_API_KEY`, the application falls back to `LocalMarketDataProvider`. Live third-party HTTP communication has not been verified.

### 3.3 MongoDB Atlas Connectivity & Network Resiliency
- **Historical State**: Initial MongoDB Atlas onboarding was gated by IP whitelisting configurations.
- **Current Verified State**: Live connection to the MongoDB Atlas cluster (`agrisense.e4pyxxk.mongodb.net/agrisense`) is fully operational and verified across all test suites. Real database CRUD operations, read-after-write consistency, and cross-process restart persistence are actively verified in `test_persistence_atlas.js` and downstream integration suites. The in-memory repository pattern in `farmService.js` is retained as an automatic resilience fallback in the event of temporary network or cluster unreachable conditions.
