(function(globalScope) {
  function createGameDebugApi({
    simulation,
    constants,
    state,
    updateBalanceConfigHud,
    updateUpgradeHud,
    updateSelectionHud,
    getDebugFlags,
    setDebugFlags,
    getTimeScale,
    setTimeScale,
    getBotStrategy,
    setBotStrategy,
  }) {
    const api = {
      toggleVisionRanges() {
        const flags = getDebugFlags();
        flags.showVisionRanges = !flags.showVisionRanges;
        setDebugFlags(flags);
        return flags.showVisionRanges;
      },
      setShowVisionRanges(value) {
        const flags = getDebugFlags();
        flags.showVisionRanges = Boolean(value);
        setDebugFlags(flags);
        return flags.showVisionRanges;
      },
      getFlags() {
        return { ...getDebugFlags() };
      },
      setTimeScale(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return getTimeScale();
        }

        const clamped = Math.max(0, Math.min(4, parsed));
        setTimeScale(clamped);
        return clamped;
      },
      getTimeScale() {
        return getTimeScale();
      },
      setBotStrategy(side, strategy) {
        if ((side !== 'left' && side !== 'right') || !strategy) {
          return false;
        }

        setBotStrategy(side, strategy);
        return true;
      },
      getBotStrategy() {
        return { ...getBotStrategy() };
      },
      setSpawnLayout(padding, slotCount) {
        const result = simulation.setSpawnLayout({ padding, slotCount });
        updateBalanceConfigHud();
        return result;
      },
      setSpawnTiming(spawnIntervalSeconds) {
        const result = simulation.setSpawnTiming({ spawnIntervalSeconds });
        updateBalanceConfigHud();
        return result;
      },
      setPeonValues(peonSpeed, peonHp, peonDamage, peonAttackRate) {
        const result = simulation.setPeonValues({ peonSpeed, peonHp, peonDamage, peonAttackRate });
        updateUpgradeHud();
        updateBalanceConfigHud();
        return result;
      },
      setStructureDamageScaling(towerDamagePerMinute, baseDamagePerMinute) {
        const result = simulation.setStructureDamageScaling({
          towerDamagePerMinute,
          baseDamagePerMinute,
        });
        updateBalanceConfigHud();
        return result;
      },
      setStructureCombatValues(towerDamage, baseDamage, towerAttackRate, baseAttackRate) {
        const result = simulation.setStructureCombatValues({
          towerDamage,
          baseDamage,
          towerAttackRate,
          baseAttackRate,
        });
        updateUpgradeHud();
        updateBalanceConfigHud();
        return result;
      },
      setStructureVitalityValues(towerHp, baseHp) {
        const result = simulation.setStructureVitalityValues({ towerHp, baseHp });
        updateBalanceConfigHud();
        updateSelectionHud();
        return result;
      },
      setProtectionWindows(structureDamageGraceSeconds, baseDamageGraceSeconds) {
        const result = simulation.setProtectionWindows({
          structureDamageGraceSeconds,
          baseDamageGraceSeconds,
        });
        updateBalanceConfigHud();
        return result;
      },
      setEconomyValues(...args) {
        const payload = typeof args[0] === 'object' && args[0] !== null
          ? args[0]
          : {
              killBountyGold: args[0],
              baseGoldPerSecond: args[1],
              shrineGoldPerSecond: args[2],
              upgradeBaseCost: args[3],
              upgradeCostGrowth: args[4],
              upgradeDamageBaseCost: args[5],
              upgradeDamageCostGrowth: args[6],
              upgradeHealthBaseCost: args[7],
              upgradeHealthCostGrowth: args[8],
              upgradeSpawnBaseCost: args[9],
              upgradeSpawnCostGrowth: args[10],
              upgradeDamageCostFormula: args[11],
              upgradeHealthCostFormula: args[12],
              upgradeSpawnCostFormula: args[13],
            };
        const result = simulation.setEconomyValues(payload);
        updateUpgradeHud();
        updateBalanceConfigHud();
        return result;
      },
      getSpawnLayout() {
        const layout = simulation.getSpawnLayout ? simulation.getSpawnLayout() : {};
        return {
          padding: constants.SPAWN_SLOT_PADDING,
          slotCount: constants.SPAWN_SLOT_COUNT,
          slots: layout.spawnSlots ? layout.spawnSlots.slice() : [],
        };
      },
      setDecisionLog(value) {
        simulation.setDecisionLogEnabled(Boolean(value));
        return Boolean(value);
      },
      clearDecisionLog() {
        simulation.clearDecisionLog();
        return true;
      },
      getDecisionLog(limit) {
        return simulation.getDecisionLog(limit);
      },
      dumpDecisionLog(limit = 150) {
        const rows = simulation.getDecisionLog(limit);
        console.table(rows);
        return rows.length;
      },
      dumpDecisionWindow(startSec, endSec, eventType = null) {
        const startTick = Math.floor(startSec * constants.TICK_RATE);
        const endTick = Math.floor(endSec * constants.TICK_RATE);
        const rows = simulation
          .getDecisionLog()
          .filter(entry => entry.tick >= startTick && entry.tick <= endTick)
          .filter(entry => (eventType ? entry.event === eventType : true));
        console.table(rows);
        return rows.length;
      },
      summarizeWindow(startSec, endSec) {
        const startTick = Math.floor(startSec * constants.TICK_RATE);
        const endTick = Math.floor(endSec * constants.TICK_RATE);
        const rows = simulation
          .getDecisionLog()
          .filter(entry => entry.event === 'tick-summary')
          .filter(entry => entry.tick >= startTick && entry.tick <= endTick);

        if (rows.length === 0) {
          return null;
        }

        const first = rows[0];
        const last = rows[rows.length - 1];
        const result = {
          startTick: first.tick,
          endTick: last.tick,
          startLeftPeons: first.leftPeons,
          startRightPeons: first.rightPeons,
          endLeftPeons: last.leftPeons,
          endRightPeons: last.rightPeons,
          leftHpLostDelta: last.leftHpLost - first.leftHpLost,
          rightHpLostDelta: last.rightHpLost - first.rightHpLost,
          leftGoldDelta: (last.leftGold ?? state.leftGold) - (first.leftGold ?? state.leftGold),
          rightGoldDelta: (last.rightGold ?? state.rightGold) - (first.rightGold ?? state.rightGold),
          shrineControl: last.shrineControl ?? state.shrineControl,
        };

        console.table([result]);
        return result;
      },
    };

    return api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createGameDebugApi };
  }

  if (globalScope) {
    globalScope.LegionGameDebugApi = { createGameDebugApi };
  }
})(typeof window !== 'undefined' ? window : globalThis);
