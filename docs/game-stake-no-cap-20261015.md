# Bağımsız oyunlarda sabit bahis tavanının kaldırılması

Taban: auth-unified-v1, 4f66dc5; #277 sonrası.

Özel 13 slot, klasik slot, blackjack, crash, şans çarkı, dört kupa, at yarışı ve kasa için sunucu/arayıüzdeki sabit bahis tavanları kaldırıldı. Genel eski tek turluk oyun yolundaki tavan da kaldırıldı. Oda oyunlarının kendi bahis ayarları bu paketin kapsamı değildir.

Özel slotlarda pozitif tam sayı; klasik bahislerde mevcut en az 10 ve 10’un katı kuralı sürer. Hazır 10/100/1.000/10.000/100.000 seçenekleri tavan değil artış adımıdır. Sunucu, bahis ya da bonus bedelinin tamamı için mevcut kilitli bakiyeyi kontrol eder. Bakiyeyi aşan işlem reddedilir; UUID tekrarları ikinci ücret/ödeme üretmez. Açık bonusun kilitli bahsi ve matematik sürümü korunur. Kazanma olasılıkları, çarpanlar ve tur kazanç tavanları değiştirilmemiştir.

Eski altı test hatasının beşi geçerli ara bahisleri yanlışlıkla geçersiz sayıyordu (blackjack 858.993.460; crash 50/500; klasik slot 500; çark 500). Diğeri Şeker Sarayı’nın eski 10.000 üst sınırını bekliyordu. Testler güncel sınırsız üst bahis politikasına göre düzeltildi; yalnız test susturulmadı, gerçek sunucu ve arayüz tavanları da kaldırıldı.

Klasik slotun bonus hesaplarındaki stake ve UUID makbuzlarındaki amount alanları BIGINT’e genişletildi. Sunucu açılışındaki mevcut şema güncellemesi, bu alanlar INTEGER ise bir kez genişletir; zaten BIGINT olanlara dokunmaz. Mevcut kayıtlar veya bonuslar silinmez.

## Teknik sayı aralığı

Sabit oyun limiti yoktur; oyuncu, işlem bedelini bakiyesinden karşılamalıdır. Arayüz JavaScript’in kesin tam sayı aralığını korur (Number.MAX_SAFE_INTEGER); bu bir oyun ürünü tavanı değildir. Veritabanı para alanları BIGINT’tir. Matematiksel olarak sonsuz büyüklükte tutarlar desteklenmez. Bu paket tüm para altyapısını keyfi hassasiyetli sayı sistemine dönüştürmez.

## Doğrulama

- tests/ taraması: 506 test geçti, hata yok.
- Gerçek API/SQLite yollarında tüm 13 özel oyunda 2 milyar üzeri normal bahis ve bonus satın alma; yetersiz bakiye reddi; UUID tekrarında değişmeyen bakiye.
- Klasik slot, çark ve crash için 3 milyar bahis; blackjack için 1 trilyon bahis ve doğal blackjack ödemesi.
- Klasik slotta 3 milyar kilitli bonus bahsinin devamı ve tek ödeme. PostgreSQL tablo tanımlarının BIGINT olarak derlenmesi.
- Üretimde kullanılan şema genişletme döngüsünün iki kez çalıştırılmasında idempotency testi. Canlı PostgreSQL’e bağlanılmadı.
- Ortak bahis seçicisinin eski tavanlar üzerinde artırma/azaltma ve tam sayı hassasiyeti testi. Değişen JavaScript dosyalarının tümünde sözdizimi kontrolü.
- Termux kurulum betiği yerel test deposunda doğrulandı; GitHub yazma işlemi testte taklit edildi.

Komutlar: `python -m pytest -q tests`, `node tests/dede-stakes.test.cjs`. Uygun backend bağımlılıklarının kurulu olduğu Python ortamı kullanıldı. Tarayıcıda etkileşimli görsel test yapılmadı. Kök pytest taramasının önceki eksik psycopg/Pillow bağımlılıkları bu paketin kapsamında değildir.
