# Render Docker Deployment

The backend is deployed as a Docker Web Service from the repository `main` branch.

## Render service settings

- Root directory: `backend`
- Runtime: Docker
- Dockerfile: `Dockerfile`
- Build command: managed by Docker
- Start command: managed by Docker (`npm start`)
- Instance: start with Free only for staging; TensorFlow memory and cold-start behavior must be measured
- Health check path: `/`

The Dockerfile uses Node.js 22, Python 3 from the Debian image, and the virtual
environment at `/opt/venv/bin/python`. `PYTHON_PATH` is set inside the image so
the existing Node subprocess integration launches the packaged interpreter.

## Required Render environment variables

Set these in Render without committing them:

- `MONGODB_URI`: existing MongoDB Atlas connection URI
- `JWT_SECRET`: existing strong signing secret
- `NODE_ENV=production`
- `FRONTEND_ORIGIN`: final Vercel HTTPS origin after the frontend is deployed

Render supplies `PORT`; the Express server preserves its dynamic-port behavior.

Optional variables:

- `AI_TIMEOUT_MS` (default `30000`)
- `WEATHER_TIMEOUT_MS` (default `15000`)
- `DATA_GOV_IN_API_KEY` for live Government market data
- `DISEASE_IMAGE_ROOT` only when the legacy trusted-path endpoint needs an override

`AI_SERVER_URL` and `AI_SERVER_PORT` are not required by the current Node
subprocess architecture. `VITE_API_BASE_URL` belongs on the Vercel frontend,
not this service.

## Model artifact requirement

The Docker build fails if `models/disease_detection/saved_model/disease_model.keras`
is absent or is still an LFS pointer. The build context must contain the hydrated
Git LFS object. The crop Random Forest artifacts are copied from their existing
`models/crop_recommendation/saved_model/` directory.

## Validation boundary

The runtime versions are pinned from the local inference environment. Linux wheel
compatibility, model loading inside the image, TensorFlow memory usage on Render,
and Atlas connectivity must be validated in staging. This configuration does not
fabricate or disable any AI result.
