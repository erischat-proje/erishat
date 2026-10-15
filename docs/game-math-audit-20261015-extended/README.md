# v1 geniş örneklem kaynakları

Bu dizindeki 18 JSON raporu, PR #275 sonrası kaynak commit `609235ec06e6b947c91a90a50d86e9ec0e228ea4` üzerinde, v2 ayarları eklenmeden önce üretildi. Toplam 18.800.000 örnek içerir; 17.200.000’i doğal tur/satın alım, 1.600.000’i iki koşulda ağırlıklandırılan tam tur örneğidir.

Eski motor/simülatör kaynaklarına `git show 609235e:backend/app/bastet_engine.py` gibi erişilebilir. O sırada yeni olan koşullu yardımcının byte düzeyinde kaynak kopyası `source-snapshots/game_math_conditional_v1.py` içindedir. Tekrar üretmek için bu kopya eski kaynak ağacında `tests/game_math_conditional.py` yoluna konur.

v2 sonuçları ve yorumlar: `../game-math-three-games-v2/README.md`.
