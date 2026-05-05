const VISUAL_PREFS_KEY = 'adAssistVisualPrefs';

function readVisualPrefs() {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const defaults = { contrast: false, largeText: false, reducedMotion: prefersReducedMotion };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(VISUAL_PREFS_KEY) || '{}') };
  } catch (_) {
    return defaults;
  }
}

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
  currentIntervalIndex: null,
  intervalSaveTimers: new Map(),
  transcriptSaveTimer: null,
  notesSaveTimer: null,
  transcriptSegments: [],
  visualPrefs: readVisualPrefs(),
};

const $ = (id) => document.getElementById(id);

const els = {
  healthStatus: $('healthStatus'),
  contrastToggle: $('contrastToggle'),
  largeTextToggle: $('largeTextToggle'),
  reducedMotionToggle: $('reducedMotionToggle'),
  projectTitle: $('projectTitle'),
  videoFile: $('videoFile'),
  selectedFileName: $('selectedFileName'),
  uploadBtn: $('uploadBtn'),
  projectList: $('projectList'),
  currentTitle: $('currentTitle'),
  currentMeta: $('currentMeta'),
  deleteProjectBtn: $('deleteProjectBtn'),
  workflowTitle: $('workflowTitle'),
  workflowHint: $('workflowHint'),
  workflowStats: $('workflowStats'),
  prevPauseBtn: $('prevPauseBtn'),
  nextPendingBtn: $('nextPendingBtn'),
  nextPauseBtn: $('nextPauseBtn'),
  markReviewedBtn: $('markReviewedBtn'),
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
  transcriptText: $('transcriptText'),
  transcriptSearch: $('transcriptSearch'),
  transcriptContextSeconds: $('transcriptContextSeconds'),
  transcriptPreview: $('transcriptPreview'),
  saveTranscriptBtn: $('saveTranscriptBtn'),
  refreshHistoryBtn: $('refreshHistoryBtn'),
  historyList: $('historyList'),
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

function fmtClock(seconds) {
  seconds = Number(seconds || 0);
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
}

function parseTimeToSeconds(value) {
  const text = String(value || '').trim().replace(',', '.');
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some(part => Number.isNaN(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function statusLabel(status) {
  const labels = {
    pendente: 'Pendente',
    roteirizado: 'Roteirizado',
    gravado: 'Gravado',
    revisado: 'Revisado',
    descartado: 'Descartado',
  };
  return labels[status] || status || 'Pendente';
}

function saveVisualPrefs() {
  localStorage.setItem(VISUAL_PREFS_KEY, JSON.stringify(state.visualPrefs));
}

function applyVisualPrefs() {
  document.body.dataset.contrast = state.visualPrefs.contrast ? 'high' : 'standard';
  document.body.dataset.largeText = state.visualPrefs.largeText ? 'true' : 'false';
  document.body.dataset.motion = state.visualPrefs.reducedMotion ? 'reduced' : 'standard';
  els.contrastToggle.setAttribute('aria-pressed', String(!!state.visualPrefs.contrast));
  els.largeTextToggle.setAttribute('aria-pressed', String(!!state.visualPrefs.largeText));
  els.reducedMotionToggle.setAttribute('aria-pressed', String(!!state.visualPrefs.reducedMotion));
  els.contrastToggle.classList.toggle('active', !!state.visualPrefs.contrast);
  els.largeTextToggle.classList.toggle('active', !!state.visualPrefs.largeText);
  els.reducedMotionToggle.classList.toggle('active', !!state.visualPrefs.reducedMotion);
}

function toggleVisualPref(key) {
  state.visualPrefs[key] = !state.visualPrefs[key];
  saveVisualPrefs();
  applyVisualPrefs();
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

function visibleIntervalIndexes() {
  return Array.from(els.intervalsContainer.querySelectorAll('.interval-card'))
    .map(card => Number(card.id.replace('interval-', '')))
    .filter(Boolean);
}

function goToInterval(index, autoplay = true) {
  if (!state.project) return;
  const interval = (state.project.intervals || []).find(item => item.index === index);
  if (!interval) return;
  state.currentIntervalIndex = index;
  const visible = visibleIntervalIndexes();
  if (!visible.includes(index)) {
    els.searchIntervals.value = '';
    els.statusFilter.value = '';
    renderIntervals();
  } else {
    document.querySelectorAll('.interval-card.current').forEach(card => card.classList.remove('current'));
    document.getElementById(`interval-${index}`)?.classList.add('current');
  }
  const card = document.getElementById(`interval-${index}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.focus({ preventScroll: true });
  }
  if (autoplay) jumpToStart(interval);
  updateWorkflowPanel();
}

function findIntervalNearVideo(direction = 1) {
  const intervals = state.project?.intervals || [];
  if (!intervals.length) return null;
  const time = Number(els.videoPlayer.currentTime || 0);
  if (direction > 0) {
    return intervals.find(interval => Number(interval.start || 0) > time + 0.05) || intervals[0];
  }
  return [...intervals].reverse().find(interval => Number(interval.start || 0) < time - 0.05) || intervals[intervals.length - 1];
}

function goToNextPending() {
  const intervals = state.project?.intervals || [];
  const current = Number(state.currentIntervalIndex || 0);
  const ordered = intervals.filter(interval => interval.status !== 'revisado' && interval.status !== 'descartado');
  const next = ordered.find(interval => Number(interval.index) > current) || ordered[0];
  if (next) goToInterval(next.index, true);
}

async function markCurrentReviewed() {
  if (!state.project || !state.currentIntervalIndex) return;
  const card = document.getElementById(`interval-${state.currentIntervalIndex}`);
  if (card) {
    card.querySelector('.status-input').value = 'revisado';
    await saveInterval(state.currentIntervalIndex, card);
    return;
  }
  const interval = state.project.intervals.find(item => item.index === state.currentIntervalIndex);
  if (!interval) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/intervals/${state.currentIntervalIndex}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...interval, status: 'revisado' }),
    });
    setProject(res.project);
  } catch (err) {
    showError('Erro ao marcar revisão', err.message);
  }
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
  state.currentIntervalIndex = project.workflow?.current_interval || state.currentIntervalIndex || project.intervals?.[0]?.index || null;
  state.transcriptSegments = parseTranscript(project.transcript?.text || '');
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
  els.saveTranscriptBtn.disabled = false;
  els.refreshHistoryBtn.disabled = false;
  els.transcriptText.value = project.transcript?.text || '';
  const s = project.settings || {};
  els.noiseDb.value = s.noise_db ?? -35;
  els.minSilence.value = s.min_silence ?? 1.0;
  els.minAdDuration.value = s.min_ad_duration ?? 0.8;
  els.previewMargin.value = s.preview_margin ?? 2.0;
  els.paddingStart.value = s.padding_start ?? 0.10;
  els.paddingEnd.value = s.padding_end ?? 0.10;
  els.exportButtons.forEach(btn => btn.disabled = false);
  updateWorkflowPanel();
  renderTranscriptPreview();
  renderIntervals();
  loadHistory();
}

function clearProject() {
  state.project = null;
  state.currentIntervalIndex = null;
  state.transcriptSegments = [];
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
  els.saveTranscriptBtn.disabled = true;
  els.refreshHistoryBtn.disabled = true;
  els.prevPauseBtn.disabled = true;
  els.nextPendingBtn.disabled = true;
  els.nextPauseBtn.disabled = true;
  els.markReviewedBtn.disabled = true;
  els.exportButtons.forEach(btn => btn.disabled = true);
  els.projectNotes.value = '';
  els.transcriptText.value = '';
  els.transcriptPreview.innerHTML = '';
  els.historyList.className = 'history-list empty';
  els.historyList.textContent = 'Abra um projeto para ver o histórico.';
  updateWorkflowPanel();
  renderIntervals();
}

function projectStats() {
  const intervals = state.project?.intervals || [];
  const counts = { pendente: 0, roteirizado: 0, gravado: 0, revisado: 0, descartado: 0 };
  intervals.forEach(interval => {
    const status = interval.status || 'pendente';
    counts[status] = (counts[status] || 0) + 1;
  });
  return {
    total: intervals.length,
    counts,
    scripted: intervals.filter(interval => (interval.script || '').trim()).length,
    recorded: intervals.filter(interval => interval.recording_filename).length,
  };
}

function updateWorkflowPanel() {
  const stats = projectStats();
  const hasProject = !!state.project;
  const hasIntervals = stats.total > 0;
  els.prevPauseBtn.disabled = !hasIntervals;
  els.nextPendingBtn.disabled = !hasIntervals;
  els.nextPauseBtn.disabled = !hasIntervals;
  els.markReviewedBtn.disabled = !hasIntervals;

  if (!hasProject) {
    els.workflowTitle.textContent = 'Abra ou crie um projeto';
    els.workflowHint.textContent = 'Depois de carregar um vídeo, o guia mostra o próximo intervalo para revisar.';
    els.workflowStats.innerHTML = '';
    return;
  }
  if (!hasIntervals) {
    els.workflowTitle.textContent = 'Detecte as pausas';
    els.workflowHint.textContent = 'Use a detecção automática para criar os intervalos de audiodescrição.';
    els.workflowStats.innerHTML = `<span>${fmtClock(state.project.duration || 0)} de vídeo</span>`;
    return;
  }

  const pending = stats.counts.pendente || 0;
  const reviewed = stats.counts.revisado || 0;
  els.workflowTitle.textContent = pending ? `${pending} pausa(s) ainda pendente(s)` : 'Roteiro pronto para revisão final';
  els.workflowHint.textContent = pending
    ? 'Use “Próxima pendente” para avançar sem se perder no projeto.'
    : 'Confira as gravações e exporte a faixa ou o vídeo final.';
  els.workflowStats.innerHTML = `
    <span><strong>${stats.total}</strong> pausas</span>
    <span><strong>${stats.scripted}</strong> com roteiro</span>
    <span><strong>${stats.recorded}</strong> gravadas</span>
    <span><strong>${reviewed}</strong> revisadas</span>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseTranscript(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const segments = [];
  const blocks = raw.split(/\n\s*\n/);

  blocks.forEach(block => {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    if (timeLineIndex >= 0) {
      const match = lines[timeLineIndex].match(/(\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)/);
      if (!match) return;
      const start = parseTimeToSeconds(match[1]);
      const end = parseTimeToSeconds(match[2]);
      const textLines = lines.slice(timeLineIndex + 1);
      if (start !== null && end !== null && textLines.length) {
        segments.push({ start, end, text: textLines.join(' ') });
      }
      return;
    }

    lines.forEach(line => {
      const match = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)\]?\s*(?:[-–—:]\s*)?(.*)$/);
      if (!match || !match[2]) return;
      const start = parseTimeToSeconds(match[1]);
      if (start === null) return;
      segments.push({ start, end: start + 3, text: match[2] });
    });
  });

  segments.sort((a, b) => a.start - b.start);
  for (let i = 0; i < segments.length; i += 1) {
    if ((!segments[i].end || segments[i].end <= segments[i].start) && segments[i + 1]) {
      segments[i].end = Math.max(segments[i].start + 0.2, segments[i + 1].start);
    }
  }
  return segments;
}

function transcriptAround(interval, marginSeconds) {
  const start = Number(interval.start || 0);
  const end = Number(interval.end || start);
  const margin = Number(marginSeconds || 10);
  const before = [];
  const during = [];
  const after = [];
  state.transcriptSegments.forEach(segment => {
    const segStart = Number(segment.start || 0);
    const segEnd = Number(segment.end || segStart + 3);
    if (segEnd <= start && segEnd >= start - margin) before.push(segment);
    else if (segStart < end && segEnd > start) during.push(segment);
    else if (segStart >= end && segStart <= end + margin) after.push(segment);
  });
  return { before, during, after };
}

function renderTranscriptBlock(title, segments) {
  if (!segments.length) return '';
  const items = segments.map(seg => `<li><strong>${fmt(seg.start)}</strong> ${escapeHtml(seg.text)}</li>`).join('');
  return `<div class="transcript-block"><strong>${title}</strong><ul>${items}</ul></div>`;
}

function transcriptContextHtml(interval) {
  const transcriptText = state.project?.transcript?.text || '';
  if (!transcriptText.trim()) {
    return '<p class="hint">Sem transcrição salva para este projeto.</p>';
  }
  if (!state.transcriptSegments.length) {
    return '<p class="hint">A transcrição foi salva sem tempos reconhecíveis. Use a busca geral na seção de transcrição.</p>';
  }
  const context = transcriptAround(interval, els.transcriptContextSeconds.value || 10);
  const html = [
    renderTranscriptBlock('Antes da pausa', context.before),
    renderTranscriptBlock('Durante a pausa', context.during),
    renderTranscriptBlock('Depois da pausa', context.after),
  ].filter(Boolean).join('');
  return html || '<p class="hint">Nenhuma fala com tempo próximo a esta pausa.</p>';
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

function updateSelectedFileName() {
  const file = els.videoFile.files?.[0];
  els.selectedFileName.textContent = file
    ? `${file.name} • ${fmtBytes(file.size)}`
    : 'Nenhum vídeo selecionado.';
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
  const confirmed = confirm('Arquivar este projeto? Ele sai da lista, mas a pasta é movida para data/trash para recuperação manual.');
  if (!confirmed) return;
  setLoading(true, 'Excluindo projeto...', 'Removendo arquivos locais do projeto.', 20);
  try {
    await api(`/api/projects/${state.project.id}`, { method: 'DELETE' });
    clearProject();
    await loadProjects();
    showToast('Projeto arquivado na lixeira local.');
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
    card.className = `interval-card ${state.currentIntervalIndex === interval.index ? 'current' : ''}`;
    card.id = `interval-${interval.index}`;
    card.tabIndex = -1;
    const badgeClass = interval.quality || 'curto';
    const recordingAudio = interval.recording_filename
      ? `<audio class="recording-preview" controls src="/media/${project.id}/recordings/${encodeURIComponent(interval.recording_filename)}"></audio>`
      : '<p class="hint">Nenhuma gravação enviada ainda.</p>';
    const warning = interval.warning ? `<div class="interval-warning">${escapeHtml(interval.warning)}</div>` : '';
    const transcriptContext = transcriptContextHtml(interval);
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
        <button class="button" data-action="mark-current">Usar como atual</button>
        <button class="button record" data-action="record">● Gravar</button>
        <button class="button" data-action="delete-recording" ${interval.recording_filename ? '' : 'disabled'}>Remover gravação</button>
      </div>
      <div class="status-row">
        <label>Título
          <input class="input title-input" value="${escapeHtml(interval.title || '')}">
        </label>
        <label>Status
          <select class="input status-input">
            ${['pendente','roteirizado','gravado','revisado','descartado'].map(s => `<option value="${s}" ${interval.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Roteiro da audiodescrição
        <textarea class="textarea script-input" rows="4" placeholder="Escreva aqui o que será narrado nesse intervalo...">${escapeHtml(interval.script || '')}</textarea>
      </label>
      <label>Observações internas
        <textarea class="textarea notes-input" rows="2" placeholder="Ex.: regravar mais curto, validar com o Ícaro, som ambiente importante...">${escapeHtml(interval.notes || '')}</textarea>
      </label>
      <div class="save-row">
        <button class="button primary" data-action="save">Salvar intervalo</button>
        <span class="autosave-state" aria-live="polite">Salvo no histórico local.</span>
      </div>
      <details class="transcript-context">
        <summary>Falas próximas da pausa</summary>
        ${transcriptContext}
      </details>
      ${recordingAudio}
      ${warning}
    `;

    card.querySelector('[data-action="play"]').addEventListener('click', () => playSegment(interval));
    card.querySelector('[data-action="jump"]').addEventListener('click', () => jumpToStart(interval));
    card.querySelector('[data-action="mark-current"]').addEventListener('click', () => goToInterval(interval.index, false));
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveInterval(interval.index, card));
    card.querySelector('[data-action="record"]').addEventListener('click', (ev) => toggleRecording(interval.index, ev.currentTarget));
    card.querySelector('[data-action="delete-recording"]').addEventListener('click', () => deleteRecording(interval.index));
    card.querySelectorAll('.title-input, .status-input, .script-input, .notes-input').forEach(input => {
      input.addEventListener('input', () => scheduleIntervalSave(interval.index, card));
      input.addEventListener('change', () => scheduleIntervalSave(interval.index, card, 250));
    });
    els.intervalsContainer.appendChild(card);
  });
}

function intervalPayloadFromCard(card) {
  return {
    title: card.querySelector('.title-input').value,
    status: card.querySelector('.status-input').value,
    script: card.querySelector('.script-input').value,
    notes: card.querySelector('.notes-input').value,
  };
}

function setCardSaveState(card, text, stateName = '') {
  const el = card.querySelector('.autosave-state');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = stateName;
}

function scheduleIntervalSave(index, card, delay = 900) {
  setCardSaveState(card, 'Alteração pendente...', 'pending');
  clearTimeout(state.intervalSaveTimers.get(index));
  const timer = setTimeout(() => saveInterval(index, card, { silent: true }), delay);
  state.intervalSaveTimers.set(index, timer);
}

async function saveInterval(index, card, options = {}) {
  if (!state.project) return;
  const body = intervalPayloadFromCard(card);
  setCardSaveState(card, 'Salvando...', 'saving');
  try {
    const res = await api(`/api/projects/${state.project.id}/intervals/${index}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    state.project = res.project;
    updateWorkflowPanel();
    setCardSaveState(card, `Salvo às ${new Date().toLocaleTimeString()}`, 'saved');
    if (!options.silent) {
      setProject(res.project);
      showToast('Intervalo salvo.');
    }
  } catch (err) {
    setCardSaveState(card, 'Erro ao salvar', 'error');
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

async function saveTranscript() {
  if (!state.project) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: els.transcriptText.value, source: 'manual' }),
    });
    setProject(res.project);
    showToast('Transcrição salva.');
  } catch (err) {
    showError('Erro ao salvar transcrição', err.message);
  }
}

function renderTranscriptPreview() {
  const term = (els.transcriptSearch.value || '').toLowerCase().trim();
  const text = els.transcriptText.value || state.project?.transcript?.text || '';
  const segments = parseTranscript(text);
  state.transcriptSegments = segments;
  if (!text.trim()) {
    els.transcriptPreview.innerHTML = '<p class="hint">Nenhuma transcrição salva ainda.</p>';
    return;
  }
  if (!segments.length) {
    els.transcriptPreview.innerHTML = '<p class="hint">Texto salvo. Para mostrar contexto por pausa, use tempos como 00:01:23 ou SRT/VTT.</p>';
    return;
  }
  const matches = segments
    .filter(seg => !term || seg.text.toLowerCase().includes(term))
    .slice(0, 12);
  if (!matches.length) {
    els.transcriptPreview.innerHTML = '<p class="hint">Nenhum trecho encontrado nessa busca.</p>';
    return;
  }
  els.transcriptPreview.innerHTML = matches.map(seg => `
    <button class="transcript-hit" type="button" data-time="${seg.start}">
      <strong>${fmt(seg.start)}</strong>
      <span>${escapeHtml(seg.text)}</span>
    </button>
  `).join('');
  els.transcriptPreview.querySelectorAll('.transcript-hit').forEach(button => {
    button.addEventListener('click', () => {
      els.videoPlayer.currentTime = Number(button.dataset.time || 0);
      els.videoPlayer.play();
    });
  });
}

async function loadHistory() {
  if (!state.project) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/history`);
    renderHistory(res.history || []);
  } catch (err) {
    els.historyList.className = 'history-list empty';
    els.historyList.textContent = err.message;
  }
}

function renderHistory(history) {
  if (!history.length) {
    els.historyList.className = 'history-list empty';
    els.historyList.textContent = 'O histórico aparecerá depois do próximo salvamento.';
    return;
  }
  els.historyList.className = 'history-list';
  els.historyList.innerHTML = '';
  history.slice(0, 12).forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.reason || 'Projeto salvo')}</strong>
        <small>${escapeHtml(item.created_at || '')} • ${Number(item.interval_count || 0)} intervalo(s)</small>
      </div>
      <button class="button" type="button">Restaurar</button>
    `;
    row.querySelector('button').addEventListener('click', () => restoreHistory(item.id));
    els.historyList.appendChild(row);
  });
}

async function restoreHistory(snapshotId) {
  if (!state.project) return;
  const confirmed = confirm('Restaurar este ponto do histórico? O estado atual também será guardado no histórico antes da restauração.');
  if (!confirmed) return;
  setLoading(true, 'Restaurando histórico...', 'Recuperando o ponto salvo selecionado.', 20);
  try {
    const res = await api(`/api/projects/${state.project.id}/history/${encodeURIComponent(snapshotId)}/restore`, {
      method: 'POST',
    });
    setProject(res.project);
    showToast('Histórico restaurado.');
  } catch (err) {
    showError('Erro ao restaurar histórico', err.message);
  } finally {
    setLoading(false);
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
  const confirmed = confirm('Remover esta gravação do intervalo? O arquivo será movido para recordings_trash dentro do projeto.');
  if (!confirmed) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/recordings/${index}`, { method: 'DELETE' });
    setProject(res.project);
    showToast('Gravação removida.');
  } catch (err) {
    showError('Erro ao remover gravação', err.message);
  }
}

async function exportFile(kind) {
  if (!state.project) return;
  if (kind === 'ad_audio' || kind === 'final_video') {
    setLoading(
      true,
      kind === 'ad_audio' ? 'Gerando faixa de audiodescrição...' : 'Gerando vídeo final...',
      'A exportação roda em segundo plano para funcionar melhor com vídeos grandes.',
      1
    );
    try {
      const start = await api(`/api/projects/${state.project.id}/export/${kind}/start`, { method: 'POST' });
      await pollJob(start.job_id, async (result) => {
        setProgress(100, 'Arquivo pronto para baixar.');
        if (result.download_url) {
          window.location.href = result.download_url;
        }
        showToast('Exportação pronta.');
      });
    } catch (err) {
      setLoadingError(err.message);
      showError('Erro ao exportar', err.message);
      return;
    }
    setTimeout(() => setLoading(false), 650);
    return;
  }
  window.location.href = `/api/projects/${state.project.id}/export/${kind}`;
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
  els.contrastToggle.addEventListener('click', () => toggleVisualPref('contrast'));
  els.largeTextToggle.addEventListener('click', () => toggleVisualPref('largeText'));
  els.reducedMotionToggle.addEventListener('click', () => toggleVisualPref('reducedMotion'));
  els.videoFile.addEventListener('change', updateSelectedFileName);
  els.uploadBtn.addEventListener('click', uploadProject);
  els.detectBtn.addEventListener('click', detectSilences);
  els.deleteProjectBtn.addEventListener('click', deleteCurrentProject);
  els.saveNotesBtn.addEventListener('click', saveNotes);
  els.projectNotes.addEventListener('input', () => {
    clearTimeout(state.notesSaveTimer);
    state.notesSaveTimer = setTimeout(() => {
      if (state.project) saveNotes();
    }, 1600);
  });
  els.saveTranscriptBtn.addEventListener('click', saveTranscript);
  els.refreshHistoryBtn.addEventListener('click', loadHistory);
  els.transcriptSearch.addEventListener('input', renderTranscriptPreview);
  els.transcriptContextSeconds.addEventListener('change', renderIntervals);
  els.transcriptText.addEventListener('input', () => {
    renderTranscriptPreview();
    clearTimeout(state.transcriptSaveTimer);
    state.transcriptSaveTimer = setTimeout(() => {
      if (state.project) saveTranscript();
    }, 1800);
  });
  els.prevPauseBtn.addEventListener('click', () => {
    const interval = findIntervalNearVideo(-1);
    if (interval) goToInterval(interval.index, true);
  });
  els.nextPendingBtn.addEventListener('click', goToNextPending);
  els.nextPauseBtn.addEventListener('click', () => {
    const interval = findIntervalNearVideo(1);
    if (interval) goToInterval(interval.index, true);
  });
  els.markReviewedBtn.addEventListener('click', markCurrentReviewed);
  els.exportButtons.forEach(btn => btn.addEventListener('click', () => exportFile(btn.dataset.export)));
  els.searchIntervals.addEventListener('input', renderIntervals);
  els.statusFilter.addEventListener('change', renderIntervals);
  els.dismissErrorBtn.addEventListener('click', hideError);
  els.closeLoadingBtn.addEventListener('click', () => setLoading(false));
  setupPlayerButtons();
}

async function init() {
  applyVisualPrefs();
  bindEvents();
  await checkHealth();
  await loadProjects();
}

init();
