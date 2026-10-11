#!/bin/bash
# 배포 도구. 프로젝트 맨 위 폴더에서 실행한다.
#
#   scripts/deploy.sh package          점검 후 site/를 dist/site-날짜.zip으로 묶기
#   scripts/deploy.sh netlify --yes    점검 → 묶기 → Netlify에 올리기
#                                      (셸에 NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID가 설정돼 있어야 함)
#   scripts/deploy.sh verify 주소       배포된 사이트가 지금 폴더와 같은지 확인
#
# 토큰은 화면에 출력하지 않는다.
set -euo pipefail

if [ ! -f site/js/engine.js ]; then
  echo "프로젝트 맨 위 폴더(site/가 있는 곳)에서 실행하세요." >&2
  exit 2
fi

FILES="index.html review.html css/style.css js/app.js js/config.js js/data.js js/engine.js js/review.js js/ui.js tests/engine.test.html tests/engine.tests.js"

check() {
  echo "▶ 점검"
  if ! osascript -l JavaScript scripts/check.js; then
    echo "점검에서 문제가 나와 멈췄어요. 위 내용을 먼저 고치세요." >&2
    exit 1
  fi
}

package() {
  mkdir -p dist
  ZIP="dist/site-$(date +%Y%m%d-%H%M).zip"
  (cd site && zip -q -r "../$ZIP" . -x '.*' -x '*/.*')
  echo "▶ 묶음: $ZIP"
}

case "${1:-}" in
  package)
    check
    package
    echo "Netlify Drop(https://app.netlify.com/drop) 같은 곳에 site 폴더나 이 zip을 올리면 됩니다."
    ;;

  netlify)
    if [ "${2:-}" != "--yes" ]; then
      echo "실제로 올리려면 --yes를 붙이세요(공개 사이트가 바뀝니다)." >&2
      exit 2
    fi
    if [ -z "${NETLIFY_AUTH_TOKEN:-}" ] || [ -z "${NETLIFY_SITE_ID:-}" ]; then
      echo "NETLIFY_AUTH_TOKEN과 NETLIFY_SITE_ID가 셸에 없어요. docs/04_운영_가이드.md 4절을 보세요." >&2
      exit 2
    fi
    check
    package
    echo "▶ Netlify에 올리는 중"
    RES=$(curl -sS --max-time 120 -X POST \
      -H "Content-Type: application/zip" \
      -H "Authorization: Bearer ${NETLIFY_AUTH_TOKEN}" \
      --data-binary "@${ZIP}" \
      "https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys")
    STATE=$(printf '%s' "$RES" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    URL=$(printf '%s' "$RES" | grep -o '"ssl_url":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [ -z "$STATE" ] || [ "$STATE" = "error" ]; then
      echo "올리기 실패. 응답 앞부분: $(printf '%s' "$RES" | head -c 300)" >&2
      exit 1
    fi
    echo "▶ 상태: $STATE"
    echo "▶ 주소: $URL"
    echo "1~2분 뒤 'scripts/deploy.sh verify $URL'로 확인하세요."
    ;;

  verify)
    BASE="${2:-}"
    if [ -z "$BASE" ]; then echo "주소를 넣어 주세요. 예: scripts/deploy.sh verify https://example.netlify.app" >&2; exit 2; fi
    BASE="${BASE%/}"
    BAD=0
    for f in $FILES; do
      LOCAL=$(shasum -a 256 "site/$f" | cut -d' ' -f1)
      REMOTE=$(curl -fsSL --max-time 20 "$BASE/$f" 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || true)
      if [ "$LOCAL" = "$REMOTE" ]; then echo "  ✓ $f"; else echo "  ✗ $f (배포본과 다름 또는 읽기 실패)"; BAD=1; fi
    done
    if [ "$BAD" = 0 ]; then echo "결과: 배포본이 지금 폴더와 같아요"; else echo "결과: 다른 파일이 있어요"; exit 1; fi
    ;;

  *)
    sed -n '2,10p' "$0"
    exit 2
    ;;
esac
