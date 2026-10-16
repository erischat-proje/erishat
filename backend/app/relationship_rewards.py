"""Relationship-scoped inventory: no currency or fan history is revoked."""
import re
from sqlalchemy import select, delete
from .models import User, UserCosmetic
from .relationship_models import Couple, CoupleMember, CoupleRewardSelection, CoupleRing

PREFIX = 'relationship-assets/rewards/'
REWARDS = [(1,'bubble','sohbet'),(2,'title','unvan'),(3,'frame','cerceve'),
           (4,'wallpaper','wallpaper'),(5,'entrance','entrance'),(6,'ring','ring'),
           (7,'bubble','sohbet'),(8,'title','unvan'),(9,'frame','cerceve'),
           (10,'wallpaper','wallpaper'),(11,'entrance','entrance'),(12,'ring','ring')]
NAMES = {'bubble':'Sohbet balonu','title':'Ünvan','frame':'Çerçeve','wallpaper':'Duvar kağıdı','entrance':'Oda girişi','ring':'Yüzük'}


def legacy_items(gender=None):
    result=[]
    for level,kind,name in REWARDS:
        if kind in ('frame', 'wallpaper'): continue  # Retired: matching collection replaces these looks.
        tier=1 if level<=6 else 2
        for sex in ([gender] if gender in ('male','female') else ['male','female']) if kind in ('bubble','frame','entrance') else [None]:
            filename=f'{name}-{sex}-{tier}' if sex else f'{name}-{tier}'
            result.append({'level':level,'type':kind,'gender':sex,'name':NAMES[kind],
                'asset_key':PREFIX+filename+'.png','asset':PREFIX+filename+'.png',
                'logo':PREFIX+f'level-{level}.png','tier':'relationship','relationship':True,'price':0,'vip':False})
    return result


# Two distinct personal rewards at every level, each with a matching male/female look.
LEVEL_REWARDS = [
    (1, 'Bakır Kıvılcım', ('bubble', 'title')),
    (2, 'Asma Bağı', ('frame', 'entrance')),
    (3, 'Sardis Yolu', ('bubble', 'frame')),
    (4, 'Palmet İzleri', ('title', 'entrance')),
    (5, 'Aslan Mührü', ('bubble', 'title')),
    (6, 'Altın Yemin', ('frame', 'entrance')),
    (7, 'Paktolos Işığı', ('bubble', 'frame')),
    (8, 'Kraliyet Bağı', ('title', 'entrance')),
    (9, 'Sardis Tacı', ('bubble', 'title')),
    (10, 'Aslanların Ahdi', ('frame', 'entrance')),
    (11, 'Krezus Hazinesi', ('bubble', 'frame')),
    (12, 'Ebedi Lidya', ('title', 'entrance')),
]
ART_NAMES = {'bubble':'sohbet', 'title':'unvan', 'frame':'cerceve', 'entrance':'entrance'}


def items(gender=None):
    result = []
    sexes = [gender] if gender in ('male', 'female') else ['male', 'female']
    for level, theme, kinds in LEVEL_REWARDS:
        for kind in kinds:
            for sex in sexes:
                key = PREFIX + f'{ART_NAMES[kind]}-{sex}-l{level}.png'
                result.append({'level':level, 'type':kind, 'gender':sex,
                    'name':theme + ' · ' + NAMES[kind], 'theme':theme,
                    'description':'Lidya motifleriyle işlenmiş ' + NAMES[kind].lower() + '.',
                    'asset_key':key, 'asset':key, 'logo':PREFIX+f'level-{level}.png',
                    'tier':'relationship', 'relationship':True, 'price':0, 'vip':False})
    # Existing shared couple rings remain bonus rewards with their original inventory keys.
    result.extend(reward for reward in legacy_items(gender) if reward['type']=='ring')
    return result


def available_reward(gender, kind, key, level):
    # Previously earned cosmetics remain valid; new inventory displays the current collection.
    return next((r for r in items(gender)
                 if r['type']==kind and r['asset_key']==key and r['level']<=level), None)



def is_legacy_asset(key):
    return bool(key and key.startswith(PREFIX) and re.fullmatch(
        r'(?:sohbet|unvan|cerceve|wallpaper|entrance)-(?:male-|female-)?[12]\.png', key[len(PREFIX):]))


def migrate_legacy_rewards(db, user, house):
    earned = [r for r in items(user.gender) if r['level'] <= house.level and r['type'] != 'ring']
    for kind in ('bubble', 'title', 'frame', 'entrance', 'wallpaper'):
        row = db.get(CoupleRewardSelection, (user.id, kind))
        direct = getattr(user, kind + '_asset', None)
        if not ((row and is_legacy_asset(row.asset_key)) or is_legacy_asset(direct)):
            continue
        choices = [r for r in earned if r['type'] == kind]
        key = choices[-1]['asset_key'] if choices else None
        if row is None:
            row = CoupleRewardSelection(user_id=user.id, kind=kind);db.add(row)
        row.asset_key = key
        if kind == 'frame' and is_legacy_asset(direct):user.frame_asset = key
        if kind in ('bubble', 'title') and is_legacy_asset(direct):setattr(user, kind + '_asset', None)
    if user.wallpaper_asset and user.wallpaper_asset.startswith('relationship_wallpaper_'):
        user.wallpaper_asset = None
    for cosmetic in list(db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id,
                UserCosmetic.asset_key.startswith(PREFIX)))):
        if is_legacy_asset(cosmetic.asset_key):db.delete(cosmetic)
    db.flush()


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
            if reward['level']>house.level:continue
            kind,key=reward['type'],reward['asset_key']
            if (kind,key) not in owned:
                db.add(UserCosmetic(user_id=uid,cosmetic_type=kind,asset_key=key));owned.add((kind,key))
            row=db.get(CoupleRewardSelection,(uid,kind))
            if row is None:
                db.add(CoupleRewardSelection(user_id=uid,kind=kind,asset_key=key))
                if kind=='frame' and not user.frame_asset:user.frame_asset=key
            db.flush()
        migrate_legacy_rewards(db,user,house)
    for tier,level in ((1,6),(2,12)):
        key=f'level-{tier}'
        if house.level>=level and not db.get(CoupleRing,(house.id,key)):
            db.add(CoupleRing(couple_id=house.id,ring=key,source='level'))
    # Sessions disable autoflush: persist level rings before checking the selected ring.
    db.flush()
    if house.ring and not db.get(CoupleRing,(house.id,house.ring)):
        db.add(CoupleRing(couple_id=house.id,ring=house.ring,source='purchased'))
    db.flush()
    for uid in (house.male_id, house.female_id):
        for key in status_unlocked(db, house):
            asset = status_asset(key)
            if not db.scalar(select(UserCosmetic.id).where(UserCosmetic.user_id == uid,
                    UserCosmetic.cosmetic_type == 'relationship_status', UserCosmetic.asset_key == asset)):
                db.add(UserCosmetic(user_id=uid, cosmetic_type='relationship_status', asset_key=asset))
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

STATUS_NAMES = {'dating':'Sevgili','copper-promise':'Bakır sözlü','silver-promise':'Gümüş sözlü',
                'copper-engaged':'Bakır nişanlı','silver-engaged':'Gümüş nişanlı','married':'Evli'}


def status_asset(key):
    return PREFIX + 'status/' + key + '.png'


def status_unlocked(db, house):
    rings = {r.ring for r in db.scalars(select(CoupleRing).where(CoupleRing.couple_id == house.id))}
    keys = {'dating'}
    if house.level >= 2 or any(r.startswith('copper-') for r in rings): keys.add('copper-promise')
    if house.level >= 2 or any(r.startswith('silver-') for r in rings): keys.add('silver-promise')
    if house.level >= 4: keys.update(('copper-engaged', 'silver-engaged'))
    if house.married: keys.add('married')
    return keys


def status_compatible(house, key):
    if key == 'dating': return True
    if key == 'married': return bool(house.married)
    return bool(house.ring and house.ring.startswith(key.split('-')[0] + '-'))


def status_for(db, house, uid):
    unlocked = status_unlocked(db, house)
    row = db.get(CoupleRewardSelection, (uid, 'relationship_status'))
    chosen = next((k for k in STATUS_NAMES if row and row.asset_key == status_asset(k)), None)
    if chosen in unlocked and status_compatible(house, chosen): return chosen
    if house.married: return 'married'
    metal = (house.ring or '').split('-')[0]
    key = metal + ('-engaged' if house.level >= 4 else '-promise')
    return key if key in unlocked and status_compatible(house, key) else 'dating'
