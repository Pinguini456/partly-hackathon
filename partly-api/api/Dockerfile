FROM python:3.12-slim

WORKDIR /srv

# Install dependencies (fastapi / uvicorn / pydantic).
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir -e .

# Dataset is mounted read-only at /data.
ENV DATA_DIR=/data

EXPOSE 8420

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8420"]
