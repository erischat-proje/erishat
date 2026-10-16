# ErisChat oda ses güncellemesi V2

Taban: PR #140 sonrası auth-unified-v1, commit 25f4941f9eb61fe942e69f5b075445f47828ebc9.

## Kapsam ve sayı

30 ayrı hata/koşul senaryosu değerlendirildi. İlk 26 satır için kod koruması veya toparlanma davranışı eklendi; son 4 satır kullanıcı, cihaz veya ağ koşulu gerektirir. Bu liste tüm olası arızaların matematiksel olarak eksiksiz listesi değildir. Senaryolar bağımsız değildir ve birden fazlası aynı anda yaşanabilir. Olasılık yüzdesi hesaplamak için gerçek cihaz, bağlantı ve hata ölçümleri gerekir; böyle ölçümler olmadığı için yüzde uydurulmadı.

| No | Senaryo | V2 davranışı / sınır |
|---|---|---|
| 1 | Dinleyici doğru ICE ayarlarını alamıyor | Peer oluşturmadan sunucunun ayarları alınır. |
| 2 | RTC ayar isteği takılıyor | 10 saniyelik iptal süresi; oda girişinde yeniden deneme. |
| 3 | Geçici HTTP/ağ hatası mikrofonu kesiyor | Geçici hata mikrofonu kapatmaz. |
| 4 | Oda erişimi gerçekten kaldırılıyor | 401/403/404 ve mute/koltuk durumunda yayın durdurulur. |
| 5 | Aynı kişiye eşzamanlı teklif üretiliyor | Peer işlem kuyruğu ve teklif kilidi. |
| 6 | Bir kişinin işlemi diğerlerini bekletiyor | Her kişinin ayrı işlem kuyruğu vardır. |
| 7 | Önceki görüşmenin cevabı geç geliyor | Teklif kimliği eşleşmeyen cevap uygulanmaz. V2 olmayan istemcilerde eski protokol uyumu korunur. |
| 8 | Eski ICE adayı yeni görüşmeye geliyor | Kimlik kontrolü; hatalı aday bağlantıyı silmez. |
| 9 | ICE, SDP'den önce geliyor | Sınırlı aday kuyruğu, açıklama uygulandıktan sonra boşaltılır. |
| 10 | Bozuk/aşırı uzun sinyal geliyor | Sunucuda SDP ve ICE tür/boyut kontrolü; istemcide kuyruk sınırı. |
| 11 | Cevaplayan kişinin mikrofonu yanlış ses hattına bağlanıyor | Gelen teklifin oluşturduğu transceiver kullanılır; cevap öncesi mikrofon bağlanır. |
| 12 | Mikrofon izni beklerken ikinci kez dokunuluyor | Bekleyen açma isteği iptal edilir; sonradan gelen stream durdurulur. |
| 13 | Oda değiştikten sonra izin sonucu geliyor | Oda nesli/istek kontrolü; eski oda mikrofonu açılmaz. |
| 14 | Mikrofon kapatılırken gönderici işlemi takılıyor | Track hemen durdurulur; gönderen hatlar kuyruk üzerinden ayrılır. |
| 15 | Kullanıcı koltuktan kalkıyor | Yerel mikrofon hemen kapanır; sunucu durumu ayrıca kontrol edilir. |
| 16 | Yönetim mikrofonu susturuyor | Mute sinyal kuyruğunu beklemeden track durdurulur; yeni yayın için tekrar izin kontrolü. |
| 17 | Kapanmış PeerConnection tekrar kullanılıyor | Kapalı bağlantı temizlenip yeniden oluşturulur. |
| 18 | ICE başarısız oluyor | Yeniden ICE görüşmesi; cevaplayan taraftan başlatıcıya kurtarma isteği. |
| 19 | Kısa ağ kopmasında koltuk kayboluyor | Sunucuda 35 saniyelik koltuk bekleme süresi; kullanıcı geri dönerse temizlik iptal edilir. Mikrofon otomatik açılmaz. |
| 20 | Bağlantı new/connecting veya cevapsız teklif durumunda kalıyor | Süreli tekrar, rollback ve her üçüncü başarısız denemede yeniden oluşturma. |
| 21 | WebSocket açık görünüp cevap vermiyor | 20 saniyede bir ping; görünür sayfada 65 saniyelik cevapsızlıkta yeniden bağlantı. |
| 22 | Odadaki kişi listesi eskimiş kalıyor | Pong üzerinden RTC listesi yenilenir; ayrılan ses hatları temizlenir. |
| 23 | Hızlı oda geçişinde eski işlemler yeni odaya karışıyor | Eski RTC kapatılır; oda açma isteği ve kapanış nesli kontrol edilir. |
| 24 | Uygulama görünür olunca ses devam etmiyor | Görünürlük/online olayında playback ve bağlantı kontrolü. İşletim sisteminin askıya almasını engellemez. |
| 25 | Aynı kullanıcı iki sekmeden çelişen cevap gönderiyor | Son RTC oturumu kullanılır; eski sekmeye bildirim ve kapanış gönderilir. Eski socket'ten RTC iletimi reddedilir. |
| 26 | Mikrofonun ses kısıtları cihazda desteklenmiyor | Yalnız OverconstrainedError için bir kez audio:true ile geri dönüş. |
| 27 | Tarayıcı otomatik ses oynatmayı engelliyor | Dokunma ile yeniden başlatma ve açıklama; tarayıcı politikasını kodla aşma garantisi yok. |
| 28 | Mikrofon izni reddedilmiş/yok/meşgul | Açık hata mesajı; izin reddi tekrar döngüsüne alınmaz. Android WebView izinleri/APK güncellemesi bu pakette bulunmaz. |
| 29 | Mobil operatör/NAT/firewall doğrudan bağlantıyı engelliyor | TURN olmadan her ağda çözüm garantisi yok. Paket yeni TURN hizmeti eklemez. |
| 30 | İnternet yok, cihaz/işletim sistemi ses hattını kapatıyor veya uygulama sonlandırılıyor | Geri dönüşte yeniden kontrol; fiziksel arıza, sürekli bağlantısızlık ve arka plan yürütme kısıtı yazılım paketiyle garanti edilemez. |

## Doğrulama

- 13 istemci RTC senaryosu: Node VM ve sahte WebRTC nesneleri.
- 4 oda bağlantısı senaryosu: heartbeat, roster, eski retry ve gizli oda.
- 3 Python yardımcı testi: sinyal doğrulama, tekrar bağlanan kişinin koltuğu, ayrılan kişinin temizliği.
- JavaScript sözdizimi, Python derleme ve git diff boşluk kontrolü.
- Kurulum betiği gerçek taban dosyaları üzerinde uygulanır; farklı dosyada yazmadan durması da test edilir.

Bu testler gerçek mikrofon, hoparlör, WebRTC tarayıcı motoru, üretim veritabanı yükü veya operatörler arası ses testi değildir. Üretimde iki ayrı cihaz/ağla uzun süreli kontrol gerekir. Kullanıcı sessiz olduğunda bağlantı otomatik bozuk kabul edilmez.

## Kurulum ve dağıtım

ZIP içindeki install.py git dosya hash'lerini doğrular, yedek alır, dosyaları uygular ve testleri çalıştırır. Farklı/yerel değiştirilmiş sürümü ezmez. Test hatasında dosyalar yedekten döndürülür. PR açma/birleştirme veya dağıtım otomatik yapılmaz.

Frontend ve backend değişiklikleri birlikte birleştirilmeli. Backend yeni rtc_reconnect sinyalini ve roster yanıtını sağlar. Önceki istemciler standart offer/answer/ICE ile çalışmaya devam eder; yeni özelliklerin tamamı için iki tarafın da V2 yüklemesi gerekir.

Sunucu tek worker/replica kullanımı içindir; oda socket haritaları ve 35 saniyelik temizlik görevleri süreç belleğindedir. Çoklu worker/replica veya sunucu çökmesi için ortak oturum altyapısı ve ayrıca yük testi gerekir. Bu paket SFU'ya geçiş veya Android APK üretimi içermez.

Tanılama: tarayıcı konsolunda window.ErisRoomRTC.diagnostics() bağlantı durumlarını ve hata sayaçlarını verir; ses kaydı, erişim token'ı ve ICE şifresi içermez.
