/*
 * 구글 시트 연결 설정 (처음 한 번만 고친다).
 * docs/04_운영_가이드.md 2단계에서 복사한 "웹에 게시" CSV 주소를 따옴표 안에 붙여 넣는다.
 * 비워 두면 js/data.js의 기본(예시) 데이터로 동작한다.
 */
window.TAX_CONFIG = {
  sheetCsvUrls: {
    rules: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR_j-eqQ7YuNxiOEUa4qa53sc3ZaVSstpvb4vpfqRxzqUNOOLPhAjIAFweBVkcBWfdnhVKDBmtGzw9-/pub?gid=637839414&single=true&output=csv',    // 규칙 탭
    depts: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwMVkMCTKbfgiV1R3K8OBrwlcNWLOMxYx4wVn6wwUA7HjtEgY78d5SG2n06pxTLLmlRQye1LOsPtW-/pub?gid=32605337&single=true&output=csv',    // 진료과목 탭
    settings: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-prQLfJeakHaLR1jaHsby-M_NoZMDOfPj-uuEIubl8SPgyOo9ebgcMyvK4NzV1jz8fCPN9kiYQ6cD/pub?gid=321471522&single=true&output=csv'  // 설정 탭
  }
};
