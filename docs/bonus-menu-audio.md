# Bonus alımı, ortak menü ve Dog Party ses dengesi

Bu yama Hasan ve Dog Party'ye ayrı satın alma girişi ekler. Dede, Prenses ve Dog Party launcher kartlarını diğer oyunların ortak eg-launcher-card/eg-lc sınıflarıyla çizer. PNG kapak alanı her kartta 2:1 olur. Prenses ve Dog Party için object-fit:contain tüm resmi korur; başlık kırpılmaz. Dede’nin panoramik arka planı sağa hizalı cover ile mevcut karakter kadrajına oturur. Resmin kendi oranına göre kenarlarda küçük boşluk oluşabilir. Kart içinde ikinci kapak oluşturulmaz. Her menü kendi kartını seçer; ilk kartın görselini yanlışlıkla değiştiremez. Aynı --pg-secondary mermer buton ve sağa hizalı ok kullanılır. Yeni PNG logo üretilmez; mevcut kapaklar korunur.

## Satın alma

Her iki oyun: temel bahsin 100 katı ücret. 50 Lidya bahis örneğinde 5.000 Lidya. Onay paneli ücret, bakiye ve dönüş sayısını gösterir; Vazgeç/Escape ücret almaz. Onay tek istek üretir. Yetersiz bakiye, aktif bonus, bekleyen istek ve devam eden spin satın almayı engeller. Bonus esnasında bahis kilitlidir. Tek ve geçmiş request_id tekrarları ikinci ücret/ödeme üretmez; kullanıcı kilidi ve ortak küsurat defteri korunur.

Hasan satın alma: 10 dönüş, metre 0, başlangıç 1×. Mevcut 4/8/12 Hasan -> +10 dönüş ve 2×/3×/10× devam eder. Satın alma profili hasan-buy-v1 içinde Wild sayım ağırlıkları [6900,2750,300,48,2]; normal/natural bonus profili [7500,2150,300,48,2] değiştirilmez. Toplam 2.100× limit aynı kalır. Eski v1 ve v3 açık doğal bonuslar kendi motoruyla devam eder.

Dog Party satın alma: 9 hücrede 1/2/3 toplamı 9–27 dönüş. Satın alma çarkı ağırlıkları [0.6595482577904477,0.24045174220955232,0.1]; normal tetiklenen çark [50,35,15] olarak kalır. Satın alımda boş sticky harita; bonus içi Wild dağılımı, toplama kuralı ve 6.750× tur limiti değiştirilmez. Satın alma anında normal Scatter 5× ödemesi eklenmez; doğrudan ücretsiz dönüşler açılır.

Bu satın alma dağılımları ErisChat'e ait ayrı profillerdir. Doğal bonus motoruyla aynı fiyatı ve RTP'yi varsaymak yerine ayrı ölçüldü. Orijinal sağlayıcının kapalı bonus satın alma matrisi veya her piyasadaki sürüm özellikleri olarak sunulmaz.

## Ölçüm

Her modda 100.000 bağımsız satın alma, tüm retrigger ve toplam limit dahil:

| Satın alma | Seed | Ölçülen RTP | %95 güven aralığı | Simüle edilen ücretsiz dönüş |
|---|---:|---:|---:|---:|
| Hasan | 304847 | %97,6640 | %96,5850–98,7430 | 2.002.029 |
| Dog Party | 404849 | %96,1225 | %95,2101–97,0349 | 1.294.635 |

Hasan'da 75 tur 2.100× limite ulaştı. Dog Party'de gözlenen en büyük satın alma 2.986,85×, örnekte limit olayı yok; limit deterministik mevcut testte doğrulanır. Dog Party satın alma çarkı limit öncesi analitik beklentisi %96,5100. Bunlar sertifikalı kesin RTP değildir. Normal oyun ölçümleri bu moddan ayrı tutulur. Tam raporlar hasan-buy-statistics.json/dogparty-buy-statistics.json.

Tekrar üretim: `python tests/bonus_buy_simulate.py balikci --samples 100000 --seed 304847 --out hasan-buy.json` ve `python tests/bonus_buy_simulate.py dogparty --samples 100000 --seed 404849 --out dogparty-buy.json`.

## Dog Party sesleri

Önceki yüksek tepe/çoklu parlak çan katmanları değiştirildi. Yeni land/wheel kısa ve yumuşak ahşap sesi, line/bonus/win düşük ve orta register'da özgün pluck/marimba benzeri seslerdir. Havlama kaydının kimliği korunur; spin swish yumuşatılır. Dosyalar stereo 32kHz PCM; ses seviyesi RMS ile dengelenir, tepe <=0,28 (yaklaşık −11dBFS), 4,2kHz alçak geçiren süzgeç ve kısa fade uygulanır.

Web Audio ana kazanç 0,65'ten 0,42'ye iner; ayrıca land 0,45, wheel 0,30 ve bark 0,55 olay kazancı vardır. En çok 4 eşzamanlı ses; bark 1,2s, wheel 0,20s, land 0,09s cooldown. Mute/arka plan/çıkış temizliği korunur. Yeni audio-v2 dosya yolu ve script cache sürümü eski yüksek dosyaları tekrar kullanmaz. Seviye raporu dogparty-audio-levels.json içindedir. Prenses sesleri bu yamada değiştirilmez.

Kaydı korunan havlama: michael_grinnell, CC0 1.0, https://freesound.org/people/michael_grinnell/sounds/464400/ . Önceki paketteki kaynak ve lisans kaydı korunur. Diğer yeni cue'lar özgün sentezdir; sağlayıcının sesleri kullanılmaz.

## Araştırma

Big Bass resmî mekanik açıklaması: https://www.pragmaticplay.com/en/games/big-bass-bonanza/ — 3/4/5 Scatter, 10/15/20 dönüş, dört balıkçıyla retrigger ve seviyeler.

Dog House resmî açıklaması: https://www.pragmaticplay.com/en/games/the-dog-house-slot/ — 5×3/20 çizgi ve orta makaralarda multiplier/sticky Wild.

Sağlayıcı bazı farklı serilerde satın alma seçeneklerini ayrıca belirtir (örneğin Big Bass Bonanza 1000): https://www.pragmaticplay.com/en/news/pragmatic-play-supercharges-fan-favourite-series-in-big-bass-bonanza-1000/ . Bu farklı sürümün 20.000× veya özel sembolleri mevcut Hasan'a taşınmadı. Resmî orijinal sayfalarda net satın alma fiyatı/dağılımı verilmediğinden burada kendi 100× profilleri açıkça belgelendi; diğer sürümler özgün oyunla aynıymış gibi sunulmaz.

## Doğrulama

37 sunucu test grubu: önceki 17 Hasan + 13 Dog Party grubu korunur; 7 satın alma grubu eklenir. Tek/late replay, sıfır başlangıç metresi/sticky harita, sahibi/sırası, insufficient balance, fiyat/dönüş sayısı enjeksiyonu, RNG hatasında geri alma, ayrı Hasan dağılımı ve eski doğal bonus devamı test edilir.

Tarayıcı: mobil iki tema ve masaüstü; tüm menü kartlarında bir resim, eşit 2:1 kapak alanı ve aynı mermer CTA; Dog/Hasan satın alma vazgeç/onay/tek istek, çark/10 dönüş, bonus durdurma/devam, yetersiz bakiye, bonus sırasında satın alma kilidi, odak sınırı, 8 sessizleştirilmiş WAV decode ve çıkış temizliği. Kapağı başka karta atayan seçici regresyonu ayrıca kontrol edilir.

Kurulum payload dışındaki oyun dosyalarını değiştirmez. Ana HTML sürümleri yenilenir; ortak satın alma helper'ı iki oyundan önce yüklenir. Paket iki kez uygulandığında route/script çoğalmaz. Sparse clone büyük ilgisiz varlıkları indirmez; ZIP CRC ve dosya SHA-256 doğrulanır.
