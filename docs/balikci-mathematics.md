# Lidya Balıkçı Hasan v1

Balıkçı Hasan, ErisChat'ın Lidya temalı özgün 5×3 payline/collector oyunudur. Başka oyunun reel strip'leri, kapalı matematik modeli, kodu veya görselleri kopyalanmamıştır. Sonuç sunucuda belirlenir; Canvas, sonucu ve özellik sırasını gösterir. İkinci bir oyun cüzdanı yoktur.

## Bahis ve ödeme çizgileri

Toplam temel bahis 1–10.000 Lidya, başlangıç 50; Dede ile aynı adımlar. Aşağıdaki bütün ödeme değerleri **toplam temel bahsin katıdır**, 10 çizgiye ayrıca bölünmez/çarpılmaz. Kazanç 1. makaradan başlayarak soldan sağa en az üç bitişik eşleşme gerektirir. Her çizgide en yüksek tek normal sembol ödemesi seçilir; wild'lı bir çizgi birden fazla sembol için tekrar ödeme yapmaz. Scatter çizgi ödeme sembolü değildir.

| Sembol | 3 eşleşme | 4 eşleşme | 5 eşleşme |
|---|---:|---:|---:|
| 10 / J / Q / K / A (her biri) | 0,5× | 2,5× | 10× |
| Olta kutusu | 2× | 10× | 50× |
| Sinek yem | 3× | 20× | 100× |
| Olta kamışı | 4× | 30× | 150× |
| Şamandıra | 5× | 40× | 200× |
| Para balığı | 1× | 5× | 20× |

Satırlar: 1 üst, 2 orta, 3 alt. Sütunlar soldan sağa makaralardır.

| Çizgi | Makara 1 | Makara 2 | Makara 3 | Makara 4 | Makara 5 |
|---|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | 2 | 2 | 2 |
| 2 | 1 | 1 | 1 | 1 | 1 |
| 3 | 3 | 3 | 3 | 3 | 3 |
| 4 | 1 | 2 | 3 | 2 | 1 |
| 5 | 3 | 2 | 1 | 2 | 3 |
| 6 | 1 | 1 | 2 | 3 | 3 |
| 7 | 3 | 3 | 2 | 1 | 1 |
| 8 | 2 | 1 | 1 | 1 | 2 |
| 9 | 2 | 3 | 3 | 3 | 2 |
| 10 | 1 | 2 | 2 | 2 | 1 |

Ana oyunda para balığı değeri görünür fakat ek nakit olarak toplanmaz; sadece çizgi eşleşmesinden kazanır. Üzerindeki nakit katları 2, 5, 10, 15, 20, 25, 50, 2000×, bağımsız ağırlıklı seçilir. 3/4/5 scatter 10/15/20 ücretsiz dönüş verir. Scatter ayrıca anlık ödeme yapmaz. Ante veya bonus satın alma bulunmaz; bunlar kullanıcı tarafından verilen Balıkçı Hasan kurallarında istenmemiştir.

## Collector ve metre

Hasan yalnızca bonus dönüşünde gelir. Wild olarak bütün normal çizgi sembollerinin (para balığı dahil) yerine geçer; scatter'ın bonus sayımına eklenmez. Her Hasan, ekrandaki tüm para balıklarının değerlerini ayrı ayrı toplar.

`toplama = para balıklarının katları toplamı × Hasan sayısı × dönüşün açılış toplama çarpanı × temel bahis`

Çizgi kazancı çarpılmaz. Aynı dönüşteki tüm Hasan'lar dönüşün açılış seviyesini kullanır. Metre ve yeni seviye toplama işleminden sonra güncellenir; yeni seviye sonraki ücretsiz dönüşte uygulanır. Örnek: metre 3, iki Hasan, 5× ve 20× balık: 25× ×2 ×1 =50× toplama. Metre 5 olur, +10 dönüş gelir, sonraki dönüş 2× toplama çarpanındadır.

Her Hasan, para balığı olmasa da metreye eklenir. Birden fazla eşik aynı dönüşte aşılırsa her eşik bir kez ödüllendirilir. Metre en fazla 12'dir; 12 sonrası tekrar ek dönüş yoktur, Hasan'lar 10× toplama yapmaya devam eder.

| Toplam Hasan | Seviye | Toplama çarpanı | Yeni dönüş |
|---|---:|---:|---:|
| 0–3 | 1 | 1× | Başlangıç 10/15/20 |
| 4–7 | 2 | 2× | 4 eşiğinde +10 |
| 8–11 | 3 | 3× | 8 eşiğinde +10 |
| 12 | 4 | 10× | 12 eşiğinde +10 |

Bonus dönüşünde Hasan var ve para balığı yoksa, %20 ihtimalle dinamit tetiklenir. Scatter/Hasan dışındaki farklı pozisyonlardan 1, 2 veya 3 sembol 10/15/20/25/50/2000× değerli para balığına dönüşür. Bütün Hasan'lar dönüştürülmüş balıkları da toplar. Normal çizgi kazancı **dinamit öncesindeki** board'dan hesaplanır; dönüşüm ikinci bir çizgi ödemesi oluşturmaz. Diğer durumlarda dinamit olmaz.

Ana dönüş ve ona bağlı bütün ücretsiz dönüşlerin toplamı 2.100× temel bahisle sınırlıdır. Limitte ödeme kırpılır ve bonusun kalan dönüşleri sıfırlanır. Sunucu limiti uygular; animasyonlar üst limiti değiştiremez.

## Yayımlanan özgün RNG modeli

`secrets.SystemRandom` üretim RNG'sidir. Sonuçlar kullanıcı kimliği, bakiyesi veya geçmiş kaybına göre değişmez. İstemci board, fish value, multiplier, seed veya payout gönderemez. Konfigürasyon `balikci-math.json` içinde versiyonludur.

Her dönüşte bir sembol ailesi ağırlıklı seçilir. On temel sembolün baz ağırlıkları eşit; seçilen ailenin ağırlığı 2,5× artırılır. Ana/bonus aile karışımları ayrı ve açıktır. Bu, fiziksel reel strip'lerini kopyalamadan özgün bağımlı board dağılımı üretir. Makara kayması görseldir; gerçek sonuç sunucunun gönderdiği board'dur.

Ana scatter sayısı 0…5 için ağırlıklar `[700000,330000,90000,9000,900,100]`, toplam 1.130.000. Üç veya fazlası için toplam 10.000: tetikleme olasılığı **tam 1/113**. Scatter'lar rastgele farklı hücrelere yerleştirilir. Bonus başlangıcı tetiklendiğinde sayılara bağlı 10/15/20 dönüş gelir. Bonus dönüşlerinde scatter yoktur.

Bonus Hasan sayısı 0…4 için `[8200,1470,283,45,2]`, toplam 10.000. Farklı hücrelere yerleştirilir. Para balığı, dinamit sayısı ve değeri ayrı ağırlıklı çekilir. Tam değerler config'tedir; 2000× nadirdir ama üretilebilir.

Normal çizgi beklentisi analitik olarak hesaplanmıştır. N scatter için ilk k çizgi hücresinde scatter olmaması `C(15−N,k)/C(15,k)` ile bulunur. Bir sembolün olasılığı p ise k önek eşleşme olasılığı bu katsayı ×p^k'dir. Çizgi beklentisi `PAY3×P3 + (PAY4−PAY3)×P4 + (PAY5−PAY4)×P5`. Her çizgi aynı marjinal dağılıma sahip olduğu için beklentiler 10 çizgi üzerinden toplanır; çizgilerin birbirinden bağımsız olduğu varsayılmaz. Aileler ve scatter sayıları üzerinden ağırlıklı toplam normal oyun RTP'sini verir. Normal oyun için analitik beklenti **%46,8221**; bonus beklentisi cap/retrigger ile ayrıca simüle edilmiştir. Bu, toplam RTP'nin analitik sertifikası değildir.

## Ölçüm ve sınırları

Toplam RTP hedefi **%96,71**; yüksek volatilite. Bonus sıklığı hedefi yaklaşık 113 dönüşte bir. Hiçbiri tek oyuncunun sonucunu garanti etmez. Matematik `calibration-pending` olarak işaretlenir; başka bir oyunun sertifikalı RTP'si bu özgün modele atfedilmez.

Son sabit konfigürasyonda seed 753893 ile **1.000.000 ücretli tur**, tetiklenen bütün bonus zincirleri ve caps dahil:

| Ölçüm | Sonuç |
|---|---:|
| Tahmini toplam RTP | %96,7689 |
| %95 normal yaklaşımlı güven aralığı | %93,9523–%99,5855 |
| Ücretli dönüşte çizgi kazancı sıklığı | %12,2345 |
| Bonus tetikleme | 8.890 / 1.000.000 = %0,889 |
| Gözlenen bonus aralığı | Yaklaşık 112,49 dönüş |
| Simüle edilen ücretsiz dönüş | 121.875 |
| 2× / 3× / 10× seviyeye ulaşan bonus sayısı | 1.256 / 388 / 265 |
| Cap'e ulaşan tur | 5 |
| Gözlenen maksimum ödeme | 2.100× |

Ana dönüşte ödeme sıklığı yalnızca çizgi ödemesini sayar, bahis üstü kâr değildir. RTP, her ücretli turdan sonra onun tüm ücretsiz dönüşlerini bitirerek toplam ödeme/toplam bahis olarak hesaplanır. Çizgi ve bonus örnekleme varyansları nedeniyle ana/bonus katkı tahminleri ayrı sapabilir. Büyük kazançların kuyruğu geniştir; güven aralığı bağımsız sertifikasyon değildir. Tam rapor `balikci-statistics.json`; yeniden çalıştırma `python tests/balikci_simulate.py --n 1000000 --seed 753893`.

## Ortak cüzdan ve güvenilirlik

Mevcut `User.lidya`, `GameRound`, `GameBet`, `GamePlay` kullanılır. Dede'nin `eris:dede:fraction:<user>` sabit UUID'siyle saklanan 0–99 remainder kaydı **Dede, Şeker Sarayı ve Balıkçı Hasan arasında ortaktır**. Yeni bir fake balance veya migration yoktur. Ücret ve kazanç yüzde bir Lidya biriminde tam sayı hesabıyla yazılır; küsurat kaybolmaz.

User satırı `FOR UPDATE`, `populate_existing` ile kilitlenir. Debit/credit, fraction, bonus state, GamePlay ve UUID başına persistent receipt tek transaction'dadır. Başarısız RNG/DB işlemi rollback olur. Eski bonus request_id'leri de replay edilir; ikinci debit/credit yapılmaz. Bonus sahibi, sequence ve kilitli stake kontrol edilir. Yeni paid spin açık Hasan bonusu varken reddedilir; başka oyunların açık bonus kayıtları değiştirilmez. Moderation feature gate uygulanır.

Frontend pending UUID'yi kullanıcı kimliğine göre sessionStorage'da saklar. Network/5xx sonrası aynı istek tekrar denenir. 4xx'te pending temizlenir, 409'da aktif state yeniden alınır. Close veya başka oyun açılması server bonusunu silmez. Açılışta aktif state ve son board yeniden getirilir. Görsel total yalnızca reel, line, dynamite, collect ve metre işlemleri bittikten sonra count-up ile yükselir. Display cüzdanı response'tan alınır.

## Render, ses ve logo düzeltmesi

Canvas 2D, 750×450 logical alan, DPR en fazla 2, ResizeObserver, requestAnimationFrame ve capped delta. Beş ayrı clipping alanında uzun reel strip'leri EaseOutBack benzeri duruşla kayar. Semboller gerçek PNG alpha atlasından drawImage ile çizilir; rank metinleri de üretilmiş PNG'dir. Yalnız balık nakit değeri canlı Canvas text'tir. Paylines glow; her Hasan için balık değerleri ışık çizgileri ve flying text ile çekilir. Dinamit bir yay çizerek fırlatılır, kırmızı flash, screen shake ve parçacık etkisi oluşturur; yeni balıklar belirir. Metre noktaları parlar, 1×/2×/3×/10× stage aktifleşir. Reduced motion süreleri en aza iner; dinamit flash/shake reduced mode'da kapalıdır. 60 FPS hedefidir, bütün cihazlarda doğrulanmış sabit performans garantisi değildir.

Ses dış MP3 gerektirmez: modüle edilmiş bubble oscillator, filtreli reel/dynamite noise, catch/line/metre armonikleri. Tek AudioContext, ilk kullanıcı hareketinde unlock, en fazla 8 voice. Mute/hidden/close kaynakları durdurur. Ses tercihi saklanır.

Şeker Sarayı eski tam boy sahne kartı yerine diğer oyunlarla aynı **2:1 görsel ve eg-launcher-card / pg-cover** düzenini kullanır. Altın aslan armalı mermer şeker kapağı, başlık/açıklama/Oyna alt bölümünde. `games-png-premium.js` seker/balikci için açık custom asset eşlemesi kullanır; eksik `scene-seker.png` veya `scene-balikci.png` yoluna dönmez. Aynı kartta ikinci img oluşmaz. Balıkçı Hasan kartı da aynı düzendedir. Her iki tema aynı premium kapak sanatını kullanır, panel/metin renkleri mevcut uygulama temasına uyar. İçeride eski Şeker Sarayı scene/symbols değiştirilmez.

## Doğrulama

11 izole Python test grubu: input/rules, tek debit/receipt replay, fraction, bonus resume/owner/sequence/old receipt, yetersiz bakiye/rollback/feature gate, cap, shared Dede remainder ve stale auth, left-to-right çizgi/wild best-only, çoklu collector ve stage, dynamite guard/value, scatter/fish/main wild yasağı ve çoklu threshold. Bütün testler sahte test DB'sinde, canlı cüzdan olmadan çalıştırıldı.

Chromium: 390×844 mobil ve 1280×900 masaüstü; açık/koyu; üç oyun kartında aynı 2:1 image ölçüsü, tek image ve doğru kapak URL; Hasan adı; reel animasyonu; collect bitmeden total'in önceki seviyede kalması; metre 5/12 ve 2× seviye; dinamit; bonus resume; rules focus/Escape; otomatik durdurma/close sonrasında yeni istek oluşmaması; JS errors yok. API fixture'ları gerçek Python engine trace'lerinden üretildi. Canlı Railway deploy, bağımsız RTP sertifikasyonu veya PostgreSQL eşzamanlı yük testi yapılmadı.
