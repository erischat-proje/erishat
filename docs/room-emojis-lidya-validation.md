# Lidya oda emojileri

28 normal PNG ve her VIP seviyesine özel 12 PNG; toplam 40 ayrı görsel.
Şeffaf, 256×256 RGBA; bütün kaynaklar ayrı built-in imagegen çağrılarıyla üretildi.
Yalnızca boyut küçültüldü, alfa korundu. Tam prompt listesi ve dosya denetimi
bu klasördedir. `emoji-collection-preview.jpg` bütün koleksiyonu gösterir.

Normal seri: kahkaha, ağlama, öpücük, sevgi, alkış, sinirli, şaşkın, uykulu,
dans, havalı, evet/hayır, teşekkür, hoş geldin, utangaç, göz kırpma, kararsız,
parti, bravo, üzgün, vay, pes, selam, kalp, sağ/sol öpücük ve sağ/sol kadeh.
Altın metal ve zümrüt karakterlerde cinsiyet seçimi, insan teni veya saç yoktur.

| VIP | Özel emoji | Açık özel emoji sayısı |
|---|---|---:|
| 0 | Normal seri | 0 |
| 1 | Altın Işıltı | 1 |
| 2 | Zümrüt Bakış | 2 |
| 3 | Sardes Zaferi | 3 |
| 4 | Kraliyet Mührü | 4 |
| 5 | Kristal Aura | 5 |
| 6 | Kanatlı İhtişam | 6 |
| 7 | Saray Alevi | 7 |
| 8 | Yıldız Muhafızı | 8 |
| 9 | Ejder Mührü | 9 |
| 10 | Anka Yükselişi | 10 |
| 11 | Kozmik Taç | 11 |
| 12 | Lidya Efsanesi | 12 |

## Uygulama

Mevcut `room-emojis.js/css` sistemi genişletildi. Normal ID'ler ve altı hedefli
koltuk etkileşimi korundu; küçük etkileşim çizimleri altın/zümrüt paletine alındı.
Panel aydınlık/koyu tema değişkenlerini kullanır. VIP koleksiyonunda ayrı sekme,
yatay seviye filtresi, kilit etiketi, seviye durum metni ve yeniden deneme vardır.
Kilitli buton erişilebilir açıklama verir ve göndermez. Görsel, koltuk reaksiyonu
sırasında kısa süre hareket eder; üst VIP'lerde aura eklenir. Hareket azaltma
ayarı uygulanır. Avatar ismi ve ses halkası önceki yerinde kalır.

`GET /v1/me/room-emojis` mevcut `current_user` bağımlılığıyla kimliği doğrular.
Haklar `VipStatus.level` üzerinden, 1–12 arasında birikimli açılır. Gönderim
sırasında gerçek WebSocket handler aynı seviyeyi yeniden okur. Public VIP gizleme
ayarları, görünüm seçimi veya cihazda saklanan değerler hak sağlamaz. Eski hesap
isteğinin yeni hesaba erişim vermesi engellenir. Normal emojiler ağ hatasında da
seçilebilir; özel seri doğrulanana kadar kilitlidir. Yeni ödeme veya DB göçü yok.

## Yerel doğrulama

- 40 benzersiz PNG; 256×256 RGBA, tamamen şeffaf köşeler; toplam 4.6 MB.
- Python: gerçek `_room_socket_reaction` fonksiyonu AST ile ayrılarak izole DB
  taklidiyle çalıştırıldı. 13 kullanıcı seviyesi × 12 özel emoji = 156 eşleşme;
  her seviyede normal emoji; eksik VIP satırı; ghost/ban/mute/koltuksuz durumlar;
  geçersiz ID ve hedefli/normal mesaj ayrımı geçti.
- Playwright: mevcut giriş HTML'sindeki uygulama CSS'leri yüklenerek 2 tema ×
  6 boyut (320×568, 360×640, 393×850, 568×320, 768×1024, 1280×800) geçti.
  Gerçek 40 PNG yükleme, taşma, başlık/kapat erişimi, kaydırılan liste, filtre,
  VIP 0–12 açılımları, zorla kilitli tıklama, başarısız istek/yeniden deneme,
  hesap değişimi, diğer kullanıcının VIP emojisini izleme, engelleme, azaltılmış
  hareket, odak dönüşü, hedefli gönderim, koltuksuz gönderim, cooldown ve oda
  temizliği kontrol edilir.
- JS sözdizimi ve Python derlemesi kontrol edildi.
- Kurucu taklidinde bütün özgün dosyaların korunması, PNG SHA'ları, yalnızca
  izin verilen dosyaların değişmesi, taslak PR, dosya kaybı, kaynak değişimi ve
  işlem sırasında ana dal değişimi kontrolleri doğrulanır.

Çalıştırma (depo kökünden):

```sh
python tests/room-emojis-vip.test.py
CHROMIUM_PATH=/path/to/chromium node tests/room-emojis-lidya.browser.cjs
```

Testler üretim sunucusuna bağlanmaz. PostgreSQL veya gerçek kullanıcılarla canlı
uçtan uca oturum açılmadı. Backend ve frontend aynı PR'den birlikte dağıtılmalı;
eski backend çalışırken yeni VIP endpoint'i gelene kadar panel güvenli biçimde
kilitli kalır. Gerçek odada son kontrol dağıtımdan sonra yapılmalıdır.

## Kurulum ve önceki işler

Kurucu en güncel `auth-unified-v1` ağacını `base_tree` olarak kullanır. Yalnızca
bu paket dosyaları ve iki emoji cache sürümü güncellenir. Hediye penceresi/coin,
yönetim PNG'leri, rozetler ve diğer dosyalar değiştirilmez. Beklenen üç kaynak
SHA eşleşmezse yazmadan durur; yeni commit/dal yalnızca ağaç doğrulanınca oluşur.
Taslak PR açılır; otomatik merge veya deploy yapılmaz.
