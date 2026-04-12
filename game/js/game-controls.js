(function(globalScope) {
  function createGameControls({
    simulation,
    constants,
    layout,
    state,
    appEl,
    hudToggleBtn,
    activeSessionId,
    settingsKey,
    settingsDefaultsKey,
    debugFlags,
    botStrategy,
    storage,
    fitTableToWindow,
    buildSettingsPayloadFromConstants,
    getSavedOrDefaultSettings,
    getTimeScale,
    setTimeScale,
  }) {
    const upgradeButtons = [];
    const upgradeSummaryEls = {
      left: null,
      right: null,
    };

    const refs = {
      balanceConfigEl: null,
      spawnPaddingRangeEl: null,
      spawnPaddingValueEl: null,
      spawnSlotCountRangeEl: null,
      spawnSlotCountValueEl: null,
      spawnIntervalRangeEl: null,
      spawnIntervalValueEl: null,
      peonSpeedRangeEl: null,
      peonSpeedValueEl: null,
      peonHpRangeEl: null,
      peonHpValueEl: null,
      peonDamageRangeEl: null,
      peonDamageValueEl: null,
      peonAttackRateRangeEl: null,
      peonAttackRateValueEl: null,
      towerHpRangeEl: null,
      towerHpValueEl: null,
      baseHpRangeEl: null,
      baseHpValueEl: null,
      towerDamagePerMinuteRangeEl: null,
      towerDamagePerMinuteValueEl: null,
      towerDamageRangeEl: null,
      towerDamageValueEl: null,
      towerAttackRateRangeEl: null,
      towerAttackRateValueEl: null,
      baseDamagePerMinuteRangeEl: null,
      baseDamagePerMinuteValueEl: null,
      baseDamageRangeEl: null,
      baseDamageValueEl: null,
      baseAttackRateRangeEl: null,
      baseAttackRateValueEl: null,
      structureGraceSecondsRangeEl: null,
      structureGraceSecondsValueEl: null,
      baseGraceSecondsRangeEl: null,
      baseGraceSecondsValueEl: null,
      damageUpgradeBaseCostInputEl: null,
      damageUpgradeCostGrowthInputEl: null,
      damageUpgradeCostFormulaSelectEl: null,
      healthUpgradeBaseCostInputEl: null,
      healthUpgradeCostGrowthInputEl: null,
      healthUpgradeCostFormulaSelectEl: null,
      spawnUpgradeBaseCostInputEl: null,
      spawnUpgradeCostGrowthInputEl: null,
      spawnUpgradeCostFormulaSelectEl: null,
      killBountyGoldRangeEl: null,
      killBountyGoldValueEl: null,
      baseGoldPerSecondRangeEl: null,
      baseGoldPerSecondValueEl: null,
      shrineGoldPerSecondRangeEl: null,
      shrineGoldPerSecondValueEl: null,
    };

    function formatUpgradeButtonLabel(type, cost) {
      if (type === 'damage') {
        return `Damage +${constants.UPGRADE_DAMAGE_PER_LEVEL} (${cost}g)`;
      }

      if (type === 'health') {
        return `Health +${constants.UPGRADE_HEALTH_PER_LEVEL} (${cost}g)`;
      }

      return `Spawn +${constants.UPGRADE_SPAWN_COUNT_PER_LEVEL} (${cost}g)`;
    }

    function setupHudCollapseControls() {
      if (!hudToggleBtn || !appEl) {
        return;
      }

      const syncToggleLabel = () => {
        const isCollapsed = appEl.classList.contains('app--hud-collapsed');
        hudToggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
        hudToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        hudToggleBtn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        hudToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
      };

      hudToggleBtn.addEventListener('click', () => {
        appEl.classList.toggle('app--hud-collapsed');
        syncToggleLabel();
        fitTableToWindow();
        setTimeout(fitTableToWindow, 220);
      });

      syncToggleLabel();
    }

    function setupUpgradeControls() {
      const defs = [
        { id: 'leftUpgradeDamageBtn', side: 'left', type: 'damage' },
        { id: 'leftUpgradeHealthBtn', side: 'left', type: 'health' },
        { id: 'leftUpgradeSpawnBtn', side: 'left', type: 'spawn' },
        { id: 'rightUpgradeDamageBtn', side: 'right', type: 'damage' },
        { id: 'rightUpgradeHealthBtn', side: 'right', type: 'health' },
        { id: 'rightUpgradeSpawnBtn', side: 'right', type: 'spawn' },
      ];

      for (const def of defs) {
        const button = document.getElementById(def.id);
        if (!button) {
          continue;
        }

        button.addEventListener('click', () => {
          simulation.buyUpgrade(def.side, def.type);
          updateUpgradeHud();
        });

        upgradeButtons.push({ ...def, button });
      }

      upgradeSummaryEls.left = document.getElementById('leftUpgradeSummary');
      upgradeSummaryEls.right = document.getElementById('rightUpgradeSummary');
      refs.balanceConfigEl = document.getElementById('balanceConfig');
      updateBalanceConfigHud();
      updateUpgradeHud();
    }

    function updateBalanceConfigHud() {
      if (!refs.balanceConfigEl) {
        return;
      }

      const structureGraceSeconds = Math.floor(constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE);
      const baseGraceSeconds = Math.floor(constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE);
      const spawnMinY = Math.round(layout.spawnSlots[0]);
      const spawnMaxY = Math.round(layout.spawnSlots[layout.spawnSlots.length - 1]);
      const elapsedMinutes = state.gameTime / (constants.TICK_RATE * 60);
      const liveTowerDamage = (constants.TOWER_DAMAGE + elapsedMinutes * constants.TOWER_DAMAGE_PER_MINUTE).toFixed(1);
      const liveBaseDamage = (constants.BASE_DAMAGE + elapsedMinutes * constants.BASE_DAMAGE_PER_MINUTE).toFixed(1);
      const towerRamp = constants.TOWER_DAMAGE_PER_MINUTE.toFixed(1);
      const baseRamp = constants.BASE_DAMAGE_PER_MINUTE.toFixed(1);
      const shortFormula = formula => {
        if (formula === 'linear') {
          return 'L';
        }

        if (formula === 'hybrid') {
          return 'H';
        }

        return 'E';
      };
      const goldSummary = `Gold D${constants.UPGRADE_DAMAGE_BASE_COST}x${constants.UPGRADE_DAMAGE_COST_GROWTH.toFixed(2)}${shortFormula(constants.UPGRADE_DAMAGE_COST_FORMULA)} H${constants.UPGRADE_HEALTH_BASE_COST}x${constants.UPGRADE_HEALTH_COST_GROWTH.toFixed(2)}${shortFormula(constants.UPGRADE_HEALTH_COST_FORMULA)} S${constants.UPGRADE_SPAWN_BASE_COST}x${constants.UPGRADE_SPAWN_COST_GROWTH.toFixed(2)}${shortFormula(constants.UPGRADE_SPAWN_COST_FORMULA)} K${constants.KILL_BOUNTY_GOLD} B${constants.BASE_GOLD_PER_SECOND}/s S${constants.SHRINE_GOLD_PER_SECOND}/s`;
      const structureSummary = `Struct THP${constants.TOWER_HP} BHP${constants.BASE_HP} T${constants.TOWER_DAMAGE}@${constants.TOWER_ATTACK_RATE.toFixed(2)} B${constants.BASE_DAMAGE}@${constants.BASE_ATTACK_RATE.toFixed(2)}`;
      const peonSummary = `Peon SPD${constants.PEON_SPEED.toFixed(0)} HP${constants.PEON_HP} DMG${constants.PEON_DAMAGE} AR${constants.PEON_ATTACK_RATE.toFixed(2)} Spawn ${(constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE).toFixed(2)}s`;
      const sessionSummary = activeSessionId ? ` | Session ${activeSessionId}` : '';

      refs.balanceConfigEl.textContent = `Balance: D+${constants.UPGRADE_DAMAGE_PER_LEVEL} H+${constants.UPGRADE_HEALTH_PER_LEVEL} S+${constants.UPGRADE_SPAWN_COUNT_PER_LEVEL} | ${goldSummary} | ${structureSummary} | ${peonSummary} | Grace S${structureGraceSeconds}s B${baseGraceSeconds}s | Spawn Y ${spawnMinY}-${spawnMaxY} (space ${constants.SPAWN_SLOT_PADDING}, slots ${constants.SPAWN_SLOT_COUNT}) | Ramp T+${towerRamp}/m B+${baseRamp}/m | Live T${liveTowerDamage} B${liveBaseDamage}${sessionSummary}`;
    }

    function updateUpgradeHud() {
      const snapshot = simulation.getUpgradeSnapshot();

      if (upgradeSummaryEls.left) {
        upgradeSummaryEls.left.textContent = `Gold ${state.leftGold} (${state.leftTotalGold} earned) | D${snapshot.left.damageLevel} H${snapshot.left.healthLevel} S${snapshot.left.spawnLevel}`;
      }

      if (upgradeSummaryEls.right) {
        upgradeSummaryEls.right.textContent = `Gold ${state.rightGold} (${state.rightTotalGold} earned) | D${snapshot.right.damageLevel} H${snapshot.right.healthLevel} S${snapshot.right.spawnLevel}`;
      }

      for (const entry of upgradeButtons) {
        const sideSnapshot = snapshot[entry.side];
        const costKey = entry.type === 'damage'
          ? 'nextDamageCost'
          : entry.type === 'health'
            ? 'nextHealthCost'
            : 'nextSpawnCost';
        const cost = sideSnapshot[costKey];
        const currentGold = entry.side === 'left' ? state.leftGold : state.rightGold;
        entry.button.textContent = formatUpgradeButtonLabel(entry.type, cost);
        entry.button.disabled = currentGold < cost;
      }
    }

    function setupDevControls() {
      const timeScaleRange = document.getElementById('timeScaleRange');
      const timeScaleValue = document.getElementById('timeScaleValue');
      const leftBotSelect = document.getElementById('leftBotStrategy');
      const rightBotSelect = document.getElementById('rightBotStrategy');
      refs.spawnPaddingRangeEl = document.getElementById('spawnPaddingRange');
      refs.spawnPaddingValueEl = document.getElementById('spawnPaddingValue');
      refs.spawnSlotCountRangeEl = document.getElementById('spawnSlotCountRange');
      refs.spawnSlotCountValueEl = document.getElementById('spawnSlotCountValue');
      refs.spawnIntervalRangeEl = document.getElementById('spawnIntervalRange');
      refs.spawnIntervalValueEl = document.getElementById('spawnIntervalValue');
      refs.peonSpeedRangeEl = document.getElementById('peonSpeedRange');
      refs.peonSpeedValueEl = document.getElementById('peonSpeedValue');
      refs.peonHpRangeEl = document.getElementById('peonHpRange');
      refs.peonHpValueEl = document.getElementById('peonHpValue');
      refs.peonDamageRangeEl = document.getElementById('peonDamageRange');
      refs.peonDamageValueEl = document.getElementById('peonDamageValue');
      refs.peonAttackRateRangeEl = document.getElementById('peonAttackRateRange');
      refs.peonAttackRateValueEl = document.getElementById('peonAttackRateValue');
      refs.towerHpRangeEl = document.getElementById('towerHpRange');
      refs.towerHpValueEl = document.getElementById('towerHpValue');
      refs.baseHpRangeEl = document.getElementById('baseHpRange');
      refs.baseHpValueEl = document.getElementById('baseHpValue');
      refs.towerDamagePerMinuteRangeEl = document.getElementById('towerDamagePerMinuteRange');
      refs.towerDamagePerMinuteValueEl = document.getElementById('towerDamagePerMinuteValue');
      refs.towerDamageRangeEl = document.getElementById('towerDamageRange');
      refs.towerDamageValueEl = document.getElementById('towerDamageValue');
      refs.towerAttackRateRangeEl = document.getElementById('towerAttackRateRange');
      refs.towerAttackRateValueEl = document.getElementById('towerAttackRateValue');
      refs.baseDamagePerMinuteRangeEl = document.getElementById('baseDamagePerMinuteRange');
      refs.baseDamagePerMinuteValueEl = document.getElementById('baseDamagePerMinuteValue');
      refs.baseDamageRangeEl = document.getElementById('baseDamageRange');
      refs.baseDamageValueEl = document.getElementById('baseDamageValue');
      refs.baseAttackRateRangeEl = document.getElementById('baseAttackRateRange');
      refs.baseAttackRateValueEl = document.getElementById('baseAttackRateValue');
      refs.structureGraceSecondsRangeEl = document.getElementById('structureGraceSecondsRange');
      refs.structureGraceSecondsValueEl = document.getElementById('structureGraceSecondsValue');
      refs.baseGraceSecondsRangeEl = document.getElementById('baseGraceSecondsRange');
      refs.baseGraceSecondsValueEl = document.getElementById('baseGraceSecondsValue');
      refs.damageUpgradeBaseCostInputEl = document.getElementById('damageUpgradeBaseCostInput');
      refs.damageUpgradeCostGrowthInputEl = document.getElementById('damageUpgradeCostGrowthInput');
      refs.damageUpgradeCostFormulaSelectEl = document.getElementById('damageUpgradeCostFormulaSelect');
      refs.healthUpgradeBaseCostInputEl = document.getElementById('healthUpgradeBaseCostInput');
      refs.healthUpgradeCostGrowthInputEl = document.getElementById('healthUpgradeCostGrowthInput');
      refs.healthUpgradeCostFormulaSelectEl = document.getElementById('healthUpgradeCostFormulaSelect');
      refs.spawnUpgradeBaseCostInputEl = document.getElementById('spawnUpgradeBaseCostInput');
      refs.spawnUpgradeCostGrowthInputEl = document.getElementById('spawnUpgradeCostGrowthInput');
      refs.spawnUpgradeCostFormulaSelectEl = document.getElementById('spawnUpgradeCostFormulaSelect');
      refs.killBountyGoldRangeEl = document.getElementById('killBountyGoldRange');
      refs.killBountyGoldValueEl = document.getElementById('killBountyGoldValue');
      refs.baseGoldPerSecondRangeEl = document.getElementById('baseGoldPerSecondRange');
      refs.baseGoldPerSecondValueEl = document.getElementById('baseGoldPerSecondValue');
      refs.shrineGoldPerSecondRangeEl = document.getElementById('shrineGoldPerSecondRange');
      refs.shrineGoldPerSecondValueEl = document.getElementById('shrineGoldPerSecondValue');

      if (timeScaleRange && timeScaleValue) {
        const syncTimeScaleLabel = () => {
          const timeScale = getTimeScale();
          timeScaleValue.textContent = timeScale === 0 ? 'Paused' : `${timeScale.toFixed(2)}x`;
        };

        timeScaleRange.addEventListener('input', event => {
          const nextScale = Number(event.target.value);
          if (Number.isFinite(nextScale) && nextScale >= 0) {
            setTimeScale(Math.max(0, Math.min(4, nextScale)));
          }
          syncTimeScaleLabel();
        });

        syncTimeScaleLabel();
      }

      if (leftBotSelect) {
        leftBotSelect.addEventListener('change', event => {
          botStrategy.left = event.target.value;
        });
      }

      if (rightBotSelect) {
        rightBotSelect.addEventListener('change', event => {
          botStrategy.right = event.target.value;
        });
      }

      const syncSpawnControls = () => {
        if (refs.spawnPaddingValueEl) {
          refs.spawnPaddingValueEl.textContent = String(constants.SPAWN_SLOT_PADDING);
        }
        if (refs.spawnSlotCountValueEl) {
          refs.spawnSlotCountValueEl.textContent = String(constants.SPAWN_SLOT_COUNT);
        }
        if (refs.spawnPaddingRangeEl) {
          refs.spawnPaddingRangeEl.value = String(constants.SPAWN_SLOT_PADDING);
        }
        if (refs.spawnSlotCountRangeEl) {
          refs.spawnSlotCountRangeEl.value = String(constants.SPAWN_SLOT_COUNT);
        }
        if (refs.spawnIntervalRangeEl) {
          refs.spawnIntervalRangeEl.value = (constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE).toFixed(2);
        }
        if (refs.spawnIntervalValueEl) {
          refs.spawnIntervalValueEl.textContent = (constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE).toFixed(2);
        }
      };

      const applySpawnLayoutFromControls = () => {
        const nextPadding = refs.spawnPaddingRangeEl ? Number(refs.spawnPaddingRangeEl.value) : constants.SPAWN_SLOT_PADDING;
        const nextSlotCount = refs.spawnSlotCountRangeEl ? Number(refs.spawnSlotCountRangeEl.value) : constants.SPAWN_SLOT_COUNT;
        const nextSpawnIntervalSeconds = refs.spawnIntervalRangeEl
          ? Number(refs.spawnIntervalRangeEl.value)
          : constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE;
        simulation.setSpawnLayout({ padding: nextPadding, slotCount: nextSlotCount });
        simulation.setSpawnTiming({ spawnIntervalSeconds: nextSpawnIntervalSeconds });
        syncSpawnControls();
        updateBalanceConfigHud();
      };

      const syncPeonControls = () => {
        if (refs.peonSpeedRangeEl) {
          refs.peonSpeedRangeEl.value = String(constants.PEON_SPEED);
        }
        if (refs.peonSpeedValueEl) {
          refs.peonSpeedValueEl.textContent = String(Math.round(constants.PEON_SPEED));
        }
        if (refs.peonHpRangeEl) {
          refs.peonHpRangeEl.value = String(constants.PEON_HP);
        }
        if (refs.peonHpValueEl) {
          refs.peonHpValueEl.textContent = String(Math.round(constants.PEON_HP));
        }
        if (refs.peonDamageRangeEl) {
          refs.peonDamageRangeEl.value = String(constants.PEON_DAMAGE);
        }
        if (refs.peonDamageValueEl) {
          refs.peonDamageValueEl.textContent = String(Math.round(constants.PEON_DAMAGE));
        }
        if (refs.peonAttackRateRangeEl) {
          refs.peonAttackRateRangeEl.value = String(constants.PEON_ATTACK_RATE);
        }
        if (refs.peonAttackRateValueEl) {
          refs.peonAttackRateValueEl.textContent = constants.PEON_ATTACK_RATE.toFixed(2);
        }
      };

      const applyPeonControls = () => {
        const nextPeonSpeed = refs.peonSpeedRangeEl ? Number(refs.peonSpeedRangeEl.value) : constants.PEON_SPEED;
        const nextPeonHp = refs.peonHpRangeEl ? Number(refs.peonHpRangeEl.value) : constants.PEON_HP;
        const nextPeonDamage = refs.peonDamageRangeEl ? Number(refs.peonDamageRangeEl.value) : constants.PEON_DAMAGE;
        const nextPeonAttackRate = refs.peonAttackRateRangeEl ? Number(refs.peonAttackRateRangeEl.value) : constants.PEON_ATTACK_RATE;

        simulation.setPeonValues({
          peonSpeed: nextPeonSpeed,
          peonHp: nextPeonHp,
          peonDamage: nextPeonDamage,
          peonAttackRate: nextPeonAttackRate,
        });

        syncPeonControls();
        updateBalanceConfigHud();
      };

      const syncStructureVitalityControls = () => {
        if (refs.towerHpRangeEl) {
          refs.towerHpRangeEl.value = String(constants.TOWER_HP);
        }
        if (refs.towerHpValueEl) {
          refs.towerHpValueEl.textContent = String(constants.TOWER_HP);
        }
        if (refs.baseHpRangeEl) {
          refs.baseHpRangeEl.value = String(constants.BASE_HP);
        }
        if (refs.baseHpValueEl) {
          refs.baseHpValueEl.textContent = String(constants.BASE_HP);
        }
      };

      const applyStructureVitalityFromControls = () => {
        const nextTowerHp = refs.towerHpRangeEl ? Number(refs.towerHpRangeEl.value) : constants.TOWER_HP;
        const nextBaseHp = refs.baseHpRangeEl ? Number(refs.baseHpRangeEl.value) : constants.BASE_HP;

        simulation.setStructureVitalityValues({
          towerHp: nextTowerHp,
          baseHp: nextBaseHp,
        });

        syncStructureVitalityControls();
        updateBalanceConfigHud();
      };

      const syncStructureDamageControls = () => {
        if (refs.towerDamagePerMinuteValueEl) {
          refs.towerDamagePerMinuteValueEl.textContent = constants.TOWER_DAMAGE_PER_MINUTE.toFixed(1);
        }
        if (refs.baseDamagePerMinuteValueEl) {
          refs.baseDamagePerMinuteValueEl.textContent = constants.BASE_DAMAGE_PER_MINUTE.toFixed(1);
        }
        if (refs.towerDamagePerMinuteRangeEl) {
          refs.towerDamagePerMinuteRangeEl.value = String(constants.TOWER_DAMAGE_PER_MINUTE);
        }
        if (refs.baseDamagePerMinuteRangeEl) {
          refs.baseDamagePerMinuteRangeEl.value = String(constants.BASE_DAMAGE_PER_MINUTE);
        }
      };

      const syncStructureCombatControls = () => {
        if (refs.towerDamageValueEl) {
          refs.towerDamageValueEl.textContent = String(Math.round(constants.TOWER_DAMAGE));
        }
        if (refs.baseDamageValueEl) {
          refs.baseDamageValueEl.textContent = String(Math.round(constants.BASE_DAMAGE));
        }
        if (refs.towerAttackRateValueEl) {
          refs.towerAttackRateValueEl.textContent = constants.TOWER_ATTACK_RATE.toFixed(2);
        }
        if (refs.baseAttackRateValueEl) {
          refs.baseAttackRateValueEl.textContent = constants.BASE_ATTACK_RATE.toFixed(2);
        }
        if (refs.towerDamageRangeEl) {
          refs.towerDamageRangeEl.value = String(constants.TOWER_DAMAGE);
        }
        if (refs.baseDamageRangeEl) {
          refs.baseDamageRangeEl.value = String(constants.BASE_DAMAGE);
        }
        if (refs.towerAttackRateRangeEl) {
          refs.towerAttackRateRangeEl.value = String(constants.TOWER_ATTACK_RATE);
        }
        if (refs.baseAttackRateRangeEl) {
          refs.baseAttackRateRangeEl.value = String(constants.BASE_ATTACK_RATE);
        }
      };

      const applyStructureCombatFromControls = () => {
        const nextTowerDamage = refs.towerDamageRangeEl ? Number(refs.towerDamageRangeEl.value) : constants.TOWER_DAMAGE;
        const nextBaseDamage = refs.baseDamageRangeEl ? Number(refs.baseDamageRangeEl.value) : constants.BASE_DAMAGE;
        const nextTowerAttackRate = refs.towerAttackRateRangeEl ? Number(refs.towerAttackRateRangeEl.value) : constants.TOWER_ATTACK_RATE;
        const nextBaseAttackRate = refs.baseAttackRateRangeEl ? Number(refs.baseAttackRateRangeEl.value) : constants.BASE_ATTACK_RATE;

        simulation.setStructureCombatValues({
          towerDamage: nextTowerDamage,
          baseDamage: nextBaseDamage,
          towerAttackRate: nextTowerAttackRate,
          baseAttackRate: nextBaseAttackRate,
        });

        syncStructureCombatControls();
        updateBalanceConfigHud();
      };

      const syncProtectionControls = () => {
        const structureGraceSeconds = (constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE).toFixed(0);
        const baseGraceSeconds = (constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE).toFixed(0);
        if (refs.structureGraceSecondsValueEl) {
          refs.structureGraceSecondsValueEl.textContent = structureGraceSeconds;
        }
        if (refs.baseGraceSecondsValueEl) {
          refs.baseGraceSecondsValueEl.textContent = baseGraceSeconds;
        }
        if (refs.structureGraceSecondsRangeEl) {
          refs.structureGraceSecondsRangeEl.value = structureGraceSeconds;
        }
        if (refs.baseGraceSecondsRangeEl) {
          refs.baseGraceSecondsRangeEl.value = baseGraceSeconds;
        }
      };

      const applyProtectionFromControls = () => {
        const nextStructureGraceSeconds = refs.structureGraceSecondsRangeEl
          ? Number(refs.structureGraceSecondsRangeEl.value)
          : constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE;
        const nextBaseGraceSeconds = refs.baseGraceSecondsRangeEl
          ? Number(refs.baseGraceSecondsRangeEl.value)
          : constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE;

        simulation.setProtectionWindows({
          structureDamageGraceSeconds: nextStructureGraceSeconds,
          baseDamageGraceSeconds: nextBaseGraceSeconds,
        });

        syncProtectionControls();
        updateBalanceConfigHud();
      };

      const applyStructureDamageFromControls = () => {
        const nextTowerPerMinute = refs.towerDamagePerMinuteRangeEl
          ? Number(refs.towerDamagePerMinuteRangeEl.value)
          : constants.TOWER_DAMAGE_PER_MINUTE;
        const nextBasePerMinute = refs.baseDamagePerMinuteRangeEl
          ? Number(refs.baseDamagePerMinuteRangeEl.value)
          : constants.BASE_DAMAGE_PER_MINUTE;

        simulation.setStructureDamageScaling({
          towerDamagePerMinute: nextTowerPerMinute,
          baseDamagePerMinute: nextBasePerMinute,
        });

        syncStructureDamageControls();
        updateBalanceConfigHud();
      };

      const syncEconomyControls = () => {
        if (refs.damageUpgradeBaseCostInputEl) {
          refs.damageUpgradeBaseCostInputEl.value = String(constants.UPGRADE_DAMAGE_BASE_COST);
        }
        if (refs.damageUpgradeCostGrowthInputEl) {
          refs.damageUpgradeCostGrowthInputEl.value = constants.UPGRADE_DAMAGE_COST_GROWTH.toFixed(2);
        }
        if (refs.damageUpgradeCostFormulaSelectEl) {
          refs.damageUpgradeCostFormulaSelectEl.value = constants.UPGRADE_DAMAGE_COST_FORMULA;
        }
        if (refs.healthUpgradeBaseCostInputEl) {
          refs.healthUpgradeBaseCostInputEl.value = String(constants.UPGRADE_HEALTH_BASE_COST);
        }
        if (refs.healthUpgradeCostGrowthInputEl) {
          refs.healthUpgradeCostGrowthInputEl.value = constants.UPGRADE_HEALTH_COST_GROWTH.toFixed(2);
        }
        if (refs.healthUpgradeCostFormulaSelectEl) {
          refs.healthUpgradeCostFormulaSelectEl.value = constants.UPGRADE_HEALTH_COST_FORMULA;
        }
        if (refs.spawnUpgradeBaseCostInputEl) {
          refs.spawnUpgradeBaseCostInputEl.value = String(constants.UPGRADE_SPAWN_BASE_COST);
        }
        if (refs.spawnUpgradeCostGrowthInputEl) {
          refs.spawnUpgradeCostGrowthInputEl.value = constants.UPGRADE_SPAWN_COST_GROWTH.toFixed(2);
        }
        if (refs.spawnUpgradeCostFormulaSelectEl) {
          refs.spawnUpgradeCostFormulaSelectEl.value = constants.UPGRADE_SPAWN_COST_FORMULA;
        }
        if (refs.killBountyGoldValueEl) {
          refs.killBountyGoldValueEl.textContent = String(constants.KILL_BOUNTY_GOLD);
        }
        if (refs.baseGoldPerSecondValueEl) {
          refs.baseGoldPerSecondValueEl.textContent = String(constants.BASE_GOLD_PER_SECOND);
        }
        if (refs.shrineGoldPerSecondValueEl) {
          refs.shrineGoldPerSecondValueEl.textContent = String(constants.SHRINE_GOLD_PER_SECOND);
        }
        if (refs.killBountyGoldRangeEl) {
          refs.killBountyGoldRangeEl.value = String(constants.KILL_BOUNTY_GOLD);
        }
        if (refs.baseGoldPerSecondRangeEl) {
          refs.baseGoldPerSecondRangeEl.value = String(constants.BASE_GOLD_PER_SECOND);
        }
        if (refs.shrineGoldPerSecondRangeEl) {
          refs.shrineGoldPerSecondRangeEl.value = String(constants.SHRINE_GOLD_PER_SECOND);
        }
      };

      const applyEconomyFromControls = () => {
        const nextDamageUpgradeBaseCost = refs.damageUpgradeBaseCostInputEl
          ? Number(refs.damageUpgradeBaseCostInputEl.value)
          : constants.UPGRADE_DAMAGE_BASE_COST;
        const nextDamageUpgradeCostGrowth = refs.damageUpgradeCostGrowthInputEl
          ? Number(refs.damageUpgradeCostGrowthInputEl.value)
          : constants.UPGRADE_DAMAGE_COST_GROWTH;
        const nextHealthUpgradeBaseCost = refs.healthUpgradeBaseCostInputEl
          ? Number(refs.healthUpgradeBaseCostInputEl.value)
          : constants.UPGRADE_HEALTH_BASE_COST;
        const nextHealthUpgradeCostGrowth = refs.healthUpgradeCostGrowthInputEl
          ? Number(refs.healthUpgradeCostGrowthInputEl.value)
          : constants.UPGRADE_HEALTH_COST_GROWTH;
        const nextSpawnUpgradeBaseCost = refs.spawnUpgradeBaseCostInputEl
          ? Number(refs.spawnUpgradeBaseCostInputEl.value)
          : constants.UPGRADE_SPAWN_BASE_COST;
        const nextSpawnUpgradeCostGrowth = refs.spawnUpgradeCostGrowthInputEl
          ? Number(refs.spawnUpgradeCostGrowthInputEl.value)
          : constants.UPGRADE_SPAWN_COST_GROWTH;
        const nextDamageUpgradeCostFormula = refs.damageUpgradeCostFormulaSelectEl
          ? refs.damageUpgradeCostFormulaSelectEl.value
          : constants.UPGRADE_DAMAGE_COST_FORMULA;
        const nextHealthUpgradeCostFormula = refs.healthUpgradeCostFormulaSelectEl
          ? refs.healthUpgradeCostFormulaSelectEl.value
          : constants.UPGRADE_HEALTH_COST_FORMULA;
        const nextSpawnUpgradeCostFormula = refs.spawnUpgradeCostFormulaSelectEl
          ? refs.spawnUpgradeCostFormulaSelectEl.value
          : constants.UPGRADE_SPAWN_COST_FORMULA;
        const nextKillBountyGold = refs.killBountyGoldRangeEl
          ? Number(refs.killBountyGoldRangeEl.value)
          : constants.KILL_BOUNTY_GOLD;
        const nextBaseGoldPerSecond = refs.baseGoldPerSecondRangeEl
          ? Number(refs.baseGoldPerSecondRangeEl.value)
          : constants.BASE_GOLD_PER_SECOND;
        const nextShrineGoldPerSecond = refs.shrineGoldPerSecondRangeEl
          ? Number(refs.shrineGoldPerSecondRangeEl.value)
          : constants.SHRINE_GOLD_PER_SECOND;

        simulation.setEconomyValues({
          upgradeDamageBaseCost: nextDamageUpgradeBaseCost,
          upgradeDamageCostGrowth: nextDamageUpgradeCostGrowth,
          upgradeHealthBaseCost: nextHealthUpgradeBaseCost,
          upgradeHealthCostGrowth: nextHealthUpgradeCostGrowth,
          upgradeSpawnBaseCost: nextSpawnUpgradeBaseCost,
          upgradeSpawnCostGrowth: nextSpawnUpgradeCostGrowth,
          upgradeDamageCostFormula: nextDamageUpgradeCostFormula,
          upgradeHealthCostFormula: nextHealthUpgradeCostFormula,
          upgradeSpawnCostFormula: nextSpawnUpgradeCostFormula,
          killBountyGold: nextKillBountyGold,
          baseGoldPerSecond: nextBaseGoldPerSecond,
          shrineGoldPerSecond: nextShrineGoldPerSecond,
        });

        syncEconomyControls();
        updateUpgradeHud();
        updateBalanceConfigHud();
      };

      if (refs.spawnPaddingRangeEl) {
        refs.spawnPaddingRangeEl.addEventListener('input', applySpawnLayoutFromControls);
      }
      if (refs.spawnSlotCountRangeEl) {
        refs.spawnSlotCountRangeEl.addEventListener('input', applySpawnLayoutFromControls);
      }
      if (refs.spawnIntervalRangeEl) {
        refs.spawnIntervalRangeEl.addEventListener('input', applySpawnLayoutFromControls);
      }
      if (refs.peonSpeedRangeEl) {
        refs.peonSpeedRangeEl.addEventListener('input', applyPeonControls);
      }
      if (refs.peonHpRangeEl) {
        refs.peonHpRangeEl.addEventListener('input', applyPeonControls);
      }
      if (refs.peonDamageRangeEl) {
        refs.peonDamageRangeEl.addEventListener('input', applyPeonControls);
      }
      if (refs.peonAttackRateRangeEl) {
        refs.peonAttackRateRangeEl.addEventListener('input', applyPeonControls);
      }
      if (refs.towerHpRangeEl) {
        refs.towerHpRangeEl.addEventListener('input', applyStructureVitalityFromControls);
      }
      if (refs.baseHpRangeEl) {
        refs.baseHpRangeEl.addEventListener('input', applyStructureVitalityFromControls);
      }
      if (refs.towerDamagePerMinuteRangeEl) {
        refs.towerDamagePerMinuteRangeEl.addEventListener('input', applyStructureDamageFromControls);
      }
      if (refs.baseDamagePerMinuteRangeEl) {
        refs.baseDamagePerMinuteRangeEl.addEventListener('input', applyStructureDamageFromControls);
      }
      if (refs.towerDamageRangeEl) {
        refs.towerDamageRangeEl.addEventListener('input', applyStructureCombatFromControls);
      }
      if (refs.baseDamageRangeEl) {
        refs.baseDamageRangeEl.addEventListener('input', applyStructureCombatFromControls);
      }
      if (refs.towerAttackRateRangeEl) {
        refs.towerAttackRateRangeEl.addEventListener('input', applyStructureCombatFromControls);
      }
      if (refs.baseAttackRateRangeEl) {
        refs.baseAttackRateRangeEl.addEventListener('input', applyStructureCombatFromControls);
      }
      if (refs.structureGraceSecondsRangeEl) {
        refs.structureGraceSecondsRangeEl.addEventListener('input', applyProtectionFromControls);
      }
      if (refs.baseGraceSecondsRangeEl) {
        refs.baseGraceSecondsRangeEl.addEventListener('input', applyProtectionFromControls);
      }
      if (refs.damageUpgradeBaseCostInputEl) {
        refs.damageUpgradeBaseCostInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.damageUpgradeCostGrowthInputEl) {
        refs.damageUpgradeCostGrowthInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.healthUpgradeBaseCostInputEl) {
        refs.healthUpgradeBaseCostInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.healthUpgradeCostGrowthInputEl) {
        refs.healthUpgradeCostGrowthInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.spawnUpgradeBaseCostInputEl) {
        refs.spawnUpgradeBaseCostInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.spawnUpgradeCostGrowthInputEl) {
        refs.spawnUpgradeCostGrowthInputEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.damageUpgradeCostFormulaSelectEl) {
        refs.damageUpgradeCostFormulaSelectEl.addEventListener('change', applyEconomyFromControls);
      }
      if (refs.healthUpgradeCostFormulaSelectEl) {
        refs.healthUpgradeCostFormulaSelectEl.addEventListener('change', applyEconomyFromControls);
      }
      if (refs.spawnUpgradeCostFormulaSelectEl) {
        refs.spawnUpgradeCostFormulaSelectEl.addEventListener('change', applyEconomyFromControls);
      }
      if (refs.killBountyGoldRangeEl) {
        refs.killBountyGoldRangeEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.baseGoldPerSecondRangeEl) {
        refs.baseGoldPerSecondRangeEl.addEventListener('input', applyEconomyFromControls);
      }
      if (refs.shrineGoldPerSecondRangeEl) {
        refs.shrineGoldPerSecondRangeEl.addEventListener('input', applyEconomyFromControls);
      }

      syncSpawnControls();
      syncPeonControls();
      syncStructureVitalityControls();
      syncStructureDamageControls();
      syncStructureCombatControls();
      syncProtectionControls();
      syncEconomyControls();

      const saveSettings = () => {
        const settings = buildSettingsPayloadFromConstants();
        storage.setItem(settingsKey, JSON.stringify(settings));
        storage.setItem(settingsDefaultsKey, JSON.stringify(settings));
      };

      const loadSettings = () => {
        const settings = getSavedOrDefaultSettings();
        if (!settings) {
          return;
        }
        simulation.setSpawnLayout({ padding: settings.spawnPadding, slotCount: settings.spawnSlotCount });
        simulation.setSpawnTiming({
          spawnIntervalSeconds: Number.isFinite(Number(settings.spawnIntervalSeconds))
            ? settings.spawnIntervalSeconds
            : constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE,
        });
        simulation.setPeonValues({
          peonSpeed: Number.isFinite(Number(settings.peonSpeed)) ? settings.peonSpeed : constants.PEON_SPEED,
          peonHp: Number.isFinite(Number(settings.peonHp)) ? settings.peonHp : constants.PEON_HP,
          peonDamage: Number.isFinite(Number(settings.peonDamage)) ? settings.peonDamage : constants.PEON_DAMAGE,
          peonAttackRate: Number.isFinite(Number(settings.peonAttackRate)) ? settings.peonAttackRate : constants.PEON_ATTACK_RATE,
        });
        simulation.setStructureVitalityValues({
          towerHp: Number.isFinite(Number(settings.towerHp)) ? settings.towerHp : constants.TOWER_HP,
          baseHp: Number.isFinite(Number(settings.baseHp)) ? settings.baseHp : constants.BASE_HP,
        });
        simulation.setStructureDamageScaling({ towerDamagePerMinute: settings.towerDamagePerMinute, baseDamagePerMinute: settings.baseDamagePerMinute });
        simulation.setStructureCombatValues({ towerDamage: settings.towerDamage, baseDamage: settings.baseDamage, towerAttackRate: settings.towerAttackRate, baseAttackRate: settings.baseAttackRate });
        simulation.setProtectionWindows({ structureDamageGraceSeconds: settings.structureGraceSeconds, baseDamageGraceSeconds: settings.baseGraceSeconds });
        simulation.setEconomyValues({
          upgradeDamageBaseCost: settings.upgradeDamageBaseCost,
          upgradeDamageCostGrowth: settings.upgradeDamageCostGrowth,
          upgradeDamageCostFormula: settings.upgradeDamageCostFormula,
          upgradeHealthBaseCost: settings.upgradeHealthBaseCost,
          upgradeHealthCostGrowth: settings.upgradeHealthCostGrowth,
          upgradeHealthCostFormula: settings.upgradeHealthCostFormula,
          upgradeSpawnBaseCost: settings.upgradeSpawnBaseCost,
          upgradeSpawnCostGrowth: settings.upgradeSpawnCostGrowth,
          upgradeSpawnCostFormula: settings.upgradeSpawnCostFormula,
          killBountyGold: settings.killBountyGold,
          baseGoldPerSecond: settings.baseGoldPerSecond,
          shrineGoldPerSecond: settings.shrineGoldPerSecond,
        });
        syncSpawnControls();
        syncPeonControls();
        syncStructureVitalityControls();
        syncStructureDamageControls();
        syncStructureCombatControls();
        syncProtectionControls();
        syncEconomyControls();
        updateBalanceConfigHud();
        storage.setItem(settingsKey, JSON.stringify(settings));
      };

      const saveSettingsBtn = document.getElementById('saveSettingsBtn');
      const loadSettingsBtn = document.getElementById('loadSettingsBtn');

      if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
      }

      if (loadSettingsBtn) {
        loadSettingsBtn.addEventListener('click', loadSettings);
      }

      const toggleDmgNumsBtn = document.getElementById('toggleDmgNumsBtn');
      if (toggleDmgNumsBtn) {
        const syncDmgNumsLabel = () => {
          toggleDmgNumsBtn.textContent = `DMG Numbers: ${debugFlags.showDamageNumbers ? 'ON' : 'OFF'}`;
        };
        toggleDmgNumsBtn.addEventListener('click', () => {
          debugFlags.showDamageNumbers = !debugFlags.showDamageNumbers;
          syncDmgNumsLabel();
        });
        syncDmgNumsLabel();
      }
    }

    return {
      setupHudCollapseControls,
      setupUpgradeControls,
      setupDevControls,
      updateBalanceConfigHud,
      updateUpgradeHud,
    };
  }

  const api = { createGameControls };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameControls = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);