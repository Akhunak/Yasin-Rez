// =========================================================================
// 1. SUPABASE BAĞLANTI AYARLARI
// =========================================================================
const SUPABASE_URL = 'https://hiarwdthivcmgabhhjjh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_a_eeLPiolEV3oLSiM4ylKw_2vtlmT7j';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================================
// 2. SUPABASE VERİ ÇEKME VE VERİTABANI İŞLEMLERİ (GÜVENLİ & KİŞİYE ÖZEL)
// =========================================================================
async function loadAllDataFromSupabase() {
  if (!currentRole) return; // Giriş yapılmadıysa veritabanına istek atma

  updateTopLiveClock();
  const badge = document.getElementById('db-status-badge');
  try {
    let query = supabaseClient
      .from('members')
      .select('id, first_name, last_name, phone, email, password, total_lessons, completed_lessons, remaining_lessons, role, status');

    // Giriş yapan kişi "üye" ise SADECE KENDİ ID'sine ait veriyi çek (diğer üyelerin bilgileri ve şifreleri gelmez)
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

async function authenticateUserFromDb(emailVal, passVal) {
  return await supabaseClient
    .from('members')
    .select('id, role, status, email')
    .ilike('email', emailVal)
    .eq('password', passVal)
    .maybeSingle();
}

async function fetchScheduleSlotsFromDb(targetDateISO) {
  return await supabaseClient
    .from('daily_slots')
    .select('*, bookings(*, members(first_name, last_name))')
    .eq('slot_date', targetDateISO)
    .order('hour_index', { ascending: true });
}

async function confirmSaveSlots() {
  const targetDateISO = selectedAdminSlotDateISO;
  const selectedSlots = adminTimeSlots.filter(s => s.selected);
  const unselectedHours = adminTimeSlots.filter(s => !s.selected).map(s => s.id);

  try {
    if (unselectedHours.length > 0) {
      await supabaseClient
        .from('daily_slots')
        .delete()
        .eq('slot_date', targetDateISO)
        .in('hour_index', unselectedHours);
    }

    if (selectedSlots.length > 0) {
      const upsertPayload = selectedSlots.map(s => ({
        slot_date: targetDateISO,
        hour_index: s.id,
        hour_label: s.label,
        is_shared: s.isShared,
        max_capacity: s.isShared ? 2 : 1
      }));

      const { error } = await supabaseClient
        .from('daily_slots')
        .upsert(upsertPayload, { onConflict: 'slot_date,hour_index' });

      if (error) throw error;
    }

    await loadAdminSlotsForDate(targetDateISO);
    await loadTomorrowSlotsFromSupabase();
    renderGrid();
    closeModal('slot-confirm-modal');
    showToast('SAATLER KAYDEDİLDİ', `${formatISOToTurkishLong(targetDateISO)} tarihine ait boş ders saatleri veritabanına başarıyla kaydedildi.`);
  } catch (err) {
    alert('Saatler kaydedilirken hata oluştu: ' + err.message);
  }
}

async function confirmCreateMember() {
  const firstName = document.getElementById('nm-firstname').value.trim();
  const lastName = document.getElementById('nm-lastname').value.trim();
  const phone = document.getElementById('nm-phone').value.trim();
  const email = document.getElementById('nm-email').value.trim().toLowerCase();
  const total = Math.min(99, Math.max(0, parseInt(document.getElementById('nm-total').value, 10) || 0));
  const completed = Math.min(99, Math.max(0, parseInt(document.getElementById('nm-completed').value, 10) || 0));
  const remaining = total - completed;
  const password = document.getElementById('nm-password').value;

  const { error } = await supabaseClient
    .from('members')
    .insert([{
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      password,
      total_lessons: total,
      completed_lessons: completed,
      remaining_lessons: remaining,
      role: 'Member',
      status: 'Active'
    }]);

  if (error) {
    alert('Üye kaydedilirken hata oluştu: ' + error.message);
    return;
  }

  closeModal('new-member-confirm-modal');
  await loadAllDataFromSupabase();
  switchScreen('members');
  showToast('ÜYE KAYDEDİLDİ', `${firstName} ${lastName} veritabanına "Aktif" statüyle eklendi (${completed}/${total}). Şifresi: ${password}`);
}

async function confirmRenewMemberPassword() {
  if (currentRole !== 'admin') return;
  const m = members.find(item => item.id === selectedMemberId);
  if (!m) return;

  const newPassword = createRandom8CharPassword();

  const { error } = await supabaseClient
    .from('members')
    .update({ password: newPassword })
    .eq('id', selectedMemberId);

  if (error) {
    alert('Şifre yenilenirken hata oluştu: ' + error.message);
    return;
  }

  m.password = newPassword;
  const passInput = document.getElementById('det-password');
  const toggleBtn = document.getElementById('det-btn-toggle-pass');
  passInput.value = newPassword;
  passInput.type = 'text';
  if (toggleBtn) toggleBtn.textContent = 'GİZLE';

  closeModal('renew-password-confirm-modal');
  showToast('ŞİFRE YENİLENDİ', `${m.firstName} ${m.lastName} için yeni şifre oluşturuldu ve kaydedildi: ${newPassword}`);
}

async function saveMemberChanges() {
  const m = members.find(item => item.id === selectedMemberId);
  if (!m) return;

  const phoneEl = document.getElementById('det-phone');
  handlePhoneBlur(phoneEl);
  if (!isValidTurkishMobile(phoneEl.value)) {
    alert('Telefon numarası 05 ile başlamalı ve 11 haneli olmalıdır.');
    phoneEl.focus();
    return;
  }

  const firstName = document.getElementById('det-firstname').value.trim();
  const lastName = document.getElementById('det-lastname').value.trim();
  const phone = phoneEl.value.trim();
  const email = document.getElementById('det-email').value.trim().toLowerCase();
  const total = Math.min(99, Math.max(0, parseInt(document.getElementById('det-total').value, 10) || 0));
  const completed = Math.min(99, Math.max(0, parseInt(document.getElementById('det-completed').value, 10) || 0));
  const remaining = total - completed;

  const { error } = await supabaseClient
    .from('members')
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      total_lessons: total,
      completed_lessons: completed,
      remaining_lessons: remaining
    })
    .eq('id', selectedMemberId);

  if (error) {
    alert('Güncelleme hatası: ' + error.message);
    return;
  }

  await loadAllDataFromSupabase();
  const updated = members.find(item => item.id === selectedMemberId);
  if (updated) populateMemberDetailFields(updated);
  setMemberDetailEditState(false);
  showToast('BİLGİLER GÜNCELLENDİ', `Üye bilgileri (${completed}/${total}) başarıyla güncellendi.`);
}

async function confirmDeleteMember() {
  const m = members.find(item => item.id === deleteTargetMemberId);
  if (!m) return;

  const { error } = await supabaseClient
    .from('members')
    .update({ status: 'Passive' })
    .eq('id', deleteTargetMemberId);

  if (error) {
    alert('Silme hatası: ' + error.message);
    return;
  }

  closeModal('delete-member-modal');
  await loadAllDataFromSupabase();
  switchScreen('members');
  showToast('ÜYE PASİFE ALINDI', `${m.firstName} ${m.lastName} adlı üyenin statüsü veritabanında "Passive" olarak güncellendi.`);
}

async function confirmRenewPackage() {
  const m = members.find(item => item.id === renewTargetMemberId);
  const rawVal = document.getElementById('renew-total-input').value;
  if (rawVal === '') {
    alert('Lütfen 0-99 arasında bir ders sayısı giriniz.');
    return;
  }
  const newTotal = Math.min(99, Math.max(0, parseInt(rawVal, 10)));

  const { error } = await supabaseClient
    .from('members')
    .update({
      total_lessons: newTotal,
      remaining_lessons: newTotal,
      completed_lessons: 0
    })
    .eq('id', renewTargetMemberId);

  if (error) {
    alert('Paket yenileme hatası: ' + error.message);
    return;
  }

  closeModal('renew-package-modal');
  await loadAllDataFromSupabase();
  renderMembersList();
  showToast('PAKET YENİLENDİ', `${m.firstName} ${m.lastName} için ders paketi 0/${newTotal} (Tamamlanan/Toplam) olarak yenilendi.`);
}

async function confirmMemberBooking() {
  const m = members.find(item => item.id === currentMemberId);
  const targetSlot = timeSlots.find(s => s.id === pendingBookingSlotId);
  const currentSlot = getMemberCurrentBookingSlot(currentMemberId);
  if (!m || !targetSlot || !targetSlot.dbSlotId) return;

  const tomorrowISO = getDateISO(1);

  try {
    if (currentSlot) {
      const existingBooking = currentSlot.bookings.find(b => b.memberId === currentMemberId && b.status === 'booked');
      const { error } = await supabaseClient
        .from('bookings')
        .update({ slot_id: targetSlot.dbSlotId })
        .eq('id', existingBooking.id);

      if (error) throw error;

      closeModal('member-book-confirm-modal');
      await loadAllDataFromSupabase();
      renderMemberBookingScreen();
      showToast('DERS SAATİ DEĞİŞTİRİLDİ', `Eski saatiniz (${currentSlot.label}) boşa çıkarıldı ve yeni ders saatiniz ${targetSlot.label} olarak güncellendi.`);
    } else {
      const newCompleted = m.completedLessons + 1;
      const newRemaining = m.remainingLessons - 1;
      const progressText = `${newCompleted}/${m.totalLessons}`;

      const { error: bookErr } = await supabaseClient
        .from('bookings')
        .insert([{
          slot_id: targetSlot.dbSlotId,
          slot_date: tomorrowISO,
          member_id: currentMemberId,
          status: 'booked',
          lesson_progress: progressText
        }]);

      if (bookErr) throw bookErr;

      const { error: memErr } = await supabaseClient
        .from('members')
        .update({
          completed_lessons: newCompleted,
          remaining_lessons: newRemaining
        })
        .eq('id', currentMemberId);

      if (memErr) throw memErr;

      closeModal('member-book-confirm-modal');
      await loadAllDataFromSupabase();
      renderMemberBookingScreen();
      showToast('DERS SAATİ ATANDI', `${targetSlot.label} ders saati adınıza kaydedildi. Güncel ders durumunuz (Tamamlanan/Toplam): ${newCompleted}/${m.totalLessons}`);
    }
  } catch (err) {
    alert('Rezervasyon işlemi sırasında hata: ' + err.message);
  }
}

async function confirmMemberCancelBooking() {
  const m = members.find(item => item.id === currentMemberId);
  const currentSlot = getMemberCurrentBookingSlot(currentMemberId);
  if (!m || !currentSlot) return;

  const bookingObj = currentSlot.bookings.find(b => b.memberId === currentMemberId && b.status === 'booked');
  if (!bookingObj) return;

  try {
    if (memberSimMode === 'AFTER_MIDNIGHT') {
      const { error } = await supabaseClient
        .from('bookings')
        .update({ status: 'late_cancelled' })
        .eq('id', bookingObj.id);

      if (error) throw error;

      closeModal('member-cancel-confirm-modal');
      await loadAllDataFromSupabase();
      renderMemberBookingScreen();
      showToast('DERS İPTAL EDİLDİ (23:59 SONRASI)', `Dersiniz iptal edildi. 23:59 sonrası olduğu için ders yapılmış sayıldı (${m.completedLessons}/${m.totalLessons}).`);
    } else {
      const { error: delErr } = await supabaseClient
        .from('bookings')
        .delete()
        .eq('id', bookingObj.id);

      if (delErr) throw delErr;

      const restoredRemaining = m.remainingLessons + 1;
      const restoredCompleted = Math.max(0, m.completedLessons - 1);

      const { error: memErr } = await supabaseClient
        .from('members')
        .update({
          remaining_lessons: restoredRemaining,
          completed_lessons: restoredCompleted
        })
        .eq('id', currentMemberId);

      if (memErr) throw memErr;

      closeModal('member-cancel-confirm-modal');
      await loadAllDataFromSupabase();
      renderMemberBookingScreen();
      showToast('DERS SEÇİMİNDEN VAZGEÇİLDİ', `${currentSlot.label} saati tekrar boşa çıkarıldı. Güncel ders durumunuz (Tamamlanan/Toplam): ${restoredCompleted}/${m.totalLessons}`);
    }
  } catch (err) {
    alert('İptal işlemi sırasında hata: ' + err.message);
  }
}

