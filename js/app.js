// =========================================================================
// 5. INPUT DOĞRULAMA (VALIDASYON) VE XSS KORUMA FONKSİYONLARI
// =========================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeTurkishLetters(inputEl) {
  inputEl.value = inputEl.value.replace(/[^a-zA-ZçÇğĞıİöÖşŞüÜ\s]/g, '');
}

function sanitizeTwoDigitNumber(inputEl) {
  let digits = inputEl.value.replace(/\D/g, '');
  if (digits.length > 2) digits = digits.slice(0, 2);
  inputEl.value = digits;
}

function formatPhoneDigits(digits) {
  if (!digits) return '';
  let p = digits.slice(0, 11);
  if (p.length <= 4) return p;
  if (p.length <= 7) return `${p.slice(0, 4)} ${p.slice(4)}`;
  if (p.length <= 9) return `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;
  return `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7, 9)} ${p.slice(9, 11)}`;
}

function handlePhoneInput(inputEl) {
  let digits = inputEl.value.replace(/\D/g, '');
  const maxLen = digits.startsWith('5') ? 10 : 11;
  digits = digits.slice(0, maxLen);
  inputEl.value = formatPhoneDigits(digits);
  const errEl = document.getElementById('nm-phone-error');
  if (errEl) errEl.classList.add('hidden');
}

function handlePhoneBlur(inputEl) {
  let digits = inputEl.value.replace(/\D/g, '');
  if (!digits) return;
  if (digits.startsWith('5')) digits = '0' + digits;
  digits = digits.slice(0, 11);
  inputEl.value = formatPhoneDigits(digits);
}

function isValidTurkishMobile(phoneStr) {
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 0) return true;
  return /^05\d{9}$/.test(digits);
}

function createRandom8CharPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// =========================================================================
// 7. EKRAN GEÇİŞ YÖNETİMİ
// =========================================================================
function switchScreen(screenName) {
  const screens = ['login', 'slots', 'schedule', 'members', 'new-member', 'member-detail', 'member-booking'];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.add('hidden');
  });

  const adminHeader = document.getElementById('admin-header');
  const memberHeader = document.getElementById('member-header');

  if (screenName === 'login') {
    adminHeader.classList.add('hidden');
    memberHeader.classList.add('hidden');
  } else if (currentRole === 'admin') {
    adminHeader.classList.remove('hidden');
    memberHeader.classList.add('hidden');
    updateAdminHeaderInfo();
  } else {
    adminHeader.classList.add('hidden');
    memberHeader.classList.remove('hidden');
    updateMemberHeaderInfo();
  }

  const adminNavs = {
    slots: document.getElementById('nav-slots'),
    schedule: document.getElementById('nav-schedule'),
    members: document.getElementById('nav-members')
  };
  Object.values(adminNavs).forEach(btn => {
    if (btn) btn.className = 'bg-input text-zinc-300 hover:border-white font-bold text-xs uppercase px-3 py-2 border border-zinc-700 cursor-pointer';
  });

  if (screenName === 'slots') {
    adminNavs.slots.className = 'bg-white text-black font-bold text-xs uppercase px-3 py-2 border border-white cursor-pointer';
    renderGrid();
  }
  if (screenName === 'schedule') {
    adminNavs.schedule.className = 'bg-white text-black font-bold text-xs uppercase px-3 py-2 border border-white cursor-pointer';
    renderSchedule();
  }
  if (['members', 'new-member'].includes(screenName) || (screenName === 'member-detail' && currentRole === 'admin')) {
    adminNavs.members.className = 'bg-white text-black font-bold text-xs uppercase px-3 py-2 border border-white cursor-pointer';
    if (screenName === 'members') renderMembersList();
  }

  const memberNavBooking = document.getElementById('nav-member-booking');
  const memberNavProfile = document.getElementById('nav-member-profile');
  if (memberNavBooking) memberNavBooking.className = 'bg-input text-zinc-300 hover:border-white font-bold text-xs uppercase px-3 py-2 border border-zinc-700 cursor-pointer';
  if (memberNavProfile) memberNavProfile.className = 'bg-input text-zinc-300 hover:border-white font-bold text-xs uppercase px-3 py-2 border border-zinc-700 cursor-pointer';

  if (screenName === 'member-booking') {
    if (memberNavBooking) memberNavBooking.className = 'bg-white text-black font-bold text-xs uppercase px-3 py-2 border border-white cursor-pointer';
    renderMemberBookingScreen();
  }
  if (screenName === 'member-detail' && currentRole === 'member') {
    if (memberNavProfile) memberNavProfile.className = 'bg-white text-black font-bold text-xs uppercase px-3 py-2 border border-white cursor-pointer';
  }

  document.getElementById(`screen-${screenName}`).classList.remove('hidden');
  window.scrollTo(0, 0);
}

