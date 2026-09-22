# AgriSense — System Architecture Documentation

**Status**: `[IMPLEMENTED]`  
**Target Environment**: Cross-platform (Windows / Linux / macOS)  
**Core Technologies**: Node.js (v18+), Express (v4.21), Python (3.10+), Mongoose (v9.10)  

---

## 1. Architectural Overview

AgriSense operates as a decoupled, multi-tier agricultural decision-support system. The backend architecture separates HTTP network ingress, business persistence, and data modeling (implemented in Node.js) from mathematical, rule-based, and machine learning inference (implemented in Python).

```
                      ┌─────────────────────────────────────────┐
                      │          Client Layer / Frontend        │
                      │         (React / Web Client / API)      │
                      └────────────────────┬────────────────────┘
                                           │ HTTP REST (JSON)
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │          Node.js Express Server         │
                      │               (server.js)               │
                      └───────┬─────────────────────────┬───────┘
                              │                         │
            /api/farms        ▼                         ▼        /api/ai
    ┌───────────────────────────────┐     ┌────────────────────────────────┐
    │        farmController.js      │     │         aiController.js        │
    └───────────────┬───────────────┘     └────────────────┬───────────────┘
                    │                                      │
                    ▼                                      ▼
    ┌───────────────────────────────┐     ┌────────────────────────────────┐
    │         farmService.js        │     │          aiService.js          │
    │  (Live MongoDB or Memory Map) │     │ (Child Process Spawn & Stdin)  │
    └───────────────┬───────────────┘     └────────────────┬───────────────┘
                    │                                      │ JSON via Stdin
                    ▼                                      ▼
    ┌───────────────────────────────┐     ┌────────────────────────────────┐
    │     Mongoose Farm Model       │     │       Python Dispatcher        │
    │ (toSharedFarmState() format)  │     │       (ai/dispatcher.py)       │
    └───────────────────────────────┘     └────────────────┬───────────────┘
                                                           │ Internal Python
                                                           ▼ Function Invocations
                              ┌────────────────────────────┼────────────────────────────┐
                              ▼                            ▼                            ▼
                 ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
                 │        ML Models        │  │     Decision Engines    │  │   Crop Ranking Engine   │
                 │ ─────────────────────── │  │ ─────────────────────── │  │ ─────────────────────── │
                 │ • Crop Recommendation   │  │ • Irrigation Engine     │  │ • Multi-criteria        │
                 │   (Random Forest)       │  │ • Fertilizer Engine     │  │   Weighted Scorer       │
                 │ • Disease Detection     │  │ • Disease Risk Engine   │  │   (Agronomic + Market)  │
                 │   (MobileNetV2 CNN)     │  │ • Market Engine         │  │                         │
                 └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

---

## 2. Node.js Express Backend Layer

The Node.js tier manages network connectivity, CORS headers, input parsing, HTTP status routing, database persistence, and external process execution.

### Directory Structure & Responsibilities
- `server.js`: Express application initialization, global error handling, and database connection boot.
- `config/`:
  - `aiConfig.js`: Configures Python binary path, dispatcher location, default request timeouts (30,000ms), and microservice URL.
  - `db.js`: Mongoose connection manager with 5,000ms server selection timeout and error-trapped offline fallback.
- `routes/`:
  - `aiRoutes.js`: Exposes `/api/ai/health`, `/api/ai/predict`, and dedicated task endpoints (`/crop-recommendation`, `/disease-detection`, `/irrigation`, `/fertilizer`, `/disease-risk`, `/market`, `/crop-ranking`).
  - `farmRoutes.js`: Exposes RESTful CRUD operations (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`).
- `controllers/`:
  - `aiController.js`: Translates Express request payloads into task parameters, invoking `aiService`.
  - `farmController.js`: Maps HTTP bodies into `farmService` calls, formatting responses with embedded `sharedFarmState`.
- `services/`:
  - `aiService.js`: Encapsulates child process spawning, stdin pipe serialization, stdout chunk accumulation, error conversion, and execution timeouts.
  - `farmService.js`: Business logic layer implementing a dual-mode repository (live MongoDB when connected, in-memory `Map` when offline).

---

## 3. Python AI Dispatcher Layer

The Python tier isolates scientific, agronomic, and machine learning computation in a modular structure.

### Dispatcher Pattern (`backend/ai/dispatcher.py`)
Rather than starting separate daemon services for each model, `dispatcher.py` acts as a unified CLI and microservice dispatch hub:
1. **Lazy Loading**: Models and engines are instantiated only when their specific task is first requested.
2. **Unified Interface**: Accepts standard input payload:
   ```json
   {
     "task": "crop_recommendation",
     "input": { "N": 90, "P": 42, "K": 43, "temperature": 20.8, "humidity": 82.0, "ph": 6.5, "rainfall": 202.0 }
   }
   ```
3. **Structured Response**: Always outputs a normalized JSON object to stdout:
   ```json
   {
     "success": true,
     "task": "crop_recommendation",
     "result": { ... }
   }
   ```
   Or upon failure:
   ```json
   {
     "success": false,
     "error": {
       "code": "CropInferenceError",
       "message": "Missing required feature(s): ['rainfall']."
     }
   }
   ```

---

## 4. Communication & IPC Mechanics

### Subprocess Execution Lifecycle
Every AI inference request via `aiService.executeViaSubprocess(task, payload)` follows these synchronous IPC steps:
1. **Spawn**: `child_process.spawn(pythonPath, [dispatcherPath], { stdio: ['pipe', 'pipe', 'pipe'] })`.
2. **Timeout Arming**: A timer is armed for `requestTimeoutMs` (30,000ms). If the timer fires before completion, the process is killed and a `TIMEOUT` error returned.
3. **Write & Flush**: The JSON request is written to `pythonProcess.stdin` and the stream closed (`.end()`).
4. **Buffering**: `stdout` and `stderr` streams are buffered asynchronously.
5. **Exit & Parse**: On process close:
   - If stdout is empty, an `EMPTY_RESPONSE` error is raised with stderr diagnostics.
   - Stdout is parsed via `JSON.parse()`. If `parsed.success === false`, the promise is rejected with the Python error code.
   - If valid, the promise resolves with the parsed payload.

### Why Subprocess Architecture?
- **Zero Configuration**: Developers and evaluators run standard `npm start` or `npm test` without managing multiple microservice ports, background daemons, or docker containers.
- **Process Isolation**: A crash, segfault, or uncaught exception in a native C-extension (e.g. TensorFlow, OpenBLAS) cannot bring down the Express HTTP web server.
- **Microservice Fast-Path Ready**: For production deployments where subprocess spawn overhead is undesirable, `backend/ai/ai_server.py` exists as an optional lightweight HTTP server on port 5001.

---

## 5. Error Handling & Resilience

1. **Process Crash Guard**: If Python fails to spawn or exits with a non-zero code, standard error logs are captured and converted into structured JSON errors without crashing Node.js.
2. **Windows Path Compatibility**: Paths are resolved using `path.resolve` and normalized across operating systems.
3. **Database Offline Resilience**: If MongoDB is offline, the backend continues operating in memory-store mode. AI services function completely independently of database availability.
