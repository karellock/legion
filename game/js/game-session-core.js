(function(globalScope) {
  const SESSION_STORAGE_KEY_PREFIX = 'legion-game-session-v1:';

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  }

  function normalizeMapConfig(rawMapConfig = {}) {
    return {
      length: clampNumber(rawMapConfig.length, 800, 600, 6000),
      laneInset: clampNumber(rawMapConfig.laneInset, 100, 10, 300),
      baseHp: clampNumber(rawMapConfig.baseHp, 2000, 1, 5000),
      enableTowers: rawMapConfig.enableTowers !== false,
    };
  }

  function createGameSessionFromTournamentRun(run) {
    if (!run || typeof run !== 'object') {
      return null;
    }

    return {
      source: 'tournament-history',
      version: run.version || '0.0.2',
      timestamp: run.timestamp || new Date().toISOString(),
      mapConfig: normalizeMapConfig(run.mapConfig || {}),
      settingsSnapshot: run.settingsSnapshot && typeof run.settingsSnapshot === 'object'
        ? { ...run.settingsSnapshot }
        : null,
      selectedStrategies: Array.isArray(run.selectedStrategies)
        ? run.selectedStrategies.slice()
        : [],
      matchesPerSide: Number(run.matchesPerSide) || 0,
      maxMinutes: Number(run.maxMinutes) || 0,
      totalMatches: Number(run.totalMatches) || 0,
    };
  }

  function createSessionId(prefix = 'session') {
    return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  }

  function storeSessionPayload(payload, options = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const sessionId = options.sessionId || createSessionId(options.prefix || 'session');
    try {
      localStorage.setItem(`${SESSION_STORAGE_KEY_PREFIX}${sessionId}`, JSON.stringify(payload));
      return sessionId;
    } catch (err) {
      console.error('Failed to save session payload:', err);
      return null;
    }
  }

  function loadSessionPayload(sessionId) {
    if (!sessionId) {
      return null;
    }

    const rawValue = localStorage.getItem(`${SESSION_STORAGE_KEY_PREFIX}${sessionId}`);
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function buildMainGameUrlForSession(sessionId) {
    return `index.html?session=${encodeURIComponent(sessionId)}`;
  }

  function readSessionIdFromSearch(searchText) {
    const params = new URLSearchParams(searchText || '');
    return params.get('session');
  }

  function loadSessionPayloadFromSearch(searchText) {
    const sessionId = readSessionIdFromSearch(searchText);
    if (!sessionId) {
      return null;
    }

    const payload = loadSessionPayload(sessionId);
    if (!payload) {
      return null;
    }

    return {
      sessionId,
      payload,
    };
  }

  const api = {
    SESSION_STORAGE_KEY_PREFIX,
    clampNumber,
    normalizeMapConfig,
    createGameSessionFromTournamentRun,
    storeSessionPayload,
    loadSessionPayload,
    buildMainGameUrlForSession,
    readSessionIdFromSearch,
    loadSessionPayloadFromSearch,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameSessionCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
