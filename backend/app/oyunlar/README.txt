ERISCHAT OYUNLAR MİMARİSİ — v4

Klasör: backend/app/oyunlar/

MİMARİ
1. Her oyun kendi .py motoruna sahiptir.
2. Her oyun için aynı klasörde .txt teknik belgesi vardır.
3. registry.py motorları ve oyun kapsamlarını tek merkezde tanımlar.
4. platform_routes.py yalnızca HTTP/auth/oda yetkisi/round persistence katmanıdır.
5. Blackjack state'i GameRound.state_data üzerinden korunur.
6. Oyun motorları para, Lidya veya Lidya Gem işlemi yapmaz.
7. Oyunlar free-play olarak kalır.

OYUNLAR
- roulette: oda oyunu
- cups: oda oyunu
- horse_race: oda oyunu
- wheel: oda oyunu
- blackjack: özel/free-play oyun
- crash: özel/free-play oyun
- vault: özel/free-play oyun

GELİŞTİRME KURALI
- Yeni oyun kodu önce kendi .py dosyasına yazılır.
- Oyun teknik kuralları kendi .txt belgesine kaydedilir.
- registry.py üzerinden sisteme kaydedilir.
- Ana router'a oyun algoritması gömülmez.
- Persistence ve yetkilendirme ana sistemde kalır.

Registry integrity
- registry.py validates that every declared room/private game is registered.
- Every registered engine must expose play(choice, profile, data).
- This fails fast during import instead of silently exposing a broken game catalog.
