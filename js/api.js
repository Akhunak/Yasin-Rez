// =========================================================================
// 1. SUPABASE BAĞLANTI AYARLARI
// =========================================================================
const SUPABASE_URL = 'https://hiarwdthivcmgabhhjjh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_a_eeLPiolEV3oLSiM4ylKw_2vtlmT7j';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================================
// 4. SUPABASE VERİ ÇEKME FONKSİYONLARI (GÜVENLİ & KİŞİYE ÖZEL)
// =========================================================================
async function loadAllDataFromSupabase() {
  if (!currentRole) return; // Giriş yapılmadıysa veritabanına istek atma

  updateTopLiveClock();
  const badge = document.getElementById('db-status-badge');
  try {
    let query = supabaseClient
      .from('members')
      .select('id, first_name, last_name, phone, email, password, total_lessons, completed_lessons, remaining_lessons, role, status');

    // Giriş yapan kişi "üye" ise SADECE KENDİ ID'sine ait veriyi çek (diğer üyelerin bilgileri gelmez)
    if (currentRole === 'member') {
      query = query.eq('id', currentMemberId);
    }

    const { data: membersData, error: memErr } = await query.order('id', { ascending: true });

    if (memErr) throw memErr;

    members = (membersData || []).map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone || '',
      email: row.email,
      password: row.password || '',
      totalLessons: row.total_lessons,
      completedLessons: row.completed_lessons,
      remainingLessons: row.remaining_lessons,
      role: row.role,
      status: row.status
    }));

    if (currentRole === 'admin') {
      await loadAdminSlotsForDate(selectedAdminSlotDateISO);
    }
    await loadTomorrowSlotsFromSupabase();

    if (badge) {
      badge.textContent = 'SUPABASE DB: BAĞLI';
      badge.className = 'bg-emerald-500 text-black font-extrabold px-2 py-0.5 uppercase';
    }

    if (currentRole === 'admin') {
      renderGrid();
      renderMembersList();
    }
  } catch (err) {
    console.error('Supabase bağlantı hatası:', err);
    if (badge) {
      badge.textContent = 'DB BAĞLANTI HATASI';
      badge.className = 'bg-red-600 text-white font-extrabold px-2 py-0.5 uppercase';
    }
  }
}

async function loadAdminSlotsForDate(targetDateISO) {
  const { data: slotRows, error: slotErr } = await supabaseClient
    .from('daily_slots')
    .select('*, bookings(*)')
    .eq('slot_date', targetDateISO);

  if (slotErr) throw slotErr;

  adminTimeSlots.forEach(s => {
    const found = (slotRows || []).find(r => r.hour_index === s.id);
    if (found) {
      s.dbSlotId = found.id;
      s.selected = true;
      s.isShared = found.is_shared;
      s.bookings = (found.bookings || []).map(b => ({
        id: b.id,
        memberId: b.member_id,
        status: b.status,
        lessonProgress: b.lesson_progress
      }));
    } else {
      s.dbSlotId = null;
      s.selected = false;
      s.isShared = false;
      s.bookings = [];
    }
  });
}

async function loadTomorrowSlotsFromSupabase() {
  const tomorrowISO = getDateISO(1);

  const { data: slotRows, error: slotErr } = await supabaseClient
    .from('daily_slots')
    .select('*, bookings(*)')
    .eq('slot_date', tomorrowISO);

  if (slotErr) throw slotErr;

  timeSlots.forEach(s => {
    const found = (slotRows || []).find(r => r.hour_index === s.id);
    if (found) {
      s.dbSlotId = found.id;
      s.selected = true;
      s.isShared = found.is_shared;
      s.bookings = (found.bookings || []).map(b => ({
        id: b.id,
        memberId: b.member_id,
        status: b.status,
        lessonProgress: b.lesson_progress
      }));
    } else {
      s.dbSlotId = null;
      s.selected = false;
      s.isShared = false;
      s.bookings = [];
    }
  });
}

