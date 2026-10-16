Oda seviye 1–4 için 12 koltukla başlar; seviye 5 ve üzerinde 16 koltuk açılır. Yönetim seçicisinde yalnızca 12/16 bulunur; API de aynı kuralı uygular. Eski 16/20/24 düzenleri oda kilidi altında dönüştürülür: kaldırılan koltuktaki kullanıcı boş kilitsiz koltuğa taşınır, yer yoksa dinleyici kalır. Üyelik silinmez. Açıkça seçilmiş 12 koltuk yükseltmede korunur.

Koltuk satırlarının dikey boşluğu azaltılıp yüksekliği sohbete aktarılır. Avatar dairesi büyütülür, isim aşağı alınır, sohbet satırlarının boşlukları azaltılır. Oda metinleri iki temada beyaz; okunurluk için koyu yarı saydam sohbet/başlık ve gölge kullanılır. Diğer sayfaların renkleri korunur. Küçük/klavyeli ekranlarda koltuk alanı kendi içinde kayar. Oda oyunlarının sahne düzeni değiştirilmez.

Doğrulama: gerçek SQLAlchemy modelleri ve SQLite benzersizlik kısıtlarıyla 10 test; Chromium ile iki tema × altı ekran × iki koltuk düzeni =24 kontrol. Mobil/yatay/klavye yüksekliği, sohbet çakışması, satır aralığı, isim ve beyaz metin denetlendi. PostgreSQL/üretim dağıtımı bu yerel doğrulamanın parçası değildir.

Kurucu güncel tam Git ağacını temel alır; kaynak SHA değişmişse durur; dosya kaybı/ilgisiz değişiklik/ana dal yarışı halinde PR oluşturmaz. Yalnızca yeni dal ve taslak PR açar.
