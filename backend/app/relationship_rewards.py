"""Relationship-scoped inventory: no currency or fan history is revoked."""
from sqlalchemy import select, delete
from .models import User, UserCosmetic
from .relationship_models import Couple, CoupleMember, CoupleRewardSelection, CoupleRing

PREFIX = 'relationship-assets/rewards/'
REWARDS = [(1,'bubble','sohbet'),(2,'title','unvan'),(3,'frame','cerceve'),
           (4,'wallpaper','wallpaper'),(5,'entrance','entrance'),(6,'ring','ring'),
           (7,'bubble','sohbet'),(8,'title','unvan'),(9,'frame','cerceve'),
           (10,'wallpaper','wallpaper'),(11,'entrance','entrance'),(12,'ring','ring')]
NAMES = {'bubble':'Sohbet balonu','title':'Ünvan','frame':'Çerçeve','wallpaper':'Duvar kağıdı','entrance':'Oda girişi','ring':'Yüzük'}


def items(gender=None):
    result=[]
    for level,kind,name in REWARDS:
        tier=1 if level<=6 else 2
        for sex in ([gender] if gender in ('male','female') else ['male','female']) if kind in ('bubble','frame','entrance') else [None]:
            filename=f'{name}-{sex}-{tier}' if sex else f'{name}-{tier}'
            result.append({'level':level,'type':kind,'gender':sex,'name':NAMES[kind],
                'asset_key':PREFIX+filename+'.png','asset':PREFIX+filename+'.png',
                'logo':PREFIX+f'level-{level}.png','tier':'relationship','relationship':True,'price':0,'vip':False})
    return result


def house_for(db,uid):
    member=db.get(CoupleMember,uid)
    house=db.get(Couple,member.couple_id) if member else None
    return house if house and house.active else None


def selected(db,uid,kind):
    if not house_for(db,uid): return None
    row=db.get(CoupleRewardSelection,(uid,kind))
    if not row or not row.asset_key:return None
    owned=db.scalar(select(UserCosmetic.id).where(UserCosmetic.user_id==uid,UserCosmetic.cosmetic_type==kind,UserCosmetic.asset_key==row.asset_key))
    if kind=='frame' and db.get(User,uid).frame_asset!=row.asset_key:return None
    return row.asset_key if owned else None


def ensure_rewards(db,house):
    # Called while both partner rows and the house are locked.
    for uid in (house.male_id,house.female_id):
        user=db.get(User,uid)
        owned={(r.cosmetic_type,r.asset_key) for r in db.scalars(select(UserCosmetic).where(UserCosmetic.user_id==uid))}
        for reward in items(user.gender):
            if reward['level']>house.level or (reward['type'],reward['asset_key']) in owned:continue
            kind,key=reward['type'],reward['asset_key']
            db.add(UserCosmetic(user_id=uid,cosmetic_type=kind,asset_key=key));owned.add((kind,key))
            row=db.get(CoupleRewardSelection,(uid,kind))
            if row is None:
                db.add(CoupleRewardSelection(user_id=uid,kind=kind,asset_key=key))
                if kind=='frame':user.frame_asset=key
            elif row.asset_key:
                row.asset_key=key
                if kind=='frame':user.frame_asset=key
            db.flush()
    for tier,level in ((1,6),(2,12)):
        key=f'level-{tier}'
        if house.level>=level and not db.get(CoupleRing,(house.id,key)):
            db.add(CoupleRing(couple_id=house.id,ring=key,source='level'))
    if house.ring and not db.get(CoupleRing,(house.id,house.ring)):
        db.add(CoupleRing(couple_id=house.id,ring=house.ring,source='purchased'))
    db.flush()


def revoke(db,house):
    for uid in (house.male_id,house.female_id):
        user=db.get(User,uid)
        if user.frame_asset and user.frame_asset.startswith(PREFIX):user.frame_asset=None
        if user.wallpaper_asset and user.wallpaper_asset.startswith('relationship_wallpaper_'):user.wallpaper_asset=None
        db.execute(delete(UserCosmetic).where(UserCosmetic.user_id==uid,UserCosmetic.asset_key.startswith(PREFIX)))
        db.execute(delete(CoupleRewardSelection).where(CoupleRewardSelection.user_id==uid))



def owns_wallpaper(db,uid,asset):
    return bool(house_for(db,uid) and db.scalar(select(UserCosmetic.id).where(UserCosmetic.user_id==uid,UserCosmetic.cosmetic_type=='wallpaper',UserCosmetic.asset_key==asset)))
