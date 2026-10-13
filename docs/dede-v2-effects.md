# Dede v2 görünüm ve animasyonları

Bu güncelleme mevcut Dede sunucu motoru/ödeme tablosu, RTP yapılandırması ve API cüzdan işlemlerini kullanır. Sonuçlar tarayıcıdan hesaplanmaz veya değiştirilmez. Önce PR #247 gerekir.

Resmi kaynaklarda altı makaranın taklası, kazanan sembollerin kaldırılıp yukarıdan doldurulması, dönüş sonunda çarpanların toplanması ve karakterin şimşekle çarpan vermesi anlatılır: [Gates of Olympus](https://www.pragmaticplay.com/en/games/gates-of-olympus/), [resmi tanıtım](https://www.pragmaticplay.com/en/news/pragmatic-play-aims-for-the-heavens-in-gates-of-olympus/). Bu akış Dede'nin özgün Lidya karakteri ve görsellerine uyarlanmıştır. Zamanlamalar/kamera/pozlar Dede için tasarlanmıştır; orijinal oyunun sanat/animasyon dosyaları kullanılmaz.

- İki tema için üçer özgün ImageGen PNG karakter pozu: bekleme, asa kaldırma, şimşek atma. Şeffaf alpha, sabit kare tuvali ve bağımsız pozlar. Bekleme sırasında nefes hareketi, sonuç gelirken asa kaldırma, kazanan çarpanlarda şimşek pozu.
- Başlangıç dağıtımı sütun gecikmeleriyle yapılır. Taklada kazanan hücreler parlar/patlar; hayatta kalan semboller kendi sütunlarında eski satırlarından yeni satırlarına düşer, yeni semboller yukarıdan girer. Uçan küreler çarpan sayacına gider ve toplam her kürede görünür biçimde artar.
- Kazanç/büyük kazanç, bonus girişi, +5 retrigger ve bonus bitiş panoları. Ses açıldığında düşüş, kazanç, toplama ve gürültü tabanlı kısa gök gürültüsü. Reduced-motion açıkken hareketli animasyonlar atlanır.
- Satın alma native confirm yerine tema renkleri, PNG karakter ve kaplamalı iki buton içeren özel dialog ile yapılır. Fiyat ve bakiye görünür; onay tek API isteği başlatır. Vazgeç/Escape ücret almaz. Dialog içinde klavye odağı tutulur.
- Satın alınan veya doğal tetiklenen bonus otomatik ilerler; 15 başlangıç dönüşü ve tüm +5 uzatmalar bitene veya limite kadar. Bu otomatik devam yalnızca mevcut bonusun ücretsiz dönüşlerini oynar. Ücretli otomatik turlar ayrıca kullanıcı tarafından başlatılmışsa kendi sayacıyla çalışır.
- Bonusu durdur/devam butonları, pencere kapatma ve sekme gizlenmesi bekleyen callback'i iptal eder. Gönderilmiş istek tamamlanabilir; ikinci istek aynı anda gönderilmez. Kalan ücretsiz dönüşler zaten sunucuda saklanır.
- VisualViewport/ResizeObserver ile başlık, sayaç ve bütün kontroller sabit grid alanlarına yerleşir; 6×5 oyun alanı kalan yükseklik/genişliğe sığdırılır. Dikey küçük ve yatay ekran düzenleri var. Kurallar ayrı kaydırılabilir panelde açılır.

Doğrulama: Playwright iki temada 320×568, 360×640, 390×844 ve 844×390; yatay/dikey taşma olmaması, 30 sembol, bütün kontroller, özel satın alma/vazgeç, 15 ücretsiz dönüşün otomatik bitmesi, yalnızca bir ücretli satın alma, durdur/devam, asa/şimşek pozu ve uçan küre animasyonu, kapatınca yeni istek oluşmaması. Sahte/yerel API ve mevcut referans motoru kullanıldı; canlı cüzdana istek atılmadı. Değişiklik görseldir; matematik yapılandırması değişmediği için 18 milyon turluk önceki rapor geçerlidir.

PNG prompt: referans özgün Dede kimliğini koruyan 3 sütun × 2 satır atlas, üstte inci/altın robe altta zümrüt/antik altın robe, her satırda bekleme/asa kaldırma/sola şimşek atma; tam bust/asa, gerçek alpha, aynı kamera ölçeği, yazı/marka/manzara yok. Built-in ImageGen; canvas yalnızca atlasın özgün figürlerini ayırmak ve komşu figür parçalarını çıkarmak için kullanıldı.
