# VIP V2 — satın alma, 30 günlük koruma ve 12 seviyelik doğrudan ödüller

Bu belge `vip-privileges-v1.md` içindeki puan özelliklerinin yerine geçer. VIP puanı kazanma ve puan mağazası kaldırıldı. Tarihsel puan alanları yalnızca veri kaybını önlemek için saklanır; hak, fiyat, bakiye veya satın alma koşulu değildir. Eski puan alma/satın alma uçları 410 döndürür.

## Seviye tablosu

VIP, **doğrulanmış ve hesaba yüklenmiş Lidya paketlerinin bonus dahil toplamıyla** yükselir. Harcama, hediye, transfer, oyun kazancı ve genel yönetici bakiye eklemesi VIP satın alımı sayılmaz.

| VIP | Toplam satın alınan Lidya | 30 günlük yükleme hedefi (%5) | Yeni doğrudan ödül — her biri kadın/erkek ayrı |
|---|---:|---:|---|
| 1 | 4.000 | 200 | Sardis Altın Arması |
| 2 | 15.000 | 750 | Kehribar Durum İşlemesi |
| 3 | 40.000 | 2.000 | Sardis Şafak Kapağı |
| 4 | 90.000 | 4.500 | Safir Karşılama Kartı |
| 5 | 180.000 | 9.000 | Zümrüt Hediye Mührü |
| 6 | 350.000 | 17.500 | Paktolos Hanedan Kapağı |
| 7 | 700.000 | 35.000 | Safir Avlu Oda Dekoru |
| 8 | 1.300.000 | 65.000 | Hanedan Saray Bahçesi |
| 9 | 2.300.000 | 115.000 | Yakut Kraliyet Mührü |
| 10 | 4.000.000 | 200.000 | Hükümdar Taht Sahnesi |
| 11 | 6.500.000 | 325.000 | İmparatorluk Profil İşlemesi |
| 12 | 10.000.000 | 500.000 | Lidya Kraliyet Sarayı |

Her seviyede yeni ödül vardır; boş seviye yoktur. Alt seviye ödülleri de açılır. İlave puan veya para ödenmez, ayrıca alma/claim şartı yoktur. Profil → VIP içindeki 12 seviye koleksiyonundan kadın/erkek görsellerinin ikisi de büyütülerek incelenebilir; **Kullan** hesabın cinsiyetine uygun PNG'yi sunucuda seçer. Seçili ödül kapatılabilir. Aynı alandaki kapak/mühür/sahneler arasından tek seçim yapılır.

## 30 günlük dönem

- Süre seviyeye ulaşılan anda başlar; takvim ayı değildir, 30 × 24 saattir.
- Örnek: VIP 5'te 13 gün kalmışken VIP 6'ya yükselme, bitişi yükselme anından 30 gün sonrasına taşır.
- Yükselten satın alımın tamamı yeni dönemin koruma hedefine sayılır. Daha önceki satın alımlar yeniden sayılmaz.
- Aynı seviyedeki yükleme sayacı sıfırlamaz. Hedefi erken bitirmek dönemi uzatmaz.
- Dönem sonunda hedef karşılanmışsa seviye korunur; hedef karşılanmamışsa **1 kademe düşer**. Her iki durumda yeni dönem sıfır yükleme ilerlemesiyle başlar.
- Minimum VIP 0'dır. Çevrimdışı geçen her başarısız dönem de sırayla işlenir. VIP 0'da koruma sayacı durur.
- **500 Lidya bakım ücreti yoktur. Bakiye otomatik kesilmez.**
- Geçmiş toplam silinmez. Eski toplam tek başına düşen seviyeyi geri getirmez. Yeni yükleme, daha önce kazanılmış bir seviyenin %5 hedefini mevcut dönemde karşılıyorsa o seviyeye geri çıkılabilir; yeni bir toplam eşiğinin geçilmesi normal yükseliş sağlar. Her gerçek yükseliş yine 30 günü başlatır.

VIP ekranında bitiş zamanı, kalan süre, dönem yüklemesi, hedef ve eksik miktar görünür. Metin açıkça “30 gün içinde … Lidya satın almazsan VIP seviyen 1 kademe düşecektir” der. `? → VIP seviye sistemi` alanında tablo, örnekler, süre sıfırlama, düşüş, geri yükselme, mevcut hesap geçişi ve ödül kullanım kuralları açıklanır.

## Mevcut hesap geçişi

Geçerli VIP seviyesi geçişte korunur; yeni modelde ilk işleme alınma anında tam 30 günlük koruma tanınır. Sadece geçmiş onaylı LidyaOrder ve yüklemesi tamamlanmış PaymentRequest kayıtları satın alım toplamına alınır. Harcama toplamı satın alma olarak dönüştürülmez. İçe aktarılan işlemler aynı satın alma defterine işlenir; tekrar bildirim miktarı artırmaz. Geçerli dönem içe aktarılan tarihsel ödemelerle doldurulmaz.

Düşüşte kilitli üst seviye ek görünümler kapanır. Üst VIP avatar/çerçeve/duvar seçimi kaldırılır; normal mağaza sahiplikleri ve normal görünümler korunur. Süreli deneme kartları kendi bitişlerine tabidir. VIP/giriş gizleme ve hareket azaltma tercihleri korunur.

## Görseller

24 özgün PNG: VIP 1–12 × kadın/erkek. Ek olarak aynı görsellerin 24 küçük PNG önizlemesi vardır. Tam boy üretim görselleri uygulamanın profil, durum, giriş, hediye ve oda yüzeylerinde kullanılır. Küçük önizlemeler liste açılışındaki veri yükünü azaltır. Şeffaf kart/çerçevelerin orta ve dış alanları gerçek alpha içerir. Üretim promptları `vip-v2-art.json` içindedir. Toplu önizleme teslim paketinde ayrıca bulunur.

## Uygulama ve doğrulama

Üç ek tablo: `vip_purchase_memberships`, `vip_purchase_receipts`, `vip_cycle_audits`. Başlangıçtaki create_all'a platform modelleri üzerinden kaydedilir. Eski sütunlar düşürülmez. Backend/frontend birlikte dağıtılmalıdır.

Doğrulanmış satın alım, mevcut ödeme yüklemesiyle **aynı işlemde** kaydedilir. Ana ve kozmetik oturum kontrolleri dönemleri yeniler; arka plan görevi çevrimdışı hesapları da 60 saniyelik aralıklarla işler. Ödeme/ödül kararlarında sunucu yetkilidir. Döngü ve kayıt işlemleri kullanıcı kilidi altında yürür; işlem kimlikli kayıtlar tekrarları engeller. İlgili eski kullanıcı bağımlılıkları korunur.

Çalıştırılan kontroller:

- 17 yeni VIP motoru testi: tam eşikler, harcama ayrımı, tekrar bildirim, 13 → 30 gün, değişmeyen aynı seviye sayacı, dönem sınırı, düşüş, çevrimdışı dönemler, VIP 0, geri yükseliş, geçmiş ödeme importu ve atomik rollback.
- 20 ayrıcalık API testi: puan uçlarının kapanması, ücretsiz seviye hakları, 12 seviyenin kadın/erkek önizlemeleri, sunucuda varyant seçimi, seviye düşüşü, kupon, sahiplik ve gizlilik.
- 20 mevcut ödeme akışı testi: yeni VIP defteri dahil gerçek yükleme, idempotency, eşzamanlı aynı ödeme ve bakiye akışı regresyonları.
- Tarayıcı: 12 seviye/24 önizleme, etkinleştirme/kalıcılık, kadın/erkek geçişi, seviye kilitleri, rehber ve 320/393/768 piksel × açık/koyu tema.
- PNG tam decode/alpha kontrolleri, Python/JS sözdizimi, OpenAPI, yama bütünlüğü ve özgün dosya korunumu.

Canlı üretim veritabanında test veya dağıtım yapılmadı. Gerçek PostgreSQL çoklu worker yenileme yük testi ve gerçek iki kullanıcıyla oda/giriş/hediye canlı denemesi bu oturumun dışındadır. Eski harcama tabanlı VIP smoke testleri yeni politika için geçerli değildir; yeni testler satın alma motorunu çalıştırır. Eski AST/staff_identity fixture sorunları önceki raporda belgelenmiştir.
