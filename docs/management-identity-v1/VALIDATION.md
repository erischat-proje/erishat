# ErisChat ortak yönetim kimliği

SA, UA, FA ve DA aynı ErisChatYönetim adı, marka avatarı, dört rozet ve ortak dört harfli çerçeve kullanır. Krem/altın ve zümrüt/altın PNG sürümleri uygulama temasıyla değişir. Envanter bu iki özel ürünü kilitli gösterir. Diğer hesaplar bunları normal kozmetik anahtarlarıyla alamaz.

Sunucu kimliği mevcut admin_roles tablosundan hesaplar. Asıl nickname/avatar/avatar_asset/frame_asset sütunları korunur; veritabanı göçü gerekmez. Yetki kaldırıldığında saklanan görünüm yeniden kullanılır. Profil değişikliği, ücretli ad değiştirme, avatar/çerçeve satın alma ve uygulama yollarında sunucu kontrolü vardır. Profil ayrıntıları ortak sunumla gösterilir.

Hesaplar, oturumlar, izinler ve denetim kullanıcı ID'leri ayrı kalır. Dört rozet görsel bir standarttır; dört rolün yetkilerini vermez. Bu değişiklik mutlak anonimlik sağlamaz: hesap ID'leri, yetkili yönetim ekranları, geçmiş içerikler ve diğer hesap ilişkileri ayrı olabilir. Ses/video veya kullanıcıların kendi paylaştıkları bilgileri gizlemez.

Doğrulama:
- Gerçek SQLAlchemy modelleri + SQLite: dört rol, bekleyen/flush edilmiş rol atama ve kaldırma, rol değişimi, normal düzenleme, değiştirilemeyen alanlar, korunmuş ham sütunlar, detached nesne, SQL satır projeksiyonu/alias/filtreleme.
- Gerçek FastAPI rozet endpoint'i: ortak kimlik, normal kullanıcı, 100 kullanıcı sınırı, yetki kaldırma yanıtı.
- Gerçek UserOut şeması: ortak profil ayrıntıları ve orijinal kaydın korunması.
- Gerçek endpoint gövdeleri, izole bağımlılıklar: görünüm/ad değişikliği ve satın alma reddi DB/ücret işleminden önce.
- Playwright/Chromium: 320/393/1024 genişlik, iki tema PNG yüklenmesi, dört rozet, çerçevenin kırpılmaması, yatay taşma olmaması, normal kullanıcı, canlı atama/kaldırma, eski API yanıtının yeni yetki olayını ezmemesi, observer döngüsü olmaması.
- Python derleme, JS sözdizimi, paket SHA-256 ve ZIP bütünlük kontrolü.

Çalıştırma:
python tests/staff-identity.test.py   # backend gereksinimleri + httpx
node tests/staff-identity.browser.cjs # playwright; CHROMIUM_PATH isteğe bağlı

Bunlar izole geliştirme kontrolleridir. Üretim PostgreSQL, tam uygulama e2e ve dağıtım çalıştırılmadı. Birleştirmeden önce taslak PR incelenmeli; sonrasında gerçek oturumla profil/oda/sohbet ve rol kaldırma kontrol edilmelidir.
