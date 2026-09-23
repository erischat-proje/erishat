from .privacy_routes import router as privacy_router
from .security_routes import router as security_router
from .webrtc_signaling import router as webrtc_router
from .room_music_routes import router as room_music_router
from .music_routes import router as music_router
from .ledger_routes import router as ledger_router
from fastapi import FastAPI
from app.db import engine, Base
from app.room_routes import router as room_router
from app.platform_routes import router as platform_router
from app.admin_routes import router as admin_router
from app.support_routes import router as support_router
from app.family_routes import router as family_router
from app.gift_routes import router as gift_router
from app.vip_routes import router as vip_router
from app.profile_routes import router as profile_router
from app.follow_fan_routes import router as follow_fan_router
from app.dm_routes import router as dm_router
from app.notification_routes import router as notification_router
from app.discovery_routes import router as discovery_router

# Veritabanı tablolarını otomatik oluştur
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ErisChat Production API",
    version="2.0.0",
    description="ErisChat tam teşekküllü ve güvenli backend altyapısı."
)

# Tüm modül rotalarını ana uygulamaya dahil et
app.include_router(room_router)
app.include_router(platform_router)
app.include_router(admin_router)
app.include_router(support_router)
app.include_router(family_router)
app.include_router(gift_router)
app.include_router(vip_router)
app.include_router(profile_router)
app.include_router(follow_fan_router)
app.include_router(dm_router)
app.include_router(notification_router)
app.include_router(discovery_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "ErisChat Backend",
        "mode": "Production-Grade",
        "version": "2.0.0"
    }

app.include_router(privacy_router)
app.include_router(security_router)
app.include_router(webrtc_router)
app.include_router(room_music_router)
app.include_router(music_router)
app.include_router(ledger_router)