/* 고객 화면과 검수 화면이 함께 쓰는 일정 목록 그리기. 시트 내용은 모두 이스케이프한다. */
(function (global) {
  'use strict';

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function md(d) { return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  function wd(d) { return WEEK[d.getUTCDay()]; }

  // 세목 → 색 묶음. 색은 보조 신호이고, 세목 이름은 항상 글자로도 보인다.
  var CAT = { '부가세': 'vat', '원천세': 'wage', '지급명세서': 'wage', '종합소득세': 'income', '지방세': 'local', '4대보험': 'ins' };
  function catOf(r) { return CAT[String(r['세목'] || '').trim()] || 'etc'; }

  var PHONE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';

  function telHref(st) { return 'tel:' + esc(st['연락처'].replace(/[^\d+]/g, '')); }
  function callButton(st) {
    return '<a class="call" href="' + telHref(st) + '">' + PHONE_ICON +
      '<span>' + esc(st['세무법인명'] || '담당 세무사') + '에 전화하기</span><b>' + esc(st['연락처']) + '</b></a>';
  }

  // 설정 '연락처항목'(규칙 id, 쉼표로 여러 개)에 든 일정에 세무법인 연락처를 붙인다. 줄이 없으면 상담 항목에만.
  function contactIds(st) {
    if (!st || !st['연락처']) return [];
    var v = st['연락처항목'] == null ? 'PREP_CONSULT' : st['연락처항목'];
    return String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function renderItem(it, st, ids) {
    var r = it.rule, detail = (r['상세설명'] || '').trim(), basis = (r['근거'] || '').trim();
    var contact = ids.indexOf(String(r['id']).trim()) >= 0;
    var tags = it.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var d = it.date;
    var head =
      '<span class="date" aria-label="' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 ' + wd(d) + '요일">' +
      '<small class="dm">' + (d.getUTCMonth() + 1) + '월</small><b>' + d.getUTCDate() + '</b><small>' + wd(d) + '</small></span>' +
      '<span class="body"><span class="cat">' + esc(r['세목']) + (it.past ? '<span class="past-label">지남</span>' : '') + '</span>' +
      '<span class="name">' + esc(r['이름']) + '</span>' + tags +
      '<span class="line">' + esc(r['한줄설명']) + '</span></span>';
    var cls = 'item c-' + catOf(r) + (it.past ? ' past' : '');
    if (!detail && !basis && !contact) return '<li class="' + cls + '"><div class="row">' + head + '</div></li>';
    return '<li class="' + cls + '"><details><summary>' + head + '<span class="chev" aria-hidden="true"></span></summary>' +
      '<div class="more">' + (detail ? '<p>' + esc(detail) + '</p>' : '') +
      (basis ? '<p class="basis">근거 · ' + esc(basis) + '</p>' : '') +
      (contact ? callButton(st) : '') +
      '</div></details></li>';
  }

  function renderSchedule(s, st) {
    var ids = contactIds(st);
    return s.months.map(function (mo) {
      return '<section class="month' + (mo.current ? ' current' : '') + '" id="m-' + mo.key + '">' +
        '<h2><span>' + mo.y + '년 <b>' + mo.m + '월</b></span>' + (mo.current ? '<span class="now">이번 달</span>' : '') +
        (mo.items.length ? '<span class="count">' + mo.items.length + '건</span>' : '') + '</h2>' +
        (mo.items.length
          ? '<ul class="items">' + mo.items.map(function (it) { return renderItem(it, st, ids); }).join('') + '</ul>'
          : '<p class="empty">챙길 일정이 없어요</p>') +
        '</section>';
    }).join('');
  }

  function renderFooter(st) {
    var html = '';
    if (st['연락처']) html += '<div class="foot-call"><p class="foot-q">일정이 헷갈리면 편하게 물어보세요</p>' + callButton(st) + '</div>';
    else if (st['세무법인명']) html += '<p class="contact">문의 · ' + esc(st['세무법인명']) + '</p>';
    if (st['휴일안내']) html += '<p>' + esc(st['휴일안내']) + '</p>';
    if (st['면책문구']) html += '<p>' + esc(st['면책문구']) + '</p>';
    if (st['규칙기준일']) html += '<p class="stamp">일정 기준일 ' + esc(st['규칙기준일']) + '</p>';
    return html;
  }

  global.TaxUI = { esc: esc, md: md, wd: wd, renderSchedule: renderSchedule, renderFooter: renderFooter };
})(window);
