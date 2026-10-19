from pathlib import PurePosixPath
FAMILIES = ['Sardis Aslanı', 'Paktolos', 'Asma Bahçesi', 'Palmet Sarayı', 'Kehribar Yolu', 'Elektrum Mührü', 'Safir Kapısı', 'Yakut Hanedanı', 'Krezus Hazinesi', 'Lidya Tacı']
PALETTES = ['Bakır', 'Gümüş', 'Altın', 'Zümrüt', 'Kehribar', 'Ametist', 'Safir', 'Yakut']
def avatar_metadata(key, gender):
 n=sum(map(ord,PurePosixPath(key).name))%80+1
 gender="male" if gender=="male" else "female"
 return {"name":FAMILIES[(n-1)//8]+f" · Portre {n:02d} · "+("Erkek" if gender=="male" else "Kadın"),"asset_url":f"shop-lydia/avatar-{gender}-{n:02d}.webp"}
