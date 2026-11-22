(() => {
  let state = null;
  let selectedPlatform = 'auto';
  let customSounds = [];
  let memesList = [];
  let userPlaylists = [];
  const expandedPlaylistIds = new Set();
  let memeRegion = 'ru';
  let eventSource = null;
  let lastProgressSec = 0;
  let lastProgressSyncAt = 0;
  let volumeDebounce = null;
  let dragFromIndex = null;

  const $ = (id) => document.getElementById(id);

  // ==================== Утилиты ====================
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showToast(msg, type = 'info') {
    const box = $('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, 4000);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Ошибка сервера (${res.status})`);
    }
    return data;
  }

  function showView(viewId) {
    ['loading-view', 'login-view', 'denied-view', 'app-view'].forEach((id) => {
      $(id).classList.toggle('hidden', id !== viewId);
    });
  }

  // ==================== Инициализация и авторизация ====================
  async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('authError');
    if (authError) {
      const banner = $('auth-error-banner');
      const messages = {
        expired: 'Ссылка для входа устарела или уже использована. Запросите новую командой /web.',
        no_oauth: 'Discord OAuth2 ещё не настроен в .env — используйте мгновенный вход командой /web.',
        invalid_state: 'Ошибка проверки состояния OAuth2. Попробуйте ещё раз.',
        oauth_failed: 'Не удалось авторизоваться через Discord.',
      };
      banner.textContent = messages[authError] || 'Ошибка авторизации.';
      banner.classList.remove('hidden');
      window.history.replaceState({}, '', '/');
    }

    try {
      const info = await api('/api/auth/info');
      $('magic-prefix-hint').textContent = `${info.prefix || '+'}web`;
      if (info.oauthEnabled) {
        $('discord-oauth-btn').classList.remove('hidden');
      }

      if (!info.authenticated) {
        showView('login-view');
        return;
      }

      const initialState = await api('/api/state');
      handleStateUpdate(initialState);
      connectSSE();
      loadCustomSounds();
      loadMemes();
      loadPlaylists();
    } catch (err) {
      showView('login-view');
    }
  }

  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/events');

    eventSource.addEventListener('state', (e) => {
      try {
        const nextState = JSON.parse(e.data);
        handleStateUpdate(nextState);
      } catch {}
    });

    eventSource.addEventListener('sounds', () => {
      loadCustomSounds();
    });

    eventSource.addEventListener('playlists', () => {
      loadPlaylists();
    });

    eventSource.onerror = () => {
      // EventSource переподключается сам
    };
  }

  // ==================== Отрисовка состояния ====================
  function handleStateUpdate(nextState) {
    const prevGuildId = state?.guildId;
    state = nextState;

    if (!state.user.inGuild || !state.user.hasAccess) {
      $('denied-reason').textContent = !state.user.inGuild
        ? 'Вы не состоите ни на одном сервере, куда добавлен этот бот.'
        : `Для доступа к панели на сервере "${state.guildName}" требуется роль: ${state.user.requiredRoleName || state.user.requiredRoleId}.`;
      showView('denied-view');
      return;
    }

    showView('app-view');

    // Шапка и профиль
    const guilds = nextState.guilds || [];
    const guildSelect = $('guild-select');
    const guildNameEl = $('guild-name');

    if (guilds.length > 1) {
      guildNameEl.classList.add('hidden');
      guildSelect.classList.remove('hidden');
      guildSelect.innerHTML = guilds
        .map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === nextState.guildId ? 'selected' : ''}>${g.inVoice ? '🔊 ' : ''}${escapeHtml(g.name)}</option>`)
        .join('');
    } else {
      guildSelect.classList.add('hidden');
      guildNameEl.classList.remove('hidden');
      guildNameEl.textContent = nextState.guildName || 'Discord Server';
    }

    if (prevGuildId && prevGuildId !== nextState.guildId) {
      loadCustomSounds();
      if (nextState.user.isAdmin) loadAdminSettings();
    }

    $('user-name').textContent = state.user.displayName;
    if (state.user.avatarUrl) $('user-avatar').src = state.user.avatarUrl;
    $('user-role-badge').classList.toggle('hidden', !state.user.isAdmin);
    $('admin-tab-btn').classList.toggle('hidden', !state.user.isAdmin);

    // Голосовой статус
    const inVoice = Boolean(state.voice?.inVoice);
    const worker = state.myWorker;
    const pill = $('voice-pill');
    pill.className = `voice-pill ${inVoice ? 'voice-online' : 'voice-offline'}`;

    if (inVoice) {
      $('voice-pill-text').textContent = worker
        ? `🔊 ${state.voice.channelName} • ${worker.name}`
        : `🔊 ${state.voice.channelName} (агент не вызван)`;
    } else {
      $('voice-pill-text').textContent = 'Вы не в голосовом канале';
    }

    $('no-voice-banner').classList.toggle('hidden', inVoice);

    // Кнопка "Позвать агента"
    const summonBtn = $('summon-btn');
    if (inVoice && !worker) {
      summonBtn.classList.remove('hidden');
      summonBtn.disabled = state.pool.availableCount === 0;
      summonBtn.textContent =
        state.pool.availableCount > 0
          ? `🎙️ Позвать агента (свободно ${state.pool.availableCount})`
          : '⚠️ Все агенты заняты';
    } else {
      summonBtn.classList.add('hidden');
    }

    // Блокировка формы добавления треков вне войса
    $('play-query').disabled = !inVoice;
    $('play-submit-btn').disabled = !inVoice;

    // Обновление бейджа агентов
    const freeCount = state.pool.availableCount;
    const totalCount = state.pool.totalCount;
    $('agents-count-badge').textContent = `${totalCount - freeCount}/${totalCount}`;

    renderPlayer(inVoice, worker);
    renderQueue(inVoice, worker);
    renderAgents(state.pool);
    renderPlaylists();
    // Обновляем состояние кнопок саундборда (доступность в войсе)
    renderCustomSounds();
    renderMemes();
  }

  function renderPlayer(inVoice, worker) {
    const hasTrack = Boolean(worker && worker.currentTrack);
    const canControl = inVoice && Boolean(worker);

    const agentTag = $('active-agent-tag');
    if (worker) {
      agentTag.textContent = `🎙️ ${worker.name} (${worker.tag})`;
      agentTag.classList.remove('hidden');
    } else {
      agentTag.classList.add('hidden');
    }

    // Баннер проигрываемого SFX
    const sfxBanner = $('sfx-banner');
    if (worker?.activeSfxName) {
      sfxBanner.textContent = `🔊 Сейчас проигрывается звук: ${worker.activeSfxName}`;
      sfxBanner.classList.remove('hidden');
    } else {
      sfxBanner.classList.add('hidden');
    }

    // Таймеры автовыхода
    const timerBanner = $('auto-leave-banner');
    if (worker?.emptyLeaveAt) {
      const rem = Math.max(0, Math.ceil((worker.emptyLeaveAt - Date.now()) / 1000));
      timerBanner.textContent = `⏳ В канале нет людей — агент выйдет через ${formatDuration(rem)}`;
      timerBanner.classList.remove('hidden');
    } else if (worker?.idleLeaveAt) {
      const rem = Math.max(0, Math.ceil((worker.idleLeaveAt - Date.now()) / 1000));
      timerBanner.textContent = `⏱️ Нет воспроизведения — агент выйдет через ${formatDuration(rem)}`;
      timerBanner.classList.remove('hidden');
    } else {
      timerBanner.classList.add('hidden');
    }

    $('np-empty').classList.toggle('hidden', hasTrack);
    $('np-content').classList.toggle('hidden', !hasTrack);

    if (hasTrack) {
      const t = worker.currentTrack;
      $('np-title').textContent = t.title;
      $('np-title').href = t.originalUrl || '#';
      $('np-author').textContent = t.author || '';
      $('np-requester').textContent = `Запросил: ${t.requestedBy?.tag || 'Неизвестно'}`;
      $('np-thumb').src = t.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect fill="%23222635" width="80" height="80"/><text x="40" y="50" text-anchor="middle" font-size="32">🎵</text></svg>';

      const srcEl = $('np-source');
      srcEl.className = `source-badge ${t.source}`;
      srcEl.textContent =
        t.source === 'spotify' ? '🟢 Spotify' : t.source === 'soundcloud' ? '🟠 SoundCloud' : '🔴 YouTube';

      lastProgressSec = worker.progressSec || 0;
      lastProgressSyncAt = Date.now();
      updateProgressUI();
    }

    // Кнопки управления
    const pauseBtn = $('btn-pause-resume');
    pauseBtn.disabled = !canControl || !hasTrack;
    pauseBtn.textContent = worker?.isPaused ? '▶ Продолжить' : '⏸ Пауза';

    $('btn-skip').disabled = !canControl || !hasTrack;
    $('btn-shuffle').disabled = !canControl || (worker?.queue?.length || 0) < 2;
    $('btn-stop').disabled = !canControl;

    const loopBtn = $('btn-loop');
    loopBtn.disabled = !canControl;
    const loopMode = worker?.loopMode || 'off';
    loopBtn.textContent =
      loopMode === 'track' ? '🔂 Трек' : loopMode === 'queue' ? '🔁 Очередь' : '🔁 Выкл';

    const slider = $('volume-slider');
    slider.disabled = !canControl;
    if (document.activeElement !== slider && worker) {
      slider.value = String(worker.volume ?? 80);
      $('volume-value').textContent = `${worker.volume ?? 80}%`;
    }
  }

  function updateProgressUI() {
    if (!state?.myWorker?.currentTrack) return;
    const w = state.myWorker;
    const total = w.currentTrack.durationSec || 0;
    let current = lastProgressSec;
    if (!w.isPaused && !w.activeSfxName) {
      current += Math.floor((Date.now() - lastProgressSyncAt) / 1000);
    }
    if (total > 0) current = Math.min(current, total);

    $('np-time-current').textContent = formatDuration(current);
    $('np-time-total').textContent = w.currentTrack.durationFormatted || formatDuration(total);
    const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
    $('np-progress-fill').style.width = `${pct}%`;
  }

  // Плавный локальный тик прогресс-бара и таймеров каждую секунду
  setInterval(() => {
    if (!state?.myWorker) return;
    updateProgressUI();
    const w = state.myWorker;
    const timerBanner = $('auto-leave-banner');
    if (w.emptyLeaveAt) {
      const rem = Math.max(0, Math.ceil((w.emptyLeaveAt - Date.now()) / 1000));
      timerBanner.textContent = `⏳ В канале нет людей — агент выйдет через ${formatDuration(rem)}`;
    } else if (w.idleLeaveAt) {
      const rem = Math.max(0, Math.ceil((w.idleLeaveAt - Date.now()) / 1000));
      timerBanner.textContent = `⏱️ Нет воспроизведения — агент выйдет через ${formatDuration(rem)}`;
    }
  }, 1000);

  function renderQueue(inVoice, worker) {
    const queue = worker?.queue || [];
    const hasAnyTrack = Boolean(worker && (worker.currentTrack || queue.length > 0));
    $('queue-count').textContent = String(queue.length);
    $('btn-clear-queue').disabled = !inVoice || !worker || queue.length === 0;
    $('btn-save-playlist-toggle').disabled = !inVoice || !hasAnyTrack;
    $('playlists-save-name').disabled = !inVoice || !hasAnyTrack;
    $('btn-playlists-save-submit').disabled = !inVoice || !hasAnyTrack;
    if (!inVoice || !hasAnyTrack) {
      $('save-playlist-form').classList.add('hidden');
    }

    const listEl = $('queue-list');
    if (queue.length === 0) {
      listEl.innerHTML = '<div class="empty-state small">Очередь пуста — добавьте треки выше</div>';
      return;
    }

    listEl.innerHTML = queue
      .map((t, i) => {
        const platDot = t.source === 'spotify' ? '🟢' : t.source === 'soundcloud' ? '🟠' : '🔴';
        const thumb = t.thumbnail
          ? `<img class="queue-thumb" src="${escapeHtml(t.thumbnail)}" alt="" />`
          : '<div class="queue-thumb"></div>';
        return `
          <div class="queue-item" draggable="${inVoice ? 'true' : 'false'}" data-index="${i}">
            <span class="queue-idx">${i + 1}</span>
            ${thumb}
            <div class="queue-meta">
              <div class="queue-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
              <div class="queue-sub">
                <span>${platDot} ${escapeHtml(t.author)}</span>
                <span>•</span>
                <span>${escapeHtml(t.durationFormatted)}</span>
                <span>•</span>
                <span>${escapeHtml(t.requestedBy?.tag || '')}</span>
              </div>
            </div>
            <div class="queue-actions">
              <button class="icon-btn" data-action="up" data-index="${i}" ${!inVoice || i === 0 ? 'disabled' : ''} title="Выше">↑</button>
              <button class="icon-btn" data-action="down" data-index="${i}" ${!inVoice || i === queue.length - 1 ? 'disabled' : ''} title="Ниже">↓</button>
              <button class="icon-btn danger" data-action="remove" data-index="${i}" ${!inVoice ? 'disabled' : ''} title="Удалить">✕</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderAgents(pool) {
    $('agents-summary').textContent = `Свободно: ${pool.availableCount} из ${pool.totalCount}`;
    const grid = $('agents-grid');

    if (!pool.workers || pool.workers.length === 0) {
      grid.innerHTML = '<div class="empty-state small">Воркеры не настроены</div>';
      return;
    }

    grid.innerHTML = pool.workers
      .map((w) => {
        const otherGuild =
          w.guildId && state?.guildId && w.guildId !== state.guildId && w.guildName
            ? ` <span class="muted">(${escapeHtml(w.guildName)})</span>`
            : '';
        const statusText = !w.isOnline
          ? '🔴 Офлайн'
          : w.isInChannel
            ? `🔊 В канале: <strong>${escapeHtml(w.channelName || w.channelId)}</strong>${otherGuild}`
            : '🟢 Свободен';
        const mineBadge = w.isMine ? '<span class="badge">ВАШ КАНАЛ</span>' : '';
        const avatar = w.avatarUrl
          ? `<img class="avatar" src="${escapeHtml(w.avatarUrl)}" alt="" />`
          : '<div class="avatar"></div>';
        const trackLine = w.currentTrackTitle
          ? `<div class="agent-track">${w.isPaused ? '⏸' : '▶'} ${escapeHtml(w.currentTrackTitle)} ${w.queueLength > 0 ? `(+${w.queueLength})` : ''}</div>`
          : '<div class="muted small">Ничего не играет</div>';

        return `
          <div class="agent-card ${w.isMine ? 'is-mine' : ''}">
            <div class="agent-top">
              ${avatar}
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <strong>${escapeHtml(w.name)}</strong> ${mineBadge}
                </div>
                <div class="muted small">${escapeHtml(w.tag)}</div>
              </div>
            </div>
            <div class="agent-status">${statusText}</div>
            ${trackLine}
          </div>
        `;
      })
      .join('');
  }

  // ==================== Саундборд ====================
  async function loadCustomSounds() {
    try {
      const data = await api('/api/soundboard/custom');
      customSounds = data.sounds || [];
      renderCustomSounds();
    } catch {}
  }

  function renderCustomSounds() {
    const grid = $('custom-sounds-grid');
    const inVoice = Boolean(state?.voice?.inVoice);

    if (customSounds.length === 0) {
      grid.innerHTML =
        '<div class="empty-state">Библиотека пока пуста. Загрузите mp3/wav выше или сохраните любой мем со вкладки MyInstants!</div>';
      return;
    }

    grid.innerHTML = customSounds
      .map(
        (s) => `
        <div class="sound-tile" style="--tile-color:${escapeHtml(s.color || '#5865f2')}">
          <button class="sound-play-area" data-play-custom="${s.id}" ${!inVoice ? 'disabled' : ''} title="${inVoice ? 'Воспроизвести в голосовой канал' : 'Зайдите в голосовой канал'}">
            <span class="sound-emoji">${escapeHtml(s.emoji || '🔊')}</span>
            <span class="sound-name">${escapeHtml(s.name)}</span>
          </button>
          <div class="sound-footer">
            <span class="sound-meta">${escapeHtml(s.uploadedByTag || '')}</span>
            <div class="sound-tools">
              <button class="icon-btn" data-preview-url="/api/soundboard/file/${s.id}" title="Прослушать в браузере">🎧</button>
              <button class="icon-btn danger" data-delete-custom="${s.id}" title="Удалить">🗑</button>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  async function loadMemes(query = '') {
    const grid = $('memes-grid');
    grid.innerHTML = '<div class="empty-state">🔎 Загрузка звуков с MyInstants...</div>';
    try {
      const url = query
        ? `/api/soundboard/memes?q=${encodeURIComponent(query)}`
        : `/api/soundboard/memes?region=${memeRegion}`;
      const data = await api(url);
      memesList = data.memes || [];
      renderMemes();
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">❌ ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderMemes() {
    const grid = $('memes-grid');
    const inVoice = Boolean(state?.voice?.inVoice);

    if (memesList.length === 0) {
      grid.innerHTML = '<div class="empty-state">Ничего не найдено</div>';
      return;
    }

    grid.innerHTML = memesList
      .map(
        (m, idx) => `
        <div class="sound-tile" style="--tile-color:${escapeHtml(m.color || '#5865f2')}">
          <button class="sound-play-area" data-play-meme="${idx}" ${!inVoice ? 'disabled' : ''} title="${inVoice ? 'Проиграть мем в Discord' : 'Зайдите в голосовой канал'}">
            <span class="sound-emoji">😂</span>
            <span class="sound-name">${escapeHtml(m.name)}</span>
          </button>
          <div class="sound-footer">
            <span class="sound-meta">MyInstants</span>
            <div class="sound-tools">
              <button class="icon-btn" data-preview-url="${escapeHtml(m.url)}" title="Прослушать у себя">🎧</button>
              <button class="icon-btn" data-save-meme="${idx}" title="Сохранить в «Мои звуки»">💾</button>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  // ==================== Личные сохранённые плейлисты ====================
  async function loadPlaylists() {
    try {
      const data = await api('/api/playlists');
      userPlaylists = data.playlists || [];
      renderPlaylists();
    } catch {}
  }

  function renderPlaylists() {
    const badge = $('playlists-count-badge');
    if (badge) badge.textContent = String(userPlaylists.length);

    const listEl = $('playlists-list');
    if (!listEl) return;

    const inVoice = Boolean(state?.voice?.inVoice);

    if (userPlaylists.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state small">У вас пока нет сохранённых плейлистов. Включите музыку и нажмите «💾 Сохранить» рядом с очередью!</div>';
      return;
    }

    listEl.innerHTML = userPlaylists
      .map((p) => {
        const totalSec = (p.tracks || []).reduce((acc, t) => acc + (Number(t.durationSec) || 0), 0);
        const durStr = totalSec > 0 ? formatDuration(totalSec) : '';
        const updatedDate = p.updatedAt
          ? new Date(p.updatedAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        const isExpanded = expandedPlaylistIds.has(p.id);
        const tracksHtml = isExpanded
          ? `<div class="playlist-tracks">${(p.tracks || [])
              .map((t, i) => {
                const dot = t.source === 'spotify' ? '🟢' : t.source === 'soundcloud' ? '🟠' : '🔴';
                const href = escapeHtml(t.originalUrl || '#');
                return `
                  <div class="playlist-track-row">
                    <span class="playlist-track-idx">${i + 1}.</span>
                    <span>${dot}</span>
                    <a class="playlist-track-link" href="${href}" target="_blank" rel="noopener" title="${escapeHtml(t.title)} — ${escapeHtml(t.author)}">${escapeHtml(t.title)} <span class="muted">— ${escapeHtml(t.author)}</span></a>
                    <span class="playlist-track-dur">${escapeHtml(t.durationFormatted || '0:00')}</span>
                  </div>
                `;
              })
              .join('')}</div>`
          : '';

        return `
          <div class="playlist-card">
            <div class="playlist-card-head">
              <div class="playlist-info">
                <div class="playlist-name">🎵 ${escapeHtml(p.name)}</div>
                <div class="playlist-meta">
                  <span>Треков: <strong>${p.trackCount}</strong></span>
                  ${durStr ? `<span>• ${escapeHtml(durStr)}</span>` : ''}
                  ${updatedDate ? `<span>• обновлён ${escapeHtml(updatedDate)}</span>` : ''}
                </div>
              </div>
              <div class="playlist-actions">
                <button
                  class="btn btn-primary btn-sm"
                  data-load-playlist="${p.id}"
                  ${!inVoice ? 'disabled' : ''}
                  title="${inVoice ? 'Заменить текущую очередь этим плейлистом' : 'Зайдите в голосовой канал'}"
                >▶ Восстановить</button>
                <button
                  class="btn btn-secondary btn-sm"
                  data-toggle-playlist="${p.id}"
                >${isExpanded ? '▲ Скрыть' : '📋 Треки'}</button>
                <button
                  class="icon-btn danger"
                  data-delete-playlist="${p.id}"
                  title="Удалить плейлист"
                >🗑</button>
              </div>
            </div>
            ${tracksHtml}
          </div>
        `;
      })
      .join('');
  }

  async function saveCurrentQueueAsPlaylist(rawName, submitBtn) {
    const name = rawName.trim();
    if (!name) {
      showToast('Введите название плейлиста', 'error');
      return false;
    }
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳...';
    try {
      const res = await api('/api/playlists/save', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      showToast(
        res.overwritten
          ? `💾 Плейлист «${res.playlist.name}» обновлён (${res.playlist.trackCount} тр.)`
          : `💾 Плейлист «${res.playlist.name}» сохранён (${res.playlist.trackCount} тр.)`,
        'success'
      );
      await loadPlaylists();
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  }

  // ==================== Админские настройки ====================
  function renderCookiesStatus(status) {
    const el = $('cookies-status');
    if (!el) return;
    if (status && status.hasCookies) {
      el.className = 'cookies-status active';
      if (status.source === 'file') {
        const dt = status.updatedAt
          ? new Date(status.updatedAt).toLocaleString('ru-RU')
          : '';
        el.textContent = `✅ Активны из data/cookies.txt • строк: ${status.lineCount}${dt ? ` • обновлены: ${dt}` : ''}`;
      } else {
        el.textContent = '✅ Активны из переменной YT_COOKIE (.env)';
      }
    } else {
      el.className = 'cookies-status empty';
      el.textContent = '⚠️ Cookies не загружены — работает режим без авторизации + фолбэк через SoundCloud';
    }
  }

  async function loadAdminSettings() {
    if (!state?.user?.isAdmin) return;
    try {
      const [data, cookiesStatus] = await Promise.all([
        api('/api/admin/settings'),
        api('/api/admin/cookies').catch(() => null),
      ]);
      const select = $('required-role-select');
      select.innerHTML = '<option value="">🌐 Доступ открыт всем участникам сервера</option>';
      for (const r of data.roles || []) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `@${r.name}`;
        if (data.requiredRoleId === r.id) opt.selected = true;
        select.appendChild(opt);
      }
      if (cookiesStatus) renderCookiesStatus(cookiesStatus);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ==================== Обработчики событий UI ====================
  // Переключение основных вкладок
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
      if (tab === 'admin') loadAdminSettings();
      if (tab === 'playlists') loadPlaylists();
    });
  });

  // Подвкладки саундборда
  document.querySelectorAll('.subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sb = btn.dataset.sb;
      document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.sb-panel').forEach((p) => p.classList.toggle('active', p.id === `sb-${sb}-panel`));
    });
  });

  // Выбор платформы
  $('platform-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.plat-pill');
    if (!btn) return;
    selectedPlatform = btn.dataset.platform;
    document.querySelectorAll('.plat-pill').forEach((b) => b.classList.toggle('active', b === btn));
  });

  // Переключение сервера
  $('guild-select').addEventListener('change', async (e) => {
    const guildId = e.target.value;
    if (!guildId) return;
    try {
      const next = await api('/api/guild/select', {
        method: 'POST',
        body: JSON.stringify({ guildId }),
      });
      handleStateUpdate(next);
      loadCustomSounds();
      if (next.user?.isAdmin) loadAdminSettings();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Вызвать агента
  $('summon-btn').addEventListener('click', async () => {
    try {
      const res = await api('/api/worker/summon', { method: 'POST' });
      showToast(res.message || 'Агент подключился!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Выход
  async function doLogout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    if (eventSource) eventSource.close();
    window.location.reload();
  }
  $('logout-btn').addEventListener('click', doLogout);
  $('denied-logout-btn').addEventListener('click', doLogout);

  // Форма добавления трека
  $('play-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('play-query');
    const query = input.value.trim();
    if (!query) return;

    const btn = $('play-submit-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Ищу...';

    try {
      const res = await api('/api/player/play', {
        method: 'POST',
        body: JSON.stringify({ query, platform: selectedPlatform }),
      });
      input.value = '';
      if (res.addedCount > 1) {
        showToast(`📚 Добавлен плейлист: ${res.addedCount} треков`, 'success');
      } else {
        showToast(
          res.isPlayingNow ? `▶ Включил: ${res.track.title}` : `➕ В очереди: ${res.track.title}`,
          'success'
        );
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = !state?.voice?.inVoice;
      btn.textContent = '▶ Добавить';
    }
  });

  // Кнопки управления плеером
  $('btn-pause-resume').addEventListener('click', async () => {
    if (!state?.myWorker) return;
    const ep = state.myWorker.isPaused ? '/api/player/resume' : '/api/player/pause';
    try {
      await api(ep, { method: 'POST' });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('btn-skip').addEventListener('click', async () => {
    try {
      await api('/api/player/skip', { method: 'POST', body: JSON.stringify({ count: 1 }) });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('btn-shuffle').addEventListener('click', async () => {
    try {
      await api('/api/player/shuffle', { method: 'POST' });
      showToast('🔀 Очередь перемешана', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('btn-loop').addEventListener('click', async () => {
    if (!state?.myWorker) return;
    const cycle = { off: 'track', track: 'queue', queue: 'off' };
    const nextMode = cycle[state.myWorker.loopMode] || 'off';
    try {
      await api('/api/player/loop', {
        method: 'POST',
        body: JSON.stringify({ mode: nextMode }),
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('btn-stop').addEventListener('click', async () => {
    try {
      await api('/api/player/stop', { method: 'POST' });
      showToast('⏹ Воспроизведение остановлено, агент свободен', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('btn-clear-queue').addEventListener('click', async () => {
    try {
      await api('/api/queue/clear', { method: 'POST' });
      showToast('🗑️ Очередь очищена', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Слайдер громкости
  $('volume-slider').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    $('volume-value').textContent = `${val}%`;
    if (volumeDebounce) clearTimeout(volumeDebounce);
    volumeDebounce = setTimeout(async () => {
      try {
        await api('/api/player/volume', {
          method: 'POST',
          body: JSON.stringify({ volume: val }),
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    }, 120);
  });

  // Действия с очередью (вверх / вниз / удалить / Drag & Drop)
  const queueListEl = $('queue-list');
  queueListEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.index);

    try {
      if (action === 'remove') {
        await api('/api/queue/remove', { method: 'POST', body: JSON.stringify({ index: idx }) });
      } else if (action === 'up' && idx > 0) {
        await api('/api/queue/move', { method: 'POST', body: JSON.stringify({ from: idx, to: idx - 1 }) });
      } else if (action === 'down') {
        await api('/api/queue/move', { method: 'POST', body: JSON.stringify({ from: idx, to: idx + 1 }) });
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  queueListEl.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.queue-item');
    if (!item) return;
    dragFromIndex = Number(item.dataset.index);
    item.classList.add('dragging');
  });

  queueListEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const item = e.target.closest('.queue-item');
    document.querySelectorAll('.queue-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
    if (item) item.classList.add('drag-over');
  });

  queueListEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    const item = e.target.closest('.queue-item');
    document.querySelectorAll('.queue-item').forEach((el) => el.classList.remove('dragging', 'drag-over'));
    if (!item || dragFromIndex === null) return;
    const toIndex = Number(item.dataset.index);
    const fromIndex = dragFromIndex;
    dragFromIndex = null;
    if (fromIndex === toIndex) return;
    try {
      await api('/api/queue/move', { method: 'POST', body: JSON.stringify({ from: fromIndex, to: toIndex }) });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  queueListEl.addEventListener('dragend', () => {
    dragFromIndex = null;
    document.querySelectorAll('.queue-item').forEach((el) => el.classList.remove('dragging', 'drag-over'));
  });

  // Загрузка своего звука
  $('sound-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    $('sound-file-label').textContent = file ? `🎵 ${file.name}` : '📁 Выбрать файл (.mp3/.wav/.ogg)';
    if (file && !$('sound-name').value.trim()) {
      $('sound-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 50);
    }
  });

  $('upload-sound-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = $('sound-file').files?.[0];
    const name = $('sound-name').value.trim();
    const emoji = $('sound-emoji').value.trim() || '🔊';
    const color = $('sound-color').value || '#5865f2';

    if (!file || !name) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('Файл слишком большой (максимум 10 МБ)', 'error');
      return;
    }

    const btn = $('upload-sound-btn');
    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await api('/api/soundboard/upload', {
        method: 'POST',
        body: JSON.stringify({
          name,
          emoji,
          color,
          filename: file.name,
          mimeType: file.type,
          dataBase64,
        }),
      });

      $('upload-sound-form').reset();
      $('sound-emoji').value = '🔊';
      $('sound-color').value = '#5865f2';
      $('sound-file-label').textContent = '📁 Выбрать файл (.mp3/.wav/.ogg)';
      showToast(`✅ Звук «${name}» добавлен!`, 'success');
      loadCustomSounds();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Загрузить';
    }
  });

  // Клики по сеткам саундборда (свои звуки + мемы)
  function playPreview(url) {
    const audio = $('preview-audio');
    audio.pause();
    audio.src = url;
    audio.volume = 0.7;
    audio.play().catch(() => {});
  }

  $('custom-sounds-grid').addEventListener('click', async (e) => {
    const previewBtn = e.target.closest('button[data-preview-url]');
    if (previewBtn) {
      playPreview(previewBtn.dataset.previewUrl);
      return;
    }

    const delBtn = e.target.closest('button[data-delete-custom]');
    if (delBtn) {
      const id = Number(delBtn.dataset.deleteCustom);
      if (!confirm('Удалить этот звук из библиотеки сервера?')) return;
      try {
        await api(`/api/soundboard/custom/${id}`, { method: 'DELETE' });
        showToast('🗑️ Звук удалён', 'info');
        loadCustomSounds();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    const playBtn = e.target.closest('button[data-play-custom]');
    if (playBtn) {
      const id = Number(playBtn.dataset.playCustom);
      try {
        const res = await api('/api/soundboard/play', {
          method: 'POST',
          body: JSON.stringify({ type: 'custom', id }),
        });
        showToast(`🔊 Играет: ${res.played}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  $('memes-grid').addEventListener('click', async (e) => {
    const previewBtn = e.target.closest('button[data-preview-url]');
    if (previewBtn) {
      playPreview(previewBtn.dataset.previewUrl);
      return;
    }

    const saveBtn = e.target.closest('button[data-save-meme]');
    if (saveBtn) {
      const meme = memesList[Number(saveBtn.dataset.saveMeme)];
      if (!meme) return;
      saveBtn.disabled = true;
      try {
        await api('/api/soundboard/save-meme', {
          method: 'POST',
          body: JSON.stringify({
            name: meme.name,
            url: meme.url,
            color: meme.color,
            emoji: '😂',
          }),
        });
        showToast(`💾 «${meme.name}» сохранён в Мои звуки!`, 'success');
        loadCustomSounds();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
      return;
    }

    const playBtn = e.target.closest('button[data-play-meme]');
    if (playBtn) {
      const meme = memesList[Number(playBtn.dataset.playMeme)];
      if (!meme) return;
      try {
        await api('/api/soundboard/play', {
          method: 'POST',
          body: JSON.stringify({ type: 'url', url: meme.url, name: meme.name }),
        });
        showToast(`😂 Включён мем: ${meme.name}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  // Поиск и пресеты мемов
  $('meme-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadMemes($('meme-query').value.trim());
  });

  document.querySelectorAll('.meme-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      memeRegion = btn.dataset.region;
      $('meme-query').value = '';
      document.querySelectorAll('.meme-preset-btn').forEach((b) => b.classList.toggle('active', b === btn));
      loadMemes('');
    });
  });

  // Сохранение админских настроек
  $('admin-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const roleId = $('required-role-select').value || null;
    try {
      await api('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ requiredRoleId: roleId }),
      });
      showToast('💾 Настройки доступа сохранены!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Сохранение / восстановление / удаление личных плейлистов
  $('btn-save-playlist-toggle').addEventListener('click', () => {
    const form = $('save-playlist-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      $('save-playlist-name').focus();
    }
  });

  $('btn-save-playlist-cancel').addEventListener('click', () => {
    $('save-playlist-form').classList.add('hidden');
    $('save-playlist-name').value = '';
  });

  $('save-playlist-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await saveCurrentQueueAsPlaylist(
      $('save-playlist-name').value,
      $('btn-save-playlist-submit')
    );
    if (ok) {
      $('save-playlist-name').value = '';
      $('save-playlist-form').classList.add('hidden');
    }
  });

  $('playlists-save-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await saveCurrentQueueAsPlaylist(
      $('playlists-save-name').value,
      $('btn-playlists-save-submit')
    );
    if (ok) {
      $('playlists-save-name').value = '';
    }
  });

  $('playlists-list').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('button[data-toggle-playlist]');
    if (toggleBtn) {
      const id = Number(toggleBtn.dataset.togglePlaylist);
      if (expandedPlaylistIds.has(id)) {
        expandedPlaylistIds.delete(id);
      } else {
        expandedPlaylistIds.add(id);
      }
      renderPlaylists();
      return;
    }

    const delBtn = e.target.closest('button[data-delete-playlist]');
    if (delBtn) {
      const id = Number(delBtn.dataset.deletePlaylist);
      const pl = userPlaylists.find((p) => p.id === id);
      if (!confirm(`Удалить плейлист «${pl?.name || ''}»?`)) return;
      try {
        await api(`/api/playlists/${id}`, { method: 'DELETE' });
        expandedPlaylistIds.delete(id);
        showToast(`🗑️ Плейлист «${pl?.name || ''}» удалён`, 'info');
        loadPlaylists();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    const loadBtn = e.target.closest('button[data-load-playlist]');
    if (loadBtn) {
      const id = Number(loadBtn.dataset.loadPlaylist);
      const pl = userPlaylists.find((p) => p.id === id);
      const hasActiveQueue = Boolean(
        state?.myWorker && (state.myWorker.currentTrack || (state.myWorker.queue?.length || 0) > 0)
      );
      if (
        hasActiveQueue &&
        !confirm(
          `Заменить текущую очередь канала на плейлист «${pl?.name || ''}»? Текущие треки будут стёрты.`
        )
      ) {
        return;
      }

      loadBtn.disabled = true;
      const orig = loadBtn.textContent;
      loadBtn.textContent = '⏳ Загружаю...';
      try {
        const res = await api('/api/playlists/load', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
        showToast(
          `💾 Восстановлен «${res.playlistName}» (${res.loadedCount} тр.) — играет: ${res.firstTrack?.title || ''}`,
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        loadBtn.textContent = orig;
        loadBtn.disabled = !state?.voice?.inVoice;
      }
    }
  });

  // Админ: YouTube Cookies (выбор файла, загрузка, перечитывание, удаление)
  $('cookies-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('cookies-file-label').textContent = `📄 ${file.name}`;
    try {
      const text = await file.text();
      $('cookies-textarea').value = text;
      showToast(`📄 Файл «${file.name}» прочитан — нажмите «Загрузить и применить»`, 'info');
    } catch {
      showToast('Не удалось прочитать файл cookies.txt', 'error');
    }
  });

  $('btn-cookies-save').addEventListener('click', async () => {
    const content = $('cookies-textarea').value.trim();
    if (!content) {
      showToast('Выберите файл cookies.txt или вставьте его содержимое в поле выше', 'error');
      return;
    }
    const btn = $('btn-cookies-save');
    btn.disabled = true;
    btn.textContent = '⏳ Проверяю и применяю...';
    try {
      const res = await api('/api/admin/cookies', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      renderCookiesStatus(res.status);
      $('cookies-textarea').value = '';
      $('cookies-file').value = '';
      $('cookies-file-label').textContent = '📄 Выбрать файл cookies.txt';
      showToast('🍪 YouTube cookies успешно сохранены и применены без перезапуска!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Загрузить и применить';
    }
  });

  $('btn-cookies-reload').addEventListener('click', async () => {
    const btn = $('btn-cookies-reload');
    btn.disabled = true;
    try {
      const res = await api('/api/admin/cookies/reload', { method: 'POST' });
      renderCookiesStatus(res.status);
      showToast('🔄 Cookies перечитаны с диска и применены!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('btn-cookies-clear').addEventListener('click', async () => {
    if (!confirm('Удалить файл data/cookies.txt и переключить YouTube на работу без cookies?')) {
      return;
    }
    try {
      const res = await api('/api/admin/cookies', { method: 'DELETE' });
      renderCookiesStatus(res.status);
      showToast('🗑️ Файл cookies.txt удалён', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  init();
})();
