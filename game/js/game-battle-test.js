(function(globalScope) {
  function runBattleTests({
    buildMatchConfig,
    constants,
    createSimulation,
    getUpgradeTypeForStrategy,
    leftStrategy,
    rightStrategy,
    matchCount,
  }) {
    const config = buildMatchConfig();
    const maxTicksPerMatch = constants.TICK_RATE * 60 * 10;
    let leftWins = 0;
    let rightWins = 0;
    let draws = 0;
    let timeouts = 0;
    let totalTicks = 0;

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
      const sim = createSimulation(config.simOptions);
      sim.setEconomyValues(config.economyOptions);
      sim.setSpawnLayout(config.spawnLayout);

      const { state, constants: simConstants, getUpgradeSnapshot, buyUpgrade, tick } = sim;
      let ended = false;

      for (let tickIndex = 1; tickIndex <= maxTicksPerMatch; tickIndex++) {
        tick();

        if (tickIndex % simConstants.TICK_RATE === 0) {
          for (const side of ['left', 'right']) {
            const strategy = side === 'left' ? leftStrategy : rightStrategy;
            const type = getUpgradeTypeForStrategy(strategy, getUpgradeSnapshot()[side]);
            if (type) {
              buyUpgrade(side, type);
            }
          }
        }

        if (state.leftBase.isDestroyed() || state.rightBase.isDestroyed()) {
          totalTicks += tickIndex;
          if (state.leftBase.isDestroyed() && state.rightBase.isDestroyed()) {
            draws++;
          } else if (state.leftBase.isDestroyed()) {
            rightWins++;
          } else {
            leftWins++;
          }
          ended = true;
          break;
        }
      }

      if (!ended) {
        timeouts++;
        totalTicks += maxTicksPerMatch;
      }
    }

    return { leftWins, rightWins, draws, timeouts, matchCount, totalTicks };
  }

  function createGameBattleTest({
    buildMatchConfig,
    constants,
    createSimulation,
    documentRef,
    getUpgradeTypeForStrategy,
    setTimeoutFn,
  }) {
    function setupBattleTestPanel() {
      const runBtn = documentRef.getElementById('runBattleTestBtn');
      const testLeftStrategyEl = documentRef.getElementById('testLeftStrategy');
      const testRightStrategyEl = documentRef.getElementById('testRightStrategy');
      const testMatchCountEl = documentRef.getElementById('testMatchCount');
      const testResultsEl = documentRef.getElementById('battleTestResults');

      if (!runBtn || !testResultsEl) {
        return;
      }

      runBtn.addEventListener('click', () => {
        const leftStrategy = testLeftStrategyEl ? testLeftStrategyEl.value : 'none';
        const rightStrategy = testRightStrategyEl ? testRightStrategyEl.value : 'none';
        const matchCount = Math.max(1, Math.min(100, Number(testMatchCountEl?.value ?? 30)));

        runBtn.disabled = true;
        runBtn.textContent = 'Running…';

        setTimeoutFn(() => {
          const result = runBattleTests({
            buildMatchConfig,
            constants,
            createSimulation,
            getUpgradeTypeForStrategy,
            leftStrategy,
            rightStrategy,
            matchCount,
          });
          const avgSeconds = (result.totalTicks / result.matchCount / constants.TICK_RATE).toFixed(1);
          const pct = n => `${((n / result.matchCount) * 100).toFixed(0)}%`;
          const timeoutNote = result.timeouts > 0 ? ` (${result.timeouts} timeout)` : '';

          testResultsEl.innerHTML = [
            `<strong>${result.matchCount} matches — ${leftStrategy} vs ${rightStrategy}</strong>`,
            `Blue wins: ${result.leftWins} (${pct(result.leftWins)})`,
            `Red  wins: ${result.rightWins} (${pct(result.rightWins)})`,
            `Draws: ${result.draws} (${pct(result.draws)})${timeoutNote}`,
            `Avg match: ${avgSeconds}s`,
          ].join('<br>');

          runBtn.disabled = false;
          runBtn.textContent = 'Run Tests';
        }, 10);
      });
    }

    return {
      runBattleTests(params) {
        return runBattleTests({
          buildMatchConfig,
          constants,
          createSimulation,
          getUpgradeTypeForStrategy,
          ...params,
        });
      },
      setupBattleTestPanel,
    };
  }

  const api = {
    createGameBattleTest,
    runBattleTests,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameBattleTest = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);