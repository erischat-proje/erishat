# Candy Ultimate ve menü düzeltmesi

## Tıklama hatası
Prenses/Dog Party kartı `onclick` ile kendi modalını açıyordu. `games-menu.js` üzerindeki üst kap dinleyicisi aynı tıklamayı ayrıca `ErisChatGames.open`'a taşıyordu. Yeni kimlikler eski oyunun listesinde olmadığından eski modal Şans Çarkı'na geri dönüyordu. `custom-game-routing.js`, document capture aşamasında özel oyunları bir kez yönlendirir ve olayı tüketir. Eski menü yalnızca ALL_GAMES içinde bulunan kimlikleri işler. Standart oyunların yönlendirmesi korunur. Yeni oyun henüz yüklenmemişse Çark açılmaz, yükleniyor mesajı gösterilir.

Kapakların eski 900×600/3:2 oranı, ortak 2:1 kutuda contain boşlukları oluşturuyordu. Yeni Prenses/Dog Party kapakları 1200×600 PNG'dir; geniş sahne, başlık ve karakter güvenli yerleşimiyle 2:1 kutuyu doldurur. Menü gözlemcileri ile ortak PNG modülü aynı yeni URL'yi kullanır; kaynak adresleri arasında salınım oluşmaz. Eski dekoratif köşe çizgileri kaldırılır.

## Oyun durumu
Sunucu RNG: secrets.SystemRandom. Grid: 49 row-major hücre; 7 normal sembol ve Scatter. Flood-fill yalnızca dört yönlü komşuluk, ayrı kümeler ayrı ödeme. Ücret ve ödeme tamsayı kuruş benzeri Lidya yüzlükleriyle tutulur. Cüzdan mevcut User.lidya ile ortak dede_wallet küsurat kaydıdır. Kullanıcı satırı işlem boyunca kilitlenir. GameRound/Bet/Play mevcut tablolarıdır; şema değişimi gerekmez.

Spotta 0=boş, 1=ambalaj, 2..1024=çarpan. Önce mevcut spotlardan küme ödemesi hesaplanır. Sonra kazanan hücrelerin işaretleri artırılır ve yalnızca o semboller kaldırılır. Böylece ikinci patlamada yeni oluşan 2×, geriye dönük olarak kendi patlamasını çarpmaz. Kümeye giren mevcut çarpanlar toplanır; hiç yoksa 1×. Bonus spinleri 49 spotu taşır; ana oyun temiz 49 spotla başlar. Yeni bonus da temiz spotlarla başlar. 500000 yüzlük temel bahis limiti tüm tur/bonus toplamına uygulanır.

3..7 Scatter, 10/12/15/20/30 dönüş. Satın alma 100× temel bahis ve aynı dağılımdan seçilen başlangıç dönüşlerini verir; ilk satın alma işleminde ödeme yapılmaz. Bu özgün profil bonus yeniden tetiklemesi içermez. +%25 ante, normal bonus tetikleme olasılığını 0.0081364'ten 0.0106341 civarına artırır; bonusun kendi dağılımı aynıdır. Kullanıcıya göre farklı oran, kaybetme serisi telafisi veya sonuç değiştirme yoktur.

Makbuz kimliği kullanıcı+istek UUID'si ile ayrı GameRound receipt kaydında tutulur; aradan başka spinler geçse de aynı UUID tekrar ücret kesmez. İstemci belirsiz ağ hatasında aynı payload/UUID'yi sessionStorage'da kullanıcıya özel anahtarla saklar. Bonus stake/ante sabit, sequence/ownership doğrulanır. Çift tıklama UI busy/confirm kilitleri ve sunucu idempotency ile karşılanır. UI kapanması sunucuda kaydedilmiş bonusu silmez.

## Görsel ve ses
Üretim PNG: 8 şeffaf şeker sembolü, Candy Ultimate 2:1 kapak, iki güncellenmiş menü kapağı. Built-in image generation kullanılmıştır. Sprite atlasından yalnızca ayrı hücre varlıkları çıkarılmış ve boyutları küçültülmüştür. Özgün promptlar: glossy orange/purple/red gummy bears, green star, purple bottle, orange bean, pink heart, gold-pink gumball machine; özgün Lydian marble/gold candy garden CANDY ULTIMATE banner. PRENSES/DOG PARTY kapakları mevcut karakter/başlık korunarak geniş 2:1 kompozisyona uyarlanmıştır.

Canvas DPR en fazla2; oyun kapanınca RAF ve bekleyen animasyonlar temizlenir. Gravity/bounce, 9 parçacık/sembol, çarpan pop, iki Scatter sonrası sonraki sütunlarda anticipation. Reduced-motion animasyon sürelerini kaldırır; sekme arka plana geçince otomatik oyun/renderer/ses durur. Web Audio master .12, sine katmanları, 4 ses sınırı, kompresör, kısa zarflar; varsayılan ses kapalı. Bu sesler insan sesi veya sağlayıcının özgün kayıtları değildir.

## Matematik doğrulaması
%96,50 sertifika değil hedeftir. 30k bonus kalibrasyon örneği 96.5900× ortalama toplam bonus, normal 100k başlangıç simülasyonu 0.179104× temel ödeme verdi. Tetikleme oranı bu değerlerden seçildi. Bağımsız normal/ante/buy raporu ve tohumlar candy-statistics.json'da değiştirilmeden yer alır. Yüksek volatilitede az sayıda büyük bonus normal/ante örneklem aralığını genişletir; satın alma örneklemi daha dar aralık verir. Ölçülen oranlar hedefe eşitmiş gibi sunulmaz.

Resmî kaynaklar (13 Ekim 2026 kontrolü):
- https://www.pragmaticplay.com/en/news/pragmatic-play-delivers-a-real-treat-in-sugar-rush/ : 7×7, 5+ komşu cluster, 100× feature buy, klasik spot üst sınırı128×.
- https://www.pragmaticplay.com/tr/oyunlar/sugar-rush/ : 3..7 Scatter → 10/12/15/20/30 ve bonus sticky spots.
- https://www.pragmaticplay.com/en/news/pragmatic-play-adds-to-sweet-sensation-in-sugar-rush-1000/ : 1024× spot Sugar Rush1000 sürümüne aittir, onun maksimum kazancı25000×. Candy Ultimate kullanıcı isteğine göre 1024× spot ve5000× tur sınırını birleştiren özgün modeldir; sağlayıcının gizli matematiğinin birebir kopyası iddia edilmez.

17 pytest motor/API testi ve gerçek legacy menu kodunu kullanan Playwright kontrolü paketin geliştirilmesi sırasında çalıştırıldı. Üretim frontend modülleri cüzdana bağlanır; paket kökündeki tek dosya index.html, PNG ve JS gömülü bağımsız sanal bakiye demosudur.
