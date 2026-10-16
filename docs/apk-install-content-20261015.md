# APK 1.9: kurulumla birlikte gelen içerik

Sorun: avatar/çerçeve seçimi ve mağaza görselleri web üzerinden tek tek ve yüksek dosya boyutuyla yükleniyordu. Yeni APK, depodaki 4.527 sabit medya yolunu kurulum paketinde taşır: avatar, çerçeve, mağaza, VIP, ilişki, oyun, hediye, ses ve font dosyaları. Kaynak toplamı 3.533.098.246 bayt; optimize medya paketi 429.940.666 bayt. Bu ölçüm APK'nın son boyutu değildir; son boyut GitHub derlemesinde belli olur.

PNG/JPEG/WebP kopyaları genel olarak en fazla 1024px; atlas/sprite/symbol/sheet dosyaları en fazla 2048px, en-boy oranı korunarak WebP kalite 86 ile hazırlanır. Saydamlık korunur; animasyonlu dosyalar yeniden kodlanmaz. Eski SVG'lerin içindeki base64 PNG kopyaları ayrıca optimize edilir; SVG'nin vektör ve yazı katmanları korunur. Orijinal web varlıkları değiştirilmez. APK kopyaları kayıplı sıkıştırma ve küçültme nedeniyle çok yakın bakışta kaynakla birebir değildir.

WebView yalnızca uygulamanın güvenilen HTTPS kaynağındaki ve paket indeksinde bulunan GET medya isteklerini yerelden karşılar. Ana HTML, JS, CSS, API, oturum, canlı sohbet ve kullanıcı yüklemeleri pakete alınmaz. Türkçe/URL kodlanmış dosya adları desteklenir. Dosya bulunamazsa normal ağ yolu kullanılır. Kullanıcının hesabı/verileri pakete yazılmaz.

Sürüm kontrolü: web Docker imajı her derlemede güncel medya SHA256 indeksini üretir. APK, açılışta ve yeni sayfa geçişlerinde en fazla dakikada bir bu küçük indeksi arka planda yeniler. SHA eşleşmeyen/değişmiş yeni medya ağdan gelir; yeni yollar zaten normal ağ yolunu izler. Son indeks cihazda saklanır; çevrimdışı açılış paketlenmiş içeriği kullanabilir. İlk açılışta indeks henüz gelmeden mevcut paket gösterilebilir. Uygulamanın tamamı çevrimdışı çalışmaz.

APK CI: tam repo üzerinden paket üretilir; assets dizini Gradle'a tanıtılır. Paket üretiminden sonra `clean` çalıştırılmaz. İleride statik içerik değişiklikleri de APK iş akışını tetikler. Sürüm 1.9 / 10; onaylanan logo, paket kimliği ve imza yapılandırması korunur.

Doğrulama: tüm 4.527 yol web indeksiyle eşleşti; paket dosyalarının içerik hashleri doğrulandı. Gerçek görsel dönüştürme, alpha, kaynakların değişmemesi, kök dizin eşleme ve SVG içindeki PNG dönüşümü testleri geçti. Java sınıfı API biçimindeki test taklitleriyle derlendi; kaynak/port/kullanıcı bilgisi/yol geçişi/Türkçe yol kontrolü geçti. Bu bir gerçek Android SDK derlemesi veya cihaz testi değildir. Son APK GitHub Actions üzerinde derlenmeli ve cihazda kontrol edilmelidir.

Çalıştırma: `bash scripts/termux-lidya-apk-kur.sh`; aynı ana dal commitinin başarılı derlemesini bekler, APK'yı indirir ve indirme sayfasını gösterir. Mevcut APK üzerine güncelleme yapılır.
