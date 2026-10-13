# Prenses görsel üretimi

Built-in imagegen kullanıldı. Kaynaklar ErisChat için özgün anime oyun varlıklarıdır; sağlayıcının varlıkları kullanılmaz. Transparan atlas ayrı sprite dosyalarına ayrıldı; komşu sprite taşmaları dışarıda bırakıldı. Karakter ayrıca iki tam boy poz halinde üretildi ve ayrı PNG'lere ayrıldı. Kapak orijinal olarak üretildi. Alfa kanalı korunur; harici URL yoktur.

Son dosyalar: frontend/assets/lidya-prenses/ altında 5 mücevher (yellow, green, blue, turquoise, pink), moon/star/sun/heart, scatter, orb-green/blue/purple/red, actor-idle/actor-cast ve menu-cover.png.

Üretim prompt seti:

1. Transparan 4×4 sprite atlas: sarı/yeşil/mavi/turkuaz/pembe kesimli altın çerçeveli mücevherler, ay/yıldız/güneş/kalp madalyonları, lavanta saçlı yetişkin anime prenses portresi, yeşil/mavi/pembe/altın kanatlı çarpan kalpleri, prenses idle/cast. Her sprite tek hücrede, metin veya sayı yok; premium boyalı anime, belirgin silüet ve altın detaylar.
2. Menü kapağı: geniş kompozisyonda sağda aynı lavanta saçlı prenses, beyaz kanatlar ve yıldız asa, pembe/mor gökyüzü ve bulut sarayı, solda tam 'PRENSES' altın serif başlık, alt kenarda mücevherler. Diğer yazı/marka yok.
3. Karakter atlası: ilk atlas kimlik referansı; iki eşit sütunda aynı tam boy yetişkin prenses. Solda idle/floating, sağda asa yukarıda cast. Taç, baş, kanatlar ve ayaklar tamamen içeride; orta boşluk, şeffaf arka plan. Lavanta saç, pembe/beyaz/altın kıyafet ve aynı yüz korunur.

Görsel hareket: idle floating, kanat katman salınımı, asa poz değişimi, kalpler üzerine ışık uçuşu ve pembe/mavi Canvas parçacıkları. Bunlar 2D sprite/tween animasyonlarıdır; 3D iskelet veya kare kare anime filmi değildir. Prenses reaksiyonları özgün frekans sentezidir, gerçek konuşma/sağlayıcı ses kaydı kullanılmaz.
