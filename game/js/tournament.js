const GAME_VERSION = '0.0.2';
const SETTINGS_KEY = 'legion-dev-settings';
const SETTINGS_DEFAULTS_KEY = `legion-dev-settings-defaults-${GAME_VERSION}`;

const STRATEGIES = [
  { id: 'damage-only', label: 'Damage Only' },
  { id: 'health-only', label: 'Health Only' },
  { id: 'spawn-only', label: 'Spawn Only' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'damage-health', label: 'Double Trouble: D + HP' },
  { id: 'damage-spawn', label: 'Double Trouble: D + Spawn' },
  { id: 'health-spawn', label: 'Double Trouble: HP + Spawn' },
];

const MAP_PROFILES = {
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function renderLeaderboard(summaryByStrategy) {
  const rows = [...summaryByStrategy.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.winRate - a.winRate;
  });

  const wrap = document.getElementById('leaderboardTableWrap');
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="muted">No results yet.</div>';
    return;
  }

  const header = '<tr><th>Strategy</th><th>Pts</th><th>W</th><th>L</th><th>D</th><th>Win%</th><th>Avg Gold Diff</th></tr>';
  const body = rows.map(row => (
    `<tr><td>${row.name}</td><td>${row.points.toFixed(1)}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.draws}</td><td>${(row.winRate * 100).toFixed(1)}%</td><td>${row.avgGoldDiff.toFixed(1)}</td></tr>`
  )).join('');

  wrap.innerHTML = `<table class="tournamentTable">${header}${body}</table>`;
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

    renderLeaderboard(summaryByStrategy);
    renderPairResults(pairResults, pairMatchCount, sampleSim.constants.TICK_RATE);

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
  mapProfileSelect.addEventListener('change', () => applyMapProfile(mapProfileSelect.value));

  document.getElementById('resetMapProfileBtn').addEventListener('click', () => {
    applyMapProfile(mapProfileSelect.value);
  });

  document.getElementById('runTournamentBtn').addEventListener('click', runTournament);
  document.getElementById('backToGameBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  applyMapProfile(mapProfileSelect.value);

  if (!getSavedSettings()) {
    document.getElementById('tournamentStatus').textContent = 'No saved settings found yet. Save settings in main game first.';
  }
}

init();
