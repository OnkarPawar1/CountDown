const KEY = 'daymark.events.v1', PREF = 'daymark.prefs.v1', DAY = 86400000;
const IDB_NAME = 'daymark_db', IDB_STORE = 'events_store';

const STARTER_EVENTS = [
  {
    id: 'starter-new-year',
    title: "New Year's Day",
    type: 'event',
    start: `${new Date().getFullYear() + 1}-01-01T00:00`,
    end: '',
    color: 'blue',
    repeat: 'yearly',
    unit: 'auto',
    notes: 'Welcome the new year with fresh goals!'
  },
  {
    id: 'starter-birthday',
    title: "Mom's Birthday",
    type: 'birthday',
    start: `${new Date().getFullYear() - 28}-10-25T09:00`,
    end: '',
    color: 'pink',
    repeat: 'yearly',
    unit: 'auto',
    notes: 'Pick up flowers & celebratory dinner.'
  },
  {
    id: 'starter-career',
    title: 'Software Engineer',
    type: 'job',
    start: `${new Date().getFullYear() - 2}-01-15T09:00`,
    end: '',
    color: 'purple',
    repeat: 'none',
    unit: 'auto',
    notes: 'Ongoing professional journey and milestones.'
  },
  {
    id: 'starter-goal',
    title: 'Fitness & Health Target',
    type: 'goal',
    start: `${new Date().getFullYear()}-01-01T00:00`,
    end: `${new Date().getFullYear()}-12-31T23:59`,
    color: 'green',
    repeat: 'none',
    unit: 'auto',
    notes: 'Consistent daily workout and healthy habits.'
  }
];

// IndexedDB Helper for dual-layer persistent storage (protects against Safari cache eviction)
function openIDB() {
  return new Promise(resolve => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbSaveAll(items) {
  try {
    const db = await openIDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  } catch (err) {
    console.warn('IDB write fallback error:', err);
  }
}

async function idbGetAll() {
  try {
    const db = await openIDB();
    if (!db) return [];
    return new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

function readEvents() {
  if (localStorage.getItem(KEY) === null) {
    try { localStorage.setItem(KEY, JSON.stringify(STARTER_EVENTS)); } catch {}
    idbSaveAll(STARTER_EVENTS);
    return STARTER_EVENTS;
  }
  return read(KEY, []);
}

let events = readEvents(), prefs = read(PREF, { view: 'overview', filter: 'all', showAllOverview: false }), query = '';
const $ = s => document.querySelector(s), safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function read(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
    localStorage.setItem(PREF, JSON.stringify(prefs));
  } catch {
    toast('Storage is full. Export a backup and remove older entries.');
  }
  idbSaveAll(events);
}

// Request permanent persistence from Safari/Chrome
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// If localStorage was cleared (e.g. Safari 7-day eviction), restore from IndexedDB backup
(async function checkRecovery() {
  if (events.length === 0) {
    const backup = await idbGetAll();
    if (backup && backup.length > 0) {
      events = backup;
      save();
      render();
      toast(`Restored ${backup.length} counters from secure backup`);
    }
  } else {
    idbSaveAll(events);
  }
})();

function toast(s) { const t = $('#toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => t.style.display = 'none', 3500); }
function parse(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
function stamp(d) { const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return t.toISOString().slice(0, 16); }
function dateText(d) { return d?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) || ''; }
function span(ms) {
  let x = Math.abs(ms);
  let days = Math.floor(x / DAY);
  let hours = Math.floor((x % DAY) / 3600000);
  let mins = Math.floor((x % 3600000) / 60000);
  let secs = Math.floor((x % 60000) / 1000);
  return { days, hours, mins, secs };
}
function calendarAge(start, end = new Date()) {
  let y = end.getFullYear() - start.getFullYear(), m = end.getMonth() - start.getMonth(), d = end.getDate() - start.getDate();
  if (d < 0) { m--; d += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return `${Math.max(0, y)}y ${Math.max(0, m)}m ${Math.max(0, d)}d`;
}
function occurrence(e, now = new Date()) {
  let base = parse(e.end || e.start);
  if (!base) return null;
  let repeat = e.type === 'birthday' || e.type === 'anniversary' ? 'yearly' : e.repeat;
  if (repeat === 'none' || !repeat) return base;
  let d = new Date(base);
  if (repeat === 'yearly') {
    const make = y => new Date(y, base.getMonth(), Math.min(base.getDate(), new Date(y, base.getMonth() + 1, 0).getDate()), base.getHours(), base.getMinutes());
    d = make(now.getFullYear());
    let isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (!isSameDay && d < now) d = make(now.getFullYear() + 1);
  }
  if (repeat === 'monthly') {
    const make = (y, m) => new Date(y, m, Math.min(base.getDate(), new Date(y, m + 1, 0).getDate()), base.getHours(), base.getMinutes());
    d = make(now.getFullYear(), now.getMonth());
    let isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (!isSameDay && d < now) d = make(now.getFullYear() + 1);
  }
  if (repeat === 'weekly') {
    let n = Math.max(0, Math.ceil((now - d) / (7 * DAY)));
    d = new Date(d.getTime() + n * 7 * DAY);
  }
  return d;
}
function info(e, now = new Date()) {
  const start = parse(e.start), end = parse(e.end), target = occurrence(e, now);
  const recurring = ['birthday', 'anniversary'].includes(e.type) || e.repeat !== 'none';
  let metric = '', sub = '', progress = null;
  const isSameDay = target && target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate();

  if (e.type === 'job') {
    let finish = end || now;
    if (start > finish) {
      metric = 'Starts soon';
      sub = dateText(start);
    } else {
      metric = calendarAge(start, finish);
      sub = end ? 'Experience completed' : 'Current experience';
      if (end) progress = 100;
    }
  } else if (e.type === 'birthday') {
    let turning = target.getFullYear() - start.getFullYear();
    if (isSameDay) {
      metric = 'Today! 🎂';
      sub = `Turning ${turning}`;
      progress = 100;
    } else {
      let days = Math.max(0, Math.ceil((target - now) / DAY));
      metric = `${days} day${days === 1 ? '' : 's'}`;
      sub = `Next birthday · turning ${turning}`;
      let previous = new Date(target);
      previous.setFullYear(previous.getFullYear() - 1);
      progress = Math.min(100, Math.max(0, (now - previous) / (target - previous) * 100));
    }
  } else if (e.type === 'anniversary') {
    let years = target.getFullYear() - start.getFullYear();
    if (isSameDay) {
      metric = 'Today! 🥂';
      sub = `${years} year${years === 1 ? '' : 's'} anniversary`;
      progress = 100;
    } else {
      let days = Math.max(0, Math.ceil((target - now) / DAY));
      metric = `${days} day${days === 1 ? '' : 's'}`;
      sub = `${years} year${years === 1 ? '' : 's'} anniversary`;
      let previous = new Date(target);
      previous.setFullYear(previous.getFullYear() - 1);
      progress = Math.min(100, Math.max(0, (now - previous) / (target - previous) * 100));
    }
  } else if (target) {
    let diff = target - now;
    if (e.type === 'goal' && end && start) {
      progress = Math.min(100, Math.max(0, (now - start) / (end - start) * 100));
    }
    if (diff >= 0) {
      let n = span(diff);
      let secs = Math.floor((diff % 60000) / 1000);
      metric = e.unit === 'hours' ? `${Math.ceil(diff / 3600000)} hours`
        : e.unit === 'minutes' ? `${Math.ceil(diff / 60000)} min`
        : e.unit === 'days' ? `${Math.ceil(diff / DAY)} days`
        : diff < 3600000 ? `${n.mins}m ${secs}s`
        : diff < DAY ? `${n.hours}h ${n.mins}m`
        : `${Math.ceil(diff / DAY)} days`;
      sub = `Until ${dateText(target)}`;
    } else {
      if (isSameDay) {
        metric = 'Today';
        sub = `At ${target.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      } else {
        let passedDays = Math.max(1, Math.floor(Math.abs(diff) / DAY));
        metric = `${passedDays} day${passedDays === 1 ? '' : 's'}`;
        sub = `Since ${dateText(target)}`;
      }
    }
  }
  return { metric, sub, progress, target, recurring };
}
function typeName(e) { return ({ birthday: 'Birthday', job: 'Career', goal: 'Goal', anniversary: 'Anniversary', todo: 'Task', event: 'Event' })[e.type] || 'Event'; }
function card(e) {
  let i = info(e);
  return `<article class="event-card"><div class="card-top"><span class="category ${safe(e.color)}">${typeName(e)}</span><button class="card-menu" data-edit="${safe(e.id)}" aria-label="Edit ${safe(e.title)}">···</button></div><h3>${safe(e.title)}</h3><div class="metric">${safe(i.metric)}</div><div class="sub">${safe(i.sub)}</div>${i.progress !== null ? `<div class="progress-track" role="progressbar" aria-valuenow="${Math.round(i.progress)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${i.progress}%"></div></div>` : ''}</article>`;
}
function empty() { return `<div class="empty"><div style="font-size:35px">◷</div><strong>Nothing here yet</strong><p>Add a birthday, deadline, goal or career period to begin.</p><button class="primary" data-add>＋ New counter</button></div>`; }
function overview() {
  let now = new Date(), upcoming = events.filter(e => { let i = info(e, now); return i.target && i.target >= now && e.type !== 'job'; }).sort((a, b) => info(a, now).target - info(b, now).target), next = upcoming[0], birthdays = events.filter(e => e.type === 'birthday').length, goals = events.filter(e => e.type === 'goal').length;
  let sorted = [...events].sort((a, b) => (info(a).target || new Date(9e15)) - (info(b).target || new Date(9e15)));
  let displayed = prefs.showAllOverview ? sorted : sorted.slice(0, 6);

  return `<div class="stats"><div class="stat"><span class="label">All counters</span><strong>${events.length}</strong><small>Stored on device</small></div><div class="stat"><span class="label">Coming up</span><strong>${upcoming.length}</strong><small>Future dates</small></div><div class="stat"><span class="label">Birthdays</span><strong>${birthdays}</strong><small>Never miss one</small></div><div class="stat"><span class="label">Goals</span><strong>${goals}</strong><small>Progress in view</small></div></div><div class="hero-grid"><div class="feature-card"><div class="eyebrow">${next ? 'NEXT UP' : 'YOUR NEXT MOMENT'}</div><h2>${next ? safe(next.title) : 'Keep the days that matter close.'}</h2><div class="feature-number">${next ? safe(info(next).metric) : 'Start here'}</div><p>${next ? safe(info(next).sub) : 'Add your first counter and see time take shape.'}</p>${next && info(next).progress !== null ? `<div class="progress-track"><div class="progress-fill" style="width:${info(next).progress}%"></div></div>` : ''}</div><div class="quick-card"><h2>Quick start</h2><div class="quick-actions"><button data-add="birthday">🎂 &nbsp; Add a birthday</button><button data-add="job">💼 &nbsp; Track an experience</button><button data-add="goal">◎ &nbsp; Start a goal</button></div></div></div><div class="section-head"><div><h2 style="display:inline-block">Your counters</h2><span class="sub-label">${events.length > 6 ? (prefs.showAllOverview ? `Showing all ${events.length}` : `Showing upcoming 6 of ${events.length}`) : `${events.length} total`}</span></div><div style="display:flex;gap:8px;align-items:center">${events.length > 6 ? `<button class="text-btn" data-toggle-overview>${prefs.showAllOverview ? 'Show top 6' : `Show all ${events.length}`}</button>` : ''}<button class="text-btn" data-view="events">All events tab →</button></div></div>${events.length ? `<div class="cards">${displayed.map(card).join('')}</div>` : empty()}`;
}
function allEvents() {
  let types = ['all', 'event', 'birthday', 'job', 'goal', 'anniversary', 'todo'];
  let filtered = events.filter(e => (prefs.filter === 'all' || e.type === prefs.filter) && e.title.toLowerCase().includes(query.toLowerCase()));
  return `<div class="toolbar"><div class="filters">${types.map(t => `<button class="chip ${prefs.filter === t ? 'active' : ''}" data-filter="${t}">${t === 'all' ? `All (${events.length})` : ({ todo: 'Tasks', job: 'Career' })[t] || t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><input class="search" id="search" placeholder="Search ${events.length} counters..." aria-label="Search counters" value="${safe(query)}"></div>${filtered.length ? `<div class="cards">${filtered.map(card).join('')}</div>` : empty()}`;
}
function timeline() {
  let jobs = events.filter(e => e.type === 'job').sort((a, b) => new Date(a.start) - new Date(b.start));
  let milestones = events.filter(e => e.type === 'goal' && e.end);
  return `<div class="stack"><div class="panel"><div class="section-head" style="margin:0 0 12px"><h2>Career & experience</h2><button class="text-btn" data-add="job">＋ Add period</button></div>${jobs.length ? `<div class="list">${jobs.map(e => `<div class="list-row"><div><strong>${safe(e.title)}</strong><small>${dateText(parse(e.start))} — ${e.end ? dateText(parse(e.end)) : 'Present'}</small></div><div class="row-metric">${safe(info(e).metric)}</div><button class="mini-btn" data-edit="${safe(e.id)}">Edit</button></div>`).join('')}</div>` : empty()}</div><div class="panel"><h2>Year in days</h2><p class="hint">A look at how much of this year has passed.</p>${yearChart()}<div class="result"><strong>${Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / DAY)} days lived this year</strong><p>${Math.max(0, Math.ceil((new Date(new Date().getFullYear() + 1, 0, 1) - new Date()) / DAY))} days until next year</p></div></div>${milestones.length ? `<div class="panel"><h2>Goal progress</h2><div class="list">${milestones.map(e => `<div class="settings-row"><div><strong>${safe(e.title)}</strong><p>${safe(info(e).metric)} ${safe(info(e).sub)}</p></div><strong>${Math.round(info(e).progress ?? 0)}%</strong></div>`).join('')}</div></div>` : ''}</div>`;
}
function yearChart() {
  let y = new Date().getFullYear(), now = new Date(), days = Array.from({ length: 12 }, (_, i) => { let a = new Date(y, i, 1), b = new Date(y, i + 1, 1); return Math.min(100, Math.max(0, (now - a) / (b - a) * 100)); });
  return `<div class="chart" aria-label="Monthly progress of ${y}">${days.map((v, i) => `<div class="chart-col" title="${new Date(y, i, 1).toLocaleString(undefined, { month: 'long' })}: ${Math.round(v)}% complete" style="height:${Math.max(3, v)}%"></div>`).join('')}</div><div class="chart-labels"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span></div>`;
}
function calculator() {
  return `<div class="stack"><div class="panel"><h2>Date difference</h2><p class="hint">Compare two dates and times, including elapsed years, months, weeks, days, hours and minutes.</p><div class="form-grid"><label>From<input id="calcFrom" type="datetime-local" value="${stamp(new Date())}"></label><label>To<input id="calcTo" type="datetime-local" value="${stamp(new Date(Date.now() + 30 * DAY))}"></label></div><div class="result" id="differenceResult"></div></div><div class="panel"><h2>Add or subtract time</h2><div class="form-grid"><label>Starting date<input id="durationStart" type="datetime-local" value="${stamp(new Date())}"></label><label>Direction<select id="durationSign"><option value="1">Add</option><option value="-1">Subtract</option></select></label></div><div class="form-grid"><label>Amount<input id="durationAmount" type="number" min="0" value="30"></label><label>Unit<select id="durationUnit"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option><option value="hours">Hours</option><option value="minutes">Minutes</option></select></label></div><div class="result" id="durationResult"></div></div></div>`;
}
function updateCalculators() {
  let a = parse($('#calcFrom')?.value), b = parse($('#calcTo')?.value);
  if (a && b) {
    let low = a < b ? a : b, high = a < b ? b : a, d = span(high - low), weeks = Math.floor(d.days / 7);
    $('#differenceResult').innerHTML = `<strong>${calendarAge(low, high)}</strong><p>${d.days.toLocaleString()} days · ${weeks.toLocaleString()} weeks and ${d.days % 7} days · ${Math.floor((high - low) / 3600000).toLocaleString()} hours · ${Math.floor((high - low) / 60000).toLocaleString()} minutes ${a > b ? '(to an earlier date)' : ''}</p>`;
  }
  let s = parse($('#durationStart')?.value), n = Number($('#durationAmount')?.value), sign = Number($('#durationSign')?.value), unit = $('#durationUnit')?.value;
  if (s && Number.isFinite(n) && n >= 0) {
    let d = new Date(s);
    if (unit === 'months' || unit === 'years') {
      let day = d.getDate();
      d.setDate(1);
      if (unit === 'months') d.setMonth(d.getMonth() + sign * n);
      else d.setFullYear(d.getFullYear() + sign * n);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else d = new Date(d.getTime() + sign * n * ({ weeks: 7 * DAY, days: DAY, hours: 3600000, minutes: 60000 }[unit] || DAY));
    $('#durationResult').innerHTML = `<strong>${dateText(d)}</strong><p>${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>`;
  }
}
function settings() {
  let sizeKB = (JSON.stringify(events).length / 1024).toFixed(1);
  return `<div class="panel"><h2>Backups & storage</h2><div class="result" style="margin-top:0;margin-bottom:20px;background:#f0f5ff"><strong>${events.length} counters stored securely</strong><p>Using ${sizeKB} KB of storage with dual-layer backup (LocalStorage + IndexedDB). Data is 100% private on your device.</p></div><div class="settings-row"><div><strong>Export complete backup</strong><p>Download a JSON backup of all ${events.length} counters to your device or iCloud Drive.</p></div><button class="primary" data-export-all>Download JSON</button></div><div class="settings-row"><div><strong>Import counters</strong><p>Restore counters from a Daymark JSON backup. Existing IDs will update, new ones will be added.</p></div><button class="secondary" data-import>Choose file</button></div><div class="settings-row"><div><strong>Sample counters</strong><p>Load example counters (birthdays, career timeline, goals) if you'd like to explore.</p></div><button class="secondary" data-reset-starter>Load samples</button></div>${events.map(e => `<div class="settings-row"><div><strong>${safe(e.title)}</strong><p>${typeName(e)}</p></div><button class="mini-btn" data-export="${safe(e.id)}">Export</button></div>`).join('')}<div class="settings-row"><div><strong>Clear all counters</strong><p>First export a backup if you want to restore them later.</p></div><button class="secondary danger" data-clear>Clear all</button></div></div><div class="panel" style="margin-top:18px"><h2>Safari & iPhone tips</h2><p class="hint" style="font-size:15px">1. <strong>Prevent Safari clearing data:</strong> Open Safari, tap Share (box with arrow) → <strong>Add to Home Screen</strong>. Installed Home Screen web apps have dedicated permanent storage that Safari never purges.<br><br>2. <strong>Periodic backup:</strong> Use 'Export complete backup' above to save a file to Apple Files or iCloud Drive periodically.</p></div>`;
}
function render() {
  let titles = { overview: 'Your time, at a glance', events: 'All your counters', timeline: 'Your timeline', calculator: 'Date calculators', settings: 'Your data & settings' };
  $('#pageTitle').innerHTML = safe(titles[prefs.view] || titles.overview) + '<span class="accent">.</span>';
  $('#todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  $('#content').innerHTML = ({ overview, events: allEvents, timeline, calculator, settings })[prefs.view]?.() || overview();
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === prefs.view));
  
  // Update sidebar and mobile badge counts
  const badge = $('#eventBadge');
  if (badge) badge.textContent = events.length;
  const mobBadge = $('#mobileEventLabel');
  if (mobBadge) mobBadge.textContent = `Events (${events.length})`;

  if (prefs.view === 'calculator') updateCalculators();
  save();
}
function openEditor(type = 'event', id) {
  let e = events.find(v => v.id === id), f = $('#eventForm');
  f.reset();
  f.elements.id.value = e?.id || '';
  f.elements.title.value = e?.title || '';
  f.elements.type.value = e?.type || type;
  f.elements.color.value = e?.color || 'blue';
  f.elements.start.value = e?.start || stamp(new Date());
  f.elements.end.value = e?.end || '';
  f.elements.repeat.value = e?.repeat || (['birthday', 'anniversary'].includes(type) ? 'yearly' : 'none');
  f.elements.unit.value = e?.unit || 'auto';
  f.elements.notes.value = e?.notes || '';
  $('#editorTitle').textContent = e ? 'Edit counter' : 'New counter';
  $('#deleteEvent').hidden = !e;
  $('#editor').showModal();
  setTimeout(() => f.elements.title.focus(), 40);
}
function download(data, name) {
  let a = document.createElement('a'), u = URL.createObjectURL(new Blob([JSON.stringify({ format: 'daymark', version: 1, exportedAt: new Date().toISOString(), events: data }, null, 2)], { type: 'application/json' }));
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
}
function validate(v) {
  if (!v || typeof v !== 'object' || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 90 || typeof v.start !== 'string' || !parse(v.start)) return null;
  let type = ['event', 'birthday', 'job', 'goal', 'anniversary', 'todo'].includes(v.type) ? v.type : 'event';
  return {
    id: typeof v.id === 'string' && v.id.length < 100 ? v.id : crypto.randomUUID(),
    title: v.title.trim(),
    type,
    start: v.start,
    end: parse(v.end) ? v.end : '',
    color: ['blue', 'purple', 'orange', 'green', 'pink'].includes(v.color) ? v.color : 'blue',
    repeat: ['none', 'yearly', 'monthly', 'weekly'].includes(v.repeat) ? v.repeat : 'none',
    unit: ['auto', 'days', 'hours', 'minutes'].includes(v.unit) ? v.unit : 'auto',
    notes: typeof v.notes === 'string' ? v.notes.slice(0, 500) : ''
  };
}
document.addEventListener('click', e => {
  let b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) {
    prefs.view = b.dataset.view;
    render();
    scrollTo(0, 0);
  } else if ('toggleOverview' in b.dataset) {
    prefs.showAllOverview = !prefs.showAllOverview;
    render();
  } else if ('add' in b.dataset) {
    openEditor(b.dataset.add || 'event');
  } else if (b.dataset.edit) {
    openEditor('event', b.dataset.edit);
  } else if (b.dataset.filter) {
    prefs.filter = b.dataset.filter;
    render();
  } else if ('exportAll' in b.dataset) {
    download(events, 'daymark-all-counters.json');
  } else if (b.dataset.export) {
    let v = events.find(x => x.id === b.dataset.export);
    if (v) download([v], `daymark-${v.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'counter'}.json`);
  } else if ('import' in b.dataset) {
    $('#importFile').click();
  } else if ('resetStarter' in b.dataset) {
    events = JSON.parse(JSON.stringify(STARTER_EVENTS));
    save();
    render();
    toast('Loaded sample counters');
  } else if ('clear' in b.dataset && events.length && confirm(`Delete all ${events.length} counters from this device? This cannot be undone without an exported backup.`)) {
    events = [];
    save();
    render();
    toast('All counters cleared');
  }
});
$('#addTop').onclick = () => openEditor();
$('#closeEditor').onclick = $('#cancelEditor').onclick = () => $('#editor').close();
$('#editor').addEventListener('click', e => { if (e.target === $('#editor')) $('#editor').close(); });
$('#eventForm').onsubmit = e => {
  e.preventDefault();
  let f = e.currentTarget, v = validate(Object.fromEntries(new FormData(f)));
  if (!v) return toast('Please enter a name and valid start date.');
  if (v.end && v.type === 'goal' && parse(v.end) <= parse(v.start)) return toast('Goal end must be after its start.');
  if (v.type === 'birthday' || v.type === 'anniversary') v.repeat = 'yearly';
  let i = events.findIndex(x => x.id === v.id);
  if (i < 0) events.push(v);
  else events[i] = v;
  save();
  $('#editor').close();
  render();
  toast(i < 0 ? 'Counter added' : 'Counter updated');
};
$('#deleteEvent').onclick = () => {
  let id = $('#eventForm').elements.id.value;
  if (confirm('Delete this counter?')) {
    events = events.filter(x => x.id !== id);
    save();
    $('#editor').close();
    render();
    toast('Counter deleted');
  }
};
$('#importFile').onchange = async e => {
  let file = e.target.files[0];
  if (!file) return;
  try {
    let obj = JSON.parse(await file.text()), arr = Array.isArray(obj) ? obj : obj.events;
    if (!Array.isArray(arr) || arr.length > 10000) throw Error('Invalid backup');
    let valid = arr.map(validate);
    if (valid.some(x => !x)) throw Error('Invalid counter data');
    let existing = new Map(events.map(x => [x.id, x]));
    valid.forEach(v => existing.set(v.id, v));
    events = [...existing.values()];
    save();
    render();
    toast(`Imported ${valid.length} counter${valid.length === 1 ? '' : 's'}`);
  } catch {
    toast('Could not read this Daymark backup.');
  }
  e.target.value = '';
};
document.addEventListener('input', e => {
  if (e.target.id === 'search') {
    query = e.target.value;
    let pos = e.target.selectionStart;
    let grid = $('#content .cards');
    let filtered = events.filter(v => (prefs.filter === 'all' || v.type === prefs.filter) && v.title.toLowerCase().includes(query.toLowerCase()));
    let old = grid || $('#content .empty');
    if (old) old.outerHTML = filtered.length ? `<div class="cards">${filtered.map(card).join('')}</div>` : empty();
    e.target.setSelectionRange(pos, pos);
  } else if (e.target.closest('#content') && (e.target.id.startsWith('calc') || e.target.id.startsWith('duration'))) {
    updateCalculators();
  }
});
document.addEventListener('change', e => {
  if (e.target.id.startsWith('calc') || e.target.id.startsWith('duration')) updateCalculators();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
setInterval(() => {
  if (document.visibilityState === 'visible' && prefs.view !== 'calculator' && document.activeElement?.id !== 'search' && !$('#editor').open) {
    render();
  }
}, 1000);
