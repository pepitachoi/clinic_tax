/*
 * 세무 일정 계산 엔진.
 * 규칙 표(CSV) + 입력 조건 → 일정 목록. 화면 코드와 분리되어 있어 고객 화면과 검수 화면이 같은 결과를 낸다.
 * 날짜는 모두 UTC 자정 Date로 다룬다(시간대 때문에 하루씩 밀리는 문제를 막기 위해).
 */
(function (global) {
  'use strict';

  var RULE_HEADERS = ['id', '사용', '상태', '세목', '이름', '한줄설명', '상세설명', '근거', '기한유형', '기한값',
    '조건_미용', '조건_직원', '조건_과목', '시작연차', '시작개월', '적용시작일', '적용종료일', '메모'];
  var REQUIRED = ['id', '사용', '상태', '세목', '이름', '한줄설명', '기한유형', '기한값', '조건_미용', '조건_직원', '조건_과목'];
  var DUE_TYPES = ['매년', '매월', '개원일+일', '개원월말+개월', '개원전'];
  var ONE_TIME = { '개원일+일': true, '개원월말+개월': true, '개원전': true };

  /* ---------- CSV ---------- */

  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // 첫 줄을 머리글로 보고 객체 배열로 바꾼다. _row는 시트에서의 행 번호(검수 화면 안내용).
  function toTable(text) {
    var rows = parseCSV(text);
    var headers = (rows[0] || []).map(function (h) { return h.trim(); });
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i].some(function (v) { return v.trim() !== ''; })) continue;
      var o = { _row: i + 1 };
      headers.forEach(function (h, j) { if (h) o[h] = (rows[i][j] || '').trim(); });
      out.push(o);
    }
    return { headers: headers, rows: out };
  }

  /* ---------- 날짜 ---------- */

  function day(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function monthIndex(date) { return date.getUTCFullYear() * 12 + date.getUTCMonth(); }
  function fromMonthIndex(i) { return { y: Math.floor(i / 12), m: (i % 12) + 1 }; }
  function addDays(date, n) { return new Date(date.getTime() + n * 86400000); }
  function shiftYears(date, n) {
    var y = date.getUTCFullYear() + n, m = date.getUTCMonth() + 1;
    return day(y, m, Math.min(date.getUTCDate(), lastDay(y, m)));
  }
  function todayUTC(now) {
    now = now || new Date();
    return day(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(date) { return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()); }

  // '2026-10-11', '2026. 10. 11', '2026/10/11', '10/11/2026' 모두 받는다
  // (구글 시트가 계정 언어에 따라 날짜 서식을 바꿔 내보내는 경우 대비).
  function parseDate(s) {
    var v = String(s || '').trim(), y, mo, d;
    var m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*\.?$/.exec(v);
    var us = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/.exec(v);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (us) { y = +us[3]; mo = +us[1]; d = +us[2]; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > lastDay(y, mo)) return null;
    return day(y, mo, d);
  }

  /* ---------- 칸 값 해석 ---------- */

  // Y/N/* 칸. 시트 체크박스(TRUE/FALSE)와 한글 답도 받는다. 알 수 없는 값은 ''.
  function yn(v) {
    var s = String(v || '').trim().toUpperCase();
    if (s === 'Y' || s === 'TRUE' || s === '예' || s === 'O') return 'Y';
    if (s === 'N' || s === 'FALSE' || s === '아니오' || s === 'X') return 'N';
    if (s === '*' || s === '상관없음') return '*';
    return '';
  }

  function intOrNull(v) {
    var s = String(v || '').trim();
    if (s === '') return null;
    return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  }

  // 조건_과목: '*'면 null(전체), 아니면 과목명 배열
  function deptList(v) {
    var s = String(v || '').trim();
    if (s === '*' || s === '상관없음' || s === '') return null;
    return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // 기한값을 기한유형에 맞게 해석한다. 맞지 않으면 null.
  // 매년: '01-25', '1/25', '1월 25일', '2026. 1. 25', '1/25/2026'(연도는 무시), '02-말일'
  // 매월: '10', '10일', '말일'
  // 나머지: 숫자 하나('20', '20일', '3개월')
  function parseDue(type, raw) {
    var v = String(raw || '').trim(), nums = v.match(/\d+/g) || [], isLast = v.indexOf('말일') >= 0;
    if (type === '매년') {
      var mm, dd;
      if (nums.length === 3 && nums[0].length === 4) { mm = +nums[1]; dd = +nums[2]; }
      else if (nums.length === 3 && nums[2].length === 4) { mm = +nums[0]; dd = +nums[1]; }
      else if (nums.length === 2 && !isLast) { mm = +nums[0]; dd = +nums[1]; }
      else if (nums.length === 1 && isLast) { mm = +nums[0]; dd = 'last'; }
      else return null;
      if (mm < 1 || mm > 12) return null;
      if (dd !== 'last' && (dd < 1 || dd > lastDay(2024, mm))) return null;
      return { m: mm, d: dd };
    }
    if (type === '매월') {
      if (isLast && nums.length === 0) return { d: 'last' };
      if (nums.length === 1 && /^\d+\s*일?$/.test(v) && +nums[0] >= 1 && +nums[0] <= 31) return { d: +nums[0] };
      return null;
    }
    if (DUE_TYPES.indexOf(type) >= 0 && /^\d+\s*(일|개월)?$/.test(v)) return { n: +nums[0] };
    return null;
  }

  // 규칙 한 줄의 오류 목록. 오류가 있는 규칙은 일정에 넣지 않는다.
  function checkRule(r) {
    var errs = [];
    REQUIRED.forEach(function (k) { if (!String(r[k] || '').trim()) errs.push('"' + k + '" 칸이 비어 있어요'); });
    if (errs.length) return errs;
    var use = yn(r['사용']);
    if (use !== 'Y' && use !== 'N') errs.push('"사용"은 Y 또는 N이어야 해요');
    ['조건_미용', '조건_직원'].forEach(function (k) {
      if (!yn(r[k])) errs.push('"' + k + '"은 Y, N, * 중 하나여야 해요 (지금: ' + r[k] + ')');
    });
    if (DUE_TYPES.indexOf(r['기한유형']) < 0) {
      errs.push('기한유형 "' + r['기한유형'] + '"을 알 수 없어요. 가능한 값: ' + DUE_TYPES.join(', '));
    } else if (!parseDue(r['기한유형'], r['기한값'])) {
      errs.push('기한값 "' + r['기한값'] + '"이 기한유형 "' + r['기한유형'] + '"에 맞지 않아요');
    }
    var y = intOrNull(r['시작연차']);
    if (y !== null && !(y >= 1)) errs.push('시작연차는 1 이상의 숫자여야 해요');
    if (isNaN(intOrNull(r['시작개월']))) errs.push('시작개월은 0 이상의 숫자여야 해요');
    ['적용시작일', '적용종료일'].forEach(function (k) {
      if (String(r[k] || '').trim() && !parseDate(r[k])) errs.push(k + ' "' + r[k] + '"이 날짜(YYYY-MM-DD)가 아니에요');
    });
    return errs;
  }

  function compile(r) {
    return {
      type: r['기한유형'],
      due: parseDue(r['기한유형'], r['기한값']),
      beauty: yn(r['조건_미용']),
      staff: yn(r['조건_직원']),
      depts: deptList(r['조건_과목']),
      startYear: intOrNull(r['시작연차']),
      startMonth: intOrNull(r['시작개월']) || 0,
      from: parseDate(r['적용시작일']),
      to: parseDate(r['적용종료일'])
    };
  }

  function matches(c, input) {
    return (c.beauty === '*' || c.beauty === input.beauty) &&
      (c.staff === '*' || c.staff === input.staff) &&
      (!c.depts || c.depts.indexOf(input.dept) >= 0);
  }

  // 화면에 "왜 이 일정이 나왔는지" 보여 줄 꼬리표
  function tagsFor(c) {
    var tags = [];
    if (c.beauty === 'Y') tags.push('미용');
    if (c.staff === 'Y') tags.push('직원');
    if (c.depts) tags.push(c.depts.length <= 2 ? c.depts.join('·') : '일부 과목');
    return tags;
  }

  function occurrences(c, open, start, end) {
    var out = [], i, p;
    function clampDay(y, m, d) { return day(y, m, d === 'last' ? lastDay(y, m) : Math.min(d, lastDay(y, m))); }
    if (c.type === '매년') {
      for (var y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) out.push(clampDay(y, c.due.m, c.due.d));
    } else if (c.type === '매월') {
      for (i = monthIndex(start); i <= monthIndex(end); i++) { p = fromMonthIndex(i); out.push(clampDay(p.y, p.m, c.due.d)); }
    } else if (c.type === '개원일+일') {
      out.push(addDays(open, c.due.n));
    } else if (c.type === '개원월말+개월') {
      p = fromMonthIndex(monthIndex(open) + c.due.n);
      out.push(day(p.y, p.m, lastDay(p.y, p.m)));
    } else if (c.type === '개원전') {
      out.push(addDays(open, -c.due.n));
    }
    return out;
  }

  // 표시 기간: 개원월 1일 ~ max(개원월, 이번 달)부터 12개월째 되는 달의 말일
  function period(open, today) {
    var e = fromMonthIndex(Math.max(monthIndex(open), monthIndex(today)) + 11);
    return { start: day(open.getUTCFullYear(), open.getUTCMonth() + 1, 1), end: day(e.y, e.m, lastDay(e.y, e.m)) };
  }

  /*
   * input: { openDate: Date(UTC), dept: '피부과', beauty: 'Y'|'N', staff: 'Y'|'N' }
   * 반환: { start, end, items: [{date, rule, tags, past}], months: [{y, m, key, items, current}] }
   */
  function buildSchedule(rules, input, today) {
    today = today || todayUTC();
    var open = input.openDate, pr = period(open, today), items = [];
    var openYear = open.getUTCFullYear(), openMonth = monthIndex(open);

    rules.forEach(function (r, order) {
      if (yn(r['사용']) !== 'Y' || checkRule(r).length) return;
      var c = compile(r);
      if (!matches(c, input)) return;
      var once = !!ONE_TIME[c.type];
      occurrences(c, open, pr.start, pr.end).forEach(function (d) {
        if (d > pr.end) return;
        // 반복 일정은 개원일 이후 것만. 1회성(개원 전 준비 등)은 기간 시작 전이어도 보여준다.
        if (!once && (d < pr.start || d < open)) return;
        if (c.startYear && d.getUTCFullYear() - openYear + 1 < c.startYear) return;
        if (c.startMonth && monthIndex(d) < openMonth + c.startMonth) return;
        if (c.from && d < c.from) return;
        if (c.to && d > c.to) return;
        items.push({ date: d, rule: r, order: order, tags: tagsFor(c), past: d < today });
      });
    });

    items.sort(function (a, b) { return (a.date - b.date) || (a.order - b.order); });

    var first = monthIndex(pr.start), months = [], byIndex = {};
    if (items.length) first = Math.min(first, monthIndex(items[0].date));
    for (var i = first; i <= monthIndex(pr.end); i++) {
      var p = fromMonthIndex(i);
      byIndex[i] = { y: p.y, m: p.m, key: p.y + '-' + pad(p.m), items: [], current: i === monthIndex(today) };
      months.push(byIndex[i]);
    }
    items.forEach(function (it) { byIndex[monthIndex(it.date)].items.push(it); });

    return { start: pr.start, end: pr.end, items: items, months: months };
  }

  /* ---------- 검수 ---------- */

  function validate(data) {
    var errors = [], warnings = [], seen = {};
    var names = data.depts.map(function (d) { return d.name; });
    RULE_HEADERS.forEach(function (h) {
      if (data.ruleHeaders.indexOf(h) < 0) errors.push({ row: 1, id: '', msg: '규칙 탭에 "' + h + '" 열이 없어요' });
    });
    data.rules.forEach(function (r) {
      var at = { row: r._row, id: r.id || '' };
      checkRule(r).forEach(function (msg) { errors.push({ row: at.row, id: at.id, msg: msg }); });
      if (r.id) {
        if (seen[r.id]) errors.push({ row: at.row, id: at.id, msg: 'id가 ' + seen[r.id] + '행과 겹쳐요' });
        else seen[r.id] = r._row;
      }
      (deptList(r['조건_과목']) || []).forEach(function (n) {
        if (names.indexOf(n) < 0) warnings.push({ row: at.row, id: at.id, msg: '과목 "' + n + '"이 진료과목 탭에 없어요' });
      });
    });
    var unconfirmed = data.rules.filter(function (r) {
      return yn(r['사용']) === 'Y' && String(r['상태'] || '').trim() !== '확정';
    }).length;
    return { errors: errors, warnings: warnings, unconfirmed: unconfirmed };
  }

  /* ---------- 데이터 읽기 ---------- */

  var CACHE_PREFIX = 'tax-calendar:';
  var TABS = [
    { key: 'rules', first: 'id' },
    { key: 'depts', first: '과목명' },
    { key: 'settings', first: '항목' }
  ];

  // 읽어 온 시트 사본만 저장한다(규칙 데이터일 뿐, 고객 입력은 저장하지 않음).
  function store(k, v) { try { localStorage.setItem(CACHE_PREFIX + k, v); } catch (e) { /* 저장 불가 환경 */ } }
  function recall(k) { try { return localStorage.getItem(CACHE_PREFIX + k); } catch (e) { return null; } }

  function looksLike(text, firstHeader) {
    if (!firstHeader) return false;
    var rows = parseCSV(text);
    return rows.length > 0 && String(rows[0][0] || '').trim() === firstHeader;
  }

  function fetchText(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('응답 코드 ' + res.status);
        return res.text();
      }, function (err) { clearTimeout(timer); throw err; });
  }

  // 시트 주소가 있으면 시트 → 실패 시 마지막으로 읽은 사본 → 그것도 없으면 기본 데이터
  function loadTab(tab, url, fallback) {
    if (!url) return Promise.resolve({ text: fallback, source: 'builtin' });
    return fetchText(url).then(function (text) {
      if (!looksLike(text, tab.first)) throw new Error('첫 칸이 "' + tab.first + '"가 아니에요(웹에 게시한 CSV 주소인지 확인)');
      store(tab.key, text);
      return { text: text, source: 'sheet' };
    }).catch(function (err) {
      var cached = recall(tab.key), useCache = !!cached && looksLike(cached, tab.first);
      return { text: useCache ? cached : fallback, source: useCache ? 'cache' : 'builtin', error: String((err && err.message) || err) };
    });
  }

  function loadData(config, builtin) {
    var urls = (config && config.sheetCsvUrls) || {};
    return Promise.all(TABS.map(function (t) {
      return loadTab(t, String(urls[t.key] || '').trim(), builtin[t.key]);
    })).then(function (res) {
      var data = fromTexts({ rules: res[0].text, depts: res[1].text, settings: res[2].text });
      data.sources = { rules: res[0], depts: res[1], settings: res[2] };
      data.failed = res.some(function (r) { return r.error; });
      return data;
    });
  }

  // CSV 글 3개 → 화면과 검수가 쓰는 데이터 모양. 명령줄 점검 도구(scripts/check.js)도 이것을 쓴다.
  function fromTexts(texts) {
    var rules = toTable(texts.rules), depts = toTable(texts.depts), settings = toTable(texts.settings);
    return {
      rules: rules.rows,
      ruleHeaders: rules.headers,
      depts: depts.rows.filter(function (d) { return d['과목명']; })
        .map(function (d) { return { name: d['과목명'], beautyDefault: yn(d['미용기본값']) }; }),
      settings: settings.rows.reduce(function (o, r) { if (r['항목']) o[r['항목']] = r['값'] || ''; return o; }, {}),
      texts: texts
    };
  }

  global.TaxEngine = {
    RULE_HEADERS: RULE_HEADERS,
    DUE_TYPES: DUE_TYPES,
    parseCSV: parseCSV,
    toTable: toTable,
    parseDate: parseDate,
    parseDue: parseDue,
    iso: iso,
    todayUTC: todayUTC,
    shiftYears: shiftYears,
    yn: yn,
    checkRule: checkRule,
    buildSchedule: buildSchedule,
    validate: validate,
    looksLike: looksLike,
    fromTexts: fromTexts,
    loadData: loadData
  };
})(window);
