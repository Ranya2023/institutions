// ============================================================
// Shared UI helpers — modal, toast, code generation, small utils
// ============================================================

function ensureModalShell() {
  if (document.getElementById('modalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'modalOverlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="modal-panel">
      <button class="modal-close" onclick="closeModal()">×</button>
      <div id="modalBody"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

function openModal(html) {
  ensureModalShell();
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
  if (typeof applyI18n === 'function') applyI18n();
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function ensureToastShell() {
  if (document.getElementById('toastEl')) return;
  const el = document.createElement('div');
  el.id = 'toastEl';
  el.className = 'toast';
  document.body.appendChild(el);
}

function toast(message, type) {
  ensureToastShell();
  const el = document.getElementById('toastEl');
  el.textContent = message;
  el.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}

// XXXX-XXXX code, avoids ambiguous characters (0/O, 1/I/L)
function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part()}-${part()}`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// Single-glyph compact indicator for assessment levels — used in small
// circle badges where a full translated word wouldn't fit.
const LEVEL_ICONS = { excellent: '★', good: '★', fine: '★', bad: '★', very_bad: '★' };
function levelIcon(level) {
  return LEVEL_ICONS[level] || '★';
}
// Matches the --lvl-color values in css/theme.css. Kept as real hex here
// (rather than the CSS custom property) since these get used inline on
// elements outside the .level-btn scope where that variable isn't defined.
const LEVEL_COLORS = {
  excellent: '#3F7D5C',
  good: '#6FA37E',
  fine: '#B08D3E',
  bad: '#C17A4A',
  very_bad: '#A6473A',
};
function levelColor(level) {
  return LEVEL_COLORS[level] || 'var(--muted)';
}

// Applies an institution's brand colors to the shared design tokens
function applyInstitutionBranding(inst) {
  if (!inst) return;
  const root = document.documentElement;
  if (inst.primary_color) root.style.setProperty('--teal', inst.primary_color);
  if (inst.secondary_color) root.style.setProperty('--gold', inst.secondary_color);
}

// Kurdish (Sorani) / Arabic weekday names + a simple DD/MM/YYYY formatter,
// since Intl locale support for 'ckb' is inconsistent across browsers.
const WEEKDAYS = {
  ckb: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'ھەینی', 'شەممە'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};
function formatDateLabel(date) {
  date = date || new Date();
  const lang = getLang() === 'ar' ? 'ar' : 'ckb';
  const day = WEEKDAYS[lang][date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${day} — ${dd}/${mm}/${yyyy}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Formats a timestamp as a short "N minutes/seconds ago" label in the
// current UI language — used to show a teacher how recently a student
// last updated something (e.g. an Azkar duty item), not how long they
// spent on it (progress rows only carry a last-updated timestamp).
const AGO_LABELS = {
  ckb: { sec: (n) => `${n} چرکە لەمەوبەر`, min: (n) => `${n} خولەک لەمەوبەر`, hr: (n) => `${n} کاتژمێر لەمەوبەر` },
  ar: { sec: (n) => `منذ ${n} ثانية`, min: (n) => `منذ ${n} دقيقة`, hr: (n) => `منذ ${n} ساعة` },
};
function formatElapsed(isoTimestamp) {
  if (!isoTimestamp) return '';
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return '';
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const lang = getLang() === 'ar' ? 'ar' : 'ckb';
  if (hr >= 1) return AGO_LABELS[lang].hr(hr);
  if (min >= 1) return AGO_LABELS[lang].min(min);
  return AGO_LABELS[lang].sec(sec);
}

// ---------- Unread badges ----------
// Sets/clears a small red count badge on a tab button.
function setTabBadge(tabSelector, count) {
  const tab = document.querySelector(tabSelector);
  if (!tab) return;
  let badge = tab.querySelector('.tab-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      tab.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (badge) {
    badge.remove();
  }
}

// Shows a one-line "you have N unread" toast, meant to run once per
// app open after the unread counts are known.
function announceUnread(count) {
  if (count > 0) toast(`${t('you_have_unread')} ${count}`);
}

// ---------- Quran "continue reading" card ----------
// Reads the last reading position quran.html saves to localStorage
// (same-origin, so it's readable from the student/teacher/parent
// dashboards too) and renders a small "you stopped at Surah X —
// continue reading" card into the given container. Renders nothing
// if the person hasn't opened the Quran reader yet.
function renderQuranContinueCard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem('quran_last_position') || 'null'); } catch (e) {}
  if (!pos || !pos.surah || !pos.surahName) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <a class="quran-continue-card" href="quran.html">
      <span class="icon">📖</span>
      <span class="text">
        <span class="label">${t('quran_continue_at')}</span>
        <span class="surah">${escapeHtml(pos.surahName)}</span>
      </span>
      <span class="cta">${t('quran_continue_reading')} ‹</span>
    </a>`;
}

// ---------- Word export ----------
// Produces a real, openable .doc file client-side — no server round
// trip, no extra library. Word opens HTML that declares the right
// namespaces; this is a long-standing, reliable technique for exactly
// this use case (not a hack specific to this app).
function downloadAsWord(filename, titleText, bodyHtml) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${titleText}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
  h1 { font-size: 20px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 6px 10px; font-size: 13px; text-align: right; }
  th { background: #1F4B43; color: #fff; }
  tr:nth-child(even) { background: #f6f1e4; }
</style></head>
<body dir="rtl">
  <h1>${titleText}</h1>
  ${bodyHtml}
</body></html>`;
  const blob = new Blob(['\ufeff', doc], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith('.doc') ? filename : filename + '.doc';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
