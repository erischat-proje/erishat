# Yönetim: mobil yerleşim ve gerçek veri izleme V8

PR #393 birleşmiş auth-unified-v1 (4e20d12) üzerine hazırlanmıştır. Mevcut V2/V4 açık/koyu PNG'ler, V5 mali bağımsız onayı, V6 rol onayı ve V7 iş akışları korunur.

## Mobil yerleşim

Arama/favori katmanı butonları `.aw-tool` ile sardığında eski `.eris-admin-grid > button` kuralları devre dışı kalıyordu. Mutlak konumlu PNG ataya yayılıp metinleri üst üste bindiriyordu. Kurallar sarılmış butonları da kapsar. Görsel kendi 3:1 buton alanında tutulur; 600 px altında tek, geniş ekranda iki sütun vardır. Başlık/yardım/kapatma, dinamik yükseklik ve güvenli alan düzenlendi. Favori ayrı 44 px tıklama hedefidir. Genel tema kurallarının soluk düğme metni üretmesi bileşen renk değişkenleriyle düzeltildi.

## Gerçek veri kaynakları

Yeni DA korumalı GET `/v1/admin/finance-audit/live-snapshot` ve eski `/overview` gerçek DB toplamlarını kullanır. Önceki son 1.000 işlem örneği kaldırıldı. 1–90 gün ve profil ID kapsamı vardır; arayüz Bugün/7/30/90 gün sunar. İstanbul takvim günü başlangıcı kullanılır. Tutarlar JSON'da dizedir; arayüz BigInt ile gösterir.

| Gösterge | Kaynak ve anlam |
| --- | --- |
| Mevcut cüzdanlar | users.lidya; mevcut hesapların aktif olmayanlar dahil güncel bakiyesi; dönem geliri değildir. |
| Giriş/çıkış/net/kayıt sayısı | system_lidya_ledger; dönem içindeki tüm kayıtlar, ilk bakiye kayıtları dahil. |
| Manuel ekleme/çıkarma/tutarsızlık | lidya_manual_operations; dönem içindeki tüm kayıtlar. |
| Yükleme siparişleri | lidya_purchase_orders; durumlar ayrı, karar tarihi varsa o yoksa açılış tarihi esas. TL tutarı banka tahsilat mutabakatı değildir. |
| Fiilen yüklenmiş destekli işlemler | payment_assistance_requests; gerçek credit_operation_id ve transaction_reference mevcut kayıtlar, kredi audit zamanına göre. |
| VIP seviyesi / aktif dönem / kontrol bekleyen dönem | vip_status ve vip_purchase_memberships; birbirinden ayrı sayaçlar. Read sırasında VIP sync veya bakiye mutasyonu yapılmaz. |
| VIP satın alma makbuzları | vip_purchase_receipts; dönem sayısı ve Lidya toplamı. |
| Mali talepler | management_finance_requests; hedef kapsamındaki güncel, tüm zaman durum sayıları. |
| Bakiye kayıt kontrolü | Mevcut bakiye ile en yüksek ledger ID'sindeki balance_after; ledger'sız hesaplar ayrı. İlk 20 bulgu, tam kapsam sayaçları. |
| Hareket tablosu | Dönem/hedef kapsamından son 30 ledger kaydı. Toplamlar 30 kayıtla sınırlanmaz. Mobilde yalnız tablo kendi içinde yatay kayar. |

Manuel kayıtlar destekli yüklemeleri de içerir; bu kutular toplanarak gelir hesaplanmaz. Ledger kaydedilmemiş geçmişi kanıtlamaz; silinmiş hesap geçmişi kapsam dışıdır. Son bakiye kontrolü tam muhasebe mutabakatı veya tüm hareket zincirinin doğrulanması değildir. Alanlar aynı isteğin sorgu zaman aralığında okunur; yoğun yazmada geçici farklılık bağımsız inceleme gerektirebilir. Gösterge otomatik yaptırım/bakiye düzeltmesi uygulamaz. Mali yanıtlar no-store ve Authorization kapsamındadır.

## Yenileme

Menü görev sayaçları, operasyon özeti ve mali panel 15 saniyelik salt okunur GET yenilemesi kullanır; WebSocket yayını değildir. Manuel yenileme ve otomatiği kapatma vardır. Arka planda veya gizli panelde yeni sorgu yapılmaz. Ekran/hesap değişiminde izleme durur; oturum olayında özel değerler temizlenir. Aynı anda tek sorgu, filtre değişiminde eski yanıtı geçersiz kılma vardır. Yazılmamış form otomatik yenilemede yeniden oluşturulmaz. Hata durumunda son başarılı veri ve zamanı gösterilir; bağlantı yokken sahte sıfırlar üretilmez. Diğer geçmiş/işlem ekranları mevcut sunucu sorguları ve sayfalama ile çalışır; bütün formlar kendiliğinden yenilenmez.

## Yayın ve doğrulama

Yeni tablo/kolon yoktur. Readiness yeni canlı mali yolu ve mevcut ledger/VIP/ödeme tablolarını doğrular. API sürümü `20261023-management-mobile-live-v8`, frontend cache anahtarı `management-mobile-live-v8-20261023`. API/web birlikte yayınlanmalıdır.

56 Python test yürütmesi ve 120 subtest geçti; kalıtımdan gelen tekrarlar dahildir. SQLite üzerinde 1.005 kaydın tamamı, büyük tam sayı hassasiyeti, dönem/hedef filtresi, ledger uyuşmazlığı/eksikliği, gerçek destekli kredi, VIP dönemleri, DA sınırı ve salt okunurluk doğrulandı. 41 jsdom testi taklit HTTP ile yenileme/hata/oturum/filtre yaşam döngüsünü ve mevcut formları kontrol etti.

Gerçek Chromium'da 320/360/393/430/768/1280 px × iki tema ile 12 yerleşim kontrolü geçti. Gerçek uygulama CSS'si/sarmalayıcı/PNG ile oran, taşma, görsel sınırı, tıklama hedefleri ve en az 4.5 düğme metni kontrastı kontrol edildi. Mali tablo kendi alanında kaydı; filtre girdisi yenilemede korundu. Bu tarayıcı testinin API cevapları taklittir. Sözdizimi, diff, ZIP hash/bütünlük ve kurucu güvenlik kontrolleri yapıldı.

Gerçek Android WebView, üretim hesabıyla mali işlem veya PostgreSQL yük/eşzamanlılık testi yapılmadı. Büyük üretim tablolarında 15 saniyelik sorgu yükü staging'de ölçülmelidir. Kurucu taban/önkoşul hashleri farklıysa üzerine yazmadan durur; klonlamadan tek dal/commit ve taslak PR açar, birleştirme/dağıtım yapmaz.

API/web SUCCESS sonrası `python scripts/verify-management-release.py --web https://www.erischat.com` salt okunur sürüm/readiness/korumalı yollar/modül/12 PNG kontrolüdür. Yetkili staging işlem testi bunun yerine geçmez.
