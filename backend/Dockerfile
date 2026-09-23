FROM python:3.13-slim

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app
COPY Gereken_icerikler /app/Gereken_icerikler

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
