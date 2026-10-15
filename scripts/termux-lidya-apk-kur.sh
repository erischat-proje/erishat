#!/usr/bin/env bash
set -euo pipefail
repo='erischat-proje/erishat'
branch='auth-unified-v1'
command -v gh >/dev/null || { echo 'Önce pkg install gh komutunu çalıştır.'; exit 1; }
command -v python3 >/dev/null || { echo 'Önce pkg install python komutunu çalıştır.'; exit 1; }
gh auth status --hostname github.com >/dev/null
sha="$(gh api "repos/$repo/branches/$branch" --jq .commit.sha)"
find_run() {
 gh run list --repo "$repo" --workflow android-apk.yml --branch "$branch" --limit 30 --json databaseId,headSha,status,conclusion | python3 -c 'import json,sys; rows=[r for r in json.load(sys.stdin) if r["headSha"]==sys.argv[1] and (r["status"]!="completed" or r["conclusion"]=="success")];print(rows[0]["databaseId"] if rows else "")' "$sha"
}
run="$(find_run)"
if [ -z "$run" ]; then
 gh workflow run android-apk.yml --repo "$repo" --ref "$branch"
 for attempt in $(seq 1 20); do
  sleep 3
  run="$(find_run)"
  [ -z "$run" ] || break
 done
fi
[ -n "$run" ] || { echo 'APK derlemesi henüz görünmedi. Biraz sonra aynı komutu tekrar çalıştır.'; exit 1; }
echo "APK derlemesi: https://github.com/$repo/actions/runs/$run"
gh run watch "$run" --repo "$repo" --exit-status
[ "$(gh api "repos/$repo/branches/$branch" --jq .commit.sha)" = "$sha" ] || { echo 'Dal derleme sırasında güncellendi; son sürüm için komutu tekrar çalıştır.'; exit 1; }
command -v termux-setup-storage >/dev/null && [ -d "${ERISCHAT_APK_DOWNLOADS:-$HOME/storage/downloads}" ] || { echo 'Önce termux-setup-storage komutuyla dosya erişimini aç.'; exit 1; }
work="$(mktemp -d "${ERISCHAT_WORK_ROOT:-$HOME}/ErisChat-Lidya-APK-XXXXXXXX")"
gh run download "$run" --repo "$repo" --name ErisChat-Lidya-APK --dir "$work"
[ -s "$work/app-debug.apk" ] || { echo 'APK dosyası indirilemedi.'; exit 1; }
file="${ERISCHAT_APK_DOWNLOADS:-$HOME/storage/downloads}/ErisChat-Lidya-1.7-$run.apk"
cp "$work/app-debug.apk" "$file"
echo "APK hazır: $file"
if command -v termux-open >/dev/null; then
 termux-open --view --content-type application/vnd.android.package-archive "$file"
else
 echo 'İndirilenler klasöründeki APK dosyasını açarak mevcut uygulamanın üzerine kur.'
fi
