# Lidya Şeker Sarayı v1

Şeker Sarayı, ErisChat için özgün görseller ve özgün matematikle geliştirilen pay-anywhere oyunudur. Başka bir oyunun varlıklarını, gizli reel strip'lerini, kaynak kodunu veya doğrulanmış matematik modelini içermez.

## Ödeme ve durum makinesi

6 sütun × 5 satır, satır öncelikli 30 hücre. Aynı sembolden herhangi bir yerde 8–9, 10–11 veya 12+ görülmesi ilgili kademeyi bir kez öder. Komşuluk veya çizgi gerekmez; aynı board'da birden fazla sembol grubu ödeme yapabilir. Kazananların tamamı kaldırılır. Her sütundaki sağ kalanların göreli sırası korunur, sütunun altına kayarlar, yeni semboller üstte doğar. Üst limit sağlanmadıkça ödeme kalmayana kadar devam edilir.

| Sembol | 8–9 | 10–11 | 12+ |
|---|---:|---:|---:|
| Muz | 0,25× | 0,75× | 2× |
| Elma | 0,40× | 0,90× | 4× |
| Üzüm | 0,50× | 1× | 5× |
| Erik | 0,80× | 1,50× | 8× |
| Karpuz | 1× | 2× | 10× |
| Mavi şeker | 1,50× | 2× | 12× |
| Yeşil şeker | 2× | 5× | 15× |
| Mor şeker | 3× | 10× | 25× |
| Kalp şeker | 10× | 25× | 50× |

4/5/6+ lolipop: 3×/5×/100× temel bahis, 10 ücretsiz dönüş. Bonus içindeki 3+ lolipop +5 dönüş verir, ayrı scatter ödemesi yoktur. Başlangıç board'unda scatter sayısı dağılımdan örneklenir ve rastgele farklı pozisyonlara yerleştirilir. Scatter ve bomba ödeme grubuna dahil değildir; kaldırılmaz. Tumble dolumlarında yeni scatter üretilmez. Bu, oyunun yayımlanmış özgün modelinin açık bir tercihidir.

Bomba sadece ücretsiz dönüşte üretilir. Değerleri 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100×. Bonus dönüşünün bütün tumbles'ları bittikten sonra board'daki bomba değerleri toplanır. Çarpan yoksa 1; varsa toplam. Tumble toplamıyla çarpılır. Sonraki bonus dönüşüne taşınmaz. Scatter ödemesi çarpılmaz. Turun başlangıcı ile bonusun sonu arasındaki toplam ödeme temel bahsin 21.100 katıyla sınırlıdır; cap'te kalan dönüşler biter.

Bonus satın alma 100× temel bahis, 10 dönüş. Ante ücret 1,25× temel bahis; ödeme temel bahse göre hesaplanır. Ante ile satın alma birlikte kullanılamaz. Bahis 1–10.000 strict tam sayı; Dede ile aynı +/− bantları, başlangıç 50.

## RNG ve olasılık modeli

Üretimde `secrets.SystemRandom` kullanılır. İstemci sadece stake, ante, action, request_id, round_id ve sequence gönderir; board, kazanç, çarpan veya RNG seed gönderemez. Çekilişler kullanıcı kimliğine, bakiye miktarına veya geçmiş kayıplara göre değişmez. Sabit konfigurasyon `seker-math.json` içindedir.

Her dönüşte önce ağırlıklı bir sembol ailesi seçilir. O aileye ait sembol ağırlığı 2,18× artırılır; kalanlar eşit baz ağırlık taşır. Tumble dizisi boyunca aile değişmez. Normal, ante ve bonus aile ağırlıkları ayrı yayımlanır. Bu koşullu karışım kaskadlar ve yüksek ödeme sembolleri üzerinden volatilite oluşturur. Bomba olasılığı bonus dolumlarında hücre başına %7; değeri ayrıca ağırlıklı örneklenir. Normal dönüşte bomba olasılığı sıfır.

Normal scatter sayı ağırlıkları (0…6): `[540000,330000,105000,22000,2955,44,1]`. Ante: `[201000,440000,287000,66000,5910,88,2]`. Her ikisinin toplamı 1.000.000'dur. Normal beklenen scatter adedi 0,618046, ante 1,236092: tam iki kat. 4+ scatter olasılıkları %0,3 ve %0,6: tam iki kat. Hücre başına bağımsız scatter olasılığını iki kat yapmakla bonus ihtimalini iki kat yapmanın aynı şey olduğu varsayılmaz. Bonus scatter sayısı `[5600,3400,900,100]`: %1 tekrar tetikleme. Capsiz beklenen bonus dönüş sayısı `10 / (1 - 5×0,01) = 10,526315…`.

Matematik miktarları temel bahsin yüzde birlik katlarında tam sayıdır. Cüzdan ücretleri ve kazançları yüzde bir Lidya biriminde tam sayı olarak toplanır. Float yalnızca dış JSON/display değerlerinde kullanılır.

## Ölçüm: hedef, tahmin ve sınırları

Hedef RTP **%96,48**, normal hit hedefi yaklaşık **%33,3**. Bunlar bağımsız sertifikasyon veya matematiksel ispat değildir. Aile ağırlıkları offline örnekleme ile ayarlanmıştır. Gerçekleşen Monte Carlo tahminleri ve %95 güven aralıkları `seker-statistics.json` içindedir. Kod `rtpStatus=calibration-pending` olarak yayımlanır ve arayüz hedefi kesin bir oran olarak sunmaz.

| Mod | Örnek | Tahmini RTP | %95 güven aralığı |
|---|---:|---:|---:|
| Normal | 500.000 ücretli tur ve tüm bonus devamları | %95,0701 | %92,3279–%97,8123 |
| Ante | 500.000 ücretli tur ve tüm bonus devamları | %95,5142 | %92,2723–%98,7560 |
| Bonus satın alma | 75.000 bonus ve tüm tekrar tetiklemeler | %95,4181 | %94,2754–%96,5608 |

Normal dönüş kazanç sıklığı %33,0898. Ante %30,7010; daha çok scatter normal sembol kombinasyonlarını azaltır. Hit ödeme alınan ücretli dönüş anlamına gelir, bahis üstü kâr anlamına gelmez. Bonus sıklığı gözlemleri %0,3018 / %0,5996. Hedef RTP üç güven aralığının içinde bulunur; bu tek başına hedefe ulaşıldığını kanıtlamaz. Bağımsız sertifikasyon, gerçek oyunun reel strip'leri ve tam %96,48 garantisi yoktur. İstatistik raporu sonucu düşük göstermez veya kullanıcı lehine sahte pay yazmaz.

Çalıştırma: `python tests/seker_simulate.py --paid 500000 --buys 75000`. Script offline deterministik test seed'leri kullanır; üretim RNG'sine müdahale etmez. Sonuç her ücretli turdan başlayıp tüm ücretsiz dönüş ve retrigger'larını tamamlayarak hesaplanır; ante paydası 1,25, satın alma paydası 100'dür. Cap modele dahildir. Büyük kazançların kuyruk riski nedeniyle daha çok örnek ve bağımsız inceleme gerekir.

## Cüzdan, güvenilirlik ve entegrasyon

Mevcut `User.lidya`, `GameRound`, `GameBet`, `GamePlay` tabloları kullanılır. Dede'nin sabit UUID'li `dede_wallet` remainder kaydı paylaşılır; ikinci bir bakiye oluşturulmaz. User satırı `FOR UPDATE` ve `populate_existing` ile kilitlenir. Ücret, payout, fraction, bonus state ve request receipt aynı DB transaction'ında yazılır. Sonuç işlenemezse transaction rollback olur.

Her istek kimliği için ayrı `seker_receipt` kaydı aynı transaction'da saklanır. Yalnızca son bonus isteği değil eski başarılı istekler de idempotenttir. Yeniden gönderim tekrar debit/credit yapmaz; receipt önceki görsel sonucu ve güncel bakiyeyi döndürür. Bonus sahibi, sequence ve kilitli bahis doğrulanır. Yeni bir paid spin açık Şeker Sarayı bonusu varken reddedilir. Dede bonus state'i değiştirilmez. Kapatma veya bağlantı kaybı ücretsiz dönüşleri silmez.

Frontend pending request'i kullanıcı kimliğine göre sessionStorage'da saklar. Network/5xx sonrası aynı UUID ile tekrar dener; 4xx sonrası pending temizlenir, 409'da aktif state yeniden alınır. Bakiye sunucunun cevabıdır; display kazancı animasyon sonunda sayar. Başka oyun modalı açıldığında cleanup yapılır; render loop, timer, ses ve observer kapatılır. Kişisel Oyunlar menüsüne bir kart eklenir.

## Canvas ve ses

Tek Canvas 2D, requestAnimationFrame, capped delta time, ResizeObserver, devicePixelRatio en fazla 2. Logical alan 600×500. PNG atlas drawImage ile çizilir; semboller DOM elemanı değildir. Gravity ease-in quadratic, iniş sonunda 5 logical pixel sönümlü sekme. Column stagger ve 3+ scatter anticipation hızını 1,25× yavaşlatır; altın kenar titreşimi gösterilir. Kazananlar glow, scale pop, alpha fade ve sembol başına 10 partikül. Kazanç yazıları board üzerinde uçar. Bombalar sırayla glow ve ışık iziyle alt kenardaki toplama hedefine gider, çarpan meteri yükselir. Ardından toplam kazanç ease-out count-up ile görünür.

Aynı Dede CC0 MP3 dosyaları kullanılır. Tek AudioContext, decode cache, en fazla 8 voice; kullanıcı hareketi unlock eder. Patlama sesi tumble index'ine göre playbackRate ile yükselir. Ses dosyası yüklenemezse Web Audio sentezi çalışır. Mute/hidden/close mevcut sesleri durdurur. Reduced motion süreleri 1 ms'ye indirir. 60 FPS hedefidir; tüm cihazlarda ölçülmüş sabit FPS garantisi değildir.

## Doğrulama

13 izole Python test grubu: strict input/ban/owner/sequence, tek ücretlendirme, bonus resume, cap, rollback, küsurat ve önceki Dede fraction paylaşımı, eski bonus receipt replay, ödeme eşikleri, column survivor sırası, base'te bomba olmaması, additive multiplier ve scatter kuralları. Gerçek kullanıcı cüzdanı kullanılmadı.

Chromium: 390×844 mobil, 1280×900 masaüstü, açık/koyu tema, bahis butonları, patlama bitmeden total'in 0 olması, satın alma, bonus devamı, bombaların toplamı, otomatik durdurma, Escape/close, kapatma sonrası yeni istek olmaması ve JS error kontrolü. Gerçek API bağlantısı yerine deterministik engine trace fixture'ları kullanıldı. Canlı Railway/PostgreSQL eşzamanlı yük testi veya canlı deployment yapılmadı.
