/* 검수 화면(A2): 미용×직원 4가지 조합 결과를 표로 보고, 조합 하나를 고객 화면 그대로 미리 본다. */
(function () {
  'use strict';

  var E = window.TaxEngine, UI = window.TaxUI, esc = UI.esc;
  var $ = function (id) { return document.getElementById(id); };
  var COMBOS = [
    { beauty: 'N', staff: 'N', label: '미용 X · 직원 X' },
    { beauty: 'N', staff: 'Y', label: '미용 X · 직원 O' },
    { beauty: 'Y', staff: 'N', label: '미용 O · 직원 X' },
    { beauty: 'Y', staff: 'Y', label: '미용 O · 직원 O' }
  ];
  var TABS = { rules: '규칙', depts: '진료과목', settings: '설정' };
  var SOURCE_LABEL = { sheet: '구글 시트', cache: '이전에 읽어 둔 시트 사본', builtin: '기본 데이터(js/data.js)' };
  var state = { data: null, combo: 3 };

  function load() {
    $('status').textContent = '불러오는 중…';
    E.loadData(window.TAX_CONFIG, window.TAX_DEFAULT_DATA).then(function (data) {
      state.data = data;
      var prev = $('rDept').value;
      $('rDept').innerHTML = data.depts.map(function (d) { return '<option>' + esc(d.name) + '</option>'; }).join('');
      if (prev && data.depts.some(function (d) { return d.name === prev; })) $('rDept').value = prev;
      render();
    });
  }

  function renderStatus(d) {
    var parts = Object.keys(TABS).map(function (k) {
      var s = d.sources[k];
      return TABS[k] + ': <b>' + SOURCE_LABEL[s.source] + '</b>' + (s.error ? ' (시트 읽기 실패: ' + esc(s.error) + ')' : '');
    });
    var noUrl = Object.keys(TABS).every(function (k) { return d.sources[k].source === 'builtin' && !d.sources[k].error; });
    $('status').innerHTML = parts.join(' · ') +
      (noUrl ? '<br>js/config.js에 시트 주소를 넣으면 구글 시트에서 읽어요.' : '');
  }

  function renderProblems(v) {
    function list(items) {
      return '<ul>' + items.map(function (e) {
        return '<li><b>' + e.row + '행' + (e.id ? ' (' + esc(e.id) + ')' : '') + '</b> ' + esc(e.msg) + '</li>';
      }).join('') + '</ul>';
    }
    var html = '';
    if (v.errors.length) html += '<div class="box err"><h3>고쳐야 할 곳 ' + v.errors.length + '개</h3><p>오류가 있는 규칙은 고객 화면에 나오지 않아요.</p>' + list(v.errors) + '</div>';
    if (v.warnings.length) html += '<div class="box warn"><h3>확인할 곳 ' + v.warnings.length + '개</h3>' + list(v.warnings) + '</div>';
    if (v.unconfirmed) html += '<div class="box warn"><h3>상태가 "확정"이 아닌 규칙 ' + v.unconfirmed + '개</h3><p>이 규칙이 결과에 들어가면 고객 화면에 "검수 전 예시 일정" 안내가 함께 나가요.</p></div>';
    if (!html) html = '<div class="box ok"><h3>문제 없음</h3><p>오류가 없고 사용 중인 규칙이 모두 확정 상태예요.</p></div>';
    $('problems').innerHTML = html;
  }

  function renderMatrix(d, scheds) {
    var head = '<thead><tr><th>규칙</th><th>기한</th><th>조건(미용·직원·과목)</th>' + COMBOS.map(function (c, i) {
      return '<th class="cell"><button type="button" class="combo" data-combo="' + i + '" aria-pressed="' + (i === state.combo) + '">' + c.label + '</button></th>';
    }).join('') + '</tr></thead>';

    var body = d.rules.map(function (r) {
      var off = E.yn(r['사용']) === 'N', errs = E.checkRule(r);
      var badges = (off ? '<span class="badge off">꺼짐</span>' : '') +
        (errs.length ? '<span class="badge err">오류</span>' : '') +
        (!off && String(r['상태']).trim() !== '확정' ? '<span class="badge warn">' + esc(r['상태'] || '상태 없음') + '</span>' : '');
      var cells = scheds.map(function (s, i) {
        var hits = s.items.filter(function (it) { return it.rule === r; });
        var sel = i === state.combo ? ' sel' : '';
        if (!hits.length) return '<td class="cell none' + sel + '">–</td>';
        var first = hits[0].date, last = hits[hits.length - 1].date;
        return '<td class="cell' + sel + '" title="' + esc(hits.map(function (it) { return E.iso(it.date); }).join('\n')) + '">' +
          '<b>' + hits.length + '회</b><small>' + UI.md(first) + (hits.length > 1 ? ' ~ ' + UI.md(last) : '') + '</small></td>';
      }).join('');
      return '<tr' + (off ? ' class="off"' : '') + '><th scope="row"><span class="rname">' + esc(r['이름'] || '(이름 없음)') + '</span>' + badges +
        '<small class="rid">' + esc(r.id || '(id 없음)') + ' · ' + r._row + '행</small></th>' +
        '<td class="due">' + esc(r['기한유형']) + ' ' + esc(r['기한값']) + '</td>' +
        '<td class="cond">' + esc(r['조건_미용']) + ' · ' + esc(r['조건_직원']) + ' · ' + esc(r['조건_과목']) + '</td>' + cells + '</tr>';
    }).join('');

    var foot = '<tfoot><tr><th scope="row">합계</th><td></td><td></td>' + scheds.map(function (s, i) {
      return '<td class="cell' + (i === state.combo ? ' sel' : '') + '">' + s.items.length + '건</td>';
    }).join('') + '</tr></tfoot>';

    $('matrix').innerHTML = head + '<tbody>' + body + '</tbody>' + foot;
  }

  function render() {
    var d = state.data;
    if (!d) return;
    renderStatus(d);
    renderProblems(E.validate(d));

    var open = E.parseDate($('rOpen').value), today = E.parseDate($('rToday').value) || E.todayUTC();
    if (!open) {
      $('periodText').textContent = '기준 개원일을 넣어 주세요.';
      $('matrix').innerHTML = '';
      $('preview').innerHTML = '';
      return;
    }
    var scheds = COMBOS.map(function (c) {
      return E.buildSchedule(d.rules, { openDate: open, dept: $('rDept').value, beauty: c.beauty, staff: c.staff }, today);
    });
    $('periodText').textContent = '표시 기간 ' + E.iso(scheds[0].start) + ' ~ ' + E.iso(scheds[0].end) +
      ' · 칸에 마우스를 올리면 날짜 전체가 보여요.';
    renderMatrix(d, scheds);
    $('previewTitle').textContent = '고객 화면 미리보기 · ' + $('rDept').value + ' · ' + COMBOS[state.combo].label;
    $('preview').innerHTML = UI.renderSchedule(scheds[state.combo]);
  }

  function download(key) {
    var text = String(state.data.texts[key] || '').replace(/^﻿/, '');
    // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
    var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = TABS[key] + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var todayIso = E.iso(E.todayUTC());
  $('rOpen').value = todayIso;
  $('rToday').value = todayIso;
  ['rOpen', 'rToday', 'rDept'].forEach(function (id) { $(id).addEventListener('change', render); });
  $('reload').addEventListener('click', load);
  $('matrix').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-combo]');
    if (!btn) return;
    state.combo = +btn.getAttribute('data-combo');
    render();
  });
  document.querySelectorAll('[data-export]').forEach(function (btn) {
    btn.addEventListener('click', function () { if (state.data) download(btn.getAttribute('data-export')); });
  });

  load();
})();
