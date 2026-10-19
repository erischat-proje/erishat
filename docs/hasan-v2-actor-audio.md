# Balıkçı Hasan v2: karakter, toplama sahnesi ve gerçek ses

Kullanıcı geri bildirimi: makaradaki Hasan, menü kapağındaki Hasan ile aynı kişi gibi görünmüyordu; toplama yalnızca çizgi ve sayı uçuşuydu; synth sesler balıkçılık hissi vermiyordu. V2, aynı karakter yüzünü sahne/collect/metre boyunca kullanır, balıkların kendisini hareket ettirir ve gerçek kayıtlardan düzenlenen 12 MP3 ile olayları seslendirir.

## Oyun araştırması ve uygulanması

İncelenen birincil kaynaklar:

- [Pragmatic Play — Big Bass Bonanza](https://www.pragmaticplay.com/en/games/big-bass-bonanza/)
- [Pragmatic Play — Turns Fishing to Spins](https://www.pragmaticplay.com/en/news/pragmatic-play-turns-fishing-to-spins-in-big-bass-bonanza/)

Resmî özet 3/4/5 scatter için 10/15/20 dönüş, wild'ın bütün nakit balıklarını toplaması, her dördüncü wild'da +10 dönüş ve 2×/3×/10× ilerlemeyi destekler. Dinamit, Hasan'ın olduğu fakat balığın olmadığı bonus dönüşü koşuluyla açıklanır. Özet, dinamit için %20 gibi kesin olasılık veya gizli reel strip'lerini yayımlamaz. Bizim %20 değerimiz önceki kullanıcı teknik şartnamesi ve özgün Lidya modeline aittir. Başka serinin Keeping It Reel, Splash, 1000 vb. özellikleri temel oyuna karıştırılmadı.

Sunucu mekanikleri, cüzdan, idempotency, ek dönüşler, config ve 2.100× cap v1'deki haliyle çalışır. V2 sonuç üretmez, sonucu görselleştirir. Matematik değiştirilmediği için yeni RTP ölçümü veya sertifikasyon iddiası yoktur; önceki özgün modelin ölçüm raporu geçerlidir. Hasan oyun sahnesinde ana karakterdir; wild/toplayıcı sembol olarak yalnızca bonus dönüşlerinde görünür.

## Aynı Hasan yüzü

Stil/kimlik referansı önceki `frontend/assets/lidya-balikci/menu-cover.png` kapağındaki özgün kurgusal Hasan'dır. Gerçek bir kişinin fotoğrafı sağlanmadı. Built-in image generation, bu aynı karakter için dört saydam PNG poz üretti: idle, cast, reel, celebrate. Üretilmiş görsel alpha bileşenlerinden pozlar ayrıldı; portre aynı idle görselinin yüz kesitidir. Kodla yeni yüz/simge çizilmedi.

Renderer, s=11 hücrelerinde eski atlasın genel balıkçı yüzünü kullanmak yerine aynı `actor-v2/portrait.png` görüntüsünü çizer. Bonus metre portreleri de aynı dosyadır. Sahnedeki farklı pozlar aynı şapka, kısa gümüş sakal, yeşil-altın ceket ve Hasan yüzüne sahiptir. Kimlik referansı oyun kapağıdır; Pragmatic Play'in karakter varlıkları indirilip kopyalanmadı.

Dosyalar:

- `frontend/assets/lidya-balikci/actor-v2/idle.png`
- `frontend/assets/lidya-balikci/actor-v2/cast.png`
- `frontend/assets/lidya-balikci/actor-v2/reel.png`
- `frontend/assets/lidya-balikci/actor-v2/celebrate.png`
- `frontend/assets/lidya-balikci/actor-v2/portrait.png`

Kullanılan imagegen prompt'u:

> Use case: identity-preserve. Reference is the EXACT identity for Hasan, the fictional main character of original ErisChat fishing game. Create a transparent PNG character animation pose sheet with FOUR evenly spaced columns in one horizontal row, no labels or borders. Same exact smiling mature Turkish-looking fisherman face from reference, same silver short beard, eyebrows, brown hat with gold lion medallion, dark emerald coat with gold embroidery. Four waist-up poses: 1 idle smiling toward viewer, hands holding rod low at side; 2 casting rod to right, dynamic arm extension and rod bending; 3 reeling a catch with both hands on reel, leaning back slightly in concentrated excitement; 4 celebrating holding one silver-green bass up, joyful broad smile. Same consistent identity and outfit in all four poses, fully isolated with true alpha transparency, generous empty space between each figure so they can be cleanly extracted. Use premium realistic 3D game art, sharply readable expressive face, detailed hands, natural anatomy, polished gold fishing equipment. No scenery, boat, text, boxes, existing casino characters or branding. Fit all four figures inside image with no clipping; wide 1536x1024 or 2048x1024 composition. The face must match the supplied menu-cover character, not a different generic old fisherman.

## Collect animasyonu ve UI

1. Makaralar sırayla durur; 3+ scatter'lı sonuçta son makaralar için altın anticipation ve hafif uzayan duruş.
2. Hasan görünür; aynı yüz makara/sahne/metrede okunur.
3. Dinamit gerekiyorsa fırlatma, patlama ve su sesi; yeni balıklar görünür.
4. Her Hasan için ayrı cast: oltanın ışık eğrisi balıklara uzanır.
5. Reel: gerçek balık PNG'leri ve canlı değer etiketleri Hasan'a doğru hareket eder. Board'daki kaynak balıklar geçici olarak soluklaşır; ikinci Hasan aynı balıkları ayrı toplar.
6. Catch: yakalama sesi, sevinme pozu ve toplama sayacı. Bu alt sayaç ham collector miktarıdır; sunucunun cap uygulanmış toplam kazancı son count-up'ta gösterilir.
7. Metre: her seviye için dört Hasan portresi. Toplam 5/12 olduğunda 2× aşamasında bir portre dolu, sonraki 3× için üç Hasan gerektiği yazılıdır. 12'de dört portre dolu ve 10× maksimum aşama görünür. Ana oyunda bonus metresi gizlidir.
8. Tur kazancı, toplama/metre akışı bitince yükselir. Küsurat ve ücret daima sunucu cevabından alınır.

Actor tween timer'ı close ile iptal edilir ve bekleyen promise çözülür. Başka oyun açma, close, tab hide ve mute yeni otomatik dönüş/ses akışını kontrol eder. Reduced motion actor CSS hareketlerini kapatır; gerçek ödeme akışı devam eder. Panel ek bonus metresiyle ekrandan uzun olsa da kapatma düğmesi erişilebilir, içerik dikey kaydırılabilir.

## Gerçek kayıtlar ve lisanslar

HQ önizlemeler, kaynak sayfalarında doğrulanan **CC0 1.0** seslerinden alındı:

| Kaynak | Kayıt | Kullanım |
|---|---|---|
| [BranndyBottle 464697](https://freesound.org/people/BranndyBottle/sounds/464697/) | fishingreel_throw | Cast |
| [Harrisando 466205](https://freesound.org/people/Harrisando/sounds/466205/) | FishingReel | Spin/reel/land |
| [qubodup 442773](https://freesound.org/people/qubodup/sounds/442773/) | Big Water Splash | Splash/catch |
| [Evan Cruder 160797](https://freesound.org/people/Evan%20Cruder/sounds/160797/) | Real dynamite recording | Explosion |
| [doudar41 573342](https://freesound.org/people/doudar41/sounds/573342/) | Coins02 | Line/catch/payout |
| [qubodup 189318](https://freesound.org/people/qubodup/sounds/189318/) | Glass Ding | Meter/bonus/win |

Dosya işlemi: mono 44,1 kHz, kesim, 25 ms başlangıç/bitiş fade, 0,62 peak seviyesine normalizasyon, 128 kbps MP3. Catch ve payout gerçek kayıtların katmanıdır; win/bonus gerçek cam tınısının pitch/delay katmanıdır, osilatör sentezi değildir. Konuşma, Hasan'ın taklit sesi veya kaynak casino oyununun sesleri içermez. Aktif oyunda dış Freesound bağlantısına istek atılmaz; MP3'ler uygulamadan yüklenir. Kaynak URL'leri, boyutlar, süreler ve SHA-256 `hasan-v2-sources.json` / audio `sources.json` içindedir.

12 dosya: spin .95 s, reel .85 s, cast 1.08 s, splash .72 s, catch .75 s, land .13 s, line .36 s, meter .40 s, explosion 1.25 s, payout .85 s, bonus 1.8 s, win 1.4 s. Tek AudioContext, decode cache, hafif compressor, en çok sekiz eşzamanlı voice ve olay başına sınır. İlk kullanıcı hareketi context'i açar. Mute/hidden/close sesleri durdurur; close bekleyen fetch'leri abort eder. Eksik/bozuk ses oyunu ve para işlemini bloke etmez; eski bip sentezi kullanılmaz.

## Doğrulama ve kurulum

Chromium mobil 390×844, masaüstü 1280×900, açık/koyu tema: beş PNG load; yeni actor pozları/portre; 12 MP3 gerçek decode; spin/land/cast/reel/catch/meter/payout/bonus/explosion/splash kaynaklarının playback olayları; collect sırasında toplam kazancın önceki değerinde kalması; 5/12 örneğinde dört portreden birinin dolu olması ve üç Hasan sonra 3× ifadesi; bonus resume; mute ile sıfır voice; close ile sıfır banka; collect ortasında close timer/promise cleanup; rules focus/Escape; JS error yok. Sesin decode/play akışı doğrulandı; kullanıcı cihazlarında hoparlör dengesi öznel olarak değişebilir. Canlı API/cüzdan yerine gerçek Python engine trace'leriyle fixture kullanıldı.

Backend ve matematik dosyaları v2 paketinde değiştirilmez. İlk kurulum PR #252 gerektirir. Yeni clone `--filter=blob:none --no-checkout` ve doğrudan sparse-checkout ile yalnız gerekli HTML/JS/CSS'yi alır; diğer binlerce görsel checkout edilmez. Sekiz MiB ilgisiz binary içeren yerel fixture'da bu binary'nin ne checkout edilmediği ne blob paketine girmediği doğrulandı. Installer iki kez uygulandığında audio script'i bir kez eklenir ve ana game script'inden önce gelir. Payload EOF'ları temiz; git diff --check geçti. Dağıtım taslak PR'dır, merge veya canlı deploy yapmaz.
