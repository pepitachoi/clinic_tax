/*
 * 명령줄 점검 도구. 브라우저 없이 사이트와 같은 엔진(site/js/engine.js)으로 테스트·검수·일정 계산을 한다.
 * macOS 내장 JavaScript로 실행하므로 따로 설치할 것이 없다. 프로젝트 맨 위 폴더에서 실행한다.
 *
 *   osascript -l JavaScript scripts/check.js [옵션]
 *
 *   --source auto|sheet|builtin|files   데이터 출처 (기본 auto: config.js에 시트 주소가 있으면 sheet)
 *   --rules 파일 --depts 파일 --settings 파일   source=files일 때 읽을 CSV (빠진 것은 기본 데이터)
 *   --open YYYY-MM-DD   이 개원일로 4가지 조합 일정을 모두 출력 (없으면 건수만)
 *   --dept 과목명        기본: 진료과목 첫 줄
 *   --today YYYY-MM-DD  오늘 날짜 가정
 *   --export 폴더        지금 데이터를 규칙.csv / 진료과목.csv / 설정.csv로 저장
 *   --no-tests          엔진 테스트 건너뛰기
 *
 * 끝 코드: 0 = 문제 없음, 1 = 테스트 실패·규칙 오류·시트 읽기 실패, 2 = 사용법 오류
 */
ObjC.import('Foundation');
ObjC.import('stdlib');

var window = this;
var TAB_FILES = { rules: '규칙.csv', depts: '진료과목.csv', settings: '설정.csv' };
var TAB_FIRST = { rules: 'id', depts: '과목명', settings: '항목' };
var COMBOS = [['N', 'N', '미용X·직원X'], ['N', 'Y', '미용X·직원O'], ['Y', 'N', '미용O·직원X'], ['Y', 'Y', '미용O·직원O']];

function out(s) {
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(String(s) + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
}

function readFile(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, null);
  if (!s || s.isNil()) throw new Error('파일을 읽을 수 없어요: ' + path);
  return s.js;
}

function writeFile(path, text) {
  $(text).writeToFileAtomicallyEncodingError($(path), true, $.NSUTF8StringEncoding, null);
}

function shell(cmd) {
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  return app.doShellScript(cmd, { alteringLineEndings: false });
}

function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function load(path) { (0, eval)(readFile(path)); }

function parseArgs(argv) {
  var o = { source: 'auto', tests: true };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--no-tests') { o.tests = false; continue; }
    if (!/^--/.test(a) || i + 1 >= argv.length) throw new Error('알 수 없는 옵션: ' + a);
    o[a.slice(2)] = argv[++i];
  }
  return o;
}

function run(argv) {
  var opt;
  try { opt = parseArgs(argv); } catch (e) { out(e.message); $.exit(2); }

  if (!$.NSFileManager.defaultManager.fileExistsAtPath('site/js/engine.js')) {
    out('프로젝트 맨 위 폴더(site/가 있는 곳)에서 실행하세요.');
    $.exit(2);
  }
  load('site/js/config.js');
  load('site/js/data.js');
  load('site/js/engine.js');
  load('site/tests/engine.tests.js');
  var E = window.TaxEngine, failed = false;

  // 1. 엔진 테스트
  if (opt.tests) {
    var results = window.TaxEngineTests(E), bad = results.filter(function (r) { return !r.ok; });
    out('■ 엔진 테스트: ' + (bad.length ? '실패 ' + bad.length + ' / ' + results.length : '전부 통과 ' + results.length + '개'));
    bad.forEach(function (r) { out('  ✗ ' + r.name + '\n    ' + r.detail.replace(/\n/g, '\n    ')); });
    if (bad.length) failed = true;
  }

  // 2. 데이터 읽기
  var urls = (window.TAX_CONFIG && window.TAX_CONFIG.sheetCsvUrls) || {};
  var source = opt.source;
  if (source === 'auto') source = Object.keys(TAB_FILES).some(function (k) { return String(urls[k] || '').trim(); }) ? 'sheet' : 'builtin';
  var texts = {}, status = [];
  Object.keys(TAB_FILES).forEach(function (k) {
    var fallback = window.TAX_DEFAULT_DATA[k];
    try {
      if (source === 'sheet') {
        var url = String(urls[k] || '').trim();
        if (!url) throw new Error('config.js에 주소가 없어요');
        texts[k] = shell('curl -fsSL --max-time 15 ' + quote(url));
        if (!E.looksLike(texts[k], TAB_FIRST[k])) throw new Error('첫 칸이 "' + TAB_FIRST[k] + '"가 아니에요(웹에 게시한 CSV 주소인지 확인)');
        status.push(k + '=시트');
      } else if (source === 'files' && opt[k]) {
        texts[k] = readFile(opt[k]);
        status.push(k + '=' + opt[k]);
      } else {
        texts[k] = fallback;
        status.push(k + '=기본 데이터');
      }
    } catch (e) {
      texts[k] = fallback;
      status.push(k + '=기본 데이터(실패: ' + String(e.message || e).split('\n')[0] + ')');
      failed = true;
    }
  });
  out('■ 데이터: ' + status.join(' · '));
  var data = E.fromTexts(texts);

  // 3. 검수
  var v = E.validate(data);
  out('■ 검수: 규칙 ' + data.rules.length + '줄 · 오류 ' + v.errors.length + ' · 경고 ' + v.warnings.length + ' · 미확정 ' + v.unconfirmed);
  v.errors.forEach(function (e) { out('  ✗ ' + e.row + '행' + (e.id ? ' (' + e.id + ')' : '') + ' ' + e.msg); });
  v.warnings.forEach(function (e) { out('  ! ' + e.row + '행' + (e.id ? ' (' + e.id + ')' : '') + ' ' + e.msg); });
  if (v.errors.length) failed = true;
  var st = data.settings;
  out('■ 설정: 규칙기준일 ' + (st['규칙기준일'] || '(없음)') + ' · ' + (st['세무법인명'] || '(법인명 없음)') + ' ' + (st['연락처'] || ''));

  // 4. 조합별 일정
  var today = opt.today ? E.parseDate(opt.today) : E.todayUTC();
  var open = opt.open ? E.parseDate(opt.open) : today;
  var dept = opt.dept || (data.depts[0] && data.depts[0].name) || '';
  if (!open || !today) { out('날짜 형식은 YYYY-MM-DD예요.'); $.exit(2); }
  out('■ 일정: 개원일 ' + E.iso(open) + ' · ' + dept + ' · 오늘 ' + E.iso(today));
  COMBOS.forEach(function (c) {
    var s = E.buildSchedule(data.rules, { openDate: open, dept: dept, beauty: c[0], staff: c[1] }, today);
    out('  [' + c[2] + '] ' + s.items.length + '건 (' + E.iso(s.start) + ' ~ ' + E.iso(s.end) + ')');
    if (opt.open) s.items.forEach(function (it) { out('    ' + E.iso(it.date) + '  ' + it.rule.id + '  ' + it.rule['이름']); });
  });

  // 5. 내보내기
  if (opt.export) {
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(opt.export), true, $(), null);
    Object.keys(TAB_FILES).forEach(function (k) { writeFile(opt.export + '/' + TAB_FILES[k], texts[k].replace(/^﻿/, '')); });
    out('■ 내보냄: ' + opt.export + '/{' + Object.keys(TAB_FILES).map(function (k) { return TAB_FILES[k]; }).join(',') + '}');
  }

  out(failed ? '결과: 문제 있음' : '결과: 문제 없음');
  $.exit(failed ? 1 : 0);
}
