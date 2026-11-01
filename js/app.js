import { openStore, randomId, loadMyTrips, saveMyTrip, forgetMyTrip, SECTION_NAMES } from './store.js';
import { splitExpense, computeBalances, computeTransfers } from './settlement.js';
import { COVERS } from './covers.js';

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const toastEl = document.getElementById('toast');

const CATEGORIES = ['交通', '宿泊', '食事', '観光', '買い物', 'その他'];
const RESERVATION_TYPES = ['宿泊', '交通', '食事', 'チケット', 'その他'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const TABS = [
  ['home', 'ホーム', '⌂'],
  ['itinerary', '日程', '☰'],
  ['places', '場所', '⚑'],
  ['reservations', '予約', '✎'],
  ['money', 'お金', '¥'],
];

let store = null;
let current = null; // 開いている旅行 { id, trip, members, itinerary, places, reservations, expenses, unsubs }
let moneyTab = 'settle';
let sheetSubmit = null;
let sheetDelete = null;

// ---------- 表示の補助 ----------

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const yen = (value) => `${Math.round(value).toLocaleString('ja-JP')}円`;

// 招待された人も書き込めるので、リンクは http と https だけを通す
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

const mapsUrl = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateLabel(iso) {
  if (!iso) return '日付未定';
  const date = parseDate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

function dateRange(trip) {
  if (!trip?.startDate) return '日程未定';
  return trip.endDate && trip.endDate !== trip.startDate
    ? `${dateLabel(trip.startDate)} 〜 ${dateLabel(trip.endDate)}`
    : dateLabel(trip.startDate);
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / 86400000);
}

function tripDays(trip) {
  if (!trip?.startDate) return [];
  const days = [];
  const end = parseDate(trip.endDate || trip.startDate);
  for (let d = parseDate(trip.startDate); d <= end && days.length < 60; d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

const byDateTime = (a, b) => `${a.date || '9'}${a.time || '99'}`.localeCompare(`${b.date || '9'}${b.time || '99'}`);

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

const memberName = (id) => current.members.find((m) => m.id === id)?.name ?? '（削除された人）';
const meId = () => loadMyTrips()[current.id]?.memberId;

// ---------- 入力シート ----------

function fieldHtml(field) {
  const { name, label, type = 'text', value = '', required, placeholder, options, hint, inputmode, rows } = field;
  const attrs = `name="${esc(name)}" id="f-${esc(name)}" ${required ? 'required' : ''} ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} ${inputmode ? `inputmode="${esc(inputmode)}"` : ''}`;
  let control;
  if (type === 'select') {
    control = `<select ${attrs}>${options.map((o) => {
      const [val, text] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(text)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea ${attrs} rows="${rows || 3}">${esc(value)}</textarea>`;
  } else {
    control = `<input type="${esc(type)}" ${attrs} value="${esc(value)}" ${type === 'number' ? 'min="0" step="1"' : ''}>`;
  }
  return `<div class="field"><label for="f-${esc(name)}">${esc(label)}${required ? '' : '<span class="opt">任意</span>'}</label>${control}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}

function openSheet({ title, body, onSubmit, onDelete, submitLabel = '保存する' }) {
  sheetSubmit = onSubmit;
  sheetDelete = onDelete || null;
  sheet.innerHTML = `
    <form method="dialog" id="sheet-form" novalidate>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="閉じる">×</button>
      </header>
      <div class="sheet-body">${body}<p class="form-error" id="form-error" role="alert"></p></div>
      <footer class="sheet-foot">
        ${onDelete ? '<button type="button" class="btn danger-text" data-action="sheet-delete">削除</button>' : ''}
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </footer>
    </form>`;
  sheet.showModal();
}

function closeSheet() {
  sheet.close();
  sheet.innerHTML = '';
  sheetSubmit = null;
  sheetDelete = null;
}

function showFormError(message) {
  const el = document.getElementById('form-error');
  if (el) el.textContent = message;
}

sheet.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const missing = [...form.querySelectorAll('[required]')].find((el) => !el.value.trim());
  if (missing) {
    showFormError(`「${missing.labels?.[0]?.firstChild?.textContent ?? '必須項目'}」を入力してください`);
    missing.focus();
    return;
  }
  const values = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(values)) {
    if (typeof values[key] === 'string') values[key] = values[key].trim();
  }
  const error = sheetSubmit?.(values, form);
  if (error) {
    showFormError(error);
    return;
  }
  closeSheet();
});

// ---------- 画面: 旅行の外 ----------

function viewTripList() {
  const trips = Object.entries(loadMyTrips())
    .sort(([, a], [, b]) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  document.title = '旅のしおり帖';
  return `
    <main class="page front">
      <header class="front-head">
        <div class="front-art">${COVERS.suitcase.svg}</div>
        <h1>旅のしおり帖</h1>
        <p>旅の計画も、立て替えの精算も、この一冊に。</p>
      </header>
      ${trips.length ? `
        <section>
          <h2 class="section-title">わたしの旅</h2>
          <ul class="card-list">
            ${trips.map(([id, t]) => `
              <li><a class="card trip-card" href="#/trip/${esc(id)}/home">
                <strong>${esc(t.name || '名前のない旅')}</strong>
                <span class="muted">${esc(dateRange(t))}</span>
              </a></li>`).join('')}
          </ul>
        </section>` : `
        <p class="empty">まだ旅はありません。<br>招待リンクをもらった人は、そのリンクから開いてください。</p>`}
      <a class="btn primary wide" href="#/new">＋ 新しい旅をつくる</a>
    </main>`;
}

function viewNewTrip() {
  document.title = '新しい旅 | 旅のしおり帖';
  return `
    <main class="page">
      <header class="top-bar"><a class="back" href="#/">‹ もどる</a></header>
      <h1 class="page-title">新しい旅をつくる</h1>
      <form id="new-trip" class="stack" novalidate>
        ${fieldHtml({ name: 'name', label: '旅の名前', required: true, placeholder: '例：秋の京都旅行' })}
        ${fieldHtml({ name: 'destination', label: '行き先', placeholder: '例：京都' })}
        <div class="two-col">
          ${fieldHtml({ name: 'startDate', label: '出発日', type: 'date', required: true })}
          ${fieldHtml({ name: 'endDate', label: '帰着日', type: 'date', required: true })}
        </div>
        ${fieldHtml({ name: 'budget', label: '全体の予算（円）', type: 'number', inputmode: 'numeric', placeholder: '例：90000' })}
        ${fieldHtml({ name: 'myName', label: 'あなたの名前', required: true, placeholder: '例：りょう' })}
        ${fieldHtml({ name: 'others', label: '一緒に行く人', type: 'textarea', rows: 3, placeholder: '1行に1人ずつ', hint: 'あとから追加もできます。' })}
        <p class="form-error" id="new-trip-error" role="alert"></p>
        <button class="btn primary wide" type="submit">旅をつくる</button>
      </form>
    </main>`;
}

function viewMessage(title, message) {
  return `
    <main class="page front">
      <h1 class="page-title">${esc(title)}</h1>
      <p class="empty">${esc(message)}</p>
      <a class="btn wide" href="#/">トップへ</a>
    </main>`;
}

function viewJoin() {
  const { trip, members } = current;
  document.title = `${trip.name} | 旅のしおり帖`;
  return `
    <main class="page front">
      <header class="front-head">
        <p class="muted">旅のしおり帖への招待</p>
        <h1>${esc(trip.name)}</h1>
        <p>${esc(dateRange(trip))}${trip.destination ? `・${esc(trip.destination)}` : ''}</p>
      </header>
      <h2 class="section-title">あなたはどなたですか？</h2>
      <div class="stack">
        ${members.map((m) => `<button class="btn wide" data-action="join-as" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}
        <button class="btn wide ghost" data-action="join-new">＋ 名前を追加して参加</button>
      </div>
    </main>`;
}

// ---------- 画面: 旅行の中 ----------

function tripShell(tab, title, body, { action } = {}) {
  document.title = `${title} | ${current.trip.name}`;
  return `
    <main class="page has-tabs">
      <header class="top-bar">
        <a class="back" href="#/">‹ 旅の一覧</a>
        <span class="top-name">${esc(current.trip.name)}</span>
      </header>
      <div class="title-row">
        <h1 class="page-title">${esc(title)}</h1>
        ${action || ''}
      </div>
      ${body}
    </main>
    <nav class="tabs" aria-label="メニュー">
      ${TABS.map(([key, label, icon]) => `
        <a href="#/trip/${esc(current.id)}/${key}" class="${key === tab ? 'active' : ''}" ${key === tab ? 'aria-current="page"' : ''}>
          <span aria-hidden="true">${icon}</span>${label}
        </a>`).join('')}
    </nav>`;
}

function itineraryCard(item) {
  const link = safeUrl(item.url) || (item.place ? mapsUrl(item.place) : '');
  return `
    <li class="card">
      <button class="card-main" data-action="edit-itinerary" data-id="${esc(item.id)}">
        <span class="time">${esc(item.time || '—')}</span>
        <span class="card-text">
          <strong>${esc(item.title)}</strong>
          ${item.place ? `<span class="muted">${esc(item.place)}</span>` : ''}
          ${item.note ? `<span class="note">${esc(item.note)}</span>` : ''}
        </span>
      </button>
      ${link ? `<a class="link-btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">地図</a>` : ''}
    </li>`;
}

function viewHome() {
  const { trip, itinerary, expenses, members } = current;
  const today = todayIso();
  const toStart = trip.startDate ? daysBetween(today, trip.startDate) : null;
  let badge = '';
  if (toStart !== null) {
    if (toStart > 0) badge = `出発まであと${toStart}日`;
    else if (today <= (trip.endDate || trip.startDate)) badge = `旅の${1 - toStart}日目`;
    else badge = 'おつかれさまでした';
  }
  const days = tripDays(trip);
  const focusDay = days.includes(today) ? today : days[0];
  const plans = itinerary.filter((i) => i.date === focusDay).sort(byDateTime);
  const used = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const budget = Number(trip.budget || 0);
  const balances = computeBalances(expenses, members.map((m) => m.id));
  const mine = balances[meId()]?.balance ?? 0;
  let mineText = '貸し借りなし';
  if (mine > 0) mineText = `${yen(mine)} 受け取り`;
  if (mine < 0) mineText = `${yen(-mine)} 支払い`;

  return tripShell('home', 'ホーム', `
    <section class="hero">
      <p class="hero-badge">${esc(badge)}</p>
      <p class="hero-date">${esc(dateRange(trip))}${trip.destination ? `・${esc(trip.destination)}` : ''}</p>
      <p class="muted">${members.map((m) => esc(m.name)).join('、')}</p>
    </section>
    <div class="stat-row">
      <a class="stat" href="#/trip/${esc(current.id)}/money" data-action="money-budget">
        <span class="muted">予算の残り</span>
        <strong>${budget ? yen(budget - used) : '未設定'}</strong>
      </a>
      <a class="stat" href="#/trip/${esc(current.id)}/money" data-action="money-settle">
        <span class="muted">あなたの精算</span>
        <strong>${esc(mineText)}</strong>
      </a>
    </div>
    <section>
      <h2 class="section-title">${focusDay === today ? '今日の予定' : `${esc(dateLabel(focusDay))}の予定`}</h2>
      ${plans.length ? `<ul class="card-list">${plans.map(itineraryCard).join('')}</ul>` : '<p class="empty small">予定はまだありません。</p>'}
    </section>
    <div class="stack row-links">
      <a class="btn wide" href="#/trip/${esc(current.id)}/booklet">しおりを見る</a>
      <a class="btn wide ghost" href="#/trip/${esc(current.id)}/settings">旅の設定・招待リンク</a>
    </div>`);
}

function viewItinerary() {
  const { trip, itinerary } = current;
  const days = [...new Set([...tripDays(trip), ...itinerary.map((i) => i.date).filter(Boolean)])].sort();
  const body = days.map((day) => {
    const items = itinerary.filter((i) => i.date === day).sort(byDateTime);
    return `
      <section class="day">
        <div class="day-head">
          <h2>${esc(dateLabel(day))}</h2>
          <button class="link-btn" data-action="add-itinerary" data-date="${esc(day)}">＋ 追加</button>
        </div>
        ${items.length ? `<ul class="card-list">${items.map(itineraryCard).join('')}</ul>` : '<p class="empty small">予定はまだありません。</p>'}
      </section>`;
  }).join('');
  return tripShell('itinerary', '日程表', body);
}

function viewPlaces() {
  const items = [...current.places].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const body = items.length ? `
    <ul class="card-list">
      ${items.map((p) => `
        <li class="card">
          <button class="card-main" data-action="edit-place" data-id="${esc(p.id)}">
            <span class="card-text">
              <strong>${esc(p.name)}</strong>
              ${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}
            </span>
          </button>
          <div class="card-actions">
            <a class="link-btn" href="${esc(safeUrl(p.url) || mapsUrl(p.name))}" target="_blank" rel="noopener noreferrer">地図</a>
            <button class="link-btn" data-action="place-to-itinerary" data-id="${esc(p.id)}">日程へ</button>
          </div>
        </li>`).join('')}
    </ul>` : '<p class="empty">気になる場所をメモしておきましょう。</p>';
  return tripShell('places', '行きたい場所', body, {
    action: '<button class="btn small primary" data-action="add-place">＋ 追加</button>',
  });
}

function viewReservations() {
  const items = [...current.reservations].sort(byDateTime);
  const body = `
    <p class="notice">招待リンクを知っている人は、ここの内容をすべて読めます。パスポート番号やカード番号は書かないでください。</p>
    ${items.length ? `
      <ul class="card-list">
        ${items.map((r) => `
          <li class="card column">
            <button class="card-main" data-action="edit-reservation" data-id="${esc(r.id)}">
              <span class="card-text">
                <span class="tag">${esc(r.type)}</span>
                <strong>${esc(r.name)}</strong>
                <span class="muted">${esc(r.date ? dateLabel(r.date) : '日付未定')} ${esc(r.time || '')}</span>
                ${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}
              </span>
            </button>
            <div class="card-actions">
              ${r.code ? `<button class="link-btn" data-action="copy" data-text="${esc(r.code)}">番号 ${esc(r.code)} をコピー</button>` : ''}
              ${safeUrl(r.url) ? `<a class="link-btn" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">予約ページ</a>` : ''}
            </div>
          </li>`).join('')}
      </ul>` : '<p class="empty">ホテルや交通機関の予約をまとめておきましょう。</p>'}`;
  return tripShell('reservations', '予約情報', body, {
    action: '<button class="btn small primary" data-action="add-reservation">＋ 追加</button>',
  });
}

function viewSettle() {
  const { expenses, members } = current;
  const balances = computeBalances(expenses, members.map((m) => m.id));
  const transfers = computeTransfers(balances);
  const sorted = [...expenses].sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  return `
    <section>
      <h2 class="section-title">精算のしかた</h2>
      ${transfers.length ? `
        <ul class="card-list">
          ${transfers.map((t) => `
            <li class="card transfer ${t.from === meId() || t.to === meId() ? 'mine' : ''}">
              <span>${esc(memberName(t.from))} → ${esc(memberName(t.to))}</span>
              <strong>${yen(t.amount)}</strong>
            </li>`).join('')}
        </ul>` : `<p class="empty small">${expenses.length ? '精算は必要ありません。' : '立て替えを入力すると、ここに表示されます。'}</p>`}
    </section>
    <section>
      <h2 class="section-title">一人ずつの内訳</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>名前</th><th>払った</th><th>負担</th><th>差額</th></tr></thead>
          <tbody>
            ${Object.entries(balances).map(([id, row]) => `
              <tr>
                <td>${esc(memberName(id))}</td>
                <td>${yen(row.paid)}</td>
                <td>${yen(row.owed)}</td>
                <td class="${row.balance < 0 ? 'minus' : ''}">${row.balance > 0 ? '+' : ''}${yen(row.balance)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint">割り切れない1円未満は、支払った人の負担にしています。</p>
    </section>
    <section>
      <h2 class="section-title">立て替えの記録（${expenses.length}件）</h2>
      ${sorted.length ? `
        <ul class="card-list">
          ${sorted.map((e) => `
            <li class="card">
              <button class="card-main" data-action="edit-expense" data-id="${esc(e.id)}">
                <span class="card-text">
                  <strong>${esc(e.title)}</strong>
                  <span class="muted">${esc(dateLabel(e.date))}・${esc(memberName(e.payerId))}が支払い・${Object.keys(e.participants || {}).length}人で割る</span>
                </span>
                <span class="amount">${yen(e.amount)}</span>
              </button>
            </li>`).join('')}
        </ul>` : ''}
    </section>`;
}

function viewBudget() {
  const { trip, expenses } = current;
  const budget = Number(trip.budget || 0);
  const used = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const left = budget - used;
  const percent = budget ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const memberCount = Math.max(current.members.length, 1);
  const rows = CATEGORIES.map((category) => ({
    category,
    total: expenses.filter((e) => (e.category || 'その他') === category).reduce((sum, e) => sum + Number(e.amount || 0), 0),
  })).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  return `
    <section class="budget">
      <p class="muted">${budget ? (left >= 0 ? '残り' : '予算オーバー') : '使った金額'}</p>
      <p class="budget-num ${left < 0 && budget ? 'minus' : ''}">${yen(budget ? Math.abs(left) : used)}</p>
      ${budget ? `
        <div class="meter ${left < 0 ? 'over' : ''}" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="予算の使用率">
          <span style="width:${percent}%"></span>
        </div>
        <p class="muted">予算 ${yen(budget)} のうち ${yen(used)} 使用（${Math.round((used / budget) * 100)}%）</p>` : '<p class="muted">予算は未設定です。</p>'}
      <p class="muted">1人あたり ${yen(used / memberCount)}</p>
      <button class="btn small" data-action="edit-budget">予算を変更</button>
    </section>
    <section>
      <h2 class="section-title">カテゴリ別</h2>
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>カテゴリ</th><th>金額</th><th>割合</th></tr></thead>
            <tbody>
              ${rows.map((row) => `<tr><td>${esc(row.category)}</td><td>${yen(row.total)}</td><td>${Math.round((row.total / used) * 100)}%</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="empty small">立て替えを入力すると集計されます。</p>'}
    </section>`;
}

function viewMoney() {
  const body = `
    <div class="segment" role="tablist">
      <button role="tab" aria-selected="${moneyTab === 'settle'}" class="${moneyTab === 'settle' ? 'active' : ''}" data-action="money-tab" data-tab="settle">精算</button>
      <button role="tab" aria-selected="${moneyTab === 'budget'}" class="${moneyTab === 'budget' ? 'active' : ''}" data-action="money-tab" data-tab="budget">予算</button>
    </div>
    ${moneyTab === 'settle' ? viewSettle() : viewBudget()}`;
  return tripShell('money', 'お金', body, {
    action: '<button class="btn small primary" data-action="add-expense">＋ 立て替え</button>',
  });
}

function viewBooklet() {
  const { trip, members, itinerary, places, reservations } = current;
  const cover = COVERS[trip.cover] ? trip.cover : 'ticket';
  document.title = `しおり | ${trip.name}`;
  const days = [...new Set([...tripDays(trip), ...itinerary.map((i) => i.date).filter(Boolean)])].sort();
  return `
    <main class="page booklet-page">
      <header class="top-bar no-print">
        <a class="back" href="#/trip/${esc(current.id)}/home">‹ もどる</a>
        <button class="btn small primary" data-action="print">印刷・PDF保存</button>
      </header>
      <div class="cover-picker no-print" role="group" aria-label="表紙を選ぶ">
        ${Object.entries(COVERS).map(([key, c]) => `
          <button class="${key === cover ? 'active' : ''}" aria-pressed="${key === cover}" data-action="pick-cover" data-cover="${key}">${esc(c.label)}</button>`).join('')}
      </div>
      <article class="booklet">
        <section class="b-cover">
          <p class="b-kicker">旅のしおり</p>
          <h1>${esc(trip.name)}</h1>
          <div class="b-art">${COVERS[cover].svg}</div>
          <p class="b-date">${esc(dateRange(trip))}</p>
          ${trip.destination ? `<p>${esc(trip.destination)}</p>` : ''}
          <p class="b-members">${members.map((m) => esc(m.name)).join('・')}</p>
        </section>
        <section class="b-section">
          <h2>日程</h2>
          ${days.map((day) => {
            const items = itinerary.filter((i) => i.date === day).sort(byDateTime);
            return `
              <div class="b-day">
                <h3>${esc(dateLabel(day))}</h3>
                ${items.length ? `<ul>${items.map((i) => `
                  <li>
                    <span class="b-time">${esc(i.time || '')}</span>
                    <span><strong>${esc(i.title)}</strong>${i.place ? ` ${esc(i.place)}` : ''}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</span>
                  </li>`).join('')}</ul>` : '<p class="b-empty">予定なし</p>'}
              </div>`;
          }).join('')}
        </section>
        ${reservations.length ? `
          <section class="b-section">
            <h2>予約</h2>
            <ul class="b-list">
              ${[...reservations].sort(byDateTime).map((r) => `
                <li><strong>${esc(r.name)}</strong><span>${esc(r.type)}・${esc(r.date ? dateLabel(r.date) : '日付未定')} ${esc(r.time || '')}</span></li>`).join('')}
            </ul>
            <p class="b-empty">予約番号は共有の安全のため、しおりには載せていません。</p>
          </section>` : ''}
        ${places.length ? `
          <section class="b-section">
            <h2>行きたい場所</h2>
            <ul class="b-list">
              ${places.map((p) => `<li><strong>${esc(p.name)}</strong>${p.note ? `<span>${esc(p.note)}</span>` : ''}</li>`).join('')}
            </ul>
          </section>` : ''}
        <section class="b-section b-memo">
          <h2>メモ</h2>
          <div class="b-lines"></div>
        </section>
      </article>
    </main>`;
}

function viewSettings() {
  const { trip, members } = current;
  const me = meId();
  return tripShell('home', '旅の設定', `
    <section>
      <h2 class="section-title">招待リンク</h2>
      <p class="notice">このリンクを知っている人は、予約情報を含む旅の内容を読み書きできます。メンバー以外には送らないでください。</p>
      <div class="stack">
        <button class="btn primary wide" data-action="share-invite">リンクを送る</button>
      </div>
    </section>
    <section>
      <h2 class="section-title">旅の情報</h2>
      <div class="card column padded">
        <strong>${esc(trip.name)}</strong>
        <span class="muted">${esc(dateRange(trip))}${trip.destination ? `・${esc(trip.destination)}` : ''}</span>
        <button class="btn small" data-action="edit-trip">変更する</button>
      </div>
    </section>
    <section>
      <div class="day-head">
        <h2 class="section-title">メンバー</h2>
        <button class="link-btn" data-action="add-member">＋ 追加</button>
      </div>
      <ul class="card-list">
        ${members.map((m) => `
          <li class="card">
            <button class="card-main" data-action="edit-member" data-id="${esc(m.id)}">
              <span class="card-text"><strong>${esc(m.name)}${m.id === me ? '（あなた）' : ''}</strong></span>
            </button>
            ${m.id === me ? '' : `<button class="link-btn" data-action="be-member" data-id="${esc(m.id)}">自分にする</button>`}
          </li>`).join('')}
      </ul>
    </section>
    <section>
      <button class="btn wide ghost" data-action="forget-trip">この端末の一覧から外す</button>
      <p class="hint">旅のデータは消えません。招待リンクからまた開けます。</p>
    </section>`);
}

// ---------- 編集フォーム ----------

function itineraryForm(existing, preset = {}) {
  const item = existing || preset;
  const save = (values) => {
    const id = existing?.id || randomId(20);
    store.set(current.id, 'itinerary', id, {
      date: values.date,
      time: values.time,
      title: values.title,
      place: values.place,
      url: item.url || '',
      note: values.note,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });
  };
  openSheet({
    title: existing ? '予定を編集' : '予定を追加',
    body: [
      fieldHtml({ name: 'title', label: '内容', required: true, value: item.title, placeholder: '例：清水寺を見学' }),
      `<div class="two-col">${fieldHtml({ name: 'date', label: '日付', type: 'date', required: true, value: item.date || current.trip.startDate })}${fieldHtml({ name: 'time', label: '時刻', type: 'time', value: item.time })}</div>`,
      fieldHtml({ name: 'place', label: '場所', value: item.place, placeholder: '地図検索に使います' }),
      fieldHtml({ name: 'note', label: 'メモ', type: 'textarea', value: item.note }),
    ].join(''),
    onSubmit: save,
    onDelete: existing ? () => store.remove(current.id, 'itinerary', existing.id) : null,
  });
}

function placeForm(existing) {
  openSheet({
    title: existing ? '場所を編集' : '行きたい場所を追加',
    body: [
      fieldHtml({ name: 'name', label: '名前', required: true, value: existing?.name, placeholder: '例：伏見稲荷大社' }),
      fieldHtml({ name: 'url', label: '地図やWebページのURL', type: 'url', inputmode: 'url', value: existing?.url, hint: '空なら、名前でGoogleマップを検索します。' }),
      fieldHtml({ name: 'note', label: 'メモ', type: 'textarea', value: existing?.note }),
    ].join(''),
    onSubmit: (values) => {
      if (values.url && !safeUrl(values.url)) return 'URLは http:// か https:// で始まるものを入れてください';
      store.set(current.id, 'places', existing?.id || randomId(20), {
        name: values.name,
        url: values.url,
        note: values.note,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
      return null;
    },
    onDelete: existing ? () => store.remove(current.id, 'places', existing.id) : null,
  });
}

function reservationForm(existing) {
  openSheet({
    title: existing ? '予約を編集' : '予約を追加',
    body: [
      fieldHtml({ name: 'type', label: '種類', type: 'select', required: true, options: RESERVATION_TYPES, value: existing?.type || '宿泊' }),
      fieldHtml({ name: 'name', label: '名前', required: true, value: existing?.name, placeholder: '例：○○旅館' }),
      `<div class="two-col">${fieldHtml({ name: 'date', label: '日付', type: 'date', value: existing?.date })}${fieldHtml({ name: 'time', label: '時刻', type: 'time', value: existing?.time })}</div>`,
      fieldHtml({ name: 'code', label: '予約番号', value: existing?.code }),
      fieldHtml({ name: 'url', label: '予約ページのURL', type: 'url', inputmode: 'url', value: existing?.url }),
      fieldHtml({ name: 'note', label: 'メモ', type: 'textarea', value: existing?.note }),
      '<p class="notice">パスポート番号やカード番号は書かないでください。</p>',
    ].join(''),
    onSubmit: (values) => {
      if (values.url && !safeUrl(values.url)) return 'URLは http:// か https:// で始まるものを入れてください';
      store.set(current.id, 'reservations', existing?.id || randomId(20), {
        ...values,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
      return null;
    },
    onDelete: existing ? () => store.remove(current.id, 'reservations', existing.id) : null,
  });
}

function expenseForm(existing) {
  const { members } = current;
  const participants = existing?.participants || Object.fromEntries(members.map((m) => [m.id, 1]));
  const weighted = Object.values(participants).some((w) => Number(w) !== 1);
  const defaultDate = (() => {
    const today = todayIso();
    return tripDays(current.trip).includes(today) ? today : current.trip.startDate;
  })();
  const body = `
    ${fieldHtml({ name: 'title', label: '内容', required: true, value: existing?.title, placeholder: '例：夕食' })}
    ${fieldHtml({ name: 'amount', label: '金額（円）', type: 'number', inputmode: 'numeric', required: true, value: existing?.amount })}
    <div class="two-col">
      ${fieldHtml({ name: 'payerId', label: '支払った人', type: 'select', required: true, options: members.map((m) => [m.id, m.name]), value: existing?.payerId || meId() })}
      ${fieldHtml({ name: 'date', label: '日付', type: 'date', required: true, value: existing?.date || defaultDate })}
    </div>
    ${fieldHtml({ name: 'category', label: 'カテゴリ', type: 'select', required: true, options: CATEGORIES, value: existing?.category || '食事' })}
    <fieldset class="split">
      <legend>誰で割る？</legend>
      <label class="check"><input type="checkbox" id="use-weight" ${weighted ? 'checked' : ''}> 負担の割合を変える</label>
      <div class="split-rows ${weighted ? 'weighted' : ''}" id="split-rows">
        ${members.map((m) => `
          <div class="split-row">
            <label class="check"><input type="checkbox" name="p:${esc(m.id)}" ${participants[m.id] ? 'checked' : ''}> ${esc(m.name)}</label>
            <input class="weight" type="number" min="0.5" step="0.5" inputmode="decimal" name="w:${esc(m.id)}" value="${esc(participants[m.id] || 1)}" aria-label="${esc(m.name)}の割合">
            <span class="share" data-share="${esc(m.id)}"></span>
          </div>`).join('')}
      </div>
    </fieldset>`;
  const collect = (form) => {
    const data = new FormData(form);
    const result = {};
    for (const m of members) {
      if (data.get(`p:${m.id}`)) {
        const useWeight = form.querySelector('#use-weight').checked;
        result[m.id] = useWeight ? Number(data.get(`w:${m.id}`)) : 1;
      }
    }
    return result;
  };
  openSheet({
    title: existing ? '立て替えを編集' : '立て替えを追加',
    body,
    onSubmit: (values, form) => {
      const amount = Number(values.amount);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 99999999) return '金額は1円以上の整数で入力してください';
      const chosen = collect(form);
      if (!Object.keys(chosen).length) return '割る人を1人以上選んでください';
      if (Object.values(chosen).some((w) => !(w > 0))) return '割合は0より大きい数にしてください';
      store.set(current.id, 'expenses', existing?.id || randomId(20), {
        title: values.title,
        amount,
        payerId: values.payerId,
        date: values.date,
        category: values.category,
        participants: chosen,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
      return null;
    },
    onDelete: existing ? () => store.remove(current.id, 'expenses', existing.id) : null,
  });
  const form = sheet.querySelector('form');
  const update = () => {
    const payerId = form.elements.payerId.value;
    form.querySelector('#split-rows').classList.toggle('weighted', form.querySelector('#use-weight').checked);
    const shares = splitExpense({ amount: Number(form.elements.amount.value) || 0, payerId, participants: collect(form) });
    form.querySelectorAll('[data-share]').forEach((el) => {
      el.textContent = yen(shares[el.dataset.share] || 0);
    });
  };
  form.addEventListener('input', update);
  update();
}

function tripForm() {
  const { trip } = current;
  openSheet({
    title: '旅の情報を変更',
    body: [
      fieldHtml({ name: 'name', label: '旅の名前', required: true, value: trip.name }),
      fieldHtml({ name: 'destination', label: '行き先', value: trip.destination }),
      `<div class="two-col">${fieldHtml({ name: 'startDate', label: '出発日', type: 'date', required: true, value: trip.startDate })}${fieldHtml({ name: 'endDate', label: '帰着日', type: 'date', required: true, value: trip.endDate })}</div>`,
    ].join(''),
    onSubmit: (values) => {
      if (values.endDate < values.startDate) return '帰着日は出発日より後にしてください';
      store.updateTrip(current.id, values);
      return null;
    },
  });
}

function budgetForm() {
  openSheet({
    title: '予算を変更',
    body: fieldHtml({ name: 'budget', label: '全体の予算（円）', type: 'number', inputmode: 'numeric', value: current.trip.budget || '', hint: '空にすると未設定になります。' }),
    onSubmit: (values) => {
      const budget = values.budget ? Number(values.budget) : 0;
      if (!Number.isInteger(budget) || budget < 0) return '予算は0以上の整数で入力してください';
      store.updateTrip(current.id, { budget });
      return null;
    },
  });
}

function memberForm(existing) {
  const usedInExpense = existing && current.expenses.some((e) => e.payerId === existing.id || e.participants?.[existing.id]);
  openSheet({
    title: existing ? '名前を変更' : 'メンバーを追加',
    body: `${fieldHtml({ name: 'name', label: '名前', required: true, value: existing?.name })}
      ${usedInExpense ? '<p class="hint">立て替えの記録で使われている人は削除できません。</p>' : ''}`,
    onSubmit: (values) => {
      store.set(current.id, 'members', existing?.id || randomId(20), { name: values.name, createdAt: existing?.createdAt || new Date().toISOString() });
      return null;
    },
    onDelete: existing && !usedInExpense && existing.id !== meId()
      ? () => store.remove(current.id, 'members', existing.id)
      : null,
  });
}

// ---------- 操作 ----------

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    window.prompt('コピーしてください', text);
  }
}

const findIn = (section, id) => current[section].find((item) => item.id === id);

const actions = {
  'close-sheet': closeSheet,
  'sheet-delete': () => {
    if (window.confirm('本当に削除しますか？')) {
      sheetDelete?.();
      closeSheet();
    }
  },
  'add-itinerary': (d) => itineraryForm(null, { date: d.date }),
  'edit-itinerary': (d) => itineraryForm(findIn('itinerary', d.id)),
  'add-place': () => placeForm(),
  'edit-place': (d) => placeForm(findIn('places', d.id)),
  'place-to-itinerary': (d) => {
    const place = findIn('places', d.id);
    itineraryForm(null, { title: place.name, place: place.name, url: place.url, note: place.note });
  },
  'add-reservation': () => reservationForm(),
  'edit-reservation': (d) => reservationForm(findIn('reservations', d.id)),
  'add-expense': () => expenseForm(),
  'edit-expense': (d) => expenseForm(findIn('expenses', d.id)),
  'edit-budget': budgetForm,
  'edit-trip': tripForm,
  'add-member': () => memberForm(),
  'edit-member': (d) => memberForm(findIn('members', d.id)),
  'be-member': (d) => {
    saveMyTrip(current.id, { memberId: d.id });
    render();
  },
  'money-tab': (d) => {
    moneyTab = d.tab;
    render();
  },
  'money-budget': () => { moneyTab = 'budget'; },
  'money-settle': () => { moneyTab = 'settle'; },
  'pick-cover': (d) => store.updateTrip(current.id, { cover: d.cover }),
  print: () => window.print(),
  copy: (d) => copyText(d.text, 'コピーしました'),
  'share-invite': async () => {
    const url = `${location.origin}${location.pathname}#/join/${current.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: current.trip.name, text: `「${current.trip.name}」のしおりです`, url });
      } catch (error) {
        if (error.name !== 'AbortError') copyText(url, 'リンクをコピーしました');
      }
    } else {
      copyText(url, 'リンクをコピーしました');
    }
  },
  'forget-trip': () => {
    if (window.confirm('この端末の一覧から外しますか？')) {
      forgetMyTrip(current.id);
      location.hash = '#/';
    }
  },
  'join-as': (d) => {
    saveMyTrip(current.id, { memberId: d.id });
    render();
  },
  'join-new': () => {
    openSheet({
      title: '名前を追加して参加',
      body: fieldHtml({ name: 'name', label: 'あなたの名前', required: true }),
      submitLabel: '参加する',
      onSubmit: (values) => {
        const id = randomId(20);
        store.set(current.id, 'members', id, { name: values.name, createdAt: new Date().toISOString() });
        saveMyTrip(current.id, { memberId: id });
        return null;
      },
    });
  },
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = actions[target.dataset.action];
  if (action) action(target.dataset);
});

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'new-trip') return;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  const errorEl = document.getElementById('new-trip-error');
  const missing = ['name', 'startDate', 'endDate', 'myName'].find((key) => !String(values[key]).trim());
  if (missing) {
    errorEl.textContent = '旅の名前、出発日、帰着日、あなたの名前を入力してください';
    return;
  }
  if (values.endDate < values.startDate) {
    errorEl.textContent = '帰着日は出発日より後にしてください';
    return;
  }
  const budget = values.budget ? Number(values.budget) : 0;
  if (!Number.isInteger(budget) || budget < 0) {
    errorEl.textContent = '予算は0以上の整数で入力してください';
    return;
  }
  const tripId = randomId(24);
  const now = new Date().toISOString();
  store.createTrip(tripId, {
    name: values.name.trim(),
    destination: values.destination.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    budget,
    cover: 'ticket',
    createdAt: now,
  });
  const myId = randomId(20);
  store.set(tripId, 'members', myId, { name: values.myName.trim(), createdAt: now });
  values.others.split('\n').map((s) => s.trim()).filter(Boolean).forEach((name, i) => {
    store.set(tripId, 'members', randomId(20), { name, createdAt: `${now}#${i}` });
  });
  saveMyTrip(tripId, { memberId: myId, name: values.name.trim(), startDate: values.startDate, endDate: values.endDate });
  location.hash = `#/trip/${tripId}/home`;
});

// ---------- 旅行データの購読と画面切り替え ----------

function leaveTrip() {
  current?.unsubs.forEach((unsub) => unsub());
  current = null;
}

function enterTrip(tripId) {
  if (current?.id === tripId) return;
  leaveTrip();
  moneyTab = 'settle';
  current = { id: tripId, trip: undefined, error: null, unsubs: [] };
  SECTION_NAMES.forEach((section) => { current[section] = []; });
  const opened = current;
  const onError = (error) => {
    console.error(error);
    if (opened !== current) return;
    current.error = error;
    render();
  };
  current.unsubs.push(store.watchTrip(tripId, (trip) => {
    if (opened !== current) return;
    current.trip = trip;
    if (trip && loadMyTrips()[tripId]?.memberId) {
      saveMyTrip(tripId, { name: trip.name, startDate: trip.startDate, endDate: trip.endDate });
    }
    render();
  }, onError));
  SECTION_NAMES.forEach((section) => {
    current.unsubs.push(store.watchSection(tripId, section, (items) => {
      if (opened !== current) return;
      if (section === 'members') items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      current[section] = items;
      render();
    }, onError));
  });
}

function banners() {
  const parts = [];
  if (store.mode === 'local') parts.push('<div class="banner">お試しモード：データはこの端末にだけ保存されます。</div>');
  if (!navigator.onLine) parts.push('<div class="banner offline">オフライン中：入力内容は、つながった時に反映されます。</div>');
  return parts.join('');
}

function currentView() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [first, id, section = 'home'] = parts;
  if (first === 'new') {
    leaveTrip();
    return viewNewTrip();
  }
  if (first === 'join' || first === 'trip') {
    if (!id) return viewMessage('リンクが正しくありません', '招待リンクをもう一度確認してください。');
    enterTrip(id);
    if (current.error) return viewMessage('読み込めませんでした', 'ネット接続を確認してください。初めて開く旅は、接続が必要です。');
    if (current.trip === undefined) return `<main class="page front"><p class="empty">読み込み中です…</p></main>`;
    if (current.trip === null) return viewMessage('旅が見つかりません', '招待リンクが正しいか確認してください。');
    if (!loadMyTrips()[id]?.memberId || !current.members.some((m) => m.id === meId())) {
      // メンバーの読み込み前に招待画面を一瞬出さないよう、参加済みの端末では待つ
      if (loadMyTrips()[id]?.memberId && !current.members.length) return `<main class="page front"><p class="empty">読み込み中です…</p></main>`;
      return viewJoin();
    }
    if (first === 'join') {
      location.replace(`#/trip/${id}/home`);
      return viewHome();
    }
    const views = {
      home: viewHome,
      itinerary: viewItinerary,
      places: viewPlaces,
      reservations: viewReservations,
      money: viewMoney,
      booklet: viewBooklet,
      settings: viewSettings,
    };
    return (views[section] || viewHome)();
  }
  leaveTrip();
  return viewTripList();
}

function render() {
  if (!store) return;
  const focused = document.activeElement;
  // 新規作成フォームは入力途中で描き直さない
  if (focused?.closest?.('#new-trip') && location.hash === '#/new') return;
  app.innerHTML = banners() + currentView();
}

window.addEventListener('hashchange', () => {
  if (sheet.open) closeSheet();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('online', render);
window.addEventListener('offline', render);
window.addEventListener('store-error', () => toast('保存できませんでした。もう一度お試しください。'));

async function start() {
  app.innerHTML = '<main class="page front"><p class="empty">読み込み中です…</p></main>';
  try {
    store = await openStore();
  } catch (error) {
    console.error(error);
    const detail = error.code ? `（${error.code}）` : '';
    app.innerHTML = viewMessage('開けませんでした', `初めて開くときはネット接続が必要です。接続を確認して、もう一度開いてください。${detail}`);
    return;
  }
  render();
  if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('sw.js').catch((error) => console.error(error));
  }
}

start();
