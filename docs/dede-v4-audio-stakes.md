# Dede v4: gerçek ses kayıtları ve bahis adımları

## Ses

Eski osilatör biplerinin yerine gerçek CC0 ses kayıtlarından düzenlenmiş 8 MP3: spin (rüzgâr/şuş), land (para/metal inişi), burst (cam kırılması), collect (cam tınısı), thunder (gök gürültüsü), payout (para sayımı), win (cam kaydından kademeli armoni), bonus (uzun cam armonisi). Kayıtlar kırpıldı, fade ve seviyeleri ayarlandı; son iki armoni cam örneklerinin perde/gecikme katmanlarıdır. Kaynak oyunların ses dosyaları kopyalanmadı. Arka plan orkestral müziği veya konuşma içermez.

Kaynaklar ve doğrulanmış CC0 lisansları:

- qubodup — [Glass Ding](https://freesound.org/people/qubodup/sounds/189318/)
- doudar41 — [Coins02](https://freesound.org/people/doudar41/sounds/573342/)
- sfx4animation — [whoosh noise](https://freesound.org/people/sfx4animation/sounds/432244/)
- AyaDrevis — [Thunder strike](https://freesound.org/people/AyaDrevis/sounds/652690/)
- reg7783 — [breaking_glass1](https://freesound.org/people/reg7783/sounds/204185/)

Freesound'un açık HQ önizlemeleri kullanılmıştır. Kaynak sayfalarındaki kendi lisans bağlantıları CC0 olarak doğrulandı. Dosyalar ve işlem süreleri `assets/lidya-dede-audio/sources.json` içindedir.

Tek AudioContext, decode edilmiş örnekler ve en fazla 8 eşzamanlı ses. İlk kullanıcı hareketi sesi açar; varsayılan açık, kullanıcı kapatınca tercih saklanır. Mute, sekme gizlenmesi ve kapatma sesleri durdurur. Yüklenemeyen ses oyun/bakiye işlemini bozmaz. Sesler ilk dağıtım, düşüş sonu, patlama, küre uçuşu, şimşek, sayaç ve bonus panosuna bağlıdır. İki tema aynı sesleri kullanır. Kazanç gösteriminin animasyon sonunda açılması korunur.

## Bahis

| Aralık | +/− adımı |
|---|---:|
| 1–200 | 50 |
| 200–1.000 | 100 |
| 1.000–5.000 | 200 |
| 5.000–10.000 | 250 |

Başlangıç 50, minimum 1, maksimum 10.000 Lidya. Sınır aşılacaksa tam sınıra oturur. Sınırdan yukarı üst bant, aşağı alt bant kullanılır: 200+ = 300, 200− = 150; 1.000+ = 1.200, 1.000− = 900; 5.000+ = 5.250, 5.000− = 4.800. 10.000+ değişmez. Bu sadece Dede bahis +/− kontrolüdür; kullanıcı cüzdanı butonlarla değiştirilmez.

Sunucu artık yalnızca 20 katı koşulu yerine 1–10.000 arası strict tam sayıları kabul eder. Eski açık 20-katı bonuslar devam eder; aktif bonus sırasında bahis değiştirilemez.

## Kesirli Lidya

50/250 bahisler .25× gibi ödemelerde kesir üretebilir. Ödeme/ante bedeli yüzde bir Lidya biriminde tam sayılarla hesaplanır; küsurat kesilmez. Mevcut User.lidya tam sayı sütunu korunur. Dede için kullanıcıya ait sabit UUID'li `GameRound` kaydı (`game_type=dede_wallet,status=ledger`) 0–99 yüzde birlik kalanı saklar. User satır kilidi altında para ve kalan tek transaction içinde yazılır; yeni tablo/migrasyon yoktur. GameBet tam sayı cüzdana gerçekten yazılan borç/alacakları, GamePlay makbuzu gerçek kesirli bedel/kazancı kaydeder. Dede bakiye ve toplam kazanç iki ondalık gösterebilir; diğer uygulama alanları mevcut tam sayı cüzdanı kullanır. Kesir Dede'de tutulur ve sonraki ödemelerde tam Lidya'ya dönüşür.

Örnek: 50 bahiste .25× = 12.50 Lidya; ilkinde 12 tam + .50 kalan, ikincisinde 13 tam + 0 kalan. Kullanıcının Dede bakiyesi her ikisini tam olarak yansıtır. 1 Lidya ante = 1.25; ücret ve kalan tam hesaplanır. Tekrar istekte ikinci debit/credit oluşmaz; kullanıcının eski bonus kaydı yeni alanlar yokken de devam eder. Sembol/çarpan ağırlıkları ve matematiksel ödeme tablosu değişmedi.

## Doğrulama

12 izole Python test grubu: eski ödeme/bonus/idempotency/erişim/cap/rollback/identity/parity, yeni küsurat taşıma, 1-Lidya ante, yeni miktarlar ve eski bonus. Node adım testi: 1..10.000 bütün değerler, aralık geçişleri ve iki yönlü sınırlar. Playwright: yeni başlangıç/+−, 8 MP3 gerçekten decode/play, mute/close, iki tema dar ekran, kazancın patlama/toplama bitmeden görünmemesi. Canlı cüzdan ve PostgreSQL eşzamanlı yük testi yapılmadı.
