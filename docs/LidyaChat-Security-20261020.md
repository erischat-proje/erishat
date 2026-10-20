# LidyaChat güvenlik güncellemesi — 20 Ekim 2026

Bu güncelleme uygulama katmanında doğrulanmış erişim açıklarını kapatır ve kötüye kullanımın maliyetini artırır. Bütün saldırı ihtimallerinin veya veri sızıntılarının engellendiği iddia edilmez.

## Kapatılan / güçlendirilen noktalar

| Alan | Değişiklik |
|---|---|
| Özel mesajlar | Önce kaydedilip asıl güvenli handler'ı gölgeleyen iki eski rota kaldırıldı. Kilitli sohbet PIN'i, üyelik, gizlenmiş mesaj, engelleme, mesaj isteği ve sistem sohbeti kuralları tek akıştan uygulanır. |
| ID ve yönetim sorguları | Mevcut DA yetki kontrolü gerçek API testinde doğrulandı. Sahte istemci rol başlığı yetki sağlamaz. Kimlik sorgularına doğrulanmış hesap başına ortak DB sınırı eklenir. |
| OTP | Tüm OTP tüketicileri aynı satırı kilitleyerek tazeler; daha önce yüklenmiş nesne tekrar kullanılamaz. Adres başına gönderim ve IP başına kimlik doğrulama bütçesi bulunur. |
| Hata sızıntısı | SMTP hata ayrıntıları, doğrulama girdileri ve hesap silme SQL hata metinleri istemci/log çıktılarından çıkarıldı. |
| Oturumlar | Hesap sahibi kendi oturumlarını görür ve diğer oturumları kapatır. Ham erişim belirteçleri dönmez. Geçersiz oturumların boşta duran WebSocket bağlantıları da en fazla 30 saniyede kapatılır. |
| Bakiye | 28 mevcut kullanıcı satırı kilidinde eski ORM nesnesi yenilenir. Dönüşüm tekrar anahtarı, kullanıcı kilidi alındıktan sonra kontrol edilir. Anahtarın farklı işlemle kullanılması 409 döner. |
| Taşıma | HTTP yöntem, adres, başlık, gövde, JSON derinlik/yapı ve eşzamanlı gövde sınırları; WebSocket kaynak, oturum biçimi, mesaj/bağlantı sayısı, JSON ve 64 KiB mesaj sınırı. |
| Dosya ve tarayıcı | API yanıtları no-store/nosniff; statik gizli dosya/anahtar/yedek yolları reddedilir; aynı kaynak çerçeve politikası; üretimde API şeması kapalı. |
| Bağımlılıklar | FastAPI 0.150.0, Starlette 1.9.0, python-multipart 0.0.32, requests 2.34.2. Son yerel taramada 68 kurulu paket içinde bilinen açık bildirilmedi. Bu sonuç gelecekteki açıklara karşı garanti değildir. |

## Geçici e-posta

- İki kaynaktan 97.689 alan adı birleştirildi. Alan ve alt alan eşleşmesi yapılır; büyük/küçük harf ve IDN/Unicode nokta normalleştirilir.
- OTP kayıt, giriş, e-posta bağlama, kod tüketimi ve doğrulanmış Google e-postası sunucuda kontrol edilir. Eski doğrulamasız hesap üretme yolu 410 döndürür; anonim profil adı kullanılması yasaklanmaz.
- Kullanıcının e-posta adresi harici sorgu servisine gönderilmez. Sabit HTTPS adreslerinden yalnız alan adı listeleri alınır; dış kaynağın kodu çalıştırılmaz.
- Başlangıçta ve 24 saatte bir yenilenir. Kaynak başına 3 MB, en az 1.000 alan adı, toplam en fazla 250.000 alan adı, yönlendirmesiz indirme ve atomik dosya değişimi kullanılır. Ağ hatasında gömülü/son liste korunur.
- `backend/app/security_data/disposable_extra.txt` ek engeller, `disposable_allow.txt` yanlış engellemeleri düzeltmek içindir. Düzenlemeler güvenilir kod/depo erişimi gerektirir. Gmail/Outlook/Proton gibi gerçek sağlayıcılar veya artı adresler isim benzerliğiyle engellenmez. Katı freemail/yönlendirme listeleri kullanılmaz.
- Mevcut hesaplar/veriler otomatik silinmez; yeni OTP girişleri politikaya tabidir. Doğrulanmış oturumu olan mevcut bir hesap kendi silme doğrulamasını yapabilir.
- Yeni açılan veya listelere henüz girmeyen geçici posta servislerinin hepsi yakalanamaz. Liste eşleşmesi gerçek kişi doğrulaması değildir.

## Ekranın açık tutulması

Ayarlar'daki **Ekranı açık tut** varsayılan olarak açıktır ve cihazda saklanır. Web tarafında görünür belge için Screen Wake Lock istenir; gizlenince/sayfa kapanınca bırakılır, görünür olunca yeniden istenir. İstek sürerken görünürlük/tercih değişirse geç gelen kilit de bırakılır. İşletim sistemi reddinde yeniden deneme döngüsü oluşmaz.

APK'da `FLAG_KEEP_SCREEN_ON` yalnız Activity ön plandayken uygulanır; `onPause` temizler, `onResume` tercihe göre yeniden uygular. JavaScript köprüsü yalnız mevcut güvenilir sayfa için tercih değiştirebilir. Bu kısım yeni APK kurulmasını gerektirir. Tarayıcı desteği veya işletim sistemi güç politikası nedeniyle web kilidi her cihazda garanti edilemez. Fiziksel güç düğmesiyle ekranı kapatma engellenmez.

## Doğrulama

Yerel olarak gerçek FastAPI uygulaması, gerçek SQLAlchemy modelleri ve izole SQLite kullanıldı. SQLite otomatik artan BigInteger anahtarları testte Integer ile uyarlandı; bu değişiklik üretim modellerine uygulanmadı. Üyelik/PIN/mesaj gizleme, sahte rol, oturum sahipliği ve iptali, eski bakiye, tekrar anahtarı, OTP tek kullanım, geçici e-posta, WebSocket gerçek giriş/mesaj kontrolleri geçti. Ortak sayaçta 40 paralel istekten tam sekizi kabul edildi. Taşıma sınırları, 20 MB multipart gövdesi ve listelerin ağ hatası davranışı test edildi.

Chromium'da ayarlar, ekran seçeneği, oturum iptal onayı, geri dönüş ve hesap değişimi kontrol edildi. Web Wake Lock için istek/ret/görünürlük/yarış durumları taklit edilen sistem API'siyle test edildi. Android Java sözdizimi ayrıştırıldı; yerelde Android SDK derlemesi veya fiziksel telefon testi yapılmadı.

`LidyaChat Security Checks` işi PR'da ayrıca izole PostgreSQL üzerinde gerçek eşzamanlı dönüşüm, Caddy yapılandırma doğrulaması, bağımlılık taraması ve imza anahtarı kullanmadan Android Java derlemesi çalıştırır. Bu CI sonuçları paket hazırlanırken henüz yoktur. Geçmeden birleştirilmemelidir.

## Kapsam sınırları / işletim

- Ağ seviyesindeki büyük DDoS, sağlayıcı güvenlik duvarı, veritabanı/hesap ele geçirilmesi, yedekleme/geri yükleme, zararlı kullanıcı cihazı ve bilinmeyen açıkların tamamı bu kodla çözülemez. APK/JavaScript kaynaklarının kullanıcı tarafından incelenmesi tümüyle engellenemez; yetki ve bakiye güveni sunucudadır.
- Bu çalışma bütün 500'den fazla uç noktanın tam sızma testi, bütün oyun matematiğinin bağımsız denetimi veya üretim yük testi değildir. Belirtilen senaryolar doğrulandı; mevcut yetkili özellikler körlemesine kapatılmadı.
- Ortak DB sayaçları API süreçleri arasında paylaşılır; kaba HTTP ve bağlantı sınırları süreç başınadır. IP tabanlı sınırın doğruluğu sunucunun gerçek istemci adresini güvenilir proxy üzerinden almasına bağlıdır. Kod, rastgele `X-Forwarded-For` başlıklarını kendisi güvenilir kabul etmez. Üretimde NAT/proxy ve yük koşulları izlenerek sınırlar ayarlanmalıdır.
- Yeni `security_counters` tablosu mevcut başlangıç `create_all` akışıyla oluşur. Sayaç anahtarları özetlenir; e-posta veya IP düz metin saklanmaz. Süresi geçen sayaçlar seyrek temizlikle kaldırılır. Sayaç veritabanı kullanılamazsa hassas işlem 503 ile bekletilir.
- Yeni/başka web alan adları kullanılırsa CORS ayarına açıkça eklenmelidir. Arka plan veri indirmesi başarısız olması uygulamayı kapatmaz.
- Geri alma, PR değişikliklerini git üzerinden geri alarak yapılabilir. Kullanıcı verisi silen bir şema geçişi yoktur. Yeni tablo eski sürüme dönüldüğünde boşta kalabilir.

## Başvuru kaynakları

- https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- https://developer.android.com/develop/background-work/background-tasks/awake/screen-on
- Geçici alan listelerinin kaynak/lisansları: `backend/app/security_data/SOURCES.md`.
