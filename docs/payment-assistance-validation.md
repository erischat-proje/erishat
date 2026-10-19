# DA destekli tek ödeme akışı

Paket penceresi korunur. Paket tıklanınca fiyat, temel/bonus ve toplam Lidya ile
Kabul et (solda) / Reddet (sağda) yüzen penceresi açılır. Reddet veya X hiçbir
istek oluşturmaz. Kabul, sunucu kataloğundaki paketin değişmez fiyat/tutar
fotoğrafıyla kalıcı istek oluşturur; istemci fiyat veya Lidya gönderemez.

## Durumlar

| Durum | Müşteri | DA | Sonraki adım |
|---|---|---|---|
| pending | Kuyruk bilgisi, mesaj kutusunda istek | Yükleme İsteği kaydı | Tek bir DA kabul eder |
| connecting | Kabul edildi penceresinde X | Müşteriye bağlanıyorsunuz penceresinde X | İki ayrı X onayı |
| chat | Mesaj/fotoğraf | Mesaj/fotoğraf, yükleme, karar | Talebe bağlı yükleme veya ret |
| finishing | Salt okunur görüşme | Teşekkür penceresi | DA X ile tamamlar |
| approved | Görüşme mesaj kutusundan kaldırılır | Görüşme kaldırılır | Denetim arşivi saklanır |
| rejecting | Görüşme kapatılır | Kapatılamayan zorunlu ret beyanı | 3–300 karakter + Gönder |
| rejected | Sonuç/ret nedeni bildirimi | Görüşme kaldırılır | Denetim arşivi saklanır |
| cancelled | Bekleyen istek iptal edildi | Kuyruktan çıkar | Denetim arşivi saklanır |

İlk pakete tıklamak ve DA'nın kabul etmesi bakiye eklemez. Her iki tarafın X
onayı gelmeden mesaj gönderilemez. İki onaydan sonra “Mesaj kutunuzu kontrol
edin” penceresi gelir; Mesajlar içindeki ödeme görüşmesi normal DM'lerden ayrı
bir kayıt olarak açılır. Mevcut kişisel konuşmalara dokunulmaz.

DA ekranının başlığında müşteri ID bulunur; altında solda “İşlem onaylandı”,
sağda “İşlem reddedildi” vardır. Sağ üst X yalnızca görüşme ekranını kapatır,
işlemi bitirmez; DA arkada kontrol yapıp geri dönebilir. “Lidya yüklemesi”
görüşmeden veya istek kartından açılır. DA, bu görüşmedeki dekontu ve bankadan/
sağlayıcıdan doğruladığı referansı seçer. Sunucu bonus dahil paket tutarını tek
bir bağlı yükleme olarak ekler. Son “İşlem onaylandı” yalnızca kapanışı başlatır;
teşekkür penceresinin X'i iki taraftaki görüşmeyi kaldırır, ikinci bakiye yazmaz.

## Yetki, eşzamanlılık ve mali kayıt

- Kuyruk, kabul, yükleme, karar ve arşiv yalnızca gerçek DA rolüne açıktır.
  Müşteri kendi isteğine; görüşmede ise müşteri ve atanmış DA erişebilir.
- Kabul atomik `UPDATE ... WHERE status='pending'` ile yapılır. PostgreSQL'de
  DA rolü ve istek satırı kilitlenir. Aynı müşteri için tek açık istek, aynı DA
  için tek üstlenilmiş görüşme ayrıca kısmi benzersiz indekslerle korunur.
- İstek/mesaj anahtarları tekrar denemelerde idempotenttir. Aynı anahtarla farklı
  paket veya farklı mesaj/fotoğraf kabul edilmez.
- Yüklemede istek → kullanıcı kilidi, benzersiz ödeme referansı/dekont özeti,
  benzersiz `assisted-<request UUID>` işlem anahtarı vardır. Referans/dekont
  rezervasyonu bakiye değişiminden önce yapılır. Bakiye, `LidyaOperation`, bağlı
  istek, olaylar ve bildirimler aynı SQL transaction içinde tamamlanır.
- Mevcut `system_data` Lidya ledger dinleyicisi kullanılır; actor/reference/amount
  bilgisi `db.info` içine yazılır. Aktif ödeme isteği olan müşteri için bağımsız
  genel manuel ekleme engellenir; yükleme yeni talebe bağlı formdan yapılır.
- Önceki/sonraki bakiye, toplam, referans ve fotoğraf ID'si denetim kaydındadır.
  Yükleme sonrası ret veya kuyruğa bırakma engellenir.
- 10 dakika heartbeat gelmeyen veya yetkisi alınan/hesabı kapanan DA'dan başka
  bir DA açıklamayla görevi devralabilir. Son kabul zamanı da dikkate alınır;
  sırf ilk heartbeat henüz gelmedi diye yeni kabul edilmiş istek devralınamaz.
- Kuyruk en eski istekten başlayarak sayfalanır. Arşiv en yeni kayıttan başlar.
  Bekleyen istek müşteri tarafından iptal edilebilir; atanmış DA yüklemeden önce
  gerekçe ile kuyruğa bırakabilir. Her geçiş olay günlüğüne yazılır.

## Dekontlar ve konuşma

JPEG/PNG/WebP, en fazla 3 MB ve 20 milyon piksel. Görsel doğrulanır; yönü
uygulanır, 2048×2048 sınırında JPEG'e dönüştürülerek EXIF/ek içerik atılır.
Fotoğraf yalnızca kimliği doğrulanmış, isteğe yetkili endpoint'ten `private,
no-store` yanıtıyla alınır. Public medya URL'si veya URL'de token kullanılmaz.
Görüşmede 30 fotoğraf, 1000 mesaj; metin 2000 karakter ve saniyede bir gönderim
sınırı vardır. Mesaj ve olay arşivleri sayfalıdır. Kart numarası/CVV metinleri için
mevcut ödeme sohbeti doğrulaması korunur.

Kapatılan konuşma ve fotoğraflar katılımcıların görüşme endpoint'inden erişilemez.
DA denetim arşivindeki yetkili okuma yolları açık kalır. “Silme” mesaj kutularından
kaldırmadır; kullanıcının istediği tam ödeme kaydı, konuşma ve dekont geçmişi
ayrı veritabanı tablolarında korunur. Hesap değişiminde pencereler, taslaklar,
fotoğraf object URL'leri ve önceki hesabın görünür kayıtları temizlenir.

## Eski sistem ve dağıtım

Eski `/v1/purchases/orders` oluşturma, belge bildirme, Mail Order kabul/mesaj ve
karar yolları HTTP 409 ile kapatılır. Eski okumalar, kullanıcı iptali ve denetim
kayıtları korunur. Eski açık kaydı olan müşteri yeni paket penceresinde bunu görür;
kendisi açıkça iptal edip yeni akışa geçebilir. Önceden yapılmış ödemeyi DA'ya
belirtmesi istenir. Eski bir kayıt sessizce onaylanmaz veya bakiye yüklenmez.

Dört yeni tablo `payment_assistance` modülünün ana uygulamada import edilmesiyle
mevcut `Base.metadata.create_all` başlangıcında oluşur. Mevcut tablolardan satır
silinmez veya mevcut kolon değiştirilmez. Referans PostgreSQL DDL bu klasördedir;
normal dağıtım için ayrıca SQL çalıştırmak gerekmez. Backend ve frontend aynı
PR'den dağıtılmalıdır; frontend yeni API hazır olmadan eski ödeme yoluna dönmez.

## Doğrulama ve sınırlar

- Gerçek FastAPI ve SQLAlchemy ile yerel SQLite testleri; yabancı anahtarlar açık.
  Mevcut Lidya ledger dinleyicisi dahil. Fiyat/bonus, idempotency, yetkiler,
  iki X kapısı, fotoğraf mahremiyeti, ret, devir, eski kayıt geçişi ve sayfalama.
- Eşzamanlı iki DA kabulü, iki müşteri isteği, iki X onayı ve iki yükleme isteği çalıştırıldı:
  tek görev, tek istek, tek bakiye yüklemesi ve tek mali ledger kaydı doğrulandı.
  Benzersizlik yarışları 500 yerine 409'a çevrilir ve transaction geri alınır.
- İki ayrı Chromium oturumunda müşteri + DA ile gerçek yerel API uçtan uca:
  7 TL/399 Lidya paketi, ret ile kayıt oluşturmama, kuyruk, iki X, dekont yükleme,
  DA'nın çıkıp geri dönmesi, tek seferlik 399 yükleme, son onay/X, iki kutudan
  kaldırma, arşiv/dekont görüntüleme, zorunlu ret ve hesap değiştirme geçti.
- İki tema × beş viewport: 320×568, 393×850, 568×320, 768×1024, 1280×800.
  Genel uygulama CSS'leriyle fiyat penceresi sığması ve düğme erişimi kontrol edildi.
- JS/Python sözdizimi, PostgreSQL DDL/indeks derlemesi, HTML yükleme sırası ve
  kurucu kaynak SHA / dosya ağacı / ana dal yarışı korumaları kontrol edilir.

Gerçek banka/sağlayıcıdan ödeme alınmadı. Tutar ve referans doğrulaması DA'nın
manuel kontrolüdür; bu paket banka entegrasyonu eklemez. Üretim PostgreSQL üzerinde
ve gerçek Railway oturumlarında test yapılmadı. PostgreSQL kilit/transaction
akışının gerçek üretim dağıtımı sonrası küçük bir test isteğiyle son kontrolü
DA tarafından yapılmalıdır. Yeni testler üretim veritabanına yöneltilmemelidir;
yalnızca kendilerine ayrılmış geçici test tablolarını kullanırlar.
