const KEY = 'egg-ledger-records-v1';
const nativeStore = window.EggLedgerNative;
const browserRecords = JSON.parse(localStorage.getItem(KEY) || '[]');
const storedNativeRecords = nativeStore ? JSON.parse(nativeStore.loadRecords() || '[]') : [];
let records = storedNativeRecords.length ? storedNativeRecords : browserRecords;
if (nativeStore && !storedNativeRecords.length && browserRecords.length) nativeStore.saveRecords(JSON.stringify(records));
const timezone = 'Asia/Shanghai';
let editingId = null;
let historyView = 'list';

const $ = (id) => document.getElementById(id);
const dayFormatter = () => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit' });
const displayFormatter = () => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
const fullFormatter = () => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const timeFormatter = () => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour:'2-digit', minute:'2-digit', hour12:false });
const dateKey = (time) => dayFormatter().format(new Date(time)).replaceAll('/','-');
const isSuccess = (r) => r.eggs > 0;
const failureLabel = (r) => r.eggs === -1 ? '消费 1 个鸡蛋' : '攒攒手气';
const sumEggs = (rs) => rs.filter(isSuccess).reduce((n,r) => n + r.eggs, 0);
const formatEggs = (value) => String(Number(Number(value).toFixed(6)));
const formatAverage = (value) => Number(value).toFixed(2);
const sanitizeEggInput = (value) => {
  const cleaned=value.replace(/[^0-9.-]/g,''); const negative=cleaned.startsWith('-') ? '-' : '';
  const unsigned=cleaned.replaceAll('-',''); const [whole='', ...fractions]=unsigned.split('.');
  return negative + whole + (fractions.length ? `.${fractions.join('')}` : '');
};
function localDateTimeValue(time) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(new Date(time));
  const pick = (type) => parts.find(p => p.type === type).value;
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}`;
}
function zonedDateTimeToTimestamp(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/); if (!match) return NaN;
  const [, year, month, day, hour, minute, second='00'] = match;
  const wanted = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  let guess = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  for (let i=0; i<3; i++) {
    const actual = new Intl.DateTimeFormat('en-CA', { timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(new Date(guess));
    const pick = (type) => actual.find(p => p.type === type).value;
    const shown = `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
    const shift = Date.parse(`${wanted}Z`) - Date.parse(`${shown}Z`); if (!shift) break; guess += shift;
  }
  return guess;
}

function timezoneName() { return '北京时间（UTC+8）'; }
function save() { const data=JSON.stringify(records); localStorage.setItem(KEY, data); nativeStore?.saveRecords(data); }
function refreshData() {
  try {
    const raw = nativeStore ? nativeStore.loadRecords() : localStorage.getItem(KEY);
    const refreshed = JSON.parse(raw || '[]');
    if (!Array.isArray(refreshed)) throw new Error('invalid records');
    records = refreshed;
    render();
    flash('数据已刷新');
  } catch { flash('刷新失败，请稍后重试'); }
}
function flash(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2300); }
function updateClock() { $('liveTimestamp').textContent = fullFormatter().format(new Date()); }
function elapsedText(time) {
  const difference = Math.floor((Date.now() - time) / 1000);
  if (difference < -60) return `${Math.ceil(-difference / 60)} 分钟后`;
  const seconds = Math.max(0, difference);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24); return `${days} 天前`;
}
function renderLastRecord() {
  const last = records.filter(isSuccess).sort((a,b) => b.createdAt - a.createdAt)[0];
  if (!last) { $('lastRecordTitle').textContent='还没有成功领取记录'; $('lastRecordTime').textContent='提交成功记录后会显示在这里'; $('lastRecordAge').textContent='—'; return; }
  $('lastRecordTitle').textContent=`上次领取 ${formatEggs(last.eggs)} 个鸡蛋`; $('lastRecordTime').textContent=fullFormatter().format(new Date(last.createdAt)); $('lastRecordAge').textContent=elapsedText(last.createdAt);
}
function renderMonthAndChart(now) {
  const currentMonth = dateKey(now).slice(0,7);
  const monthly = records.filter(r => dateKey(r.createdAt).slice(0,7) === currentMonth);
  const successes = monthly.filter(isSuccess); const eggs = sumEggs(monthly);
  $('monthLabel').textContent = currentMonth.replace('-', ' 年 ') + ' 月';
  $('monthEggs').textContent=formatEggs(eggs); $('monthCounts').textContent=`${successes.length} / ${monthly.length}`;
  $('monthRate').textContent=monthly.length ? `${Math.round(successes.length/monthly.length*100)}%` : '—';
  $('monthAverage').textContent=successes.length ? formatAverage(eggs/successes.length) : '—';
  const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number);
  const months = Array.from({length:6}, (_, index) => {
    const monthDate = new Date(Date.UTC(currentYear, currentMonthNumber - 1 - index, 1));
    const key = monthDate.toISOString().slice(0,7);
    const monthRecords = records.filter(r => dateKey(r.createdAt).slice(0,7) === key);
    const monthSuccesses = monthRecords.filter(isSuccess);
    return { key, eggs:sumEggs(monthRecords), success:monthSuccesses.length, attempts:monthRecords.length };
  });
  $('monthlyStats').innerHTML = months.map(month => `<div class="monthly-stat"><strong>${month.key.replace('-', ' 年 ')} 月</strong><span>🥚 ${formatEggs(month.eggs)} 个</span><small>成功 / 尝试 ${month.success} / ${month.attempts}</small></div>`).join('');
  const days = Array.from({length:7}, (_, index) => {
    const date = new Date(now - (6-index)*86400000); return { key:dateKey(date), label:dateKey(date).slice(5), eggs:0 };
  });
  days.forEach(day => { day.eggs = sumEggs(records.filter(r => dateKey(r.createdAt) === day.key)); });
  const width=700, left=42, right=678, top=22, bottom=160, max=Math.max(1,...days.map(d=>d.eggs));
  const x=(i)=>left+(right-left)*i/(days.length-1); const y=(value)=>bottom-(bottom-top)*value/max;
  const pointString=days.map((day,i)=>`${x(i).toFixed(1)},${y(day.eggs).toFixed(1)}`).join(' ');
  const area=`${left},${bottom} ${pointString} ${right},${bottom}`;
  const grids=[0,.5,1].map(r=>{ const yy=bottom-(bottom-top)*r; const value=Math.round(max*r); return `<line class="chart-grid" x1="${left}" x2="${right}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="4" y="${yy+4}">${value}</text>`; }).join('');
  const labels=days.map((day,i)=>`<text class="chart-label" text-anchor="middle" x="${x(i)}" y="188">${day.label}</text>`).join('');
  const points=days.map((day,i)=>`<circle class="chart-point" cx="${x(i)}" cy="${y(day.eggs)}" r="4"><title>${day.label}：${formatEggs(day.eggs)} 个鸡蛋</title></circle>${day.eggs ? `<text class="chart-value" text-anchor="middle" x="${x(i)}" y="${y(day.eggs)-10}">${formatEggs(day.eggs)}</text>` : ''}`).join('');
  $('weekChart').innerHTML=`<svg viewBox="0 0 ${width} 205" aria-labelledby="weekChartSvgTitle weekChartSvgDesc"><title id="weekChartSvgTitle">最近七天领取鸡蛋数量</title><desc id="weekChartSvgDesc">${days.map(d=>`${d.label} ${d.eggs} 个`).join('，')}</desc>${grids}<polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${pointString}"/>${points}${labels}</svg>`;
}

function render() {
  const now = Date.now(); const today = dateKey(now); const daily = records.filter(r => dateKey(r.createdAt) === today);
  const recent = records.filter(r => r.createdAt >= now - 24*60*60*1000 && r.createdAt <= now);
  const count = (rs) => rs.filter(isSuccess).length;
  $('todayLabel').textContent = `${dayFormatter().format(new Date())} · 今天`;
  $('timezoneLabel').textContent = timezoneName();
  $('todayCounts').textContent=`${count(daily)} / ${daily.length}`;
  $('hoursCounts').textContent=`${count(recent)} / ${recent.length}`;
  const best = [...records].filter(isSuccess).sort((a,b) => b.eggs-a.eggs || b.createdAt-a.createdAt)[0];
  $('singleBest').textContent=best ? formatEggs(best.eggs) : 0; $('singleBestTime').textContent=best ? fullFormatter().format(new Date(best.createdAt)) : '暂无成功记录';
  $('todayEggs').textContent=formatEggs(sumEggs(daily)); $('todayAverage').textContent=count(daily) ? formatAverage(sumEggs(daily)/count(daily)) : '—';
  $('totalEggs').textContent=formatEggs(sumEggs(records)); $('totalCounts').textContent=`${count(records)} / ${records.length}`;
  renderHistory(); renderLastRecord(); renderMonthAndChart(now); updateClock();
}

function renderHistory() {
  const date = $('dateFilter').value; const status = $('statusFilter').value;
  document.querySelector('[data-history-view="list"]').textContent = date ? '该日记录' : '最近 24 小时';
  const now = Date.now(); const minimumTime = now - 24 * 60 * 60 * 1000;
  const filtered = [...records].sort((a,b)=>b.createdAt-a.createdAt).filter(r => (date ? dateKey(r.createdAt)===date : r.createdAt >= minimumTime && r.createdAt <= now) && (status==='all'||(status==='success')===isSuccess(r)) && (historyView !== 'success' || isSuccess(r)));
  const list = $('historyList');
  list.classList.toggle('success-grid', historyView === 'success' && filtered.length > 0);
  if (!filtered.length) { list.innerHTML='<div class="empty">还没有符合条件的记录</div>'; return; }
  if (historyView === 'success') {
    list.innerHTML = filtered.map(r => `<article class="reward-history-entry" aria-label="领取 ${formatEggs(r.eggs)} 个鸡蛋，${fullFormatter().format(new Date(r.createdAt))}"><strong class="reward-count">🥚 ${formatEggs(r.eggs)}</strong><p class="reward-date">${timeFormatter().format(new Date(r.createdAt))}</p></article>`).join('');
    return;
  }
  list.innerHTML = filtered.map(r => { const title=isSuccess(r) ? `✅ 领取 ${formatEggs(r.eggs)} 个 🍳` : r.eggs === -1 ? '❌ 消费 1 个 🍳' : '❌ 攒攒手气'; return `<article class="entry"><div><p class="entry-title">${title}</p><p class="entry-time">${fullFormatter().format(new Date(r.createdAt))} · 时间戳 ${r.createdAt}</p></div><div class="entry-actions"><button class="edit-button" type="button" data-edit-id="${r.id}">修改</button></div></article>`; }).join('');
}

$('recordForm').addEventListener('submit', (event) => {
  event.preventDefault(); const raw=$('eggInput').value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return flash('请输入数字，例如 1.3 或 -1');
  const eggs=Number(raw); if (!Number.isFinite(eggs) || (eggs < 0 && eggs !== -1)) return flash('数量只能是 -1 或非负数');
  records.push({ id: crypto.randomUUID?.() || String(Date.now()), eggs, createdAt:Date.now() }); save(); $('eggInput').value=''; render(); flash(eggs === -1 ? '已记录消费 1 个鸡蛋' : eggs === 0 ? '已记录攒攒手气' : '领取已记录');
});
$('eggInput').addEventListener('input', e => { e.target.value=sanitizeEggInput(e.target.value); });
$('dateFilter').addEventListener('change',renderHistory); $('statusFilter').addEventListener('change',renderHistory);
$('clearFilterButton').addEventListener('click',()=>{ $('dateFilter').value=''; $('statusFilter').value='all'; renderHistory(); });
document.querySelectorAll('[data-history-view]').forEach(button => button.addEventListener('click', () => {
  historyView=button.dataset.historyView; document.querySelectorAll('[data-history-view]').forEach(item=>item.classList.toggle('active', item===button));
  if (historyView==='success' && !$('dateFilter').value) $('dateFilter').value=dateKey(Date.now());
  $('statusFilter').value=historyView==='success' ? 'success' : 'all'; $('statusFilter').disabled=historyView==='success'; renderHistory();
}));
$('moreStatsButton').addEventListener('click',()=>{ renderMonthAndChart(Date.now()); $('statsDialog').showModal(); });
$('closeStatsButton').addEventListener('click',()=> $('statsDialog').close());
$('historyList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-id]'); if (!button) return;
  const record = records.find(r => r.id === button.dataset.editId); if (!record) return;
  editingId = record.id; $('editEggInput').value = record.eggs; $('editTimeInput').value = localDateTimeValue(record.createdAt); $('editDialog').showModal(); $('editEggInput').focus();
});
$('closeEditButton').addEventListener('click',()=>{ editingId=null; $('editDialog').close(); });
$('editEggInput').addEventListener('input', e => { e.target.value=sanitizeEggInput(e.target.value); });
$('editForm').addEventListener('submit', (event) => {
  event.preventDefault(); const raw = $('editEggInput').value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return flash('请输入数字，例如 1.3 或 -1');
  const eggs = Number(raw); if (!Number.isFinite(eggs) || (eggs < 0 && eggs !== -1)) return flash('数量只能是 -1 或非负数');
  const createdAt = zonedDateTimeToTimestamp($('editTimeInput').value); if (!Number.isFinite(createdAt)) return flash('请选择有效的领取时间');
  const record = records.find(r => r.id === editingId); if (!record) return flash('未找到这条记录');
  record.eggs = eggs; record.createdAt = createdAt; save(); $('editDialog').close(); editingId=null; render(); flash('记录已修改');
});
$('exportButton').addEventListener('click',()=>{
  const rows=[['record_time','unix_timestamp_ms','timezone','egg_count','status'],...records.sort((a,b)=>a.createdAt-b.createdAt).map(r=>[fullFormatter().format(new Date(r.createdAt)),r.createdAt,timezone,r.eggs,isSuccess(r)?'success':r.eggs === -1 ? 'spend_1_egg' : 'try_luck'])];
  const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
  if (nativeStore) { nativeStore.exportCsv(csv); flash('请选择保存 CSV 的位置'); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=`egg-ledger_${dateKey(Date.now())}.csv`; a.click(); URL.revokeObjectURL(a.href); flash('CSV 已导出');
});
function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0; i<text.length; i++) {
    const char=text[i];
    if (quoted) { if (char==='"' && text[i+1]==='"') { cell+='"'; i++; } else if (char==='"') quoted=false; else cell+=char; continue; }
    if (char==='"') quoted=true;
    else if (char===',') { row.push(cell); cell=''; }
    else if (char==='\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
    else if (char!=='\r') cell+=char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function importCsv(text) {
  const rows=parseCsv(String(text).replace(/^\uFEFF/,'')); const header=rows.shift() || [];
  const timestampColumn=header.indexOf('unix_timestamp_ms') >= 0 ? header.indexOf('unix_timestamp_ms') : header.indexOf('Unix 时间戳（毫秒）');
  const eggsColumn=header.indexOf('egg_count') >= 0 ? header.indexOf('egg_count') : header.indexOf('鸡蛋数量');
  if (timestampColumn < 0 || eggsColumn < 0) return flash('CSV 格式不正确，无法导入');
  const known=new Set(records.map(r=>`${r.createdAt}|${r.eggs}`)); let imported=0;
  rows.forEach(row => {
    const createdAt=Number(row[timestampColumn]); const eggs=Number(row[eggsColumn]); const key=`${createdAt}|${eggs}`;
    if (!Number.isFinite(createdAt) || !Number.isFinite(eggs) || (eggs < 0 && eggs !== -1) || known.has(key)) return;
    records.push({ id:crypto.randomUUID?.() || `${createdAt}-${eggs}`, eggs, createdAt }); known.add(key); imported++;
  });
  if (!imported) return flash('没有可导入的新记录'); save(); render(); flash(`已导入 ${imported} 条记录`);
}
window.receiveNativeCsv = importCsv;
$('importButton').addEventListener('click',()=>{ if (nativeStore) { nativeStore.importCsv(); return; } $('importFileInput').click(); });
$('importFileInput').addEventListener('change',(event)=>{ const file=event.target.files[0]; if (!file) return; const reader=new FileReader(); reader.onload=()=>importCsv(reader.result); reader.readAsText(file); event.target.value=''; });
let pullStartY = 0; let pullDistance = 0; let pulling = false; let pullRefreshTimer;
const pullRefresh = $('pullRefresh'); const pullRefreshText = $('pullRefreshText');
function resetPullRefresh() {
  clearTimeout(pullRefreshTimer);
  pullRefresh.classList.remove('visible','ready','loading');
  pullRefreshText.textContent = '下拉刷新数据';
}
function updatePullRefresh() {
  const ready = pullDistance >= 76;
  pullRefresh.classList.toggle('visible', pulling && pullDistance > 8);
  pullRefresh.classList.toggle('ready', ready);
  pullRefreshText.textContent = ready ? '松开刷新数据' : '下拉刷新数据';
}
document.addEventListener('touchstart', event => {
  if (window.scrollY > 0 || event.touches.length !== 1 || document.querySelector('dialog[open]')) return;
  pullStartY = event.touches[0].clientY; pullDistance = 0; pulling = true;
}, { passive:true });
document.addEventListener('touchmove', event => {
  if (!pulling) return;
  pullDistance = Math.max(0, event.touches[0].clientY - pullStartY);
  if (pullDistance > 0) updatePullRefresh();
}, { passive:true });
document.addEventListener('touchend', () => {
  if (!pulling) return;
  const shouldRefresh = pullDistance >= 76;
  pulling = false; pullRefresh.classList.remove('ready');
  if (!shouldRefresh) { resetPullRefresh(); return; }
  pullRefresh.classList.add('visible','loading'); pullRefreshText.textContent='正在刷新…';
  refreshData();
  pullRefreshTimer = setTimeout(resetPullRefresh, 650);
}, { passive:true });
document.addEventListener('touchcancel', resetPullRefresh, { passive:true });
render(); setInterval(render,60000);
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js'));
