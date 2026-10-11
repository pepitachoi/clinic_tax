/*
 * 엔진 테스트 모음. 브라우저(tests/engine.test.html)와 명령줄(scripts/check.js)이 함께 쓴다.
 * 반환: [{ name, ok, detail }]
 */
window.TaxEngineTests = function (E) {
  'use strict';
  var results = [];
  var HEAD = E.RULE_HEADERS;

  function rule(o) {
    var r = { _row: 2 };
    HEAD.forEach(function (h) { r[h] = ''; });
    return Object.assign(r, { id: 'T', 사용: 'Y', 상태: '확정', 세목: '테스트', 이름: '테스트', 한줄설명: '설명', 조건_미용: '*', 조건_직원: '*', 조건_과목: '*' }, o);
  }
  function run(rules, input, today) {
    return E.buildSchedule(rules, Object.assign({ dept: '내과', beauty: 'N', staff: 'Y' }, input, { openDate: E.parseDate(input.open) }), E.parseDate(today || '2026-10-11'));
  }
  function dates(s) { return s.items.map(function (it) { return E.iso(it.date); }); }
  function eq(name, actual, expected) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    results.push({ name: name, ok: a === e, detail: a === e ? '' : '기대: ' + e + '\n실제: ' + a });
  }

  // 표시 기간
  var s = run([], { open: '2026-11-02' });
  eq('기간: 개원 예정이면 개원월~개원월+11', [E.iso(s.start), E.iso(s.end)], ['2026-11-01', '2027-10-31']);
  s = run([], { open: '2026-01-15' });
  eq('기간: 이미 개원했으면 끝은 오늘+11개월', [E.iso(s.start), E.iso(s.end)], ['2026-01-01', '2027-09-30']);
  eq('기간: 빈 달도 모두 포함', s.months.length, 21);

  // 기한유형
  eq('매월 10일 + 시작개월 1: 개원 다음 달부터',
    dates(run([rule({ 기한유형: '매월', 기한값: '10', 시작개월: '1' })], { open: '2026-11-02' })).slice(0, 3),
    ['2026-12-10', '2027-01-10', '2027-02-10']);
  eq('매월: 개원일 이전 날짜는 빠짐',
    dates(run([rule({ 기한유형: '매월', 기한값: '10' })], { open: '2026-11-15' }))[0], '2026-12-10');
  eq('매월 말일',
    dates(run([rule({ 기한유형: '매월', 기한값: '말일' })], { open: '2027-01-05' })).slice(0, 2), ['2027-01-31', '2027-02-28']);
  eq('매월 31일은 짧은 달에 말일로',
    dates(run([rule({ 기한유형: '매월', 기한값: '31' })], { open: '2027-02-01' }))[0], '2027-02-28');
  eq('매년 + 시작연차 2: 개원 다음 해부터',
    dates(run([rule({ 기한유형: '매년', 기한값: '05-31', 시작연차: '2' })], { open: '2026-03-01' })), ['2027-05-31']);
  eq('매년: 개원 첫해 날짜도 개원일 이후면 나옴',
    dates(run([rule({ 기한유형: '매년', 기한값: '07-25' })], { open: '2026-03-01' })), ['2026-07-25', '2027-07-25']);
  eq('개원일+일',
    dates(run([rule({ 기한유형: '개원일+일', 기한값: '20' })], { open: '2026-11-02' })), ['2026-11-22']);
  eq('개원월말+개월',
    dates(run([rule({ 기한유형: '개원월말+개월', 기한값: '3' })], { open: '2026-11-02' })), ['2027-02-28']);
  s = run([rule({ 기한유형: '개원전', 기한값: '30' })], { open: '2026-11-02' });
  eq('개원전: 기간 시작 전이어도 표시', dates(s), ['2026-10-03']);
  eq('개원전: 그 달도 목록에 추가', s.months[0].key, '2026-10');

  // 세법 변경(적용시작일/종료일)
  s = run([
    rule({ id: 'OLD', 기한유형: '매월', 기한값: '10', 적용종료일: '2027-03-31' }),
    rule({ id: 'NEW', 기한유형: '매월', 기한값: '15', 적용시작일: '2027-04-01' })
  ], { open: '2027-01-01' }, '2027-01-01');
  eq('적용종료일·적용시작일로 규칙 교체',
    s.items.slice(2, 5).map(function (it) { return it.rule.id + ' ' + E.iso(it.date); }),
    ['OLD 2027-03-10', 'NEW 2027-04-15', 'NEW 2027-05-15']);

  // 조건
  var r = [
    rule({ id: 'BEAUTY', 기한유형: '개원일+일', 기한값: '1', 조건_미용: 'Y' }),
    rule({ id: 'NOBEAUTY', 기한유형: '개원일+일', 기한값: '1', 조건_미용: 'N' }),
    rule({ id: 'STAFF', 기한유형: '개원일+일', 기한값: '1', 조건_직원: 'Y' }),
    rule({ id: 'DERM', 기한유형: '개원일+일', 기한값: '1', 조건_과목: '피부과, 성형외과' }),
    rule({ id: 'OFF', 사용: 'N', 기한유형: '개원일+일', 기한값: '1' })
  ];
  function ids(input) { return run(r, Object.assign({ open: '2026-11-02' }, input)).items.map(function (it) { return it.rule.id; }); }
  eq('조건: 미용O·직원X·피부과', ids({ beauty: 'Y', staff: 'N', dept: '피부과' }), ['BEAUTY', 'DERM']);
  eq('조건: 미용X·직원O·내과', ids({ beauty: 'N', staff: 'Y', dept: '내과' }), ['NOBEAUTY', 'STAFF']);
  eq('꼬리표', run(r, { open: '2026-11-02', beauty: 'Y', staff: 'Y', dept: '성형외과' }).items.map(function (it) { return it.tags.join('/'); }),
    ['미용', '직원', '피부과·성형외과']);

  // 시트 형식 관용
  eq('날짜: 2026. 10. 11 형식', E.iso(E.parseDate('2026. 10. 11')), '2026-10-11');
  eq('날짜: 10/11/2026(영문 계정) 형식', E.iso(E.parseDate('10/11/2026')), '2026-10-11');
  eq('날짜: 없는 날짜는 거부', E.parseDate('2027-02-29'), null);
  eq('기한값: 1월 25일', E.parseDue('매년', '1월 25일'), { m: 1, d: 25 });
  eq('기한값: 시트가 날짜로 바꾼 2026. 1. 25', E.parseDue('매년', '2026. 1. 25'), { m: 1, d: 25 });
  eq('기한값: 시트가 날짜로 바꾼 1/25/2026', E.parseDue('매년', '1/25/2026'), { m: 1, d: 25 });
  eq('기한값: 02-말일', E.parseDue('매년', '02-말일'), { m: 2, d: 'last' });
  eq('기한값: 02-29는 평년에 28일',
    dates(run([rule({ 기한유형: '매년', 기한값: '02-29' })], { open: '2027-01-01' }, '2027-01-01')), ['2027-02-28']);
  eq('기한값: 13-01 거부', E.parseDue('매년', '13-01'), null);
  eq('사용: TRUE/FALSE 체크박스', [E.yn('TRUE'), E.yn('FALSE'), E.yn(' * ')], ['Y', 'N', '*']);

  // CSV
  eq('CSV: 따옴표·쉼표·줄바꿈·BOM',
    E.parseCSV('﻿a,b\r\n"x, y","say ""hi""\nok"\n'),
    [['a', 'b'], ['x, y', 'say "hi"\nok']]);
  eq('fromTexts: 과목·설정 해석',
    (function () { var d = E.fromTexts({ rules: 'id\n', depts: '과목명,미용기본값\n피부과,Y\n', settings: '항목,값\n연락처,02\n' }); return [d.depts, d.settings]; })(),
    [[{ name: '피부과', beautyDefault: 'Y' }], { 연락처: '02' }]);

  // 검수
  var v = E.validate({
    rules: [rule({ _row: 2, 기한유형: '매주', 기한값: '1' }), rule({ _row: 3, 기한유형: '매월', 기한값: '10', 조건_과목: '치과' }),
      rule({ _row: 4, id: 'T2', 상태: '예시(검수 전)', 기한유형: '매월', 기한값: '40' })],
    ruleHeaders: HEAD, depts: [{ name: '내과' }]
  });
  eq('검수: 오류 메시지', v.errors.map(function (e) { return e.row + ' ' + e.msg.slice(0, 12); }),
    ['2 기한유형 "매주"을 알', '3 id가 2행과 겹쳐요', '4 기한값 "40"이 기한']);
  eq('검수: 없는 과목 경고', v.warnings.length, 1);
  eq('검수: 미확정 개수', v.unconfirmed, 1);
  eq('오류 규칙은 일정에서 제외', dates(run([rule({ 기한유형: '매월', 기한값: '40' })], { open: '2026-11-02' })), []);

  return results;
};
