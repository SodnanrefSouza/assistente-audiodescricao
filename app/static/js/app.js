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
  selectedIntervalIndex: null,
  timelineSelectedGroupIndex: null,
  intervalPage: 1,
  intervalPageSize: 10,
  intervalSaveTimers: new Map(),
  transcriptSaveTimer: null,
  notesSaveTimer: null,
  transcriptSegments: [],
  transcriptionAvailable: false,
  activeTranscriptJob: null,
  autoTranscriptionProjects: new Set(),
  segmentPreviewStopper: null,
  visualPrefs: readVisualPrefs(),
};

const $ = (id) => document.getElementById(id);

function setHtml(element, html) {
  if (element) element.innerHTML = html;
}

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
  videoPanel: $('videoPanel'),
  videoPlayer: $('videoPlayer'),
  selectedSegmentBar: $('selectedSegmentBar'),
  selectedSegmentLabel: $('selectedSegmentLabel'),
  segmentRangeMarker: $('segmentRangeMarker'),
  segmentStartMarker: $('segmentStartMarker'),
  segmentEndMarker: $('segmentEndMarker'),
  playbackSpeed: $('playbackSpeed'),
  timelineTrack: $('timelineTrack'),
  timelineStatus: $('timelineStatus'),
  audioInsightPanel: $('audioInsightPanel'),
  back2Btn: $('back2Btn'),
  playPauseBtn: $('playPauseBtn'),
  forward2Btn: $('forward2Btn'),
  addIntervalAtCurrentBtn: $('addIntervalAtCurrentBtn'),
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
  intervalPager: $('intervalPager'),
  searchIntervals: $('searchIntervals'),
  statusFilter: $('statusFilter'),
  addIntervalListBtn: $('addIntervalListBtn'),
  projectNotes: $('projectNotes'),
  saveNotesBtn: $('saveNotesBtn'),
  transcriptText: $('transcriptText'),
  transcriptSearch: $('transcriptSearch'),
  transcriptContextSeconds: $('transcriptContextSeconds'),
  transcriptPreview: $('transcriptPreview'),
  allTranscriptList: $('allTranscriptList'),
  transcribeBtn: $('transcribeBtn'),
  transcriptStatus: $('transcriptStatus'),
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

function shortText(value, max = 48) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trim()}…`;
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

function applyTooltips(root = document) {
  const tips = [
    ['#projectTitle', 'Dê um nome curto para identificar este trabalho na lista de projetos recentes.'],
    ['#videoFile', 'Escolha o vídeo que será analisado. O arquivo fica salvo localmente no seu computador.'],
    ['#uploadBtn', 'Cria um projeto novo com o vídeo escolhido.'],
    ['#deleteProjectBtn', 'Exclui o projeto atual e apaga a pasta dele, incluindo vídeos, gravações, histórico e exportações.'],
    ['#prevPauseBtn', 'Vai para a pausa anterior em relação ao tempo atual do vídeo.'],
    ['#nextPendingBtn', 'Vai para o próximo intervalo que ainda não foi revisado.'],
    ['#nextPauseBtn', 'Vai para a próxima pausa em relação ao tempo atual do vídeo.'],
    ['#markReviewedBtn', 'Marca o intervalo atual como revisado.'],
    ['#playbackSpeed', 'Muda apenas a velocidade de reprodução para revisar o vídeo mais rápido ou mais devagar.'],
    ['#selectedSegmentBar', 'Mostra no player onde a pausa selecionada começa e termina no vídeo inteiro.'],
    ['#timelineTrack', 'Linha do tempo das pausas. Clique em uma região para abrir as pausas daquela parte e depois escolha uma barra.'],
    ['#audioInsightPanel', 'Checklist com as pausas mais seguras e as pausas que precisam ser ouvidas antes da gravação.'],
    ['#noiseDb', 'Sensibilidade do volume baixo. -35 costuma funcionar bem. -20 aceita mais barulho; -50 exige quase silêncio.'],
    ['#minSilence', 'Tempo mínimo que o som precisa ficar baixo para virar uma pausa candidata.'],
    ['#minAdDuration', 'Menor tempo útil para caber uma narração curta de audiodescrição.'],
    ['#previewMargin', 'Tempo extra tocado antes e depois da pausa quando você usa Ver trecho.'],
    ['#paddingStart', 'Corta um pedacinho do começo da pausa para evitar pegar final de fala.'],
    ['#paddingEnd', 'Corta um pedacinho do final da pausa para evitar pegar início de fala.'],
    ['#detectBtn', 'Analisa o vídeo e monta a lista de intervalos prováveis para audiodescrição.'],
    ['#searchIntervals', 'Procura intervalos pelo título, roteiro ou observações internas.'],
    ['#statusFilter', 'Mostra apenas intervalos com o status escolhido.'],
    ['#addIntervalListBtn', 'Cria manualmente um intervalo no tempo atual do vídeo. Use quando a detecção automática perdeu uma pausa.'],
    ['.export-menu > summary', 'Abre os botões para baixar roteiro, planilha, áudio de audiodescrição ou vídeo final.'],
    ['.history-menu > summary', 'Abre pontos de retorno salvos automaticamente para restaurar uma versão anterior.'],
    ['#refreshHistoryBtn', 'Atualiza a lista de pontos de retorno salvos para este projeto.'],
    ['.help-panel', 'Guia rápido do fluxo principal: enviar vídeo, detectar pausas, revisar, gravar e exportar.'],
    ['.settings-panel', 'Campos que definem como o sistema encontra pausas por som baixo e checagem de fala.'],
    ['.intervals-panel', 'Lista paginada de pausas. Clique em uma pausa para editar o roteiro e gravar a narração.'],
  ];
  tips.forEach(([selector, tip]) => {
    root.querySelectorAll(selector).forEach(element => {
      if (!element.getAttribute('title')) element.setAttribute('title', tip);
    });
  });
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
    state.transcriptionAvailable = !!res.transcription_ok;
    els.healthStatus.classList.toggle('ok', !!res.ffmpeg_ok);
    els.healthStatus.classList.toggle('bad', !res.ffmpeg_ok);
    els.healthStatus.querySelector('strong').textContent = res.ffmpeg_ok ? 'FFmpeg pronto' : 'FFmpeg não encontrado';
    els.healthStatus.querySelector('small').textContent = res.ffmpeg_ok
      ? 'Detecção, checagem de voz e exportações disponíveis.'
      : res.ffmpeg_message;
  } catch (err) {
    state.transcriptionAvailable = false;
    els.healthStatus.classList.add('bad');
    els.healthStatus.querySelector('strong').textContent = 'Erro ao verificar ambiente';
    els.healthStatus.querySelector('small').textContent = err.message;
  }
}

function updateTranscriptStatus(job = null) {
  if (!els.transcriptStatus || !els.transcribeBtn) return;
  const project = state.project;
  if (!project) {
    els.transcribeBtn.disabled = true;
    els.transcribeBtn.textContent = 'Gerar transcrição automática';
    els.transcriptStatus.dataset.state = '';
    els.transcriptStatus.textContent = 'Abra um projeto para gerar a transcrição do vídeo.';
    return;
  }

  const transcript = project.transcript || {};
  const text = transcript.text || '';
  const status = job ? 'running' : (transcript.status || (text.trim() ? 'done' : 'empty'));
  els.transcriptStatus.dataset.state = status;

  if (job) {
    els.transcribeBtn.disabled = true;
    els.transcribeBtn.textContent = 'Transcrevendo...';
    const percent = Math.round(Number(job.percent || 0));
    els.transcriptStatus.textContent = `${percent}% - ${job.details || job.message || 'Transcrição automática em andamento.'}`;
    return;
  }

  if (status === 'running') {
    els.transcribeBtn.disabled = true;
    els.transcribeBtn.textContent = 'Transcrevendo...';
    els.transcriptStatus.textContent = 'Transcrição automática em andamento. Você pode continuar revisando o projeto enquanto ela roda.';
    return;
  }

  if (status === 'done' && text.trim()) {
    els.transcribeBtn.disabled = false;
    els.transcribeBtn.textContent = 'Refazer transcrição automática';
    const count = Number(transcript.segment_count || state.transcriptSegments.length || 0);
    const origin = transcript.source === 'automatic' ? 'automática' : 'manual';
    els.transcriptStatus.textContent = `Transcrição ${origin} pronta${count ? `: ${count} fala(s) com tempo.` : '.'}`;
    return;
  }

  if (status === 'error') {
    els.transcribeBtn.disabled = false;
    els.transcribeBtn.textContent = 'Tentar transcrever novamente';
    els.transcriptStatus.textContent = transcript.error || 'A transcrição automática falhou. Confira as dependências e tente novamente.';
    return;
  }

  els.transcribeBtn.disabled = false;
  els.transcribeBtn.textContent = 'Gerar transcrição automática';
  els.transcriptStatus.textContent = state.transcriptionAvailable
    ? 'A transcrição automática começa ao carregar um vídeo. Você também pode iniciar manualmente aqui.'
    : 'A transcrição automática precisa do faster-whisper instalado no ambiente do app.';
}

async function pollTranscriptJob(jobId) {
  if (!jobId) return;
  state.activeTranscriptJob = jobId;
  try {
    while (state.activeTranscriptJob === jobId) {
      const res = await api(`/api/jobs/${jobId}`);
      const job = res.job;
      updateTranscriptStatus(job);
      if (job.status === 'done') {
        state.activeTranscriptJob = null;
        if (job.result?.project) {
          setProject(job.result.project);
        }
        await loadProjects();
        showToast(job.result?.message || 'Checagem de voz concluída.');
        return;
      }
      if (job.status === 'error') {
        state.activeTranscriptJob = null;
        if (state.project) {
          try {
            const fresh = await api(`/api/projects/${state.project.id}`);
            setProject(fresh.project);
          } catch (_) {
            updateTranscriptStatus();
          }
        }
        showError('Erro na checagem de voz', job.error || 'Não foi possível concluir a checagem de voz.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } catch (err) {
    state.activeTranscriptJob = null;
    updateTranscriptStatus();
    showError('Erro ao acompanhar transcrição', err.message);
  }
}

async function startAutomaticTranscription({ force = false, silent = false, jobId = null } = {}) {
  if (!state.project) return;
  if (jobId) {
    pollTranscriptJob(jobId);
    return;
  }
  if (state.activeTranscriptJob) return;
  if (force && (state.project.transcript?.text || '').trim()) {
    const confirmed = confirm('Refazer a checagem de voz? O resultado atual será substituído.');
    if (!confirmed) return;
  }
  try {
    const res = await api(`/api/projects/${state.project.id}/transcript/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    setProject(res.project);
    if (res.job_id) {
      if (!silent) showToast(res.message || 'Checagem de voz iniciada.');
      pollTranscriptJob(res.job_id);
    } else if (!silent) {
      showToast(res.message || 'Checagem de voz já está pronta.');
    }
  } catch (err) {
    showError('Erro ao iniciar checagem de voz', err.message);
  }
}

function maybeStartAutoTranscription() {
  const project = state.project;
  if (!project || state.autoTranscriptionProjects.has(project.id)) return;
  const transcript = project.transcript || {};
  const status = transcript.status || '';
  if ((transcript.text || '').trim() || ['running', 'done', 'error'].includes(status)) return;
  state.autoTranscriptionProjects.add(project.id);
  startAutomaticTranscription({ silent: true });
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
    const item = document.createElement('article');
    const title = p.title || 'Projeto sem nome';
    const source = p.source_filename || '';
    item.className = 'project-item';
    item.title = 'Projeto salvo neste computador. Clique em Abrir projeto para continuar.';
    item.innerHTML = `
      <button class="project-open" type="button" title="Abre este projeto salvo">
        <strong title="${escapeHtml(title)}">${escapeHtml(shortText(title, 44))}</strong>
        <small title="${escapeHtml(source)}">${escapeHtml(shortText(source, 42))}</small>
        <small>${p.interval_count || 0} intervalos • ${escapeHtml(p.updated_at || '')}</small>
      </button>
      <details class="project-more">
        <summary title="Mostra nome e arquivo completos sem abrir o projeto">Ver mais</summary>
        <div>
          <small><strong>Nome:</strong> ${escapeHtml(title)}</small>
          <small><strong>Arquivo:</strong> ${escapeHtml(source || 'sem arquivo informado')}</small>
        </div>
      </details>
    `;
    item.querySelector('.project-open').addEventListener('click', () => openProject(p.id));
    els.projectList.appendChild(item);
  });
}

function filteredIntervalList() {
  const intervals = state.project?.intervals || [];
  const term = (els.searchIntervals?.value || '').toLowerCase().trim();
  const status = els.statusFilter?.value || '';
  return intervals.filter(interval => {
    const text = `${interval.title || ''} ${interval.script || ''} ${interval.notes || ''}`.toLowerCase();
    const matchesTerm = !term || text.includes(term);
    const matchesStatus = !status || interval.status === status;
    return matchesTerm && matchesStatus;
  });
}

function pageForInterval(index, intervals = filteredIntervalList()) {
  const position = intervals.findIndex(item => Number(item.index) === Number(index));
  if (position < 0) return null;
  return Math.floor(position / Math.max(1, Number(state.intervalPageSize || 10))) + 1;
}

function visibleIntervalIndexes() {
  return Array.from(els.intervalsContainer.querySelectorAll('[data-interval-row]'))
    .map(row => Number(row.dataset.index))
    .filter(Boolean);
}

function showIntervalPage(index, clearFilters = false) {
  let filtered = filteredIntervalList();
  if (!filtered.some(item => Number(item.index) === Number(index))) {
    if (!clearFilters) return false;
    els.searchIntervals.value = '';
    els.statusFilter.value = '';
    filtered = filteredIntervalList();
  }
  const page = pageForInterval(index, filtered);
  if (page) state.intervalPage = page;
  renderIntervals();
  return !!page;
}

function updateSelectedSegmentBar(interval) {
  if (!els.selectedSegmentBar) return;
  const selected = interval === undefined
    ? (state.project?.intervals || []).find(item => Number(item.index) === Number(state.currentIntervalIndex))
    : interval;
  const duration = Number(state.project?.duration || els.videoPlayer.duration || 0);
  if (!selected || !duration) {
    els.selectedSegmentBar.hidden = true;
    if (els.selectedSegmentLabel) els.selectedSegmentLabel.textContent = 'Nenhuma pausa selecionada.';
    return;
  }
  const start = Math.max(0, Number(selected.start || 0));
  const end = Math.max(start, Number(selected.end || start));
  const left = Math.max(0, Math.min(100, (start / duration) * 100));
  const width = Math.max(0.7, Math.min(100 - left, ((end - start) / duration) * 100));
  const endLeft = Math.min(100, left + width);
  els.selectedSegmentBar.hidden = false;
  els.selectedSegmentLabel.textContent = `Pausa ${selected.index}: ${fmt(start)} até ${fmt(end)} (${Number(selected.duration || end - start).toFixed(1)}s)`;
  els.segmentRangeMarker.style.left = `${left}%`;
  els.segmentRangeMarker.style.width = `${width}%`;
  els.segmentStartMarker.style.left = `${left}%`;
  els.segmentEndMarker.style.left = `${endLeft}%`;
  els.selectedSegmentBar.title = `Pausa ${selected.index}: começa em ${fmt(start)} e termina em ${fmt(end)}.`;
}

function goToInterval(index, autoplay = true) {
  if (!state.project) return;
  const interval = (state.project.intervals || []).find(item => Number(item.index) === Number(index));
  if (!interval) return;
  state.currentIntervalIndex = interval.index;
  state.selectedIntervalIndex = interval.index;
  updateSelectedSegmentBar(interval);
  const visible = visibleIntervalIndexes();
  if (!visible.includes(Number(index))) {
    showIntervalPage(index, true);
  } else {
    renderIntervals();
  }
  const detail = document.getElementById(`interval-${index}`) || document.getElementById('intervalDetail');
  if (detail) {
    detail.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    detail.focus({ preventScroll: true });
  }
  if (autoplay) playSegment(interval);
  updateWorkflowPanel();
  renderTimeline();
  renderAudioInsightPanel();
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
    maybeStartAutoTranscription();
    showToast('Projeto aberto.');
  } catch (err) {
    showError('Erro ao abrir projeto', err.message);
  } finally {
    setLoading(false);
  }
}

function setProject(project) {
  state.project = project;
  const savedCurrent = project.workflow?.current_interval || null;
  const hasSavedCurrent = (project.intervals || []).some(interval => Number(interval.index) === Number(savedCurrent));
  state.currentIntervalIndex = hasSavedCurrent ? savedCurrent : project.intervals?.[0]?.index || null;
  state.selectedIntervalIndex = state.currentIntervalIndex;
  state.timelineSelectedGroupIndex = null;
  state.intervalPage = 1;
  state.transcriptSegments = parseTranscript(project.transcript?.text || '');
  els.currentTitle.textContent = project.title || 'Projeto sem nome';
  els.currentMeta.textContent = `${project.source_filename || ''} • duração ${fmt(project.duration || 0)} • ${project.intervals?.length || 0} intervalos`;
  els.videoPlayer.src = `/media/${project.id}/video`;
  els.deleteProjectBtn.disabled = false;
  els.detectBtn.disabled = false;
  els.back2Btn.disabled = false;
  els.playPauseBtn.disabled = false;
  els.forward2Btn.disabled = false;
  if (els.addIntervalAtCurrentBtn) els.addIntervalAtCurrentBtn.disabled = false;
  if (els.addIntervalListBtn) els.addIntervalListBtn.disabled = false;
  if (els.playbackSpeed) els.playbackSpeed.disabled = false;
  els.videoPlayer.playbackRate = Number(els.playbackSpeed?.value || 1);
  if (els.saveNotesBtn) els.saveNotesBtn.disabled = false;
  if (els.projectNotes) els.projectNotes.value = project.notes || '';
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
  updateTranscriptStatus();
  renderTranscriptPreview();
  updateSelectedSegmentBar();
  renderTimeline();
  renderAudioInsightPanel();
  renderIntervals();
  loadHistory();
}

function clearProject() {
  state.project = null;
  state.currentIntervalIndex = null;
  state.selectedIntervalIndex = null;
  state.timelineSelectedGroupIndex = null;
  state.intervalPage = 1;
  state.transcriptSegments = [];
  els.currentTitle.textContent = 'Nenhum projeto aberto';
  els.currentMeta.textContent = 'Crie ou abra um projeto para começar.';
  els.videoPlayer.removeAttribute('src');
  els.videoPlayer.load();
  updateSelectedSegmentBar(null);
  els.deleteProjectBtn.disabled = true;
  els.detectBtn.disabled = true;
  els.back2Btn.disabled = true;
  els.playPauseBtn.disabled = true;
  els.forward2Btn.disabled = true;
  if (els.addIntervalAtCurrentBtn) els.addIntervalAtCurrentBtn.disabled = true;
  if (els.addIntervalListBtn) els.addIntervalListBtn.disabled = true;
  if (els.playbackSpeed) els.playbackSpeed.disabled = true;
  if (els.saveNotesBtn) els.saveNotesBtn.disabled = true;
  els.saveTranscriptBtn.disabled = true;
  els.transcribeBtn.disabled = true;
  els.refreshHistoryBtn.disabled = true;
  els.prevPauseBtn.disabled = true;
  els.nextPendingBtn.disabled = true;
  els.nextPauseBtn.disabled = true;
  els.markReviewedBtn.disabled = true;
  els.exportButtons.forEach(btn => btn.disabled = true);
  if (els.projectNotes) els.projectNotes.value = '';
  els.transcriptText.value = '';
  setHtml(els.transcriptPreview, '');
  setHtml(els.allTranscriptList, '<p class="hint">Cole uma transcrição para ver todas as falas aqui.</p>');
  updateTranscriptStatus();
  els.historyList.className = 'history-list empty';
  els.historyList.textContent = 'Abra um projeto para ver o histórico.';
  updateWorkflowPanel();
  renderTimeline();
  renderAudioInsightPanel();
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

function transcriptOverlapInfo(interval, segment) {
  const rawStart = Number(interval.start || 0);
  const rawEnd = Number(interval.end || rawStart);
  const rawDuration = Math.max(0.01, rawEnd - rawStart);
  const trim = Math.min(0.35, rawDuration * 0.25);
  const start = rawStart + trim;
  const end = Math.max(start + 0.01, rawEnd - trim);
  const bodyDuration = Math.max(0.01, end - start);
  const segStart = Number(segment.start || 0);
  const segEnd = Number(segment.end || segStart + 3);
  const segDuration = Math.max(0.01, segEnd - segStart);
  const overlapStart = Math.max(start, segStart);
  const overlapEnd = Math.min(end, segEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const overlapRatio = overlap / bodyDuration;
  const boundaryPadding = Math.min(0.5, rawDuration * 0.25);
  const boundaryInside = (segStart >= rawStart - boundaryPadding && segStart <= rawEnd + boundaryPadding)
    || (segEnd >= rawStart - boundaryPadding && segEnd <= rawEnd + boundaryPadding);
  const coarseTranscriptBlock = segDuration > Math.max(6, bodyDuration * 2.5);
  const meaningfulOverlap = overlap >= Math.max(0.45, Math.min(1.2, bodyDuration * 0.45));

  return {
    overlap,
    overlapRatio,
    boundaryInside,
    coarseTranscriptBlock,
    meaningful: overlap > 0 && (boundaryInside || (!coarseTranscriptBlock && meaningfulOverlap)),
  };
}

function transcriptDuringInterval(interval) {
  if (!state.transcriptSegments.length) return [];
  return state.transcriptSegments.filter(segment => transcriptOverlapInfo(interval, segment).meaningful);
}

function backgroundInfoForInterval(interval) {
  const stateName = interval.background_state || 'unknown';
  const labels = {
    quiet: 'silêncio quase puro',
    low_background: 'fundo baixo possível',
    active_background: 'fundo audível: ouça antes',
    unknown: 'fundo não analisado',
  };
  const details = {
    quiet: 'A medição de áudio encontrou volume muito baixo nesta pausa.',
    low_background: 'Existe som baixo. Pode ser música, trilha, ambiente ou ruído, então vale ouvir antes.',
    active_background: 'O fundo está audível. Pode ser música, trilha, ambiente ou fala fraca; revise com cuidado.',
    unknown: 'Esta pausa ainda não tem medição de fundo. Rode a detecção novamente para classificar melhor.',
  };
  const className = stateName === 'quiet'
    ? 'quiet'
    : stateName === 'low_background'
      ? 'low-background'
      : stateName === 'active_background'
        ? 'active-background'
        : 'unknown';
  const rms = Number(interval.background_rms_db);
  const peak = Number(interval.background_peak_db);
  const rmsText = Number.isFinite(rms) ? `RMS ${rms.toFixed(1)} dB` : 'RMS sem leitura';
  const peakText = Number.isFinite(peak) ? `pico ${peak.toFixed(1)} dB` : 'pico sem leitura';
  return {
    state: stateName,
    className,
    label: interval.background_label || labels[stateName] || labels.unknown,
    detail: interval.background_detail || details[stateName] || details.unknown,
    rmsText,
    peakText,
  };
}

function audioSeparationForInterval(interval) {
  const speech = transcriptDuringInterval(interval);
  const transcriptReady = state.transcriptSegments.length > 0;
  const usefulDuration = Number(interval.duration || 0);
  const rawDuration = Number(interval.silence_duration || usefulDuration || 0);
  const threshold = Number(state.project?.settings?.noise_db ?? els.noiseDb?.value ?? -35);
  const background = backgroundInfoForInterval(interval);
  const speechState = speech.length ? 'speech' : transcriptReady ? 'clear' : 'unknown';
  const recommendationState = speechState === 'speech'
    ? 'speech'
    : !transcriptReady
      ? 'unknown'
      : background.state === 'active_background' || background.state === 'unknown'
        ? 'caution'
        : 'clear';
  const speechLabel = speechState === 'speech'
    ? 'fala perto da pausa'
    : speechState === 'clear'
      ? 'sem fala relevante'
      : 'sem checagem';
  const recommendationLabel = recommendationState === 'speech'
    ? 'revisar fala antes'
    : recommendationState === 'caution'
      ? 'ouvir fundo antes'
      : recommendationState === 'clear'
        ? 'boa para testar'
        : 'sem checagem';
  return {
    speech,
    transcriptReady,
    usefulDuration,
    rawDuration,
    threshold,
    speechState,
    speechLabel,
    recommendationState,
    recommendationLabel,
    background,
    bedState: background.state,
    bedClass: background.className,
    bedLabel: background.label,
    bedDetail: background.detail,
    bedRmsText: background.rmsText,
    bedPeakText: background.peakText,
  };
}

function audioSplitHtml(interval) {
  const info = audioSeparationForInterval(interval);
  const speechDetail = info.speech.length
    ? 'Existe fala perto desta pausa. Confira antes de gravar para não narrar por cima de alguém.'
    : info.transcriptReady
      ? 'Não encontrei fala relevante nesta pausa. Agora confira o fundo: silêncio limpo é melhor; fundo audível pede revisão.'
      : 'Ainda não há checagem de fala para este projeto. Use como pausa de som baixo e revise no vídeo.';
  return `
    <div class="audio-split ${info.recommendationState}">
      <div class="audio-split-row">
        <span class="audio-pill voice ${info.speechState}">Fala: ${info.speechLabel}</span>
        <span class="audio-pill bed ${info.bedClass}">Fundo: ${info.bedLabel}</span>
        <span class="audio-pill meter">${info.bedRmsText}</span>
      </div>
      <p>${speechDetail}</p>
      <small>${escapeHtml(info.bedDetail)} A ferramenta não reconhece instrumentos por nome; ela mede fundo audível e cruza com a checagem de voz para evitar gravar por cima de falas.</small>
    </div>
  `;
}
function renderAudioInsightPanel() {
  if (!els.audioInsightPanel) return;
  const project = state.project;
  const intervals = project?.intervals || [];
  if (!project) {
    els.audioInsightPanel.innerHTML = `
      <summary title="Abre uma explicação simples de como escolher pausas para gravar">
        <span><strong>Checklist antes de gravar</strong><small>Ajuda a escolher por onde começar.</small></span>
        <span class="summary-action">Ver checklist ▾</span>
      </summary>
      <p class="hint">Abra um projeto para ver quais pausas são melhores para gravar primeiro.</p>
    `;
    return;
  }
  if (!intervals.length) {
    els.audioInsightPanel.innerHTML = `
      <summary title="Abre uma explicação simples de como escolher pausas para gravar">
        <span><strong>Checklist antes de gravar</strong><small>Ajuda a escolher por onde começar.</small></span>
        <span class="summary-action">Ver checklist ▾</span>
      </summary>
      <p class="hint">Clique em detectar pausas. Depois o sistema separa fala, silêncio limpo e fundo audível.</p>
    `;
    return;
  }
  const analyses = intervals.map(interval => audioSeparationForInterval(interval));
  const speechCount = analyses.filter(item => item.recommendationState === 'speech').length;
  const clearCount = analyses.filter(item => item.recommendationState === 'clear').length;
  const cautionCount = analyses.filter(item => item.recommendationState === 'caution').length;
  const unknownCount = analyses.filter(item => item.recommendationState === 'unknown').length;
  const quietCount = analyses.filter(item => item.bedState === 'quiet').length;
  const lowBackgroundCount = analyses.filter(item => item.bedState === 'low_background').length;
  const activeBackgroundCount = analyses.filter(item => item.bedState === 'active_background').length;
  const unmeasuredBackgroundCount = analyses.filter(item => item.bedState === 'unknown').length;
  const threshold = Number(project.settings?.noise_db ?? els.noiseDb?.value ?? -35);
  const clearItems = intervals
    .filter(interval => audioSeparationForInterval(interval).recommendationState === 'clear')
    .sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
    .slice(0, 4);
  const cautionItems = intervals
    .filter(interval => audioSeparationForInterval(interval).recommendationState === 'caution')
    .sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
    .slice(0, 4);
  const attentionItems = intervals
    .filter(interval => audioSeparationForInterval(interval).recommendationState === 'speech')
    .sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0))
    .slice(0, 4);
  const miniButton = (interval, stateClass, note) => {
    const info = audioSeparationForInterval(interval);
    return `<button type="button" data-index="${interval.index}" class="audio-mini ${stateClass}">
        <strong>Pausa ${interval.index}</strong>
        <span>${fmt(interval.start)} - ${Number(interval.duration || 0).toFixed(1)}s</span>
        <small>${note}. ${escapeHtml(info.bedLabel)}</small>
      </button>`;
  };
  const clearHtml = clearItems.length
    ? clearItems.map(interval => miniButton(interval, 'clear', 'verde: boa candidata para gravar')).join('')
    : `<p class="hint">Nenhuma pausa verde ainda. ${unmeasuredBackgroundCount ? 'Este projeto tem pausas com fundo não medido; rode “Detectar pausas automaticamente” de novo para medir o fundo e liberar verdes quando for seguro.' : 'Revise as amarelas e vermelhas antes de gravar.'}</p>`;
  const cautionHtml = cautionItems.length
    ? cautionItems.map(interval => miniButton(interval, 'caution', 'amarela: ouvir fundo antes')).join('')
    : '<p class="hint">Nenhuma pausa amarela encontrada.</p>';
  const speechHtml = attentionItems.length
    ? attentionItems.map(interval => miniButton(interval, 'speech', 'vermelha: fala perto da pausa')).join('')
    : '<p class="hint">Nenhuma pausa vermelha encontrada.</p>';
  els.audioInsightPanel.innerHTML = `
    <summary title="Abre uma explicação simples de como escolher pausas para gravar">
      <span><strong>Checklist antes de gravar</strong><small>Use para decidir quais pausas testar primeiro.</small></span>
      <span class="summary-action">Ver checklist ▾</span>
    </summary>
    <div class="audio-insight-body">
      <div class="audio-insight-header">
        <strong>Resumo simples</strong>
        <span>sensibilidade atual: ${threshold} dB</span>
      </div>
      <p class="audio-purpose"><strong>Como usar:</strong> comece pelas verdes. Se não houver verde, abra uma amarela longa e use “Ver trecho”. Evite gravar nas vermelhas sem ouvir, porque pode ter fala perto da pausa.</p>
      <div class="audio-summary-grid">
        <span title="Total de pausas encontradas pelo sistema"><strong>${intervals.length}</strong> pausas encontradas</span>
        <span title="Verde aparece quando não há fala relevante e o fundo foi medido como seguro"><strong>${clearCount}</strong> verdes: melhores para testar</span>
        <span title="Amarelo quer dizer: não grave direto, ouça o fundo antes"><strong>${cautionCount}</strong> amarelas: ouvir fundo antes</span>
        <span title="Vermelho quer dizer: há fala perto ou dentro da pausa"><strong>${speechCount}</strong> vermelhas: revisar fala</span>
        <span title="Cinza quer dizer que ainda falta checagem de fala"><strong>${unknownCount}</strong> cinzas: falta checagem</span>
        <span title="Medição de fundo já feita pelo FFmpeg"><strong>${quietCount}</strong> fundo limpo · <strong>${lowBackgroundCount + activeBackgroundCount}</strong> com fundo audível · <strong>${unmeasuredBackgroundCount}</strong> sem medição</span>
      </div>
      <p class="audio-purpose">Por que pode não ter verde? Verde exige duas confirmações: sem fala relevante e fundo medido como seguro. Em projetos antigos, muitas pausas ficam amarelas porque o fundo ainda não foi medido.</p>
      <div class="audio-attention-title">Comece por estas, se houver</div>
      <div class="audio-mini-list">${clearHtml}</div>
      <div class="audio-attention-title">Ouça o fundo antes de gravar</div>
      <div class="audio-mini-list">${cautionHtml}</div>
      <div class="audio-attention-title">Revise fala antes de gravar</div>
      <div class="audio-mini-list">${speechHtml}</div>
    </div>
  `;
  els.audioInsightPanel.querySelectorAll('[data-index]').forEach(button => {
    button.addEventListener('click', () => goToInterval(Number(button.dataset.index), true));
  });
}
function timelineGroups(intervals, duration, maxGroups = 48) {
  const groupCount = Math.max(12, Math.min(maxGroups, Math.ceil(duration / 75), Math.max(intervals.length, 1)));
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    index,
    start: (duration / groupCount) * index,
    end: (duration / groupCount) * (index + 1),
    intervals: [],
    speechCount: 0,
    clearCount: 0,
    cautionCount: 0,
    unknownCount: 0,
  }));
  intervals.forEach(interval => {
    const start = Math.max(0, Number(interval.start || 0));
    const groupIndex = Math.max(0, Math.min(groupCount - 1, Math.floor((start / Math.max(duration, 1)) * groupCount)));
    const group = groups[groupIndex];
    const info = audioSeparationForInterval(interval);
    group.intervals.push(interval);
    if (info.recommendationState === 'speech') group.speechCount += 1;
    else if (info.recommendationState === 'caution') group.cautionCount += 1;
    else if (info.recommendationState === 'clear') group.clearCount += 1;
    else group.unknownCount += 1;
  });
  return groups;
}
function timelineRulerHtml(duration) {
  const marks = [0, 0.25, 0.5, 0.75, 1];
  return `<div class="timeline-ruler">${marks.map(mark => `<span>${fmtClock(duration * mark)}</span>`).join('')}</div>`;
}

function timelineCellHtml(group, maxCount, currentIndex, lane, selectedGroupIndex) {
  const first = group.intervals[0];
  const density = first ? Math.max(0.16, group.intervals.length / Math.max(maxCount, 1)).toFixed(2) : '0';
  const hasCurrent = group.intervals.some(interval => Number(interval.index) === Number(currentIndex));
  const selected = Number(group.index) === Number(selectedGroupIndex);
  const checkedCount = group.speechCount + group.clearCount + group.cautionCount;
  const stateClass = !first
    ? 'empty'
    : !checkedCount
      ? 'unknown'
      : group.speechCount >= Math.max(group.clearCount, group.cautionCount)
        ? 'speech'
        : group.cautionCount > group.clearCount
          ? 'caution'
          : 'clear';
  const label = first
    ? `Abrir região: ${group.intervals.length} pausa(s) entre ${fmtClock(group.start)} e ${fmtClock(group.end)}. ${group.clearCount} verdes; ${group.cautionCount} amarelas para ouvir o fundo; ${group.speechCount} vermelhas com fala; ${group.unknownCount} sem checagem.`
    : `Sem pausa entre ${fmtClock(group.start)} e ${fmtClock(group.end)}.`;
  const className = `timeline-cell ${stateClass} ${hasCurrent ? 'current' : ''} ${selected ? 'selected' : ''}`;
  if (!first) {
    return `<span class="${className}" style="--density:${density}" aria-hidden="true"></span>`;
  }
  return `<button class="${className}" type="button" data-group="${group.index}" style="--density:${density}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`;
}
function selectedTimelineGroup(groups) {
  const selected = groups.find(group => Number(group.index) === Number(state.timelineSelectedGroupIndex) && group.intervals.length);
  if (selected) return selected;
  const current = groups.find(group => group.intervals.some(interval => Number(interval.index) === Number(state.currentIntervalIndex)));
  return current || groups.find(group => group.intervals.length) || null;
}

function timelineDetailRulerHtml(group) {
  const span = Math.max(0.01, group.end - group.start);
  const stepCount = Math.min(6, Math.max(3, Math.ceil(span / 20)));
  const marks = Array.from({ length: stepCount + 1 }, (_, index) => group.start + ((span * index) / stepCount));
  return `
    <div class="timeline-detail-ruler" style="--ruler-steps:${marks.length}" aria-hidden="true">
      ${marks.map(mark => `<span>${fmtClock(mark)}</span>`).join('')}
    </div>
  `;
}

function timelineDetailHtml(group) {
  if (!group || !group.intervals.length) return '';
  const span = Math.max(0.01, group.end - group.start);
  const lanes = [];
  const markers = group.intervals.map(interval => {
    const start = Math.max(group.start, Number(interval.start || group.start));
    const end = Math.min(group.end, Math.max(start, Number(interval.end || start)));
    const left = Math.max(0, Math.min(99, ((start - group.start) / span) * 100));
    const rawWidth = ((end - start) / span) * 100;
    const width = Math.max(0.8, Math.min(100 - left, Math.max(3.2, rawWidth)));
    let lane = lanes.findIndex(lastEnd => left >= lastEnd + 1.2);
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(-Infinity);
    }
    lanes[lane] = left + width;
    const info = audioSeparationForInterval(interval);
    const current = Number(interval.index) === Number(state.currentIntervalIndex);
    const label = `Pausa ${interval.index}. ${info.recommendationLabel}. ${info.bedLabel}. Começa em ${fmt(interval.start)}, termina em ${fmt(interval.end)} e tem ${Number(interval.duration || 0).toFixed(1)} segundos. Clique para abrir os detalhes e posicionar o vídeo.`;
    return `<button class="timeline-detail-marker ${info.recommendationState} ${current ? 'current' : ''}" type="button" data-index="${interval.index}" style="left:${left}%; width:${width}%; --lane:${lane};" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span>${interval.index}</span></button>`;
  }).join('');
  const laneCount = Math.max(1, lanes.length);
  return `
    <div class="timeline-detail">
      <div class="timeline-detail-title">
        <strong>Pausas desta parte do vídeo</strong>
        <span>${fmtClock(group.start)} até ${fmtClock(group.end)} | ${group.intervals.length} pausa(s)</span>
      </div>
      ${timelineDetailRulerHtml(group)}
      <div class="timeline-detail-lane" style="--detail-lanes:${laneCount}" aria-label="Pausas individuais da região escolhida">${markers}</div>
      <p>Clique em uma faixa. A largura mostra a duração aproximada, o vídeo vai para o início dela e os detalhes aparecem na lateral.</p>
    </div>
  `;
}
async function openIntervalFromTimelinePause(index) {
  if (!state.project) return;
  const interval = (state.project.intervals || []).find(item => Number(item.index) === Number(index));
  if (!interval) return;
  state.currentIntervalIndex = interval.index;
  state.selectedIntervalIndex = interval.index;
  updateSelectedSegmentBar(interval);
  showIntervalPage(index, true);
  renderTimeline();
  renderAudioInsightPanel();
  await setVideoTime(interval, false, false, { scrollVideo: false });
  const card = document.getElementById(`interval-${interval.index}`);
  if (card) {
    card.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    card.focus({ preventScroll: true });
  }
  showToast(`Vídeo posicionado na pausa ${interval.index}.`);
}

function selectTimelineGroup(groupIndex) {
  state.timelineSelectedGroupIndex = Number(groupIndex);
  renderTimeline();
}

function renderTimeline() {
  if (!els.timelineTrack || !els.timelineStatus) return;
  const project = state.project;
  const intervals = project?.intervals || [];
  const duration = Number(project?.duration || els.videoPlayer.duration || 0);
  if (!project) {
    els.timelineStatus.textContent = 'Abra um projeto para ver a linha do tempo.';
    els.timelineTrack.className = 'timeline-track';
    els.timelineTrack.innerHTML = '<p class="hint">Nenhum projeto aberto.</p>';
    return;
  }
  if (!intervals.length || !duration) {
    els.timelineStatus.textContent = 'Este projeto ainda não tem pausas salvas. Clique em detectar pausas para gerar a linha do tempo.';
    els.timelineTrack.className = 'timeline-track';
    els.timelineTrack.innerHTML = '<p class="hint">Nenhum intervalo detectado ainda.</p>';
    return;
  }

  const groups = timelineGroups(intervals, duration, 48);
  const filledGroups = groups.filter(group => group.intervals.length);
  const maxCount = Math.max(...filledGroups.map(group => group.intervals.length), 1);
  const currentGroup = selectedTimelineGroup(groups);
  if (currentGroup) state.timelineSelectedGroupIndex = currentGroup.index;
  const gridStyle = `grid-template-columns: repeat(${groups.length}, minmax(0, 1fr));`;
  const recommendationCells = groups.map(group => timelineCellHtml(group, maxCount, state.currentIntervalIndex, 'recommendation', state.timelineSelectedGroupIndex)).join('');

  els.timelineStatus.textContent = `${intervals.length} pausa(s) em ${fmtClock(duration)}. Clique numa região para ver as pausas daquela parte.`;
  els.timelineTrack.className = 'timeline-track editor';
  els.timelineTrack.innerHTML = `
    <div class="timeline-editor">
      ${timelineRulerHtml(duration)}
      <div class="timeline-lane-row">
        <span class="timeline-lane-label">regiões</span>
        <div class="timeline-lane recommendation" style="${gridStyle}">${recommendationCells}<i class="timeline-playhead"></i></div>
      </div>
      <div class="timeline-lane-help">Cada bloco junta pausas próximas. Verde = maioria sem fala relevante. Vermelho = maioria com começo/fim de fala perto da pausa. Cinza = sem checagem de fala.</div>
      ${timelineDetailHtml(currentGroup)}
    </div>
  `;
  els.timelineTrack.querySelectorAll('[data-group]').forEach(button => {
    button.addEventListener('click', () => selectTimelineGroup(Number(button.dataset.group)));
  });
  els.timelineTrack.querySelectorAll('.timeline-detail-marker[data-index]').forEach(button => {
    button.addEventListener('click', () => openIntervalFromTimelinePause(Number(button.dataset.index)));
  });
  updateTimelineProgress();
}
function updateTimelineProgress() {
  if (!els.timelineTrack) return;
  const duration = Number(state.project?.duration || els.videoPlayer.duration || 0);
  const percent = duration
    ? Math.max(0, Math.min(100, (Number(els.videoPlayer.currentTime || 0) / duration) * 100))
    : 0;
  const progress = els.timelineTrack.querySelector('.timeline-progress');
  if (progress) progress.style.width = `${percent}%`;
  els.timelineTrack.querySelectorAll('.timeline-playhead').forEach(playhead => {
    playhead.style.left = `${percent}%`;
  });
}

function renderTranscriptBlock(title, segments) {
  if (!segments.length) return '';
  const items = segments.map(seg => `<li><strong>${fmt(seg.start)}</strong> ${escapeHtml(seg.text)}</li>`).join('');
  return `<div class="transcript-block"><strong>${title}</strong><ul>${items}</ul></div>`;
}

function scrollToVideoPanel() {
  if (!els.videoPanel) return;
  els.videoPanel.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'start' });
  els.videoPanel.classList.add('attention');
  setTimeout(() => els.videoPanel.classList.remove('attention'), 900);
}

function scrollToTranscriptPanel() {
  const panel = document.querySelector('.transcript-panel');
  if (!panel) return;
  panel.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function clearSegmentPreviewStopper() {
  if (!state.segmentPreviewStopper) return;
  const { video, handler, fallback } = state.segmentPreviewStopper;
  if (video && handler) video.removeEventListener('timeupdate', handler);
  if (fallback) clearTimeout(fallback);
  state.segmentPreviewStopper = null;
}

function waitForSeek(video, start) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      video.removeEventListener('canplay', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    video.addEventListener('canplay', finish);
    video.currentTime = start;
    setTimeout(finish, 500);
  });
}

async function setVideoTime(interval, shouldPlay, includePreviewMargin = false, options = {}) {
  clearSegmentPreviewStopper();
  const margin = includePreviewMargin ? Number(els.previewMargin.value || 2) : 0;
  const start = Math.max(0, Number(interval.start || 0) - margin);
  const video = els.videoPlayer;
  video.pause();
  await waitForSeek(video, start);
  if (shouldPlay) {
    try {
      await video.play();
    } catch (_) {
      showToast('Clique no player para iniciar o trecho.');
    }
  } else {
    video.pause();
  }
  if (options.scrollVideo !== false) scrollToVideoPanel();
}

function transcriptContextHtml(interval) {
  const fullButton = '<div class="transcript-context-actions"><button class="button transcript-full-btn" type="button" data-action="transcript-full">Ver transcrição completa</button></div>';
  const transcript = state.project?.transcript || {};
  const transcriptText = transcript.text || '';
  if (!transcriptText.trim()) {
    if (transcript.status === 'running') {
      return `<p class="hint">A transcrição automática ainda está rodando. Quando terminar, os detalhes da pausa mostrarão as falas antes e depois.</p>${fullButton}`;
    }
    if (transcript.status === 'error') {
      return `<p class="hint">A transcrição automática falhou. Use o painel de transcrição para tentar novamente.</p>${fullButton}`;
    }
    return `<p class="hint">Sem transcrição salva para este projeto. O app tenta gerar automaticamente ao carregar o vídeo.</p>${fullButton}`;
  }
  if (!state.transcriptSegments.length) {
    return `<p class="hint">A transcrição foi salva sem tempos reconhecíveis. Use a busca geral na seção de transcrição.</p>${fullButton}`;
  }
  const context = transcriptAround(interval, els.transcriptContextSeconds.value || 10);
  const html = [
    renderTranscriptBlock('Antes da pausa', context.before),
    renderTranscriptBlock('Durante a pausa', context.during),
    renderTranscriptBlock('Depois da pausa', context.after),
  ].filter(Boolean).join('');
  const content = html || '<p class="hint">Nenhuma fala com tempo próximo a esta pausa.</p>';
  return `${content}${fullButton}`;
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
    if (res.transcription_job_id) {
      startAutomaticTranscription({ jobId: res.transcription_job_id, silent: true });
    } else {
      maybeStartAutoTranscription();
    }
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
  const confirmed = confirm('Excluir este projeto de vez? Isso apaga o vídeo, gravações, histórico e exportações salvas na pasta dele.');
  if (!confirmed) return;
  setLoading(true, 'Excluindo projeto...', 'Removendo arquivos locais do projeto.', 20);
  try {
    await api(`/api/projects/${state.project.id}`, { method: 'DELETE' });
    clearProject();
    await loadProjects();
    showToast('Projeto excluído junto com os arquivos gerados.');
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

async function playSegment(interval) {
  clearSegmentPreviewStopper();
  const margin = Number(els.previewMargin.value || 2);
  const video = els.videoPlayer;
  const start = Math.max(0, Number(interval.start || 0) - margin);
  const stopAt = Number(interval.end || 0) + margin;
  video.pause();
  await waitForSeek(video, start);
  scrollToVideoPanel();
  const onTimeUpdate = () => {
    if (video.currentTime >= stopAt) {
      video.pause();
      clearSegmentPreviewStopper();
    }
  };
  const fallback = setTimeout(() => {
    if (!video.paused) video.pause();
    clearSegmentPreviewStopper();
  }, Math.max(1000, (stopAt - start + 0.4) * 1000));
  state.segmentPreviewStopper = { video, handler: onTimeUpdate, fallback };
  video.addEventListener('timeupdate', onTimeUpdate);
  try {
    await video.play();
  } catch (_) {
    showToast('Clique no player para iniciar o trecho.');
  }
}

function jumpToStart(interval) {
  setVideoTime(interval, true, false);
}

function positionAtStart(interval) {
  setVideoTime(interval, false, false);
  showToast('Vídeo posicionado na pausa, sem iniciar.');
}

function renderIntervalPager(total, pageItemsCount, startNumber, endNumber) {
  if (!els.intervalPager) return;
  const pageSize = Number(state.intervalPageSize || 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) {
    els.intervalPager.hidden = true;
    els.intervalPager.innerHTML = '';
    return;
  }
  els.intervalPager.hidden = false;
  const pageOptions = [5, 10, 15, 20, 30, 50].map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size} por página</option>`).join('');
  els.intervalPager.innerHTML = `
    <div class="pager-info">Mostrando ${startNumber}-${endNumber} de ${total} intervalo(s). Página ${state.intervalPage} de ${totalPages}.</div>
    <div class="pager-actions">
      <button class="button" type="button" data-page="prev" ${state.intervalPage <= 1 ? 'disabled' : ''} title="Mostra a página anterior de intervalos">Anterior</button>
      <select class="input page-size-input" data-page-size title="Quantidade de intervalos carregados por vez para evitar lentidão">
        ${pageOptions}
      </select>
      <button class="button" type="button" data-page="next" ${state.intervalPage >= totalPages ? 'disabled' : ''} title="Mostra a próxima página de intervalos">Próxima</button>
    </div>
  `;
  els.intervalPager.querySelector('[data-page="prev"]')?.addEventListener('click', () => {
    state.intervalPage = Math.max(1, state.intervalPage - 1);
    renderIntervals();
    els.intervalPager.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'center' });
  });
  els.intervalPager.querySelector('[data-page="next"]')?.addEventListener('click', () => {
    state.intervalPage = Math.min(totalPages, state.intervalPage + 1);
    renderIntervals();
    els.intervalPager.scrollIntoView({ behavior: state.visualPrefs.reducedMotion ? 'auto' : 'smooth', block: 'center' });
  });
  els.intervalPager.querySelector('[data-page-size]')?.addEventListener('change', (event) => {
    state.intervalPageSize = Number(event.currentTarget.value || 10);
    state.intervalPage = 1;
    renderIntervals();
  });
}

function intervalSourceLabel(interval) {
  const source = String(interval.detection_source || '').toLowerCase();
  if (source.includes('manual')) return 'adicionado manualmente';
  if (source.includes('fala') && source.includes('som')) return 'som baixo + espaço entre falas';
  if (source.includes('fala')) return 'espaço entre falas';
  return 'som baixo';
}

function intervalRecommendationText(info) {
  if (info.recommendationState === 'clear') return 'Boa candidata';
  if (info.recommendationState === 'caution') return 'Ouça o fundo';
  if (info.recommendationState === 'speech') return 'Revisar fala';
  return 'Falta checagem';
}

function intervalReasonText(info) {
  if (info.recommendationState === 'clear') return 'A checagem não encontrou fala relevante nessa pausa.';
  if (info.recommendationState === 'caution' && info.bedState === 'unknown') return 'Não há fala relevante, mas o fundo ainda não foi medido. Ouça antes de gravar.';
  if (info.recommendationState === 'caution') return 'Não há fala relevante, mas existe fundo audível. Ouça antes de gravar.';
  if (info.recommendationState === 'speech') return 'Existe fala perto ou dentro da pausa. Revise antes de gravar.';
  return 'A pausa foi encontrada, mas ainda falta checar fala/transcrição.';
}

function intervalRowHtml(interval) {
  const info = audioSeparationForInterval(interval);
  const selected = Number(interval.index) === Number(state.selectedIntervalIndex || state.currentIntervalIndex);
  const title = interval.title || `Audiodescrição ${interval.index}`;
  return `
    <button class="interval-row ${selected ? 'current' : ''} ${info.recommendationState}" type="button" data-interval-row data-index="${interval.index}" aria-current="${selected ? 'true' : 'false'}" title="Abrir detalhes da pausa ${interval.index}">
      <span class="interval-row-main">
        <strong>Pausa ${interval.index}</strong>
        <span>${escapeHtml(title)}</span>
      </span>
      <span class="interval-row-meta">${fmt(interval.start)} · ${Number(interval.duration || 0).toFixed(1)}s · ${intervalSourceLabel(interval)}</span>
      <span class="interval-row-chips">
        <span class="rec-chip ${info.recommendationState}">${intervalRecommendationText(info)}</span>
        <span class="status-chip">${statusLabel(interval.status || 'pendente')}</span>
        <span class="row-open">Ver detalhes</span>
      </span>
    </button>
  `;
}

function intervalDetailHtml(project, interval) {
  const info = audioSeparationForInterval(interval);
  const badgeClass = interval.quality || 'curto';
  const recordingAudio = interval.recording_filename
    ? `<audio class="recording-preview" controls src="/media/${project.id}/recordings/${encodeURIComponent(interval.recording_filename)}"></audio>`
    : '<p class="hint">Nenhuma gravação enviada ainda.</p>';
  const warning = interval.warning ? `<div class="interval-warning">${escapeHtml(interval.warning)}</div>` : '';
  const title = interval.title || `Audiodescrição ${interval.index}`;
  return `
    <article class="interval-detail-card ${info.recommendationState}" id="interval-${interval.index}" data-index="${interval.index}" tabindex="-1" aria-live="polite">
      <header class="interval-detail-header">
        <div>
          <span class="badge ${badgeClass}">${escapeHtml(interval.quality || '')}</span>
          <h3>Pausa ${interval.index}: ${escapeHtml(title)}</h3>
          <p class="interval-meta">
            Começa em <strong>${fmt(interval.start)}</strong>, termina em <strong>${fmt(interval.end)}</strong> e tem <strong>${Number(interval.duration || 0).toFixed(2)}s</strong>.
            Origem: ${escapeHtml(intervalSourceLabel(interval))}.
          </p>
          <p class="interval-detail-reason">${escapeHtml(intervalReasonText(info))}</p>
        </div>
        <button class="button danger" data-action="delete-interval" title="Remove este intervalo da lista">Excluir intervalo</button>
      </header>

      <div class="interval-actions">
        <button class="button" data-action="play" title="Toca este trecho com a margem configurada, para revisar o contexto">Ver trecho</button>
        <button class="button" data-action="jump" title="Vai para o início útil da pausa e começa o vídeo">Ir ao início</button>
        <button class="button" data-action="position" title="Posiciona o vídeo no início da pausa sem tocar">Posicionar e pausar</button>
        <button class="button" data-action="mark-current" title="Marca este intervalo como o atual da revisão">Usar como atual</button>
      </div>

      <details class="interval-more" open>
        <summary>Editar roteiro e status</summary>
        <div class="status-row">
          <label>Título
            <input class="input title-input" value="${escapeHtml(interval.title || '')}">
          </label>
          <label>Status
            <select class="input status-input" title="Use o status para controlar o andamento deste intervalo">
              ${['pendente','roteirizado','gravado','revisado','descartado'].map(s => `<option value="${s}" ${interval.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label>Roteiro da audiodescrição
          <textarea class="textarea script-input" rows="4" placeholder="Escreva aqui o que será narrado nesse intervalo...">${escapeHtml(interval.script || '')}</textarea>
        </label>
        <label>Observações internas
          <textarea class="textarea notes-input" rows="2" placeholder="Ex.: regravar mais curto, validar com a turma, som ambiente importante...">${escapeHtml(interval.notes || '')}</textarea>
        </label>
        <div class="save-row">
          <button class="button primary" data-action="save" title="Salva este intervalo; alterações também ficam em autosave">Salvar intervalo</button>
          <span class="autosave-state" aria-live="polite">Salvo no histórico local.</span>
        </div>
      </details>

      <details class="interval-more">
        <summary>Ver análise de fala e fundo</summary>
        ${audioSplitHtml(interval)}
      </details>

      <details class="interval-more">
        <summary>Gravar ou revisar narração</summary>
        <div class="interval-actions">
          <button class="button record" data-action="record" title="Grava sua narração para este intervalo">● Gravar</button>
          <button class="button" data-action="delete-recording" title="Remove a gravação salva neste intervalo" ${interval.recording_filename ? '' : 'disabled'}>Remover gravação</button>
        </div>
        ${recordingAudio}
        ${warning}
      </details>
    </article>
  `;
}

function bindIntervalDetail(interval) {
  const card = document.getElementById(`interval-${interval.index}`);
  if (!card) return;
  card.querySelector('[data-action="play"]')?.addEventListener('click', () => playSegment(interval));
  card.querySelector('[data-action="jump"]')?.addEventListener('click', () => jumpToStart(interval));
  card.querySelector('[data-action="position"]')?.addEventListener('click', () => positionAtStart(interval));
  card.querySelector('[data-action="mark-current"]')?.addEventListener('click', () => goToInterval(interval.index, false));
  card.querySelector('[data-action="save"]')?.addEventListener('click', () => saveInterval(interval.index, card));
  card.querySelector('[data-action="record"]')?.addEventListener('click', (ev) => toggleRecording(interval.index, ev.currentTarget));
  card.querySelector('[data-action="delete-recording"]')?.addEventListener('click', () => deleteRecording(interval.index));
  card.querySelector('[data-action="delete-interval"]')?.addEventListener('click', () => deleteInterval(interval.index));
  card.querySelectorAll('.title-input, .status-input, .script-input, .notes-input').forEach(input => {
    input.addEventListener('input', () => scheduleIntervalSave(interval.index, card));
    input.addEventListener('change', () => scheduleIntervalSave(interval.index, card, 250));
  });
}

function renderIntervals() {
  const project = state.project;
  const intervals = project?.intervals || [];
  const filtered = filteredIntervalList();

  if (!project) {
    if (els.intervalPager) els.intervalPager.hidden = true;
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum projeto aberto.</h3><p>Crie ou abra um projeto para começar.</p>';
    return;
  }
  if (!intervals.length) {
    if (els.intervalPager) els.intervalPager.hidden = true;
    updateSelectedSegmentBar(null);
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum intervalo detectado ainda.</h3><p>Clique em “Detectar pausas automaticamente” ou use “Adicionar intervalo aqui” no vídeo.</p>';
    return;
  }
  if (!filtered.length) {
    if (els.intervalPager) els.intervalPager.hidden = true;
    els.intervalsContainer.className = 'intervals empty-state';
    els.intervalsContainer.innerHTML = '<h3>Nenhum intervalo encontrado com esse filtro.</h3><p>Limpe a busca ou mude o status.</p>';
    return;
  }

  const pageSize = Math.max(1, Number(state.intervalPageSize || 10));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.intervalPage = Math.max(1, Math.min(totalPages, Number(state.intervalPage || 1)));
  const start = (state.intervalPage - 1) * pageSize;
  const pageIntervals = filtered.slice(start, start + pageSize);
  const end = start + pageIntervals.length;
  renderIntervalPager(filtered.length, pageIntervals.length, start + 1, end);

  let selected = pageIntervals.find(item => Number(item.index) === Number(state.selectedIntervalIndex))
    || pageIntervals.find(item => Number(item.index) === Number(state.currentIntervalIndex))
    || pageIntervals[0];
  state.selectedIntervalIndex = selected.index;
  state.currentIntervalIndex = state.currentIntervalIndex || selected.index;
  updateSelectedSegmentBar(selected);

  els.intervalsContainer.className = 'intervals interval-workbench';
  els.intervalsContainer.innerHTML = `
    <div class="interval-list-panel">
      <div class="interval-list-header">
        <strong>Fila de revisão</strong>
        <span>Clique em uma pausa. O vídeo vai para o tempo certo e os detalhes aparecem ao lado.</span>
      </div>
      <div class="interval-list" role="listbox" aria-label="Intervalos encontrados">
        ${pageIntervals.map(intervalRowHtml).join('')}
      </div>
    </div>
    ${intervalDetailHtml(project, selected)}
  `;

  els.intervalsContainer.querySelectorAll('[data-interval-row]').forEach(row => {
    row.addEventListener('click', async () => {
      const index = Number(row.dataset.index);
      const interval = (state.project?.intervals || []).find(item => Number(item.index) === index);
      if (!interval) return;
      goToInterval(index, false);
      await setVideoTime(interval, false, false, { scrollVideo: false });
    });
  });
  bindIntervalDetail(selected);
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

async function addIntervalAtCurrentTime() {
  if (!state.project) return;
  const video = els.videoPlayer;
  const start = Math.max(0, Number(video.currentTime || 0));
  const projectDuration = Number(state.project.duration || video.duration || 0);
  const desiredDuration = Math.max(0.8, Number(els.minAdDuration?.value || 0.8));
  const end = projectDuration ? Math.min(projectDuration, start + desiredDuration) : start + desiredDuration;
  if (end <= start) {
    showToast('Não há espaço suficiente nesse ponto do vídeo.');
    return;
  }
  try {
    const res = await api(`/api/projects/${state.project.id}/intervals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start,
        end,
        duration: end - start,
        title: 'Intervalo manual',
      }),
    });
    setProject(res.project);
    if (res.interval?.index) {
      showIntervalPage(res.interval.index, true);
      goToInterval(res.interval.index, false);
    }
    showToast('Intervalo manual adicionado.');
  } catch (err) {
    showError('Erro ao adicionar intervalo', err.message);
  }
}

async function deleteInterval(index) {
  if (!state.project) return;
  const okToDelete = window.confirm(`Excluir a pausa ${index}? A gravação desse intervalo também será removida.`);
  if (!okToDelete) return;
  try {
    const res = await api(`/api/projects/${state.project.id}/intervals/${index}`, { method: 'DELETE' });
    setProject(res.project);
    showToast('Intervalo excluído.');
  } catch (err) {
    showError('Erro ao excluir intervalo', err.message);
  }
}

async function saveNotes() {
  if (!state.project || !els.projectNotes) return;
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
    setHtml(els.transcriptPreview, '<p class="hint">Nenhuma transcrição salva ainda.</p>');
    setHtml(els.allTranscriptList, '<p class="hint">Cole uma transcrição para ver todas as falas aqui.</p>');
    return;
  }
  if (!segments.length) {
    setHtml(els.transcriptPreview, '<p class="hint">Texto salvo. Para mostrar contexto por pausa, use tempos como 00:01:23 ou SRT/VTT.</p>');
    setHtml(els.allTranscriptList, `<pre class="transcript-raw">${escapeHtml(text)}</pre>`);
    return;
  }
  const matches = segments
    .filter(seg => !term || seg.text.toLowerCase().includes(term))
    .slice(0, 12);
  if (!matches.length) {
    setHtml(els.transcriptPreview, '<p class="hint">Nenhum trecho encontrado nessa busca.</p>');
    setHtml(els.allTranscriptList, '<p class="hint">Nenhuma fala encontrada para essa busca.</p>');
    return;
  }
  setHtml(els.transcriptPreview, matches.map(seg => `
    <button class="transcript-hit" type="button" data-time="${seg.start}">
      <strong>${fmt(seg.start)}</strong>
      <span>${escapeHtml(seg.text)}</span>
    </button>
  `).join(''));
  const fullMatches = segments.filter(seg => !term || seg.text.toLowerCase().includes(term));
  setHtml(els.allTranscriptList, `
    <div class="transcript-count">${fullMatches.length} fala(s) ${term ? 'encontrada(s)' : 'na transcrição'}.</div>
    ${fullMatches.map(seg => `
      <button class="transcript-hit transcript-full-hit" type="button" data-time="${seg.start}">
        <strong>${fmt(seg.start)}${seg.end ? ` até ${fmt(seg.end)}` : ''}</strong>
        <span>${escapeHtml(seg.text)}</span>
      </button>
    `).join('')}
  `);
  document.querySelectorAll('.transcript-hit').forEach(button => {
    button.addEventListener('click', () => {
      els.videoPlayer.currentTime = Number(button.dataset.time || 0);
      els.videoPlayer.pause();
      scrollToVideoPanel();
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
  history = (history || []).filter(item => !/transcri/i.test(String(item.reason || '')));
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
    clearSegmentPreviewStopper();
    els.videoPlayer.currentTime = Math.max(0, els.videoPlayer.currentTime - 2);
  });
  els.forward2Btn.addEventListener('click', () => {
    clearSegmentPreviewStopper();
    els.videoPlayer.currentTime = Math.min(els.videoPlayer.duration || Infinity, els.videoPlayer.currentTime + 2);
  });
  els.playPauseBtn.addEventListener('click', () => {
    clearSegmentPreviewStopper();
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
  els.transcribeBtn.addEventListener('click', () => {
    const force = !!(state.project?.transcript?.text || '').trim();
    startAutomaticTranscription({ force });
  });
  els.deleteProjectBtn.addEventListener('click', deleteCurrentProject);
  els.saveNotesBtn?.addEventListener('click', saveNotes);
  els.projectNotes?.addEventListener('input', () => {
    clearTimeout(state.notesSaveTimer);
    state.notesSaveTimer = setTimeout(() => {
      if (state.project) saveNotes();
    }, 1600);
  });
  els.saveTranscriptBtn.addEventListener('click', saveTranscript);
  els.refreshHistoryBtn.addEventListener('click', loadHistory);
  els.transcriptSearch.addEventListener('input', renderTranscriptPreview);
  els.transcriptContextSeconds.addEventListener('change', () => {
    renderIntervals();
    renderTimeline();
    renderAudioInsightPanel();
  });
  els.transcriptText.addEventListener('input', () => {
    renderTranscriptPreview();
    renderIntervals();
    renderTimeline();
    renderAudioInsightPanel();
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
  els.addIntervalAtCurrentBtn?.addEventListener('click', addIntervalAtCurrentTime);
  els.addIntervalListBtn?.addEventListener('click', addIntervalAtCurrentTime);
  els.markReviewedBtn.addEventListener('click', markCurrentReviewed);
  els.exportButtons.forEach(btn => btn.addEventListener('click', () => exportFile(btn.dataset.export)));
  els.searchIntervals.addEventListener('input', () => { state.intervalPage = 1; renderIntervals(); });
  els.statusFilter.addEventListener('change', () => { state.intervalPage = 1; renderIntervals(); });
  els.videoPlayer.addEventListener('seeking', () => {
    if (state.segmentPreviewStopper) clearSegmentPreviewStopper();
  });
  els.videoPlayer.addEventListener('timeupdate', updateTimelineProgress);
  els.videoPlayer.addEventListener('loadedmetadata', renderTimeline);
  els.playbackSpeed?.addEventListener('change', () => {
    els.videoPlayer.playbackRate = Number(els.playbackSpeed.value || 1);
    showToast(`Velocidade do vídeo: ${els.playbackSpeed.value}x.`);
  });
  els.dismissErrorBtn.addEventListener('click', hideError);
  els.closeLoadingBtn.addEventListener('click', () => setLoading(false));
  setupPlayerButtons();
}

async function init() {
  applyVisualPrefs();
  applyTooltips();
  bindEvents();
  await checkHealth();
  await loadProjects();
}

init();
