(() => {
  const ready = () => {
    const root = document.querySelector('#messages');
    if (!root || root.querySelector('[data-dm-create-panel]')) return;

    const list = root.querySelector('.list') || root;
    const panel = document.createElement('div');
    panel.setAttribute('data-dm-create-panel', '');
    panel.innerHTML = `
      <button type="button" data-dm-new class="dm-new-btn">+ Yeni konuşma</button>
      <div data-dm-create-form hidden class="dm-create-form">
        <input data-dm-participant-id type="text" inputmode="text" autocomplete="off" placeholder="Kullanıcı ID" maxlength="128">
        <input data-dm-participant-name type="text" autocomplete="off" placeholder="İsteğe bağlı isim" maxlength="80">
        <div class="dm-create-actions">
          <button type="button" data-dm-create-submit>Başlat</button>
          <button type="button" data-dm-create-cancel>İptal</button>
        </div>
        <div data-dm-create-status aria-live="polite"></div>
      </div>`;
    list.parentNode.insertBefore(panel, list);

    const form = panel.querySelector('[data-dm-create-form]');
    const idInput = panel.querySelector('[data-dm-participant-id]');
    const nameInput = panel.querySelector('[data-dm-participant-name]');
    const status = panel.querySelector('[data-dm-create-status]');

    panel.querySelector('[data-dm-new]').addEventListener('click', () => {
      form.hidden = false;
      status.textContent = '';
      idInput.focus();
    });
    panel.querySelector('[data-dm-create-cancel]').addEventListener('click', () => {
      form.hidden = true;
      idInput.value = '';
      nameInput.value = '';
      status.textContent = '';
    });
    panel.querySelector('[data-dm-create-submit]').addEventListener('click', async () => {
      const participantId = idInput.value.trim();
      if (!participantId) {
        status.textContent = 'Kullanıcı ID gerekli.';
        return;
      }
      const create = window.ErisChatDM && window.ErisChatDM.create;
      if (typeof create !== 'function') {
        status.textContent = 'DM sistemi henüz hazır değil.';
        return;
      }
      status.textContent = 'Konuşma oluşturuluyor...';
      try {
        await create(participantId, nameInput.value.trim() || 'Anonim kullanıcı');
        status.textContent = 'Konuşma hazır.';
        form.hidden = true;
        idInput.value = '';
        nameInput.value = '';
      } catch (error) {
        status.textContent = error && error.message ? error.message : 'Konuşma oluşturulamadı.';
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
