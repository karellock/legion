(function(globalScope) {
  const LOWEST_SETTINGS = {
    spawnPadding: 0,
    spawnSlotCount: 2,
    spawnIntervalSeconds: 0.5,
    peonSpeed: 10,
    peonHp: 10,
    peonDamage: 1,
    peonAttackRate: 0.2,
    towerHp: 0,
    baseHp: 100,
    towerDamagePerMinute: 0,
    baseDamagePerMinute: 0,
    towerDamage: 0,
    baseDamage: 0,
    towerAttackRate: 0.1,
    baseAttackRate: 0.1,
    structureGraceSeconds: 0,
    baseGraceSeconds: 0,
    upgradeDamageBaseCost: 0,
    upgradeDamageCostGrowth: 1,
    upgradeDamageCostFormula: 'exp',
    upgradeHealthBaseCost: 0,
    upgradeHealthCostGrowth: 1,
    upgradeHealthCostFormula: 'exp',
    upgradeSpawnBaseCost: 0,
    upgradeSpawnCostGrowth: 1,
    upgradeSpawnCostFormula: 'exp',
    killBountyGold: 0,
    baseGoldPerSecond: 0,
    shrineGoldPerSecond: 0,
  };

  function createGameSettings({
    simulation,
    constants,
    baseSettings,
    initialSessionPayload,
    settingsKey,
    settingsDefaultsKey,
    storage,
  }) {
    function buildSettingsPayloadFromConstants() {
      return {
        spawnPadding: constants.SPAWN_SLOT_PADDING,
        spawnSlotCount: constants.SPAWN_SLOT_COUNT,
        spawnIntervalSeconds: constants.SPAWN_INTERVAL_TICKS / constants.TICK_RATE,
        peonSpeed: constants.PEON_SPEED,
        peonHp: constants.PEON_HP,
        peonDamage: constants.PEON_DAMAGE,
        peonAttackRate: constants.PEON_ATTACK_RATE,
        towerHp: constants.TOWER_HP,
        baseHp: constants.BASE_HP,
        towerDamagePerMinute: constants.TOWER_DAMAGE_PER_MINUTE,
        baseDamagePerMinute: constants.BASE_DAMAGE_PER_MINUTE,
        towerDamage: constants.TOWER_DAMAGE,
        baseDamage: constants.BASE_DAMAGE,
        towerAttackRate: constants.TOWER_ATTACK_RATE,
        baseAttackRate: constants.BASE_ATTACK_RATE,
        structureGraceSeconds: constants.STRUCTURE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
        baseGraceSeconds: constants.BASE_DAMAGE_GRACE_TICKS / constants.TICK_RATE,
        upgradeDamageBaseCost: constants.UPGRADE_DAMAGE_BASE_COST,
        upgradeDamageCostGrowth: constants.UPGRADE_DAMAGE_COST_GROWTH,
        upgradeDamageCostFormula: constants.UPGRADE_DAMAGE_COST_FORMULA,
        upgradeHealthBaseCost: constants.UPGRADE_HEALTH_BASE_COST,
        upgradeHealthCostGrowth: constants.UPGRADE_HEALTH_COST_GROWTH,
        upgradeHealthCostFormula: constants.UPGRADE_HEALTH_COST_FORMULA,
        upgradeSpawnBaseCost: constants.UPGRADE_SPAWN_BASE_COST,
        upgradeSpawnCostGrowth: constants.UPGRADE_SPAWN_COST_GROWTH,
        upgradeSpawnCostFormula: constants.UPGRADE_SPAWN_COST_FORMULA,
        killBountyGold: constants.KILL_BOUNTY_GOLD,
        baseGoldPerSecond: constants.BASE_GOLD_PER_SECOND,
        shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
      };
    }

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

    function ensureVersionDefaultsSaved() {
      if (storage.getItem(settingsDefaultsKey)) {
        return;
      }

      const savedSettings = parseStoredSettings(storage.getItem(settingsKey));
      const defaults = savedSettings || buildSettingsPayloadFromConstants();
      storage.setItem(settingsDefaultsKey, JSON.stringify(defaults));
    }

    function getSavedOrDefaultSettings() {
      const savedSettings = parseStoredSettings(storage.getItem(settingsKey));
      if (savedSettings) {
        return savedSettings;
      }

      return parseStoredSettings(storage.getItem(settingsDefaultsKey));
    }

    function applyBaseSettings(settings = baseSettings) {
      simulation.setSpawnLayout({
        padding: settings.spawnPadding,
        slotCount: settings.spawnSlotCount,
      });
      simulation.setSpawnTiming({
        spawnIntervalSeconds: settings.spawnIntervalSeconds,
      });
      simulation.setPeonValues({
        peonSpeed: settings.peonSpeed,
        peonHp: settings.peonHp,
        peonDamage: settings.peonDamage,
        peonAttackRate: settings.peonAttackRate,
      });
      simulation.setStructureVitalityValues({
        towerHp: settings.towerHp,
        baseHp: settings.baseHp,
      });
      simulation.setStructureDamageScaling({
        towerDamagePerMinute: settings.towerDamagePerMinute,
        baseDamagePerMinute: settings.baseDamagePerMinute,
      });
      simulation.setStructureCombatValues({
        towerDamage: settings.towerDamage,
        baseDamage: settings.baseDamage,
        towerAttackRate: settings.towerAttackRate,
        baseAttackRate: settings.baseAttackRate,
      });
      simulation.setProtectionWindows({
        structureDamageGraceSeconds: settings.structureGraceSeconds,
        baseDamageGraceSeconds: settings.baseGraceSeconds,
      });
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
    }

    function shouldApplySessionSettings() {
      return Boolean(initialSessionPayload && initialSessionPayload.settingsSnapshot && typeof initialSessionPayload.settingsSnapshot === 'object');
    }

    function getSavedSettingsOrLowest() {
      const saved = parseStoredSettings(storage.getItem(settingsKey));
      return saved || LOWEST_SETTINGS;
    }

    function resetToDefaultSettings() {
      storage.removeItem(settingsKey);
      applyBaseSettings(baseSettings);
      return buildSettingsPayloadFromConstants();
    }

    return {
      applyBaseSettings,
      buildSettingsPayloadFromConstants,
      ensureVersionDefaultsSaved,
      getSavedOrDefaultSettings,
      shouldApplySessionSettings,
      getSavedSettingsOrLowest,
      resetToDefaultSettings,
    };
  }

  const api = { createGameSettings, LOWEST_SETTINGS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameSettings = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);