# Yönetim işlemleri V7

PR #392 ile birleşen V6 tabanı (a8ebafde0e436100802befbbe9ed9b625542c312) üzerine hazırlanmıştır. Alt altı gelişmiş ekran, V4 açık/koyu PNG kartlar ve V6 ortak menü korunur.

| Üst buton / alan | Yeni işlev |
| --- | --- |
| Destek talepleri | Atanmış kayıtlar, konu/kayıt araması, aşama/kategori/tarih filtreleri, okunmamış müşteri mesajı sayısı, mevcut görüşmeye geçiş, iç not ve bağlantılı olay dosyası. SA/UA için gizli müşteri kimliği açılmaz. |
| Kullanıcı / oda / sohbet banı | Hedefin sunucudan doğrulanması, kapsam/süre/gerekçe/kanıt önizlemesi, ayrı gönderim. Alan değişirse önizleme geçersiz olur; personel hedef uygulama anında da korunur. |
| Ban inceleme / loglar | Gerekçeli karar; V6 sunucu filtreleri korunur. Meşru ret kararı inceleyene üç dakikalık ceza vermez; yok sayma/incelemeyi kapatma kuralı değişmez. |
| Ban itirazları | Reddedilen modern talepten tek, 1–3 fotoğraflı itiraz; özgün talep, ilk ret gerekçesi ve kanıt inceleme. Talep sahibi, hedef veya ilk karar veren sonuçlandıramaz. Oda banı yalnız ilgili odaya uygulanır. |
| Referans kodları | Tür/kota ile oluşturma, arama/durum filtresi, kopyalama, gerçek kullanım/ödül geçmişi ve kalan kota; gerekçeli iptal, iç not ve geçmiş. Eski ödüller geri alınmaz. |
| Duyurular | Yazara özel taslaklar, sürüm kontrollü düzenleme, karakter sayacı, kayıtlı sürüm önizlemesi ve ayrı yayınlama. Tekrar yayınlama aynı makbuzu döndürür. Gerekçeli yayından çekme geçmişi silmez. Zamanlama eklenmedi. |
| Görüş / eksikler | Mevcut korumalı okuma sonrası durum, aktif DA sorumlusu, sürüm çakışması kontrolü, iç not, geçmiş ve olay dosyası. Müşteriye yalnız genel durum gösterilir. |
| Ödeme desteği | Kimlik/kayıt/banka referansı, durum, atama ve tarih filtreleri; mevcut kabul ve karşılıklı görüşme akışı, sonuçlanmış kayıt/kanıt inceleme, iç not ve olay bağlantısı. Başka DA'nın aktif görüşmesi açılmaz. Para yükleme motoru değişmez. |

V6 kimlik dizini, bağımsız rol onayı, hesap silme korumaları, Ghost seçimi ve denetim araçları korunur. Rol değişimi ikinci bağımsız aktif DA gerektirir; hedef karar veremez. V5 mali zinciri talep sahibi, bağımsız inceleyici ve farklı son DA koşulunu korur.

Kaynak erişimi her API isteğinde doğrulanır. Destekte DA olmak atanmamış özel görüşmeyi açmaz. Geri bildirim işlemi için işlemi yapan DA mevcut okuma adımını tamamlamalıdır. Oturum/ekran değişince eski yanıt yeni ekranı doldurmaz. İç notlar, durum, kaynak dosyası, duyuru makbuzu, audit ve ilgili bildirimler aynı transaction içinde tutulur. Kaynak başına tek olay bağlantısı ve yayın başına tek makbuz bulunur. Aynı kaynak tekrarları satır kilidi/benzersiz anahtarlarla korunur. Özel konuşma/kanıt otomatik dosyaya kopyalanmaz. İtirazın ilk karar vereni ayrıca sabit geçmişte saklanır.

Yeni tablolar: management_operation_history, management_source_cases, management_feedback_work, management_announcement_drafts. Startup create_all'a kayıtlıdır; readiness yeni yolları/tabloları doğrular. Mevcut kolon değişikliği yoktur. API/web sürümü ve değişen script cache anahtarları birlikte V7 yapılmıştır.

121 Python testi ve 145 subtest geçti (kalıtımdan gelen tekrarlar dahil). Geçici SQLite üzerinde yetki, mahremiyet, tekrar, rollback, bağımsız itiraz, oda kapsamı, hedef koruması, taslak/yayın ve V5/V6 regresyonları doğrulandı. 47 jsdom testi gerçek DOM olayları ve taklit HTTP kullanır. Python/JS sözdizimi ve diff boşluk kontrolü başarılıdır.

Gerçek tarayıcı E2E, PostgreSQL eşzamanlılık/yük testi veya canlı mutasyon yapılmadı. Yayından önce staging üzerinde farklı rollerle kayıt erişimi, bağımsız karar, eşzamanlı yayın/itiraz, rollback ve API/web eş sürümü doğrulanmalıdır. Farklı kaynaklarda aynı global istek anahtarını eşzamanlı kullanmanın PostgreSQL çakışma davranışı ayrıca sınanmalıdır.

Kurucu güncel taban/önkoşul blob hashlerini denetler, farklılıkta üzerine yazmadan durur. Tek dal, tek commit ve taslak PR açar; birleştirme/dağıtım yapmaz. PR birleşip API/web dağıtımları SUCCESS olduktan sonra `python scripts/verify-management-release.py` çalıştırılır. Salt okunur betik sürüm, readiness, korumalı GET yolları, yeni modüller ve 12 PNG'yi kontrol eder; yetkili işlem testinin yerine geçmez.
