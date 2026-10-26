FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHON_PATH=/opt/venv/bin/python

RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 python3-venv ca-certificates \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-cache-dir --upgrade pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY requirements-runtime.txt ./
RUN /opt/venv/bin/pip install --no-cache-dir --only-binary=:all: -r requirements-runtime.txt

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . ./

# Git LFS must hydrate this file before the Docker build context is created.
# Fail clearly if the artifact is absent or the context contains an LFS pointer.
RUN test -s models/disease_detection/saved_model/disease_model.keras \
    && ! grep -q "^version https://git-lfs.github.com/spec/v1$" models/disease_detection/saved_model/disease_model.keras \
    || (echo "ERROR: disease_model.keras is missing or still a Git LFS pointer" >&2; exit 1)

RUN mkdir -p tmp/disease && chown -R node:node /app
USER node

EXPOSE 5000
CMD ["npm", "start"]
