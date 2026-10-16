ERISCHAT · HAREKETLİ PRENSES

Hasan/Dede düzeninde tam ekran; açık temada krem-altın, koyu temada zümrüt-altın.
Menüdeki taçlı Lidya Prensesiyle uyumlu gerçekçi karakter ve bonus madalyonları.
Her temada dört ayrı PNG pozu: bekleme, hazırlanma, büyü gönderme, kutlama.

Çarpan görünürken hazırlanır. Ödeme yapan turdaki çarpanı toplarken elinden
büyü gönderir; çarpan tahtadan havuza taşınır. Kazançta kutlama pozu gelir.
Sistem azaltılmış hareket tercihini uygular. Pencere kapanınca veya arka plana
geçince hareket efektleri ve otomatik oyun durdurulur.

15 ücretsiz dönüş satın alma korunur. Fiyat/dönüş sayısı sunucu kurallarından
alınır; seçili bahis, toplam fiyat, bakiye ve satın alma sonrası bakiye gösterilir.
Yükleme, bekleyen istek, aktif bonus, şans artırma ve yetersiz bakiye kilitleri var.

Bu paket yalnız Prenses görünümünü ve hareketlerini günceller. Sunucu motoru,
son PR #293 doğal bonus oranları, ödeme tabloları, çarpan havuzu, retrigger,
tur limiti, ortak cüzdan ve sürmekte olan bonusların modeli değişmez. İstek
alanları, UUID ve yarım kalan isteğin kayıt anahtarı korunur.

Paket önce PR #293'ün auth-unified-v1 dalına birleşmesini gerektirir.
Termux: ZIP'i açıp içindeki termux.sh dosyasını bash ile çalıştır.
Mevcut ErisChat-Dede-Hafif-20261015-215305-26541 reposu kullanılır; tekrar
tam repo klonlanmaz. Yalnız gerekli dört kaynak dosyası ve yeni PNG'ler işlenir.
Farklı kaynak için ERIS_KAYNAK="/tam/yol" bash termux.sh kullanılır.
Script ayrı dal ve taslak PR oluşturur; kendi başına birleştirme/dağıtım yapmaz.

Küçük veya yatay ekranlarda kontroller okunabilir boyda kalır ve gerekirse
iç alan kayar. 393×820 ve 412×915 portre düzenlerinde tüm ana kontroller sığar.

Doğrulama ve görsel üretim notları docs/prenses-hareketli-v1 içindedir.
PNG yolları: frontend/assets/lidya-prenses/actor-final/{light,dark}/*.png
ve frontend/assets/lidya-prenses/symbols-final/{light,dark}/scatter.png.
