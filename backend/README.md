# ErisChat Backend

FastAPI + SQLAlchemy + PostgreSQL + authenticated WebSocket başlangıç katmanı.

## Çalıştırma

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

## Ortam değişkenleri

`backend/.env` içinde gerekirse:

```env
DATABASE_URL=postgresql+psycopg://erischat:erischat@localhost:5432/erischat
CORS_ORIGINS=*
ENVIRONMENT=development
```

## API

- `GET /health` — servis durumu
- `POST /v1/users` — anonim kullanıcı + 30 günlük bearer session
- `GET /v1/me` — mevcut oturumdaki kullanıcı
- `POST /v1/logout` — mevcut session'ı iptal eder
- `GET /v1/users/{user_id}` — kullanıcı profili
- `POST /v1/conversations` — iki kullanıcı arasında DM konuşması oluşturur
- `GET /v1/conversations/{conversation_id}` — üyelik kontrollü konuşma bilgisi
- `GET /v1/messages/{conversation_id}` — yalnızca konuşma üyeleri okuyabilir
- `POST /v1/messages/{conversation_id}` — yalnızca konuşma üyeleri mesaj gönderebilir
- `WS /ws?token=<access_token>` — authenticated WebSocket bağlantısı

## Güvenlik akışı

1. `POST /v1/users` ile kullanıcı oluşturulur.
2. API, ham session token döner; veritabanında token'ın SHA-256 hash'i saklanır.
3. Korumalı HTTP endpointleri `Authorization: Bearer <token>` ister.
4. DM konuşması oluşturulurken iki kullanıcı `conversation_members` tablosuna eklenir.
5. Mesaj okuma/yazma işlemlerinde konuşma üyeliği kontrol edilir.
6. WebSocket bağlantısı geçerli session token olmadan kabul edilmez.
7. Süresi geçmiş session kayıtları uygulama başlangıcında temizlenir.

## Veri katmanı

SQLAlchemy modelleri şu temel tabloları oluşturur:

- `users`
- `user_sessions`
- `conversations`
- `conversation_members`
- `messages`

Üretim ortamında `create_all` yerine Alembic migration katmanı eklenmesi sonraki altyapı adımlarındandır.
