/*
 * 구글 시트 연결 설정 (처음 한 번만 고친다).
 * docs/04_운영_가이드.md 2단계에서 복사한 "웹에 게시" CSV 주소를 따옴표 안에 붙여 넣는다.
 * 비워 두면 js/data.js의 기본(예시) 데이터로 동작한다.
 */
window.TAX_CONFIG = {
  sheetCsvUrls: {
    rules: '',    // 규칙 탭
    depts: '',    // 진료과목 탭
    settings: ''  // 설정 탭
  }
};
