(function(globalScope) {
  function createGameMatchUi({
    state,
    constants,
    simulation,
    getTickDelta,
    setTickDelta,
    getIsMatchPaused,
    setIsMatchPaused,
    getSuppressEndPauseUntilRestart,
    setSuppressEndPauseUntilRestart,
    clearSelection,
    updateUpgradeHud,
    updateBalanceConfigHud,
    updateSelectionHud,
  }) {
    let matchResultPanelEl = null;
    let matchResultTitleEl = null;
    let matchResultSummaryEl = null;
    let matchResultStatsEl = null;

    function getMatchOutcome() {
      const leftDestroyed = state.leftBase?.isDestroyed();
      const rightDestroyed = state.rightBase?.isDestroyed();

      if (!leftDestroyed && !rightDestroyed) {
        return null;
      }

      if (leftDestroyed && rightDestroyed) {
        return { winner: 'draw' };
      }

      return {
        winner: leftDestroyed ? 'right' : 'left',
      };
    }

    function formatTimeFromTick(gameTick) {
      const totalSeconds = Math.floor(gameTick / constants.TICK_RATE);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }

    function renderMatchResultPanel(outcome) {
      if (!matchResultPanelEl || !matchResultTitleEl || !matchResultSummaryEl || !matchResultStatsEl || !outcome) {
        return;
      }

      if (outcome.winner === 'draw') {
        matchResultTitleEl.textContent = 'Match Paused: Draw';
        matchResultSummaryEl.textContent = 'Both bases were destroyed.';
      } else {
        const winnerName = outcome.winner === 'left' ? 'Blue' : 'Red';
        matchResultTitleEl.textContent = `Match Paused: ${winnerName} Wins`;
        matchResultSummaryEl.textContent = `${winnerName} destroyed the enemy base.`;
      }

      const upgradeSnapshot = simulation.getUpgradeSnapshot();
      const leftPeons = state.peons.filter(peon => peon.side === 'left' && peon.isAlive()).length;
      const rightPeons = state.peons.filter(peon => peon.side === 'right' && peon.isAlive()).length;

      matchResultStatsEl.innerHTML = [
        `<strong>Time:</strong> ${formatTimeFromTick(state.gameTime)}`,
        `<strong>Base HP:</strong> Blue ${Math.max(0, state.leftBase.health)} / Red ${Math.max(0, state.rightBase.health)}`,
        `<strong>Tower HP:</strong> Blue ${Math.max(0, state.leftTower.health)} / Red ${Math.max(0, state.rightTower.health)}`,
        `<strong>HP Lost:</strong> Blue ${state.leftHpLost} / Red ${state.rightHpLost}`,
        `<strong>Gold:</strong> Blue ${state.leftGold} / Red ${state.rightGold}`,
        `<strong>Total Gold Earned:</strong> Blue ${state.leftTotalGold} / Red ${state.rightTotalGold}`,
        `<strong>Alive Peons:</strong> Blue ${leftPeons} / Red ${rightPeons}`,
        `<strong>Upgrades:</strong> Blue D${upgradeSnapshot.left.damageLevel} H${upgradeSnapshot.left.healthLevel} S${upgradeSnapshot.left.spawnLevel} | Red D${upgradeSnapshot.right.damageLevel} H${upgradeSnapshot.right.healthLevel} S${upgradeSnapshot.right.spawnLevel}`,
      ].join('<br>');

      matchResultPanelEl.hidden = false;
    }

    function pauseForMatchEndIfNeeded() {
      if (getSuppressEndPauseUntilRestart() || getIsMatchPaused()) {
        return;
      }

      const outcome = getMatchOutcome();
      if (!outcome) {
        return;
      }

      setIsMatchPaused(true);
      renderMatchResultPanel(outcome);
    }

    function restartMatch() {
      simulation.initEntities();
      setTickDelta(0);
      setIsMatchPaused(false);
      setSuppressEndPauseUntilRestart(false);
      clearSelection();
      if (matchResultPanelEl) {
        matchResultPanelEl.hidden = true;
      }
      updateUpgradeHud();
      updateBalanceConfigHud();
      updateSelectionHud();
    }

    function continueAfterMatchEnd() {
      setIsMatchPaused(false);
      setSuppressEndPauseUntilRestart(true);
      if (matchResultPanelEl) {
        matchResultPanelEl.hidden = true;
      }
    }

    function setupMatchControls() {
      const restartMatchButton = document.getElementById('restartMatchBtn');
      const continueAfterEndButton = document.getElementById('continueAfterEndBtn');
      const restartAfterEndButton = document.getElementById('restartAfterEndBtn');
      matchResultPanelEl = document.getElementById('matchResultPanel');
      matchResultTitleEl = document.getElementById('matchResultTitle');
      matchResultSummaryEl = document.getElementById('matchResultSummary');
      matchResultStatsEl = document.getElementById('matchResultStats');

      if (restartMatchButton) {
        restartMatchButton.addEventListener('click', restartMatch);
      }

      if (continueAfterEndButton) {
        continueAfterEndButton.addEventListener('click', continueAfterMatchEnd);
      }

      if (restartAfterEndButton) {
        restartAfterEndButton.addEventListener('click', restartMatch);
      }
    }

    return {
      continueAfterMatchEnd,
      pauseForMatchEndIfNeeded,
      restartMatch,
      setupMatchControls,
    };
  }

  const api = { createGameMatchUi };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameMatchUi = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);