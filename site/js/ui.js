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

  function telLink(st) {
    return '<a href="tel:' + esc(st['연락처'].replace(/[^\d+]/g, '')) + '">' + esc(st['연락처']) + '</a>';
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
    var head =
      '<span class="date"><b>' + md(it.date) + '</b><small>' + wd(it.date) + '</small></span>' +
      '<span class="body"><span class="name">' + esc(r['이름']) + '</span>' + tags +
      '<span class="line">' + esc(r['한줄설명']) + '</span></span>';
    var cls = 'item' + (it.past ? ' past' : '');
    if (!detail && !basis && !contact) return '<li class="' + cls + '"><div class="row">' + head + '</div></li>';
    return '<li class="' + cls + '"><details><summary>' + head + '<span class="chev" aria-hidden="true"></span></summary>' +
      '<div class="more">' + (detail ? '<p>' + esc(detail) + '</p>' : '') +
      (basis ? '<p class="basis">근거 · ' + esc(basis) + '</p>' : '') +
      (contact ? '<p class="item-contact">연락 · ' + esc(st['세무법인명'] || '') + ' ' + telLink(st) + '</p>' : '') +
      '</div></details></li>';
  }

  function renderSchedule(s, st) {
    var ids = contactIds(st);
    return s.months.map(function (mo) {
      return '<section class="month' + (mo.current ? ' current' : '') + '" id="m-' + mo.key + '">' +
        '<h2>' + mo.y + '년 ' + mo.m + '월' + (mo.current ? ' <span class="now">이번 달</span>' : '') + '</h2>' +
        (mo.items.length
          ? '<ul class="items">' + mo.items.map(function (it) { return renderItem(it, st, ids); }).join('') + '</ul>'
          : '<p class="empty">챙길 일정이 없어요</p>') +
        '</section>';
    }).join('');
  }

  function renderFooter(st) {
    var html = '';
    if (st['휴일안내']) html += '<p>' + esc(st['휴일안내']) + '</p>';
    if (st['면책문구']) html += '<p>' + esc(st['면책문구']) + '</p>';
    if (st['세무법인명'] || st['연락처']) {
      html += '<p class="contact">문의 · ' + esc(st['세무법인명'] || '') +
        (st['연락처'] ? ' ' + telLink(st) : '') + '</p>';
    }
    if (st['규칙기준일']) html += '<p class="stamp">일정 기준일 ' + esc(st['규칙기준일']) + '</p>';
    return html;
  }

  global.TaxUI = { esc: esc, md: md, wd: wd, renderSchedule: renderSchedule, renderFooter: renderFooter };
})(window);
