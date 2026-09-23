from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from .db import get_db
from .session import get_user_from_token

router = APIRouter(prefix="/v1/family", tags=["Family System"])

class CreateFamilyRequest(BaseModel):
    name: str
    description: str | None = None

class FamilyActionRequest(BaseModel):
    family_id: str
    target_user_id: str | None = None

FAMILY_LEVELS = {
    1: {"capacity": 10, "min_lidya": 0},
    2: {"capacity": 15, "min_lidya": 20_000},
    3: {"capacity": 20, "min_lidya": 50_000},
    4: {"capacity": 25, "min_lidya": 100_000},
    5: {"capacity": 30, "min_lidya": 200_000},
    6: {"capacity": 35, "min_lidya": 400_000},
    7: {"capacity": 40, "min_lidya": 750_000},
    8: {"capacity": 45, "min_lidya": 1_200_000},
    9: {"capacity": 50, "min_lidya": 2_000_000},
    10: {"capacity": 60, "min_lidya": 3_500_000},
    11: {"capacity": 75, "min_lidya": 5_500_000},
    12: {"capacity": 100, "min_lidya": 10_000_000}
}

def get_current_user(authorization: str | None = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    return user

@router.post("/create")
def create_family(payload: CreateFamilyRequest, authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    
    # 213. 10.000 Lidya oluşturma ücretini uygula
    user_wallet = db.execute(text("SELECT lidya_balance FROM user_wallets WHERE user_id=:uid"), {"uid": user.id}).scalar()
    balance = float(user_wallet or 0)
    if balance < 10000:
        raise HTTPException(status_code=400, detail="Aile kurmak için en az 10.000 Lidya gereklidir")
        
    # Bakiyeden düş ve aile oluştur
    db.execute(text("UPDATE user_wallets SET lidya_balance = lidya_balance - 10000 WHERE user_id=:uid"), {"uid": user.id})
    
    res = db.execute(
        text("INSERT INTO families (name, description, owner_id, level, total_lidya) VALUES (:name, :desc, :oid, 1, 10000) RETURNING id"),
        {"name": payload.name, "desc": payload.description or "", "oid": user.id}
    ).fetchone()
    db.commit()
    
    family_id = res[0] if res else None
    if family_id:
        db.execute(
            text("INSERT INTO family_members (family_id, user_id, role) VALUES (:fid, :uid, 'owner')"),
            {"fid": family_id, "uid": user.id}
        )
        db.commit()

    return {"status": "success", "message": "Aile başarıyla kuruldu", "family_id": family_id}

@router.get("/my")
def get_my_family(authorization: str | None = None, db: Session = Depends(get_db)):
    user = get_current_user(authorization, db)
    member = db.execute(text("SELECT family_id, role FROM family_members WHERE user_id=:uid"), {"uid": user.id}).mappings().first()
    if not member:
        return {"status": "success", "family": None}
        
    fam = db.execute(text("SELECT id, name, description, level, total_lidya, owner_id FROM families WHERE id=:fid"), {"fid": member["family_id"]}).mappings().first()
    return {"status": "success", "family": dict(fam) if fam else None, "role": member["role"]}

@router.get("/levels")
def get_family_levels():
    return {"status": "success", "levels": FAMILY_LEVELS}
