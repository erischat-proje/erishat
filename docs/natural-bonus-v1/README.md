# Doğal bonus · sık giriş, dengeli ödül

Kullanıcı daha sık giriş ve buna göre dengelenmiş doğal ödül seçeneğini seçti. Hasan 1/90; diğer yeni doğal bonuslar yaklaşık 1/100. Altın Şöleni 1/105,26 ile değişmedi. Klasik Slot, Çark, Crash ve oda oyunlarına yeni bonus eklenmedi.

Satın alınan ve önceden başlamış bonusların motor/matematik dağılımları korunur. Yeni turda sunucunun kaydettiği profil doğal bonus ödeme tablosunu seçer; istemci bu alanı gönderemez. Dede/Prenses havuzu, Hasan toplaması ve seviyeler, diğer oyunların kendi retrigger/çizgi/küme kuralları ve ortak cüzdan korunur. Aztek/Savaşın Kılıcı ana oyun tabloları da sıklaşan özelliklere bütçe ayırmak için ayarlanmıştır. Kovboy doğal bonus tabanı 4,90×; eski/satın alınan taban 10×.

## Çevrimdışı ölçüm

Tüm ücretsiz dönüş zinciri, retrigger ve tur limiti dahil. Tohum 26101617. Çoğu oyun ilk tetikleme seçimine göre tabakalandırıldı; iki tabaka gerçek olasılıkla ağırlıklandı. Aztek ve Ares birer milyon koşulsuz tam turla ölçüldü. Toplam 7040000 örnek tur. Katsayılar bu ölçümlerle iteratif ayarlandı; güven aralıkları bağımsız sertifikasyon değildir. Paylaşılan JSON diğer oyun ayarları değiştikçe farklı SHA alabilir; son oyun parametreleri summary.json içinde tutulur. Yalnız bonus ödeme katsayısı değişince etkilenmeyen tetiklenmeme tabakası tekrar kullanıldı.

| Oyun | Mod | Giriş | RTP tahmini | %95 aralık |
|---|---|---:|---:|---:|
| balikci | normal | %1.1111 | %96.09 | %95.20–%96.98 |
| bastet | normal | %1.0000 | %95.58 | %93.58–%97.58 |
| candy | ante | %1.3070 | %96.23 | %95.20–%97.26 |
| candy | normal | %1.0000 | %96.41 | %95.42–%97.41 |
| dede | ante | %2.0000 | %95.71 | %94.40–%97.02 |
| dede | normal | %1.0000 | %95.88 | %93.89–%97.87 |
| dogparty | normal | %1.0000 | %96.62 | %95.89–%97.34 |
| firavun | normal | %1.0000 | %95.63 | %94.67–%96.58 |
| kovboy | normal | %1.0000 | %97.00 | %96.08–%97.91 |
| kure | ante | %2.0000 | %96.52 | %95.72–%97.32 |
| kure | normal | %1.0000 | %95.88 | %94.84–%96.92 |
| prenses | ante | %2.0000 | %95.94 | %94.64–%97.25 |
| prenses | normal | %1.0000 | %95.90 | %93.92–%97.89 |
| seker | ante | %2.0000 | %95.42 | %94.59–%96.25 |
| seker | normal | %1.0000 | %97.33 | %96.30–%98.35 |
| aztek | normal | %0.9930 | %96.87 | %94.47–%99.27 |
| ares | normal | %1.0003 | %96.55 | %94.70–%98.39 |

Bu tahminler sertifikalı RTP değildir; belirli çevrim sayısında bonus ya da kazanç garantisi yoktur. Ham raporlar aynı klasördedir. Orijinal ve satın alınmış model izleri 900 sabit tohumlu sonuçla, API/cüzdan davranışı izole SQLite ile doğrulandı.

## Tekrar üretim

Python standart kütüphanesiyle örnek: `python3 tests/natural_bonus_audit.py dede --samples 120000 --seed 26101617 --condition yes --out /tmp/dede-true.json`. Eşlenik false tabakasını `--condition no` ile üretip p ve 1-p ile ağırlıklandırın. Ante için `--ante`. Aztek/Ares için koşul vermeden `--samples 1000000`.
