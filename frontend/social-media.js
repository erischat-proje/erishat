(() => {
  'use strict';
  function choose(input, camera, anchor) {
    input.value = '';
    if (!camera) {
      input.accept = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
      input.removeAttribute('capture'); input.click(); return;
    }
    const existing = anchor.parentElement.querySelector('[data-camera-options]');
    if (existing) { existing.remove(); return; }
    const options = document.createElement('div'); options.dataset.cameraOptions = '';
    options.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;width:100%;margin-top:8px';
    for (const [label, type] of [['Fotoğraf çek', 'image/*'], ['Sesli video çek · en fazla 30 sn', 'video/*']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.onclick = () => { input.accept = type; input.setAttribute('capture', 'environment'); options.remove(); input.click(); };
      options.append(button);
    }
    anchor.parentElement.append(options);
  }
  async function validate(file, videoMB) {
    if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm))$/.test(file.type)) throw new Error('JPG, PNG, WEBP, GIF, MP4 veya WEBM seç.');
    const video = file.type.startsWith('video/');
    if (file.size > (video ? videoMB : 10) * 1024 * 1024) throw new Error(video ? 'Video en fazla ' + videoMB + ' MB olabilir.' : 'Fotoğraf en fazla 10 MB olabilir.');
    if (!video) return;
    await new Promise((resolve, reject) => {
      const clip = document.createElement('video'), url = URL.createObjectURL(file); let done = false;
      const finish = error => { if(done)return;done=true;clearTimeout(timer);clip.onloadedmetadata=null;clip.onerror=null;clip.removeAttribute('src');clip.load();URL.revokeObjectURL(url);error ? reject(error) : resolve(); };
      const timer = setTimeout(() => finish(new Error('Video süresi okunamadı. Başka bir video seç.')), 15000);
      clip.preload = 'metadata';
      clip.onloadedmetadata = () => finish(!Number.isFinite(clip.duration) || clip.duration <= 0 ? new Error('Video süresi okunamadı.') : clip.duration > 30 ? new Error('Video en fazla 30 saniye olabilir.') : null);
      clip.onerror = () => finish(new Error('Video okunamadı.')); clip.src = url;
    });
  }
  window.ErisSocialMedia = { choose, validate };
})();
