# LidyaChat Yönetim Çalışma Alanı V6

Bu sürüm yönetim menüsünün tamamını kapsayan ortak çalışma katmanını ve aşağıdaki somut geliştirmeleri içerir. Envanter 32 aracı kapsar; her aracın altında daha önce olmayan tüm işlevlerin tamamlandığı anlamına gelmez. Mevcut uzman akışları korunur.

## Bütün menüde

- Araç ve görev açıklamasında Türkçe arama; görev alanına göre süzme; hesaba özel cihaz favorileri.
- Sunucudan yalnız mevcut rolün kullanabileceği araçlar gelir. Sayaçlar sahte örnek veriden üretilmez; kapsam dışındaki destek görüşmeleri sayılmaz.
- Aynı açık/koyu Lidya PNG kartları ve yönetim kimliği korunur. SA/UA/FA profil satırında Ghost Mode bilgisi bulunmaz; mevcut ? rehberi korunur.
- Eksik uzman modülü sessizce menüyü gizlemez. Oturum değişmiş eski panel yeni hesapla işlem başlatamaz.

## Buton envanteri

| Buton | Erişim | Bu sürümdeki çalışma | İş akışı |
|---|---|---|---|
| Destek talepleri (`tickets`) | SA, UA, FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Talebi kabul et → görüşmeyi tamamla → gerekçeli sonuçlandır. |
| Duyuru gönder (`announcement`) | FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Metni kontrol et → yayınla → aktif duyuruları yönet. |
| Uygulama Geri Bildirimi Paneli (`gaps`) | DA | Ortak menüye alındı; mevcut uzman akışı korundu | Kaydı aç → ayrıntıları incele → mevcut panelde sonuçlandır. |
| Yükleme İsteği (`payments`) | DA | Ortak menüye alındı; mevcut uzman akışı korundu | Talep → kanıt kontrolü → mevcut ödeme kararı. |
| Ghost Mode (`ghost`) | DA | Açarken otomatik değiştirme yerine açık durum seçimi | Durumu kontrol et → açıkça onayla → oturum görünürlüğünü değiştir. |
| Kullanıcı Ban (`ban`) | UA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Hedef → kanıt → süre → yetkili karar. |
| Oda Ban (`roomban`) | UA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Oda ve hedef → delil → süre → karar. |
| CHAT/DM BAN (`chatban`) | UA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Hedef → kanıt → süre → karar. |
| Ban talepleri (`banrequests`) | FA, DA | Sunucuda arama, durum ve tarih; sayfalamada filtre korunur | Kanıtı incele → bağımsız onay veya ret. |
| Oda ban talepleri (`roombanrequests`) | FA, DA | Sunucuda arama, durum ve tarih; sayfalamada filtre korunur | Oda ve hedefi doğrula → delili incele → karar. |
| Sohbet ban talepleri (`chatbanrequests`) | FA, DA | Sunucuda arama, durum ve tarih; sayfalamada filtre korunur | Kapsam ve delili kontrol et → karar. |
| İtiraz talepleri (`banappeals`) | FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | İlk karar ve ek kanıt → tarafsız itiraz kararı. |
| ID Sorgu (`lookup`) | DA | Yeni arama/dizin ve korumalı hesap özeti | Kullanıcıyı bul → profil kimliğini doğrula → ilgili araca geç. |
| Hesap Silme (`deleteaccount`) | DA | Yeni hedef özeti, yazılı ID ve açık kalıcı işlem onayı | ID sorgula → hedefi doğrula → kalıcı işlem onayı. Yetkili hesap silinemez. |
| Yönetici Rolleri (`roles`) | DA | Yeni kalıcı talep, farklı yönetici kararı ve uygulama | Hedefi doğrula → gerekçeli talep → farklı yönetici kararı. |
| SA işlemleri (`saactions`) | DA | Rol/aktör/tarih/işlem filtreli, alanlara ayrılmış denetim; eski FA kaynağı erişilebilir | Filtrele → kaydı incele → görüntülenen kayıtları dışa aktar. |
| UA işlemleri (`uaactions`) | DA | Rol/aktör/tarih/işlem filtreli, alanlara ayrılmış denetim; eski FA kaynağı erişilebilir | Filtrele → gerekçe ve hedefi incele. |
| FA işlemleri (`faactions`) | DA | Rol/aktör/tarih/işlem filtreli, alanlara ayrılmış denetim; eski FA kaynağı erişilebilir | Filtrele → karar ve aktör ayrıntılarını incele. |
| DA işlemleri (`daactions`) | DA | Rol/aktör/tarih/işlem filtreli, alanlara ayrılmış denetim; eski FA kaynağı erişilebilir | Filtrele → gerekçe, aktör ve zamanı incele. |
| Ban işlem logları (`banlogs`) | DA | Sunucuda arama ve tarih; sayfalamada filtre korunur | Kaydı incele → mevcut yetkili geri alma akışı. |
| Oda ban işlem logları (`roombanlogs`) | DA | Sunucuda arama ve tarih; sayfalamada filtre korunur | Kaydı incele → mevcut yetkili geri alma akışı. |
| Sohbet ban işlem logları (`chatbanlogs`) | DA | Sunucuda arama ve tarih; sayfalamada filtre korunur | Kaydı incele → mevcut yetkili geri alma akışı. |
| Lidya yükleme (`topup`) | DA | V5 bağımsız mali onay zincirine bağlanır | Kanıtlı talep → inceleme → farklı son onay. |
| Lidya İşlemleri · Yönetim (`lidya`) | DA | V5 bağımsız mali onay zincirine bağlanır | Talebi veya kaydı seç → kanıt ve geçmişi incele. |
| Referans Kod Oluştur (`referrals`) | DA | Ortak menüye alındı; mevcut uzman akışı korundu | Tür ve kullanım sınırı → kod oluştur → kullanımını izle. |
| Güvenlik Merkezi (`security`) | DA + güvenlik sahibi | Ortak menüye alındı; mevcut uzman akışı korundu | Mevcut güvenlik merkezi doğrulaması ile devam et. |
| Güvenlik Merkezi (`lm-command`) | SA, UA, FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Önceliği gör → dosyayı aç → ilgili iş akışına geç. |
| Olay Dosyaları (`lm-cases`) | SA, UA, FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Dosya aç → delil topla → incele → bağımsız karar. |
| Acil Müdahale (`lm-emergency`) | UA, FA, DA | Ortak menüye alındı; mevcut uzman akışı korundu | Dosya ve hedef → gerekçe ve süre → tedbir → bağımsız geri alma. |
| Lidya Denetimi (`lm-finance`) | FA, DA | V5 bağımsız mali onay zincirine bağlanır | Talep sahibi → farklı inceleyen → farklı son onaycı. |
| Dolandırıcılık İnceleme (`lm-fraud`) | DA | Ortak menüye alındı; mevcut uzman akışı korundu | Gösterge → gerçek işlem → inceleme sonucu veya dosya. |
| Yönetici Denetimi (`lm-audit`) | DA | Rol/aktör/tarih/işlem filtreli, alanlara ayrılmış denetim; eski FA kaynağı erişilebilir | Filtrele → detay → görüntülenen kayıtları dışa aktar. |

## Rol değiştirme davranışı

1. DA kullanıcıyı sorgular; mevcut rol ve kimliği görür.
2. Yeni rolü veya yetki kaldırmayı açıkça seçer; en az 20 karakter gerekçe ve doğru profil ID ile talep oluşturur. Bu adım rolü değiştirmez.
3. Talep sahibi ve hedef dışındaki farklı, aktif bir DA gerekçeli onay/ret verir. Talep sahibi kendi bekleyen talebini geri çekebilir.
4. Uygulama sırasında talep sahibinin güncel yetkisi, hedefin aktifliği ve rol anlık görüntüsü tekrar kontrol edilir. Eski görüntüyle işlem reddedilir.
5. Rol değişimi, talebin sonucu, denetim ve bildirimler aynı transaction içinde kaydedilir. Tekrarlanan onay yeni bir rol değişimi üretmez. Mevcut Ghost/rozet geri çağrıları korunur; yayın gecikirse kullanıcıya ayrıca bildirilir.

**Uyumluluk etkisi:** eski `PUT /v1/admin/roles` ve `DELETE /v1/admin/roles/{user_id}` artık 409 döner. Yetki bu uçlardan tek kişiyle değiştirilemez. En az iki farklı aktif DA gerekir; hedef DA ise hedef de karara katılamadığından üçüncü bir DA gerekir. Tek DA bulunan kurulumda ikinci hesap mevcut `INITIAL_DA_PUBLIC_IDS` başlangıç mekanizmasıyla ayrıca hazırlanmalıdır; bu paket gizlice yetki vermez veya ortam değişkeni değiştirmez.

## Veri ve dağıtım

Yeni `management_role_requests` tablosu mevcut startup `create_all` yoluyla oluşturulur. Kimlik anlık görüntüleri kullanıcı FK cascade silmesine bağlanmaz; talep ve karar izi hesap kaldırma ile kendiliğinden kaybolmaz. Eski tablo kolonları değişmez. Readiness hem yeni tabloyu hem yeni yolları kontrol eder. API sürümü `20261022-management-workspace-v6`; web sürümü `management-workspace-v6-20261022`. Yeni JS/CSS ve değişen ban/denetim betikleri birlikte yayınlanmalıdır.

## Doğrulama ve sınırları

- Geçici SQLite üzerinde gerçek router/DB testleri; rol kapsamı, özel araçların alt role sızmaması, destek sayacının kapsamı, dizin filtre/sayfalama, hesap özeti erişim kaydı, rol onay/ret/geri çekme, kendi talebi/hedef kontrolü, eski rol görüntüsü, geri alınmış talep sahibi yetkisi, idempotent sonuç ve zorlanan hata sonrası rollback.
- Gerçek DOM/form olayları ve taklit HTTP ile tüm 32 kart/handler, açık/koyu görsel yolları, Türkçe araç arama, favoriler, açık onay, hata/tekrar ve hesap değişimi testleri.
- Kullanıcı/oda/sohbet talepleri ve loglarının sunucuda arama/tarih/durum ve filtreli sayfalama testleri. Arama mevcut rol kapsamını genişletemez; listeler ham kanıtı içermez.
- V5 dosya/acil/mali iş akışı, mevcut ödeme ve duyuru regresyonları da birlikte çalıştırılır. Eski FA geçmişi ayrı kaynak seçimiyle erişilebilir; geçmiş veri taşınmaz veya silinmez.
- Gerçek tarayıcıda uçtan uca akış, PostgreSQL yarış/yük testi, canlı hesapla yazma ve dağıtım yapılmadı. DOM testi gerçek tarayıcı testi olarak sunulmaz.

## Sonraki geliştirme alanları

Bu paket profesyonelleştirmenin ilk uygulanan aşamasıdır. Destek/ödeme/itiraz/güvenlik araçları kapsamlı kendi modüllerinde çalışır; bunların her biri için daha derin iş ekranları ayrı kabul senaryolarıyla ilerlemelidir:

| Alan | İleri aşamanın kabul ölçütü |
|---|---|
| Destek | Atama sınırlarını koruyan gelişmiş kuyruk filtresi; destek kaydından olay dosyasına izin kontrollü bağ; kapanış sonucunun izlenmesi. |
| Yaptırım ve itiraz | Ortak olay/kanıt bağları; dosya, ilk karar, itiraz ve geri alma geçmişinin tek görünümde doğrulanması. Mevcut karar politikası ayrıca test edilmeli. |
| Ödeme ve referans | Ödeme görüşmesi, dekont, makbuz ve düzeltme arasında takip; mevcut para/ödül tutarları değiştirilmeden sınır ve tekrar testleri. |
| Hesap silme | Bu sürüm mevcut güvenli silme ve hedef onayını korur; ayrı ikinci yönetici silme onayı veya saklama politikasını uygulamaz. Denetim verisinin saklanması ve gerçek şema üzerindeki geri alma senaryosu ayrıca ele alınmalı. |
| Duyuru ve geri bildirim | Hedefleme, taslak/yayın yönetimi ve sorun takip durumlarının ürün kapsamına göre genişletilmesi. Bu sürüm mevcut yayın davranışını korur. |
| Güvenlik | Mevcut sahip/OTP/geçici oturum sınırlarını genişletmeden staging üzerinde olumlu/olumsuz senaryolar. |
| Yayın | Ayrı SA/UA/FA/DA hesaplarıyla gerçek staging; PostgreSQL eşzamanlı onay ve eski sürümle geçiş; API/web başarılı yayın ve yetkili oturum doğrulaması. |

Bu belgede sonraki aşama olarak yazılan özellikler varmış gibi menüye sahte işlem veya sayaç konulmamıştır.
