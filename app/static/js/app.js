const state = {
  project: null,
  mediaRecorder: null,
  recordingChunks: [],
  recordingIndex: null,
  recordingStartedAt: null,
  loadingStartedAt: null,
  loadingTimer: null,
  maxUploadMb: null,
  recommendedChunkMb: 64,
  maxChunkMb: 256,
  currentUploadId: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  healthStatus: $('healthStatus'),
  projectTitle: $('projectTitle'),
  videoFile: $('videoFile'),
  uploadBtn: $('uploadBtn'),
  projectList: $('projectList'),
  currentTitle: $('currentTitle'),
  currentMeta: $('currentMeta'),
  deleteProjectBtn: $('deleteProjectBtn'),
  videoPlayer: $('videoPlayer'),
  back2Btn: $('back2Btn'),
  playPauseBtn: $('playPauseBtn'),
  forward2Btn: $('forward2Btn'),
  noiseDb: $('noiseDb'),
  minSilence: $('minSilence'),
  minAdDuration: $('minAdDuration'),
  previewMargin: $('previewMargin'),
  paddingStart: $('paddingStart'),
  paddingEnd: $('paddingEnd'),
  detectBtn: $('detectBtn'),
  detectSummary: $('detectSummary'),
  exportButtons: Array.from(document.querySelectorAll('[data-export]')),
  intervalsContainer: $('intervalsContainer'),
  searchIntervals: $('searchIntervals'),
  statusFilter: $('statusFilter'),
  projectNotes: $('projectNotes'),
  saveNotesBtn: $('saveNotesBtn'),
  toast: $('toast'),
  loading: $('loading'),
  loadingText: $('loadingText'),
  loadingDetail: $('loadingDetail'),
  progressBar: $('progressBar'),
  progressPercent: $('progressPercent'),
  progressElapsed: $('progressElapsed'),
  loadingError: $('loadingError'),
  loadingActions: $('loadingActions'),
  closeLoadingBtn: $('closeLoadingBtn'),
  errorBox: $('errorBox'),
  errorTitle: $('errorTitle'),
  errorMessage: $('errorMessage'),
  errorDetails: $('errorDetails'),
  dismissErrorBtn: $('dismissErrorBtn'),
};

function fmt(seconds) {
  seconds = Number(seconds || 0);
  const ms = Math.round(seconds * 1000) % 1000;
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtBytes(bytes) {
  bytes = Number(bytes || 0);
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index += 1;
  }
  return `${bytes.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function showToast(message, ms = 3600) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  setTimeout(() => { els.toast.hidden = true; }, ms);
}

function showError(title, message, details = '') {
  els.errorTitle.textContent = title || 'Erro';
  els.errorMessage.textContent = message || 'Ocorreu um erro inesperado.';
  if (details) {
    els.errorDetails.textContent = details;
    els.errorDetails.hidden = false;
  } else {
    els.errorDetails.hidden = true;
    els.errorDetails.textContent = '';
  }
  els.errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
  els.errorBox.hidden = true;
}

function setBusyButtons(active) {
  els.uploadBtn.disabled = !!active;
  if (state.project) els.detectBtn.disabled = !!active;
}

function setProgress(percent, detail = '') {
  percent = Math.max(0, Math.min(100, Number(percent || 0)));
  els.progressBar.style.width = `${percent}%`;
  els.progressPercent.textContent = `${Math.round(percent)}%`;
  if (detail) els.loadingDetail.textContent = detail;
}

function updateElapsed() {
  if (!state.loadingStartedAt) return;
  const elapsed = Math.max(0, Math.round((Date.now() - state.loadingStartedAt) / 1000));
  if (els.progressElapsed) els.progressElapsed.textContent = `${elapsed}s`;
}

function setLoading(active, text = 'Processando...', detail = 'Isso pode levar alguns minutos em vídeos longos.', percent = 0) {
  if (active) {
    els.loadingText.textContent = text;
    els.loadingDetail.textContent = detail;
    els.loadingError.hidden = true;
    els.loadingError.textContent = '';
    els.loadingActions.hidden = true;
    els.loading.hidden = false;
    state.loadingStartedAt = Date.now();
    setProgress(percent, detail);
    updateElapsed();
    clearInterval(state.loadingTimer);
    state.loadingTimer = setInterval(updateElapsed, 1000);
    setBusyButtons(true);
  } else {
    els.loading.hidden = true;
    clearInterval(state.loadingTimer);
    state.loadingTimer = null;
    state.loadingStartedAt = null;
    setBusyButtons(false);
  }
}

function setLoadingError(message) {
  els.loadingText.textContent = 'Não foi possível concluir';
  els.loadingDetail.textContent = 'Leia a mensagem abaixo para corrigir e tentar novamente.';
  els.loadingError.textContent = message || 'Erro desconhecido.';
  els.loadingError.hidden = false;
  els.loadingActions.hidden = false;
  clearInterval(state.loadingTimer);
  state.loadingTimer = null;
  setBusyButtons(false);
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok || (payload && payload.ok === false)) {
    const err = new Error((payload && payload.error) || `Erro HTTP ${response.status}`);
    err.payload = payload;
    err.status = response.status;
    throw err;
  }
  return payload;
}

async function checkHealth() {
  try {
    const res = await api('/api/health');
    state.maxUploadMb = res.max_upload_mb || null;
    state.maxChunkMb = res.max_chunk_mb || 256;
    state.recommendedChunkMb = res.recommended_chunk_mb || 64;
    els.healthStatus.classList.toggle('ok', !!res.ffmpeg_ok);
    els.healthStatus.classList.toggle('bad', !res.ffmpeg_ok);
    els.healthStatus.querySelector('strong').textContent = res.ffmpeg_ok ? 'FFmpeg pronto' : 'FFmpeg não encontrado';
    els.healthStatus.querySelector('small').textContent = res.ffmpeg_ok ? 'Detecção e exportações disponíveis.' : res.ffmpeg_message;
  } catch (err) {
    els.healthStatus.classList.add('bad');
    els.healthStatus.querySelector('strong').textContent = 'Erro ao verificar ambiente';
    els.healthStatus.querySelector('small').textContent = err.message;
  }
}

async function loadProjects() {
  try {
    const res = await api('/api/projects');
    renderProjectList(res.projects || []);
  } catch (err) {
    els.projectList.textContent = err.message;
  }
}

function renderProjectList(projects) {
  if (!projects.length) {
    els.projectList.className = 'project-list empty';
    els.projectList.textContent = 'Nenhum projeto salvo ainda.';
    return;
  }
  els.projectList.className = 'project-list';
  els.projectList.innerHTML = '';
  projects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <strong>${escapeHtml(p.title || 'Projeto sem nome')}</strong>
      <small>${escapeHtml(p.source_filename || '')}</small><br>
      <small>${p.interval_count || 0} intervalos • atualizado em ${escapeHtml(p.updated_at || '')}</small>
    `;
    item.addEventListener('click', () => openProject(p.id));
    els.projectList.appendChild(item);
  });
}

async function openProject(projectId) {
  setLoading(true, 'Abrindo projeto...', 'Carregando dados salvos.', 25);
  try {
    const res = await api(`/api/projects/${projectId}`);
    setProgress(100, 'Projeto carregado.');
    setProject(res.project);
    showToast('Projeto aberto.');
  } catch (err) {
    showError('Erro ao abrir projeto', err.message);
  } finally {
    setLoading(false);
  }
}

function setProject(project) {
  state.project = project;
  els.currentTitle.textContent = project.title || 'Projeto sem nome';
  els.currentMeta.textContent = `${project.source_filename || ''} • duração ${fmt(project.duration || 0)} • ${project.intervals?.length || 0} intervalos`;
  els.videoPlayer.src = `/media/${project.id}/video`;
  els.deleteProjectBtn.disabled = false;
  els.detectBtn.disabled = false;
  els.back2Btn.disabled = false;
  els.playPauseBtn.disabled = false;
  els.forward2Btn.disabled = false;
  els.saveNotesBtn.disabled = false;
  els.projectNotes.value = project.notes || '';
  const s = project.settings || {};
  els.noiseDb.value = s.noise_db ?? -35;
  els.minSilence.value = s.min_silence ?? 1.0;
  els.minAdDuration.value = s.min_ad_duration ?? 0.8;
  els.previewMargin.value = s.preview_margin ?? 2.0;
  els.paddingStart.value = s.padding_start ?? 0.10;
  els.paddingEnd.value = s.padding_end ?? 0.10;
  els.exportButtons.forEach(btn => btn.disabled = false);
  renderIntervals();
}

function clearProject() {
  state.project = null;
  els.currentTitle.textContent = 'Nenhum projeto aberto';
  els.currentMeta.textContent = 'Crie ou abra um projeto para começar.';
  els.videoPlayer.removeAttribute('src');
  els.videoPlayer.load();
  els.deleteProjectBtn.disabled = true;
  els.detectBtn.disabled = true;
  els.back2Btn.disabled = true;
  els.playPauseBtn.disabled = true;
  els.forward2Btn.disabled = true;
  els.saveNotesBtn.disabled = true;
  els.exportButtons.forEach(btn => btn.disabled = true);
  els.projectNotes.value = '';
  renderIntervals();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validateVideoFile(file) {
  if (!file) return 'Selecione um arquivo de vídeo primeiro.';
  if (!file.size || file.size <= 0) return 'O arquivo selecionado parece estar vazio.';
  const name = file.name.toLowerCase();
  const allowed = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.mpg', '.mpeg', '.wmv'];
  if (!allowed.some(ext => name.endsWith(ext))) {
    return 'Formato não suportado. Use MP4, MOV, MKV, AVI, WEBM, M4V, MPG, MPEG ou WMV.';
  }
  return '';
}

function postChunkWithProgress(uploadId, chunkIndex, totalChunks, chunk, fileSize, uploadedBefore) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('upload_id', uploadId);
    formData.append('chunk_index', String(chunkIndex));
    formData.append('chunk', chunk, `parte_${String(chunkIndex + 1).padStart(5, '0')}.bin`);

    xhr.open('POST', '/api/projects/upload/chunk');
    xhr.timeout = 0;

    xhr.upload.onprogress = (event) => {
      const sentInChunk = event.lengthComputable ? event.loaded : 0;
      const sentTotal = Math.min(fileSize, uploadedBefore + sentInChunk);
      const percent = fileSize > 0 ? (sentTotal / fileSize) * 90 : 0;
      setProgress(
        percent,
        `Enviando parte ${chunkIndex + 1} de ${totalChunks} • ${fmtBytes(sentTotal)} de ${fmtBytes(fileSize)}`
      );
    };

    xhr.onload = () => {
      let payload = null;
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch (_) { payload = null; }
      if (xhr.status >= 200 && xhr.status < 300 && payload && payload.ok !== false) {
        resolve(payload);
      } else {
        reject(new Error((payload && payload.error) || `Erro HTTP ${xhr.status}.`));
      }
    };

    xhr.onerror = () => reject(new Error('Falha de comunicação com o programa local. Verifique se o terminal ainda está rodando.'));
    xhr.onabort = () => reject(new Error('Envio cancelado.'));
    xhr.send(formData);
  });
}

async function uploadProjectInChunks(file, title) {
  const chunkMb = Math.max(1, Math.min(Number(state.recommendedChunkMb || 64), Number(state.maxChunkMb || 256)));
  const chunkSize = chunkMb * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);

  setProgress(1, `Preparando upload fracionado em ${totalChunks} parte(s) de até ${chunkMb} MB.`);
  const start = await api('/api/projects/upload/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      title,
      size: file.size,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
    }),
  });

  state.currentUploadId = start.upload_id;
  let uploadedBefore = 0;
  for (let index = 0; index < totalChunks; index += 1) {
    const startByte = index * chunkSize;
    const endByte = Math.min(file.size, startByte + chunkSize);
    const chunk = file.slice(startByte, endByte);
    const response = await postChunkWithProgress(start.upload_id, index, totalChunks, chunk, file.size, uploadedBefore);
    uploadedBefore = Number(response.received || endByte);
    const percent = file.size > 0 ? (uploadedBefore / file.size) * 90 : 90;
    setProgress(
      percent,
      `Parte ${index + 1} de ${totalChunks} enviada • ${fmtBytes(uploadedBefore)} de ${fmtBytes(file.size)}`
    );
  }

  setProgress(93, 'Upload concluído. Montando o projeto e validando a duração do vídeo...');
  const finished = await api('/api/projects/upload/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: start.upload_id }),
  });
  state.currentUploadId = null;
  return finished;
}

async function cancelCurrentUploadSilently() {
  if (!state.currentUploadId) return;
  try {
    await api(`/api/projects/upload/${state.currentUploadId}`, { method: 'DELETE' });
  } catch (_) {
    // Ignora erro de limpeza: o usuário verá a causa principal na tela.
  } finally {
    state.currentUploadId = null;
  }
}

async function uploadProject() {
  hideError();
  const file = els.videoFile.files[0];
  const validation = validateVideoFile(file);
  if (validation) {
    showError('Não foi possível criar o projeto', validation);
    return;
  }

  const title = els.projectTitle.value || file.name.replace(/\.[^.]+$/, '');
  setLoading(true, 'Criando projeto...', `Enviando ${fmtBytes(file.size)} em partes. O limite agora depende principalmente do espaço em disco.`, 0);
  try {
    const res = await uploadProjectInChunks(file, title);
    setProgress(100, 'Projeto criado com sucesso.');
    setProject(res.project);
    await loadProjects();
    showToast('Projeto criado com sucesso.');
  } catch (err) {
    await cancelCurrentUploadSilently();
    setLoadingError(err.message);
    showError('Erro ao criar projeto', err.message);
    return;
  }
  setTimeout(() => setLoading(false), 350);
}

async function deleteCurrentProject() {
  if (!state.project) return;
  const confirmed = confirm('Tem certeza que deseja excluir este projeto e suas gravações?');
  if (!confirmed) return;
  setLoading(true, 'Excluindo projeto...', 'Removendo arquivos locais do projeto.', 20);
  try {
    await api(`/api/projects/${state.project.id}`, { method: 'DELETE' });
    clearProject();
    await loadProjects();
    showToast('Projeto excluído.');
  } catch (err) {
    showError('Erro ao excluir projeto', err.message);
  } finally {
    setLoading(false);
  }
}

async function pollJob(jobId, onDone) {
  while (true) {
    const res = await api(`/api/jobs/${jobId}`);
    const job = res.job;
    setProgress(job.percent || 0, job.details || job.message || 'Processando...');
    els.loadingText.textContent = job.message || 'Processando...';

    if (job.status === 'done') {
      setProgress(100, job.details || 'Concluído.');
      await onDone(job.result || {});
      return;
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'Erro desconhecido na tarefa.');
    }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
}

async function detectSilences() {
  if (!state.project) return;
  hideError();
  const body = {
    noise_db: Number(els.noiseDb.value),
    min_silence: Number(els.minSilence.value),
    min_ad_duration: Number(els.minAdDuration.value),
    preview_margin: Number(els.previewMargin.value),
    padding_start: Number(els.paddingStart.value),
    padding_end: Number(els.paddingEnd.value),
  };
  setLoading(true, 'Detectando pausas no vídeo...', 'Iniciando tarefa em segundo plano.', 1);
  try {
    const start = await api(`/api/projects/${state.project.id}/detect/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await pollJob(start.job_id, async (result) => {
      setProject(result.project);
      els.detectSummary.textContent = result.message || '';
      await loadProjects();
      showToast(result.message || 'Detecção concluída.');
    });
  } catch (err) {
    setLoadingError(err.message);
    showError('Erro ao detectar pausas', err.message);
    return;
  }
  setTimeout(() => setLoading(false), 450);
}

function playSegment(interval) {
  const margin = Number(els.previewMargin.value || 2);
  const video = els.videoPlayer;
  const start = Math.max(0, Number(interval.start || 0) - margin);
  const stopAt = Number(interval.end || 0) + margin;
  video.currentTime = start;
  video.play();
  const onTimeUpdate = () => {
    if (video.currentTime >= stopAt) {
      video.pause();
      video.removeEventListener('timeupdate', onTimeUpdate);
    }
  };
  video.addEventListener('timeupdate', onTimeUpdate);
}

function jumpToStart(interval) {
  els.videoPlayer.currentTime = Number(interval.start || 0);
  els.videoPlayer.play();
}

function renderIntervals() {
  const project = state.project;
  const intervals = project?.intervals || [];
  const term = (els.searchIntervals.value || '').toLowerCase().trim();
  const status = els.statusFilter.value || '';
  let filtered = intervals.filter(interval => {
    const text = `${interval.title || ''} ${interval.script || ''} ${interval.notes || ''}`.toLowerCase();
    const matchesTerm = !term || text.includes(term);
    const matchesStatus = !status || interval.status === status;
    return matchesTerm && matchesStatus;
  });

  if (!project) {
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum projeto aberto.</h3><p>Crie ou abra um projeto para começar.</p>';
    return;
  }
  if (!intervals.length) {
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum intervalo detectado ainda.</h3><p>Clique em “Detectar pausas automaticamente”.</p>';
    return;
  }
  if (!filtered.length) {
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum intervalo encontrado com esse filtro.</h3><p>Limpe a busca ou mude o status.</p>';
    return;
  }

  els.intervalsContainer.className = 'intervals';
  els.intervalsContainer.innerHTML = '';
  filtered.forEach(interval => {
    const card = document.createElement('article');
    card.className = 'interval-card';
    const badgeClass = interval.quality || 'curto';
    const recordingAudio = interval.recording_filename
      ? `<audio class="recording-preview" controls src="/media/${project.id}/recordings/${encodeURIComponent(interval.recording_filename)}"></audio>`
      : '<p class="hint">Nenhuma gravação enviada ainda.</p>';
    const warning = interval.warning ? `<div class="interval-warning">${escapeHtml(interval.warning)}</div>` : '';
    card.innerHTML = `
      <header>
        <div>
          <span class="badge ${badgeClass}">${escapeHtml(interval.quality || '')}</span>
          <h3>${interval.index}. ${escapeHtml(interval.title || 'Audiodescrição')}</h3>
          <p class="interval-meta">
            Espaço útil: <strong>${fmt(interval.start)}</strong> até <strong>${fmt(interval.end)}</strong><br>
            Duração útil: <strong>${Number(interval.duration || 0).toFixed(2)}s</strong> • Silêncio bruto: ${Number(interval.silence_duration || 0).toFixed(2)}s
          </p>
        </div>
      </header>
      <div class="interval-actions">
        <button class="button" data-action="play">Ver trecho</button>
        <button class="button" data-action="jump">Ir ao início</button>
        <button class="button record" data-action="record">● Gravar</button>
        <button class="button" data-action="delete-recording" ${interval.recording_filename ? '' : 'disabled'}>Remover gravação</button>
      </div>
      <div class="status-row">
        <label>Título
          <input class="input title-input" value="${escapeHtml(interval.title || '')}">
        </label>
        <label>Status
          <select class="input status-input">
            ${['pendente','roteirizado','gravado','revisado','descartado'].map(s => `<option value="${s}" ${interval.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Roteiro da audiodescrição
        <textarea class="textarea script-input" rows="4" placeholder="Escreva aqui o que será narrado nesse intervalo...">${escapeHtml(interval.script || '')}</textarea>
      </label>
      <label>Observações internas
        <textarea class="textarea notes-input" rows="2" placeholder="Ex.: regravar mais curto, validar com o Ícaro, som ambiente importante...">${escapeHtml(interval.notes || '')}</textarea>
      </label>
      <button class="button primary" data-action="save">Salvar intervalo</button>
      ${recordingAudio}
      ${warning}
    `;

    card.querySelector('[data-action="play"]').addEventListener('click', () => playSegment(interval));
    card.querySelector('[data-action="jump"]').addEventListener('click', () => jumpToStart(interval));
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveInterval(interval.index, card));
    card.querySelector('[data-action="record"]').addEventListener('click', (ev) => toggleRecording(interval.index, ev.currentTarget));
    card.querySelector('[data-action="delete-recording"]').addEventListener('click', () => deleteRecording(interval.index));
    els.intervalsContainer.appendChild(card);
  });
}

async function saveInterval(index, card) {
  if (!state.project) return;
  const body = {
    title: card.querySelector('.title-input').value,
    status: card.querySelector('.status-input').value,
    script: card.querySelector('.script-input').value,
    notes: card.querySelector('.notes-input').value,
  };
  try {
    const res = await api(`/api/projects/${state.project.id}/intervals/${index}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setProject(res.project);
    showToast('Intervalo salvo.');
  } catch (err) {
    showError('Erro ao salvar intervalo', err.message);
  }
}

async function saveNotes() {
  if (!state.project) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: els.projectNotes.value }),
    });
    setProject(res.project);
    showToast('Observações salvas.');
  } catch (err) {
    showError('Erro ao salvar observações', err.message);
  }
}

async function toggleRecording(index, button) {
  if (!state.project) return;
  if (state.mediaRecorder && state.recordingIndex === index) {
    state.mediaRecorder.stop();
    button.classList.remove('recording');
    button.textContent = '● Gravar';
    return;
  }
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    showToast('Finalize a gravação atual antes de iniciar outra.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    state.recordingChunks = [];
    state.recordingIndex = index;
    state.mediaRecorder = new MediaRecorder(stream, { mimeType });
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) state.recordingChunks.push(event.data);
    };
    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(state.recordingChunks, { type: mimeType });
      await uploadRecording(index, blob);
      state.mediaRecorder = null;
      state.recordingChunks = [];
      state.recordingIndex = null;
    };
    state.mediaRecorder.start();
    button.classList.add('recording');
    button.textContent = '■ Parar gravação';
    showToast('Gravação iniciada. Fale a audiodescrição e depois clique em parar.');
  } catch (err) {
    showError('Erro ao acessar microfone', `Não foi possível acessar o microfone: ${err.message}`);
  }
}

async function uploadRecording(index, blob) {
  if (!state.project) return;
  setLoading(true, 'Salvando gravação...', 'Enviando áudio do microfone para a pasta local do projeto.', 25);
  try {
    const fd = new FormData();
    fd.append('audio', blob, `intervalo_${index}.webm`);
    const res = await api(`/api/projects/${state.project.id}/recordings/${index}`, {
      method: 'POST',
      body: fd,
    });
    setProgress(100, 'Gravação salva.');
    setProject(res.project);
    showToast('Gravação salva.');
  } catch (err) {
    showError('Erro ao salvar gravação', err.message);
  } finally {
    setLoading(false);
  }
}

async function deleteRecording(index) {
  if (!state.project) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/recordings/${index}`, { method: 'DELETE' });
    setProject(res.project);
    showToast('Gravação removida.');
  } catch (err) {
    showError('Erro ao remover gravação', err.message);
  }
}

function exportFile(kind) {
  if (!state.project) return;
  window.location.href = `/api/projects/${state.project.id}/export/${kind}`;
  if (kind === 'ad_audio' || kind === 'final_video') {
    showToast('Exportação iniciada. Em vídeos longos, aguarde o navegador baixar o arquivo.');
  }
}

function setupPlayerButtons() {
  els.back2Btn.addEventListener('click', () => {
    els.videoPlayer.currentTime = Math.max(0, els.videoPlayer.currentTime - 2);
  });
  els.forward2Btn.addEventListener('click', () => {
    els.videoPlayer.currentTime = Math.min(els.videoPlayer.duration || Infinity, els.videoPlayer.currentTime + 2);
  });
  els.playPauseBtn.addEventListener('click', () => {
    if (els.videoPlayer.paused) els.videoPlayer.play();
    else els.videoPlayer.pause();
  });
}

function bindEvents() {
  els.uploadBtn.addEventListener('click', uploadProject);
  els.detectBtn.addEventListener('click', detectSilences);
  els.deleteProjectBtn.addEventListener('click', deleteCurrentProject);
  els.saveNotesBtn.addEventListener('click', saveNotes);
  els.exportButtons.forEach(btn => btn.addEventListener('click', () => exportFile(btn.dataset.export)));
  els.searchIntervals.addEventListener('input', renderIntervals);
  els.statusFilter.addEventListener('change', renderIntervals);
  els.dismissErrorBtn.addEventListener('click', hideError);
  els.closeLoadingBtn.addEventListener('click', () => setLoading(false));
  setupPlayerButtons();
}

async function init() {
  bindEvents();
  await checkHealth();
  await loadProjects();
}

init();
