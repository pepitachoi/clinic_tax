/* 고객 화면: 입력(S1) → 결과(S2/S3). 입력값은 이 페이지 메모리에만 있고 어디로도 보내지 않는다. */
(function () {
  'use strict';

  var E = window.TaxEngine, UI = window.TaxUI;
  var $ = function (id) { return document.getElementById(id); };
  var today = E.todayUTC();
  var minDate = E.shiftYears(today, -1), maxDate = E.shiftYears(today, 1);
  var state = { data: null, beautyTouched: false };

  function radioValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function setRadio(name, value) {
    var el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  // 다 채워졌고 날짜가 범위 안이면 입력값, 아니면 null
  function readInput() {
    var raw = $('openDate').value, open = E.parseDate(raw), err = '';
    if (raw && !open) err = '날짜를 다시 확인해 주세요.';
    else if (open && (open < minDate || open > maxDate)) err = '개원 1년 전부터 개원 후 1년까지만 볼 수 있어요.';
    $('dateError').textContent = err;
    $('dateError').hidden = !err;

    var input = { openDate: open, dept: $('dept').value, beauty: radioValue('beauty'), staff: radioValue('staff') };
    var ok = state.data && open && !err && input.dept && input.beauty && input.staff;
    $('submit').disabled = !ok;
    return ok ? input : null;
  }

  function fillDepts() {
    $('dept').innerHTML = '<option value="">선택하세요</option>' + state.data.depts.map(function (d) {
      return '<option>' + UI.esc(d.name) + '</option>';
    }).join('');
  }

  function applySettings() {
    var st = state.data.settings;
    $('brand').textContent = st['세무법인명'] || '';
    $('beautyHint').textContent = st['미용안내'] || '';
    $('beautyHint').hidden = !st['미용안내'];
    $('footer').innerHTML = UI.renderFooter(st);
  }

  function chip(text) { return '<span class="chip">' + UI.esc(text) + '</span>'; }

  function showResult(push) {
    var input = readInput();
    if (!input) return;
    var s = E.buildSchedule(state.data.rules, input, today);
    var d = input.openDate;

    $('chips').innerHTML =
      chip(d.getUTCFullYear() + '.' + (d.getUTCMonth() + 1) + '.' + d.getUTCDate() + ' 개원') +
      chip(input.dept) +
      chip(input.beauty === 'Y' ? '미용 시술 함' : '미용 시술 안 함') +
      chip(input.staff === 'Y' ? '직원 있음' : '직원 없음');
    $('schedule').innerHTML = UI.renderSchedule(s);
    $('draftNotice').hidden = !s.items.some(function (it) { return String(it.rule['상태']).trim() !== '확정'; });

    var current = document.querySelector('.month.current');
    $('jumpNow').hidden = !current || current === document.querySelector('.month');

    document.body.classList.add('show-result');
    $('form').hidden = true;
    $('result').hidden = false;
    window.scrollTo(0, 0);
    if (push) history.pushState({ view: 'result' }, '', '#result');
  }

  function showForm() {
    document.body.classList.remove('show-result');
    $('result').hidden = true;
    $('form').hidden = false;
    window.scrollTo(0, 0);
  }

  function init() {
    // 새로고침하면 입력값이 없으므로 결과 주소를 지운다
    if (location.hash === '#result') history.replaceState(null, '', location.pathname + location.search);

    $('openDate').min = E.iso(minDate);
    $('openDate').max = E.iso(maxDate);

    $('form').addEventListener('input', readInput);
    $('form').addEventListener('change', readInput);
    $('dept').addEventListener('change', function () {
      if (state.beautyTouched) return;
      var dept = state.data.depts.filter(function (d) { return d.name === $('dept').value; })[0];
      if (dept && dept.beautyDefault) setRadio('beauty', dept.beautyDefault);
      readInput();
    });
    document.querySelectorAll('input[name="beauty"]').forEach(function (el) {
      el.addEventListener('change', function () { state.beautyTouched = true; });
    });
    $('form').addEventListener('submit', function (e) { e.preventDefault(); showResult(true); });
    $('back').addEventListener('click', function () {
      if (history.state && history.state.view === 'result') history.back();
      else showForm();
    });
    window.addEventListener('popstate', function () {
      if (history.state && history.state.view === 'result') showResult(false);
      else showForm();
    });
    $('jumpNow').addEventListener('click', function (e) {
      e.preventDefault();
      var current = document.querySelector('.month.current');
      if (current) current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    E.loadData(window.TAX_CONFIG, window.TAX_DEFAULT_DATA).then(function (data) {
      state.data = data;
      fillDepts();
      applySettings();
      if (data.failed) {
        $('loadNotice').textContent = '최신 일정표를 불러오지 못해 저장된 일정표로 보여드려요.';
        $('loadNotice').hidden = false;
      }
      readInput();
    });
  }

  init();
})();
