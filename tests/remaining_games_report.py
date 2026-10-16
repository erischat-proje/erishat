"""Summarize independent full-round samples; keep stratified estimates separate."""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'docs/game-math-remaining-eight'
NAMES={'dede':'Dede','prenses':'Prenses','seker':'Şeker Sarayı','balikci':'Balıkçı Hasan','dogparty':'Dog Party','altin':'Altın Şöleni','kure':'Kaderin Küresi','firavun':'Firavun'}

def pool(reports):
    n=sum(r['samples'] for r in reports);mean=sum(r['samples']*r['rtp'] for r in reports)/n
    # Recover each sample's sum of squares from its unrounded 95% CI.
    within=sum((r['samples']-1)*(((r['ci95'][1]-r['ci95'][0])/3.92)**2*r['samples']) for r in reports)
    between=sum(r['samples']*(r['rtp']-mean)**2 for r in reports)
    half=1.96*math.sqrt((within+between)/(n-1)/n)
    out={'samples':n,'rtp':mean,'ci95':[mean-half,mean+half]}
    for key in ['roundHitFrequency','netProfitFrequency']:
        out[key]=sum(r['samples']*r[key] for r in reports)/n
    return out

def main():
    reports=[(p,json.loads(p.read_text())) for p in sorted(AUDIT.glob('*.json')) if p.name!='summary.json']
    rows=[];lines=['# Kalan sekiz oyunun matematik denetimi — 15 Ekim 2026','',
    'Kaynak: erischat-proje/erishat, auth-unified-v1, d7f5e4607da1f153c2982bf21977c0882698ab43. Önceki iki PR üzerine hazırlanmıştır.','',
    'RTP, uzun vadede toplam ödemelerin toplam oyun bedeline oranıdır; kazanma ihtimali değildir. Ödeme sıklığı herhangi bir ödeme alınan tamamlanmış turu, net kazanç ise toplam ödemenin turun bedelini geçtiği turu sayar. Satın alımlarda bedel 100x, ante oyunlarda 1,25x olarak kullanılır. Bonuslar, yeniden tetiklenmeler ve tur başına ödeme tavanı dahildir. Bunlar simülasyon tahminleridir; sertifikalı RTP değildir.','',
    '## Mevcut modellerin ölçümü','',
    '| Oyun | Mod | Örnek | RTP | %95 güven aralığı | Ödeme sıklığı | Net kazanç sıklığı |',
    '|---|---|---:|---:|---:|---:|---:|']
    for game,name in NAMES.items():
        for mode in ['normal','ante','buy']:
            group=[d for p,d in reports if d['game']==game and d['mode']==mode and 'strata' not in d]
            if not group:continue
            pooled=pool(group);row=dict(game=game,mode=mode,**pooled);rows.append(row)
            lo,hi=pooled['ci95'];lines.append(f"| {name} | {mode} | {pooled['samples']:,} | %{pooled['rtp']*100:.2f} | %{lo*100:.2f}–%{hi*100:.2f} | %{pooled['roundHitFrequency']*100:.2f} | %{pooled['netProfitFrequency']*100:.2f} |")
    lines+=['','## Satın alma düzeltmelerinin son ölçümü','','Normal/ante oyun dağılımları ve doğal bonuslar değiştirilmedi. Şeker Sarayı v2, yalnız satın alınan yeni bonuslarda en düşük bomba değerinin ağırlığını 3000’den 2800’e indirir. Altın Şöleni v2 satın alma pot değerlerini [63,126,253,632,1264,2529] yerine [64,127,254,639,1277,2554] kullanır. Eski config dosyaları aynen saklanır; açık bonuslar kayıtlı sürümle devam eder. Yeni Şeker turlarında satın alma profili sunucunun kaydettiği entry alanından seçilir.','',
    '| Oyun | Örnek | Önce RTP | Sonra RTP | Sonra %95 güven aralığı |','|---|---:|---:|---:|---:|']
    for game in ['seker','altin']:
        files=sorted((AUDIT/'final').glob(game+'-buy-*.json'));group=[json.loads(p.read_text()) for p in files]
        if not group:continue
        result=pool(group);old=next(r for r in rows if r['game']==game and r['mode']=='buy');lo,hi=result['ci95'];rows.append(dict(game=game,mode='buy-v2',**result))
        lines.append(f"| {NAMES[game]} | {result['samples']:,} | %{old['rtp']*100:.2f} | %{result['rtp']*100:.2f} | %{lo*100:.2f}–%{hi*100:.2f} |")
    lines+=['','## Nadir bonus için bağımsız kontrol','','İlk tetikleme kararı veya scatter ailesi iki tabakaya ayrıldı; her tabakada 100.000 tam tur çalıştırılıp canlı olasılıkla ağırlıklandırıldı. Bu sonuçlar üstteki düz örneklemle birleştirilmez. Kaderin Küresi’nde sıfır scatter olasılığı da korunur; yapılandırmayı koşullandırma işleminin dağılımı aynen yeniden kurduğu deterministik testlerle denetlenir. Altın Şöleni’nin tetikleme parası kopyalama sonrasında kaybolabileceği için koşullandırılan şey son bonus sonucu değil, ilk tetikleme kararıdır.','',
    '| Oyun | Mod | RTP | %95 güven aralığı |','|---|---|---:|---:|']
    for p,d in reports:
        if 'strata' not in d:continue
        lo,hi=d['ci95'];lines.append(f"| {NAMES[d['game']]} | {d['mode']} | %{d['rtp']*100:.2f} | %{lo*100:.2f}–%{hi*100:.2f} |")
    total=sum(d['samples'] for _,d in reports)+sum(json.loads(p.read_text())['samples'] for p in (AUDIT/'final').glob('*.json'))
    lines+=['','## Karar ve sınırlar','',
    'Aztek’in eski modelindeki büyüklükte aşırı ödeme ya da neredeyse hiç ödeme vermeyen model saptanmadı. Diğer altı oyunun olasılıkları korunur. Bazı nokta tahminleri yapılandırmadaki hedefin altında/üstündedir; güven aralıkları ve yüksek oynaklık nedeniyle bunlar hedefin doğrulandığı anlamına gelmez. Özellikle Kaderin Küresi ante ve Firavun satın alma tahminleri hedefin alt tarafındadır; daha dar tahmin elde etmek için daha fazla örnek gerekir. Şeker ve Altın satın alımlarındaki küçük aşağı sapma sınırlı bir profil değişikliğiyle ele alınmıştır.','',
    f'Toplam {len(reports)+len(list((AUDIT/"final").glob("*.json")))} ham rapor, {total:,} tam ücretli tur/satın alma/koşullu tur. Koşullu örnekler canlı tetikleme sıklığını temsil eden düz örnek sayısı değildir. Her ham raporda seed, örnek sayısı ve kullanılan kaynakların SHA-256 özeti vardır.','',
    '## Yeniden çalıştırma','',
    'Güncel ölçüm: `python tests/game_math_audit.py GAME normal|ante|buy --samples N --seed SEED --out DOSYA`. Koşullu kontrol: `python tests/remaining_games_conditional.py GAME normal|ante --samples 100000 --seed 26101641 --out DOSYA`. Tablolar: `python tests/remaining_games_report.py`.','',
    'Eski ölçümleri yeniden üretmek için bu klasördeki baseline-sources dosyalarını bir geçici çalışma kopyasının aynı yollarına koyun; altin-math-v2.json ve seker-math-v2.json dosyalarını o kopyadan çıkarın. Diğer dosyalar bu PR ile aynıdır. Üretim cüzdanına hiçbir simülasyon bağlanmaz.','',
    '## Doğrulama','',
    '60 yeni test geçti; tam tests/ taramasında 446 test geçti. Termux kurulumu ayrıca yerel bir test deposunda denetlendi. Dondurulmuş v1 sonuçları; yeni/eski doğal oyun eşitliği; açık satın alınmış bonusun eski sürümde sürmesi; tek kez ödeme/idempotent tekrar; yanlış sürümün bakiyeyi/turu değiştirmeden reddi ve istemcinin profil seçememesi test edilir.','',
    'Tam tests/ taramasında altı önceden mevcut hata var: blackjack geçersiz yüksek bahis; crash 50 ve 500 bahis kabulü; Şeker eski 10001 üst sınırı varsayımı; slot 500; wheel 500. Aynı altı test temiz d7f5e4 tabanında da başarısız oldu. Tam kök pytest taraması ayrıca eksik psycopg/Pillow bağımlılıkları yüzünden toplanamadı. Bu kapsam dışı bahis politikaları değiştirilmedi.','',
    'Şans çarkı, crash, blackjack, klasik slot, dört kupa, at yarışı ve kasa oyunu bu paketin dışında tutulmuştur.']
    (AUDIT/'summary.json').write_text(json.dumps({'rows':rows,'samples':total},ensure_ascii=False,indent=2)+'\n')
    (AUDIT/'README.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines[:35]))
if __name__=='__main__':main()
