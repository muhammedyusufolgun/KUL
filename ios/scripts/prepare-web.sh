#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p SoruHazirlamaAsistani/Web/lib
fetch() {
 local url="$1" target="$2"
 if [ -s "SoruHazirlamaAsistani/Web/lib/$target" ]; then
   echo "Already present: $target"
   return
 fi
 echo "Downloading HTTPS dependency: $target"
 curl --fail --location --retry 4 --retry-delay 2 --silent --show-error \
   "$url" --output "SoruHazirlamaAsistani/Web/lib/$target"
 test -s "SoruHazirlamaAsistani/Web/lib/$target"
}
fetch 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' 'pdf.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' 'pdf.worker.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js' 'mammoth.browser.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' 'xlsx.full.min.js'
for f in SoruHazirlamaAsistani/Web/lib/*.js; do
 if head -c 256 "$f" | grep -qiE '<html|<!doctype html|404 not found'; then
   echo "Unexpected HTML content in $f" >&2; exit 1
 fi
done
