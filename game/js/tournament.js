const GAME_VERSION = '0.0.2';
const SETTINGS_KEY = 'legion-dev-settings';
const SETTINGS_DEFAULTS_KEY = `legion-dev-settings-defaults-${GAME_VERSION}`;
const TOURNAMENT_HISTORY_KEY = 'legion-tournament-history-v1';
const TOURNAMENT_HISTORY_MANIFEST_URL = '../logs/tournament-history-manifest.json';
const TOURNAMENT_HISTORY_LIMIT = 300;
const tournamentCore = typeof window !== 'undefined' ? window.LegionTournamentCore : null;

let tournamentHistory = [];
let selectedHistoryIds = new Set();
let latestTournamentRun = null;

const STRATEGIES = tournamentCore?.STRATEGIES || [
  { id: 'damage-only', label: 'Damage Only' },
  { id: 'health-only', label: 'Health Only' },
  { id: 'spawn-only', label: 'Spawn Only' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'damage-health', label: 'Double Trouble: D + HP' },
  { id: 'damage-spawn', label: 'Double Trouble: D + Spawn' },
  { id: 'health-spawn', label: 'Double Trouble: HP + Spawn' },
];

const MAP_PROFILES = tournamentCore?.MAP_PROFILES || {
  classic: {
    length: 800,
    laneInset: 100,
    baseHp: 2000,
    enableTowers: true,
  },
  'snowball-line': {
    length: 2200,
    laneInset: 40,
    baseHp: 1,
    enableTowers: false,
  },
};

function parseStoredSettings(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function getSavedSettings() {
  return parseStoredSettings(localStorage.getItem(SETTINGS_KEY))
    || parseStoredSettings(localStorage.getItem(SETTINGS_DEFAULTS_KEY));
}

function getUpgradeTypeForStrategy(strategy, snapshot) {
  if (tournamentCore?.getUpgradeTypeForStrategy) {
    return tournamentCore.getUpgradeTypeForStrategy(strategy, snapshot);
  }

  if (strategy === 'damage-only') return 'damage';
  if (strategy === 'health-only') return 'health';
  if (strategy === 'spawn-only') return 'spawn';

  if (strategy === 'balanced') {
    const levels = [
      { type: 'damage', level: snapshot.damageLevel },
      { type: 'health', level: snapshot.healthLevel },
      { type: 'spawn', level: snapshot.spawnLevel },
    ];
    levels.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.type.localeCompare(b.type);
    });
    return levels[0].type;
  }

  if (strategy === 'damage-health') return snapshot.damageLevel <= snapshot.healthLevel ? 'damage' : 'health';
  if (strategy === 'damage-spawn') return snapshot.damageLevel <= snapshot.spawnLevel ? 'damage' : 'spawn';
  if (strategy === 'health-spawn') return snapshot.healthLevel <= snapshot.spawnLevel ? 'health' : 'spawn';

  return null;
}

function clampNumber(value, fallback, min, max) {
  if (tournamentCore?.clampNumber) {
    return tournamentCore.clampNumber(value, fallback, min, max);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toIsoOrNow(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function makeTournamentRunId(run) {
  if (typeof run.id === 'string' && run.id.trim()) {
    return run.id;
  }

  const stamp = toIsoOrNow(run.timestamp || new Date().toISOString());
  const strategies = Array.isArray(run.selectedStrategies) ? run.selectedStrategies.join('|') : 'none';
  const mapLen = Number(run?.mapConfig?.length) || 0;
  return `${stamp}-${mapLen}-${strategies}`;
}

function normalizeTournamentRun(rawRun, fallbackSource = 'local') {
  if (!rawRun || typeof rawRun !== 'object') {
    return null;
  }

  const pairResults = Array.isArray(rawRun.pairResults)
    ? rawRun.pairResults
    : [];
  const leaderboardRows = Array.isArray(rawRun.leaderboardRows)
    ? rawRun.leaderboardRows
    : [];

  const normalized = {
    id: makeTournamentRunId(rawRun),
    timestamp: toIsoOrNow(rawRun.timestamp || new Date().toISOString()),
    source: typeof rawRun.source === 'string' ? rawRun.source : fallbackSource,
    version: rawRun.version || GAME_VERSION,
    selectedStrategies: Array.isArray(rawRun.selectedStrategies) ? rawRun.selectedStrategies.slice() : [],
    mapConfig: rawRun.mapConfig && typeof rawRun.mapConfig === 'object' ? { ...rawRun.mapConfig } : {},
    matchesPerSide: Number(rawRun.matchesPerSide) || 0,
    maxMinutes: Number(rawRun.maxMinutes) || 0,
    pairMatchCount: Number(rawRun.pairMatchCount) || 0,
    totalMatches: Number(rawRun.totalMatches) || 0,
    tickRate: Number(rawRun.tickRate) || 60,
    pairResults,
    leaderboardRows,
  };

  if (rawRun.settingsSnapshot && typeof rawRun.settingsSnapshot === 'object') {
    normalized.settingsSnapshot = { ...rawRun.settingsSnapshot };
  }

  return normalized;
}

function parseJsonSafe(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function getStoredTournamentHistory() {
  const parsed = parseStoredSettings(localStorage.getItem(TOURNAMENT_HISTORY_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(run => normalizeTournamentRun(run, 'local'))
    .filter(Boolean);
}

function storeTournamentHistory() {
  localStorage.setItem(TOURNAMENT_HISTORY_KEY, JSON.stringify(tournamentHistory.slice(0, TOURNAMENT_HISTORY_LIMIT)));
}

function mergeTournamentHistory(runs) {
  const byId = new Map(tournamentHistory.map(run => [run.id, run]));

  for (const run of runs) {
    const normalized = normalizeTournamentRun(run, run?.source || 'imported');
    if (!normalized) {
      continue;
    }

    const existing = byId.get(normalized.id);
    if (!existing) {
      byId.set(normalized.id, normalized);
      continue;
    }

    byId.set(normalized.id, {
      ...existing,
      ...normalized,
      source: existing.source === 'local' ? existing.source : normalized.source,
    });
  }

  tournamentHistory = [...byId.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, TOURNAMENT_HISTORY_LIMIT);
}

async function loadTournamentHistoryFromManifest() {
  if (typeof fetch !== 'function') {
    return 0;
  }

  try {
    const response = await fetch(TOURNAMENT_HISTORY_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) {
      return 0;
    }

    const manifest = await response.json();
    const files = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest?.files)
        ? manifest.files
        : [];

    const loadedRuns = [];
    for (const item of files) {
      const path = typeof item === 'string'
        ? item
        : typeof item?.path === 'string'
          ? item.path
          : null;

      if (!path) {
        continue;
      }

      const resolvedPath = path.startsWith('http') || path.startsWith('/') || path.startsWith('../')
        ? path
        : `../logs/${path}`;

      try {
        const fileResponse = await fetch(resolvedPath, { cache: 'no-store' });
        if (!fileResponse.ok) {
          continue;
        }

        const parsed = await fileResponse.json();
        if (Array.isArray(parsed)) {
          for (const run of parsed) {
            loadedRuns.push({ ...run, source: 'manifest' });
          }
        } else if (parsed && typeof parsed === 'object') {
          loadedRuns.push({ ...parsed, source: 'manifest' });
        }
      } catch {
        // Ignore individual manifest file failures.
      }
    }

    if (loadedRuns.length > 0) {
      mergeTournamentHistory(loadedRuns);
    }

    return loadedRuns.length;
  } catch {
    // Missing manifest is expected on deployments like GitHub Pages.
    return 0;
  }
}

function formatHistoryTimestamp(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return isoText;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function computeRunAggregateStats(run) {
  if (tournamentCore?.computeRunAggregateStats) {
    return tournamentCore.computeRunAggregateStats(run);
  }

  const pairResults = Array.isArray(run.pairResults) ? run.pairResults : [];
  let draws = 0;
  let timeouts = 0;
  let totalTicks = 0;

  for (const pair of pairResults) {
    draws += Number(pair.draws) || 0;
    timeouts += Number(pair.timeouts) || 0;
    totalTicks += Number(pair.totalTicks) || 0;
  }

  const top = Array.isArray(run.leaderboardRows) && run.leaderboardRows.length > 0
    ? run.leaderboardRows[0]
    : null;

  const avgMatchSeconds = run.totalMatches > 0
    ? totalTicks / run.totalMatches / Math.max(1, run.tickRate || 60)
    : 0;

  return {
    draws,
    timeouts,
    totalTicks,
    avgMatchSeconds,
    top,
  };
}

function renderHistoryComparison() {
  const wrap = document.getElementById('historyCompareWrap');
  const selectedRuns = tournamentHistory.filter(run => selectedHistoryIds.has(run.id));

  if (selectedRuns.length === 0) {
    wrap.innerHTML = '<div class="muted">Select history rows to compare.</div>';
    return;
  }

  const headers = selectedRuns
    .map(run => `<th>${formatHistoryTimestamp(run.timestamp)}</th>`)
    .join('');

  const row = (label, getter) => {
    const cells = selectedRuns
      .map(run => `<td>${getter(run)}</td>`)
      .join('');
    return `<tr><th>${label}</th>${cells}</tr>`;
  };

  const body = [
    row('Source', run => `<span class="historySourceTag">${run.source}</span>`),
    row('Strategies', run => String(run.selectedStrategies.length || 0)),
    row('Total Matches', run => String(run.totalMatches || 0)),
    row('Map', run => {
      const length = Number(run?.mapConfig?.length) || '-';
      const baseHp = Number(run?.mapConfig?.baseHp) || '-';
      const towers = run?.mapConfig?.enableTowers ? 'on' : 'off';
      return `${length}px, base ${baseHp}, towers ${towers}`;
    }),
    row('Top Strategy', run => {
      const top = computeRunAggregateStats(run).top;
      if (!top) {
        return '-';
      }
      return `${top.name} (${(top.winRate * 100).toFixed(1)}%)`;
    }),
    row('Draws', run => String(computeRunAggregateStats(run).draws)),
    row('Timeouts', run => String(computeRunAggregateStats(run).timeouts)),
    row('Avg Match Time', run => `${computeRunAggregateStats(run).avgMatchSeconds.toFixed(1)}s`),
  ].join('');

  wrap.innerHTML = `
    <table class="tournamentTable historyCompareTable">
      <tr><th>Metric</th>${headers}</tr>
      ${body}
    </table>
  `;
}

function renderHistoryTable() {
  const wrap = document.getElementById('historyTableWrap');

  if (tournamentHistory.length === 0) {
    wrap.innerHTML = '<div class="muted">No history logs loaded.</div>';
    renderHistoryComparison();
    return;
  }

  const header = '<tr><th class="historySelectCell">Compare</th><th>Date</th><th>Source</th><th>Strategies</th><th>Matches</th><th>Top</th><th>Map</th><th>Settings</th></tr>';
  const body = tournamentHistory.map(run => {
    const stats = computeRunAggregateStats(run);
    const checked = selectedHistoryIds.has(run.id) ? 'checked' : '';
    const topText = stats.top
      ? `${stats.top.name} ${(stats.top.winRate * 100).toFixed(1)}%`
      : '-';
    const mapLength = Number(run?.mapConfig?.length) || '-';
    const towers = run?.mapConfig?.enableTowers ? 'on' : 'off';

    return `
      <tr>
        <td><input class="historyCompareCheckbox" data-run-id="${run.id}" type="checkbox" ${checked} /></td>
        <td>${formatHistoryTimestamp(run.timestamp)}</td>
        <td><span class="historySourceTag">${run.source}</span></td>
        <td>${run.selectedStrategies.length}</td>
        <td>${run.totalMatches}</td>
        <td>${topText}</td>
        <td>${mapLength}px, towers ${towers}</td>
        <td><button type="button" class="historyViewSettingsBtn" data-run-id="${run.id}">View Settings</button></td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `<table class="tournamentTable">${header}${body}</table>`;

  for (const checkbox of document.querySelectorAll('.historyCompareCheckbox')) {
    checkbox.addEventListener('change', event => {
      const runId = event.target.getAttribute('data-run-id');
      if (!runId) {
        return;
      }

      if (event.target.checked) {
        if (selectedHistoryIds.size >= 4) {
          event.target.checked = false;
          document.getElementById('historyStatus').textContent = 'Select up to 4 runs for comparison.';
          return;
        }
        selectedHistoryIds.add(runId);
      } else {
        selectedHistoryIds.delete(runId);
      }

      renderHistoryComparison();
    });
  }

  for (const viewButton of document.querySelectorAll('.historyViewSettingsBtn')) {
    viewButton.addEventListener('click', event => {
      const runId = event.target.getAttribute('data-run-id');
      if (!runId) {
        return;
      }

      const run = tournamentHistory.find(entry => entry.id === runId);
      if (!run) {
        return;
      }

      const dumpEl = document.getElementById('historySettingsDump');
      const statusEl = document.getElementById('historySettingsStatus');
      const payload = {
        timestamp: run.timestamp,
        source: run.source,
        mapConfig: run.mapConfig,
        matchesPerSide: run.matchesPerSide,
        maxMinutes: run.maxMinutes,
        selectedStrategies: run.selectedStrategies,
        settingsSnapshot: run.settingsSnapshot || null,
      };

      if (dumpEl) {
        dumpEl.textContent = JSON.stringify(payload, null, 2);
      }
      if (statusEl) {
        statusEl.textContent = `Showing settings for ${formatHistoryTimestamp(run.timestamp)} (${run.source}).`;
      }
    });
  }

  renderHistoryComparison();
}

function updateMapGeometryInfo() {
  const mapInfoEl = document.getElementById('mapGeometryInfo');
  if (!mapInfoEl) {
    return;
  }

  const mapLength = clampNumber(document.getElementById('mapLengthInput').value, 2200, 600, 6000);
  const laneInset = clampNumber(document.getElementById('laneInsetInput').value, 40, 10, 300);
  const laneWidth = Math.max(1, mapLength - laneInset * 2);
  const savedSettings = getSavedSettings() || {};
  const spawnSpace = Number.isFinite(Number(savedSettings.spawnPadding)) ? Number(savedSettings.spawnPadding) : 0;
  const spawnSlots = Number.isFinite(Number(savedSettings.spawnSlotCount)) ? Number(savedSettings.spawnSlotCount) : 7;

  mapInfoEl.textContent = `Lane Edge Offset moves each lane wall inward from the map edge (left and right). Lane width = map length - 2 * edge offset = ${mapLength} - 2*${laneInset} = ${laneWidth}. Spawn Space (${spawnSpace}) is vertical spread only (Y-axis) from saved settings, so it does not change lane width. Spawn slots from saved settings: ${spawnSlots}.`;
}

function setHistoryStatus(text) {
  const statusEl = document.getElementById('historyStatus');
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function exportLatestTournamentResult() {
  if (!latestTournamentRun) {
    setHistoryStatus('No latest tournament run available to export yet.');
    return;
  }

  const blob = new Blob([JSON.stringify(latestTournamentRun, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tournament-run-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setHistoryStatus('Exported latest tournament run JSON.');
}

async function importTournamentHistoryFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return;
  }

  const importedRuns = [];
  for (const file of files) {
    try {
      const parsed = parseJsonSafe(await file.text());
      if (Array.isArray(parsed)) {
        for (const run of parsed) {
          importedRuns.push({ ...run, source: `file:${file.name}` });
        }
      } else if (parsed && typeof parsed === 'object') {
        importedRuns.push({ ...parsed, source: `file:${file.name}` });
      }
    } catch {
      // Ignore invalid files and continue importing others.
    }
  }

  if (importedRuns.length === 0) {
    setHistoryStatus('No valid tournament runs found in selected files.');
    return;
  }

  mergeTournamentHistory(importedRuns);
  storeTournamentHistory();
  renderHistoryTable();
  setHistoryStatus(`Imported ${importedRuns.length} run(s) from ${files.length} file(s).`);
}

async function refreshTournamentHistory() {
  tournamentHistory = getStoredTournamentHistory();
  const manifestLoadedCount = await loadTournamentHistoryFromManifest();
  renderHistoryTable();
  if (manifestLoadedCount > 0) {
    setHistoryStatus(`History loaded (${tournamentHistory.length} runs total, including ${manifestLoadedCount} from logs manifest).`);
  } else {
    setHistoryStatus(`History loaded (${tournamentHistory.length} runs total).`);
  }
}

function setupHistoryControls() {
  const exportBtn = document.getElementById('exportLatestTournamentBtn');
  const importBtn = document.getElementById('importTournamentHistoryBtn');
  const refreshBtn = document.getElementById('refreshTournamentHistoryBtn');
  const clearBtn = document.getElementById('clearTournamentHistoryBtn');
  const importInput = document.getElementById('importTournamentHistoryInput');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportLatestTournamentResult);
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => {
      importInput.click();
    });

    importInput.addEventListener('change', async event => {
      await importTournamentHistoryFiles(event.target.files);
      importInput.value = '';
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshTournamentHistory();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem(TOURNAMENT_HISTORY_KEY);
      tournamentHistory = [];
      selectedHistoryIds = new Set();
      renderHistoryTable();
      setHistoryStatus('Cleared local tournament history.');
    });
  }
}

function buildTournamentRunRecord({
  selectedStrategies,
  mapConfig,
  matchesPerSide,
  maxMinutes,
  pairMatchCount,
  pairResults,
  leaderboardRows,
  tickRate,
  settings,
}) {
  const totalMatches = pairResults.length * pairMatchCount;
  return normalizeTournamentRun({
    id: `${new Date().toISOString()}-${Math.round(Math.random() * 1e9)}`,
    timestamp: new Date().toISOString(),
    source: 'local',
    version: GAME_VERSION,
    selectedStrategies,
    mapConfig,
    matchesPerSide,
    maxMinutes,
    pairMatchCount,
    totalMatches,
    tickRate,
    pairResults,
    leaderboardRows,
    settingsSnapshot: settings,
  }, 'local');
}

function applyMapProfile(profileId) {
  const profile = MAP_PROFILES[profileId] || MAP_PROFILES.classic;
  document.getElementById('mapLengthInput').value = String(profile.length);
  document.getElementById('laneInsetInput').value = String(profile.laneInset);
  document.getElementById('baseHpInput').value = String(profile.baseHp);
  document.getElementById('enableTowersInput').checked = profile.enableTowers;
}

function getSelectedStrategies() {
  return STRATEGIES
    .filter(strategy => {
      const checkbox = document.getElementById(`strategy-${strategy.id}`);
      return checkbox && checkbox.checked;
    })
    .map(strategy => strategy.id);
}

function buildRoundRobinPairs(strategies) {
  if (tournamentCore?.buildRoundRobinPairs) {
    return tournamentCore.buildRoundRobinPairs(strategies);
  }

  const pairs = [];
  for (let i = 0; i < strategies.length; i++) {
    for (let j = i + 1; j < strategies.length; j++) {
      pairs.push([strategies[i], strategies[j]]);
    }
  }
  return pairs;
}

function createSimFromConfig(settings, mapConfig) {
  const spawnIntervalSeconds = Number.isFinite(Number(settings.spawnIntervalSeconds))
    ? settings.spawnIntervalSeconds
    : 3;
  const peonSpeed = Number.isFinite(Number(settings.peonSpeed)) ? settings.peonSpeed : 50;
  const peonHp = Number.isFinite(Number(settings.peonHp)) ? settings.peonHp : 100;
  const peonDamage = Number.isFinite(Number(settings.peonDamage)) ? settings.peonDamage : 9;
  const peonAttackRate = Number.isFinite(Number(settings.peonAttackRate)) ? settings.peonAttackRate : 1;

  const sim = createSimulation({
    width: mapConfig.length,
    height: 600,
    laneInset: mapConfig.laneInset,
    enableTowers: mapConfig.enableTowers,
    baseHp: mapConfig.baseHp,
    towerAttackRate: settings.towerAttackRate,
    towerDamage: settings.towerDamage,
    baseAttackRate: settings.baseAttackRate,
    baseDamage: settings.baseDamage,
    upgradeDamageBaseCost: settings.upgradeDamageBaseCost,
    upgradeHealthBaseCost: settings.upgradeHealthBaseCost,
    upgradeSpawnBaseCost: settings.upgradeSpawnBaseCost,
    upgradeDamageCostGrowth: settings.upgradeDamageCostGrowth,
    upgradeHealthCostGrowth: settings.upgradeHealthCostGrowth,
    upgradeSpawnCostGrowth: settings.upgradeSpawnCostGrowth,
    upgradeDamageCostFormula: settings.upgradeDamageCostFormula,
    upgradeHealthCostFormula: settings.upgradeHealthCostFormula,
    upgradeSpawnCostFormula: settings.upgradeSpawnCostFormula,
    structureDamageGraceSeconds: settings.structureGraceSeconds,
    baseDamageGraceSeconds: settings.baseGraceSeconds,
    towerDamagePerMinute: settings.towerDamagePerMinute,
    baseDamagePerMinute: settings.baseDamagePerMinute,
    spawnIntervalSeconds,
    peonSpeed,
    peonHp,
    peonDamage,
    peonAttackRate,
  });

  sim.setEconomyValues({
    killBountyGold: settings.killBountyGold,
    shrineGoldPerSecond: settings.shrineGoldPerSecond,
  });

  sim.setSpawnLayout({
    padding: settings.spawnPadding,
    slotCount: settings.spawnSlotCount,
  });

  return sim;
}

function runSingleMatch({ leftStrategy, rightStrategy, settings, mapConfig, maxTicks }) {
  const sim = createSimFromConfig(settings, mapConfig);
  const { state, constants, buyUpgrade, getUpgradeSnapshot, tick } = sim;

  for (let t = 1; t <= maxTicks; t++) {
    tick();

    if (t % constants.TICK_RATE === 0) {
      const leftType = getUpgradeTypeForStrategy(leftStrategy, getUpgradeSnapshot().left);
      const rightType = getUpgradeTypeForStrategy(rightStrategy, getUpgradeSnapshot().right);
      if (leftType) buyUpgrade('left', leftType);
      if (rightType) buyUpgrade('right', rightType);
    }

    if (state.leftBase.isDestroyed() || state.rightBase.isDestroyed()) {
      const winner = state.leftBase.isDestroyed() && state.rightBase.isDestroyed()
        ? 'draw'
        : state.leftBase.isDestroyed()
          ? 'right'
          : 'left';
      return {
        winner,
        ticks: t,
        leftTotalGold: state.leftTotalGold,
        rightTotalGold: state.rightTotalGold,
      };
    }
  }

  return {
    winner: 'draw',
    ticks: maxTicks,
    leftTotalGold: sim.state.leftTotalGold,
    rightTotalGold: sim.state.rightTotalGold,
    timeout: true,
  };
}

function runPairSeries({ strategyA, strategyB, matchesPerSide, settings, mapConfig, maxTicks }) {
  const result = {
    strategyA,
    strategyB,
    aWins: 0,
    bWins: 0,
    draws: 0,
    timeouts: 0,
    totalTicks: 0,
    snowballGoldDiffSum: 0,
  };

  const sides = [
    { left: strategyA, right: strategyB, invert: false },
    { left: strategyB, right: strategyA, invert: true },
  ];

  for (const sideConfig of sides) {
    for (let i = 0; i < matchesPerSide; i++) {
      const match = runSingleMatch({
        leftStrategy: sideConfig.left,
        rightStrategy: sideConfig.right,
        settings,
        mapConfig,
        maxTicks,
      });

      result.totalTicks += match.ticks;
      if (match.timeout) {
        result.timeouts++;
      }

      const goldDiff = sideConfig.invert
        ? match.rightTotalGold - match.leftTotalGold
        : match.leftTotalGold - match.rightTotalGold;
      result.snowballGoldDiffSum += goldDiff;

      if (match.winner === 'draw') {
        result.draws++;
      } else {
        const aWon = sideConfig.invert ? match.winner === 'right' : match.winner === 'left';
        if (aWon) {
          result.aWins++;
        } else {
          result.bWins++;
        }
      }
    }
  }

  return result;
}

function buildLeaderboardRows(summaryByStrategy) {
  if (tournamentCore?.buildLeaderboardRows) {
    return tournamentCore.buildLeaderboardRows(summaryByStrategy);
  }

  return [...summaryByStrategy.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.winRate - a.winRate;
  });
}

function renderLeaderboard(summaryByStrategy) {
  const rows = buildLeaderboardRows(summaryByStrategy);

  const wrap = document.getElementById('leaderboardTableWrap');
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="muted">No results yet.</div>';
    return [];
  }

  const header = '<tr><th>Strategy</th><th>Pts</th><th>W</th><th>L</th><th>D</th><th>Win%</th><th>Avg Gold Diff</th></tr>';
  const body = rows.map(row => (
    `<tr><td>${row.name}</td><td>${row.points.toFixed(1)}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.draws}</td><td>${(row.winRate * 100).toFixed(1)}%</td><td>${row.avgGoldDiff.toFixed(1)}</td></tr>`
  )).join('');

  wrap.innerHTML = `<table class="tournamentTable">${header}${body}</table>`;
  return rows;
}

function renderPairResults(pairResults, matchesPerPair, tickRate) {
  const wrap = document.getElementById('pairResultsWrap');
  if (pairResults.length === 0) {
    wrap.innerHTML = '<div class="muted">No pair results yet.</div>';
    return;
  }

  const header = '<tr><th>Pair</th><th>A Wins</th><th>B Wins</th><th>Draws</th><th>Avg Time</th><th>Avg A-B Gold</th></tr>';
  const body = pairResults.map(pair => {
    const avgSec = pair.totalTicks / matchesPerPair / tickRate;
    const avgGoldDiff = pair.snowballGoldDiffSum / matchesPerPair;
    return `<tr><td>${pair.strategyA} vs ${pair.strategyB}</td><td>${pair.aWins}</td><td>${pair.bWins}</td><td>${pair.draws}</td><td>${avgSec.toFixed(1)}s</td><td>${avgGoldDiff.toFixed(1)}</td></tr>`;
  }).join('');

  wrap.innerHTML = `<table class="tournamentTable">${header}${body}</table>`;
}

function runTournament() {
  const statusEl = document.getElementById('tournamentStatus');
  const runButton = document.getElementById('runTournamentBtn');
  const settings = getSavedSettings();

  if (!settings) {
    statusEl.textContent = 'No saved settings found. Open the main game page and click Save Settings first.';
    return;
  }

  const selectedStrategies = getSelectedStrategies();
  if (selectedStrategies.length < 2) {
    statusEl.textContent = 'Select at least two strategies.';
    return;
  }

  const mapConfig = {
    length: clampNumber(document.getElementById('mapLengthInput').value, 2200, 600, 6000),
    laneInset: clampNumber(document.getElementById('laneInsetInput').value, 40, 10, 300),
    baseHp: clampNumber(document.getElementById('baseHpInput').value, 1, 1, 5000),
    enableTowers: document.getElementById('enableTowersInput').checked,
  };

  const matchesPerSide = clampNumber(document.getElementById('matchesPerSideInput').value, 5, 1, 50);
  const maxMinutes = clampNumber(document.getElementById('maxMinutesInput').value, 6, 1, 30);

  const pairs = buildRoundRobinPairs(selectedStrategies);
  const pairMatchCount = matchesPerSide * 2;

  statusEl.textContent = `Running ${pairs.length} pairings...`;
  runButton.disabled = true;

  setTimeout(() => {
    const summaryByStrategy = new Map();
    for (const strategyId of selectedStrategies) {
      summaryByStrategy.set(strategyId, {
        name: strategyId,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        goldDiffSum: 0,
        goldDiffGames: 0,
        winRate: 0,
        avgGoldDiff: 0,
      });
    }

    const pairResults = [];
    const sampleSim = createSimFromConfig(settings, mapConfig);
    const maxTicks = sampleSim.constants.TICK_RATE * 60 * maxMinutes;

    for (const [strategyA, strategyB] of pairs) {
      const pair = runPairSeries({
        strategyA,
        strategyB,
        matchesPerSide,
        settings,
        mapConfig,
        maxTicks,
      });
      pairResults.push(pair);

      const a = summaryByStrategy.get(strategyA);
      const b = summaryByStrategy.get(strategyB);
      a.wins += pair.aWins;
      a.losses += pair.bWins;
      a.draws += pair.draws;
      b.wins += pair.bWins;
      b.losses += pair.aWins;
      b.draws += pair.draws;

      a.points += pair.aWins + pair.draws * 0.5;
      b.points += pair.bWins + pair.draws * 0.5;

      a.goldDiffSum += pair.snowballGoldDiffSum;
      b.goldDiffSum -= pair.snowballGoldDiffSum;
      a.goldDiffGames += pairMatchCount;
      b.goldDiffGames += pairMatchCount;
    }

    for (const row of summaryByStrategy.values()) {
      const totalGames = row.wins + row.losses + row.draws;
      row.winRate = totalGames > 0 ? row.wins / totalGames : 0;
      row.avgGoldDiff = row.goldDiffGames > 0 ? row.goldDiffSum / row.goldDiffGames : 0;
    }

    const leaderboardRows = renderLeaderboard(summaryByStrategy);
    renderPairResults(pairResults, pairMatchCount, sampleSim.constants.TICK_RATE);

    latestTournamentRun = buildTournamentRunRecord({
      selectedStrategies,
      mapConfig,
      matchesPerSide,
      maxMinutes,
      pairMatchCount,
      pairResults,
      leaderboardRows,
      tickRate: sampleSim.constants.TICK_RATE,
      settings,
    });
    mergeTournamentHistory([latestTournamentRun]);
    storeTournamentHistory();
    renderHistoryTable();

    statusEl.textContent = `Done: ${pairs.length} pairings, ${pairs.length * pairMatchCount} matches.`;
    runButton.disabled = false;
  }, 10);
}

function init() {
  const strategyList = document.getElementById('strategyList');
  strategyList.innerHTML = STRATEGIES.map(strategy => (
    `<label><input id="strategy-${strategy.id}" type="checkbox" checked /> ${strategy.label}</label>`
  )).join('');

  const mapProfileSelect = document.getElementById('mapProfileSelect');
  mapProfileSelect.addEventListener('change', () => {
    applyMapProfile(mapProfileSelect.value);
    updateMapGeometryInfo();
  });

  const mapLengthInput = document.getElementById('mapLengthInput');
  const laneInsetInput = document.getElementById('laneInsetInput');
  if (mapLengthInput) {
    mapLengthInput.addEventListener('input', updateMapGeometryInfo);
  }
  if (laneInsetInput) {
    laneInsetInput.addEventListener('input', updateMapGeometryInfo);
  }

  document.getElementById('resetMapProfileBtn').addEventListener('click', () => {
    applyMapProfile(mapProfileSelect.value);
    updateMapGeometryInfo();
  });

  document.getElementById('runTournamentBtn').addEventListener('click', runTournament);
  document.getElementById('backToGameBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  setupHistoryControls();

  applyMapProfile(mapProfileSelect.value);
  updateMapGeometryInfo();
  refreshTournamentHistory();

  if (!getSavedSettings()) {
    document.getElementById('tournamentStatus').textContent = 'No saved settings found yet. Save settings in main game first.';
  }
}

init();
