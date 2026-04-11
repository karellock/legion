function createSimulation(options = {}) {
  const width = options.width ?? 800;
  const height = options.height ?? 600;

  const constants = {
    TICK_RATE: 60,
    TICK_DURATION: 1000 / 60,
    LANE_LEFT: 100,
    LANE_RIGHT: width - 100,
    LANE_TOP: 50,
    LANE_BOTTOM: height - 50,
    PEON_SPEED: 50,
    PEON_SIZE: 6,
    PEON_HP: 100,
    PEON_DAMAGE: 9,
    PEON_ATTACK_RATE: 1,
    PEON_ATTACK_RANGE: 16,
    PEON_VISION_RANGE: 90,
    TOWER_ATTACK_RANGE: 120,
    TOWER_ATTACK_RATE: 0.5,
    TOWER_DAMAGE: 26,
    TOWER_VISION_RANGE: 150,
    TOWER_HP: 700,
    BASE_ATTACK_RANGE: 160,
    BASE_ATTACK_RATE: 0.4,
    BASE_DAMAGE: 14,
    BASE_VISION_RANGE: 200,
    KILL_BOUNTY_GOLD: 10,
    SHRINE_GOLD_PER_SECOND: 2,
    UPGRADE_BASE_COST: 20,
    UPGRADE_DAMAGE_PER_LEVEL: 1,
    UPGRADE_HEALTH_PER_LEVEL: 5,
    UPGRADE_SPAWN_COUNT_PER_LEVEL: 1,
    UPGRADE_DAMAGE_COST_MULTIPLIER: 1,
    UPGRADE_HEALTH_COST_MULTIPLIER: 1,
    UPGRADE_SPAWN_COST_MULTIPLIER: 1,
    STRUCTURE_DAMAGE_GRACE_TICKS: Math.max(0, Math.floor((options.structureDamageGraceSeconds ?? 0) * 60)),
    BASE_DAMAGE_GRACE_TICKS: Math.max(0, Math.floor((options.baseDamageGraceSeconds ?? 0) * 60)),
    TOWER_DAMAGE_PER_MINUTE: Math.max(0, Number(options.towerDamagePerMinute ?? 1.2)),
    BASE_DAMAGE_PER_MINUTE: Math.max(0, Number(options.baseDamagePerMinute ?? 0.6)),
    SPAWN_INTERVAL_TICKS: Math.floor(60 * 3),
    SPAWN_COUNT: options.spawnCount ?? 1,
    SPAWN_SLOT_PADDING: Math.floor((height - 100) / 2),
    SPAWN_SLOT_COUNT: 7,
    HIT_FLASH_TOTAL_TICKS: 18,
    HIT_FLASH_HOLD_TICKS: 3,
    SLASH_EFFECT_TTL: 10,
  };

  class Peon {
    constructor(side, x, y, stats = {}) {
      this.id = state.nextEntityId++;
      this.side = side;
      this.x = x;
      this.y = y;
      this.maxHealth = stats.maxHealth ?? constants.PEON_HP;
      this.health = this.maxHealth;
      this.size = constants.PEON_SIZE;
      this.velocityX = side === 'left' ? constants.PEON_SPEED : -constants.PEON_SPEED;
      this.attackCooldown = constants.TICK_RATE / constants.PEON_ATTACK_RATE;
      // Spawn-ready attack prevents "arrived but never swung" cases when units die quickly on contact.
      this.ticksSinceLastAttack = this.attackCooldown;
      this.attackRange = constants.PEON_ATTACK_RANGE;
      this.visionRange = constants.PEON_VISION_RANGE;
      this.damage = stats.damage ?? constants.PEON_DAMAGE;
      this.target = null;
      this.hitFlashTicks = 0;
      this.hitFlashMaxTicks = constants.HIT_FLASH_TOTAL_TICKS;
      this.hitFlashHoldTicks = constants.HIT_FLASH_HOLD_TICKS;
    }

    update() {
      this.ticksSinceLastAttack++;
      if (this.hitFlashTicks > 0) {
        this.hitFlashTicks--;
      }
    }

    move() {
      if (!this.target) {
        this.x += this.velocityX / constants.TICK_RATE;
      }
    }

    moveTowardTarget(targetPosition = this.target) {
      if (!targetPosition) {
        return;
      }

      const dx = targetPosition.x - this.x;
      const dy = targetPosition.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.attackRange || distance === 0) {
        return;
      }

      const step = constants.PEON_SPEED / constants.TICK_RATE;
      const clampedStep = Math.min(step, distance - this.attackRange);
      this.x += (dx / distance) * clampedStep;
      this.y += (dy / distance) * clampedStep;
    }

    takeDamage(damage) {
      this.health = Math.max(0, this.health - damage);
      this.hitFlashTicks = this.hitFlashMaxTicks;
    }

    isAlive() {
      return this.health > 0;
    }

    canAttack() {
      return this.ticksSinceLastAttack >= this.attackCooldown;
    }

    resetAttackCooldown() {
      this.ticksSinceLastAttack = 0;
    }

    isOffLane() {
      return this.x < constants.LANE_LEFT - 50 || this.x > constants.LANE_RIGHT + 50;
    }

    distanceTo(target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    setTarget(target) {
      this.target = target;
    }

    clearTarget() {
      this.target = null;
    }
  }

  class Base {
    constructor(side, health, maxHealth) {
      this.id = state.nextEntityId++;
      this.side = side;
      this.health = health;
      this.maxHealth = maxHealth;
      this.x = side === 'left' ? constants.LANE_LEFT : constants.LANE_RIGHT;
      this.y = height / 2;
      this.size = 30;
      this.ticksSinceLastAttack = 0;
      this.attackCooldown = constants.TICK_RATE / constants.BASE_ATTACK_RATE;
      this.attackRange = constants.BASE_ATTACK_RANGE;
      this.visionRange = constants.BASE_VISION_RANGE;
      this.damage = constants.BASE_DAMAGE;
      this.lastShotTarget = null;
      this.lastShotX = null;
      this.lastShotY = null;
      this.shotFlashTicks = 0;
      this.hitFlashTicks = 0;
      this.hitFlashMaxTicks = constants.HIT_FLASH_TOTAL_TICKS;
      this.hitFlashHoldTicks = constants.HIT_FLASH_HOLD_TICKS;
    }

    update() {
      this.ticksSinceLastAttack++;
      if (this.shotFlashTicks > 0) {
        this.shotFlashTicks--;
        if (this.shotFlashTicks === 0) {
          this.lastShotTarget = null;
          this.lastShotX = null;
          this.lastShotY = null;
        }
      }

      if (this.hitFlashTicks > 0) {
        this.hitFlashTicks--;
      }
    }

    takeDamage(damage) {
      this.health = Math.max(0, this.health - damage);
      this.hitFlashTicks = this.hitFlashMaxTicks;
    }

    isDestroyed() {
      return this.health <= 0;
    }

    canAttack() {
      return this.ticksSinceLastAttack >= this.attackCooldown;
    }

    resetAttackCooldown() {
      this.ticksSinceLastAttack = 0;
    }

    recordShot(target) {
      this.lastShotTarget = target;
      this.lastShotX = target.x;
      this.lastShotY = target.y;
      this.shotFlashTicks = 4;
    }

    distanceTo(target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    findNearestEnemy(enemies) {
      let nearest = null;
      let minDistance = this.attackRange;

      for (const enemy of enemies) {
        const distance = this.distanceTo(enemy);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = enemy;
        }
      }

      return nearest;
    }
  }

  class Tower {
    constructor(side, health, maxHealth) {
      this.id = state.nextEntityId++;
      this.side = side;
      this.health = health;
      this.maxHealth = maxHealth;
      this.x = side === 'left' ? constants.LANE_LEFT + 80 : constants.LANE_RIGHT - 80;
      this.y = height / 2;
      this.width = 20;
      this.height = 60;
      this.ticksSinceLastAttack = 0;
      this.attackCooldown = constants.TICK_RATE / constants.TOWER_ATTACK_RATE;
      this.attackRange = constants.TOWER_ATTACK_RANGE;
      this.visionRange = constants.TOWER_VISION_RANGE;
      this.damage = constants.TOWER_DAMAGE;
      this.lastShotTarget = null;
      this.lastShotX = null;
      this.lastShotY = null;
      this.shotFlashTicks = 0;
      this.hitFlashTicks = 0;
      this.hitFlashMaxTicks = constants.HIT_FLASH_TOTAL_TICKS;
      this.hitFlashHoldTicks = constants.HIT_FLASH_HOLD_TICKS;
    }

    update() {
      this.ticksSinceLastAttack++;
      if (this.shotFlashTicks > 0) {
        this.shotFlashTicks--;
        if (this.shotFlashTicks === 0) {
          this.lastShotTarget = null;
          this.lastShotX = null;
          this.lastShotY = null;
        }
      }

      if (this.hitFlashTicks > 0) {
        this.hitFlashTicks--;
      }
    }

    takeDamage(damage) {
      this.health = Math.max(0, this.health - damage);
      this.hitFlashTicks = this.hitFlashMaxTicks;
    }

    isDestroyed() {
      return this.health <= 0;
    }

    canAttack() {
      return this.ticksSinceLastAttack >= this.attackCooldown;
    }

    resetAttackCooldown() {
      this.ticksSinceLastAttack = 0;
    }

    recordShot(target) {
      this.lastShotTarget = target;
      this.lastShotX = target.x;
      this.lastShotY = target.y;
      this.shotFlashTicks = 4;
    }

    distanceTo(target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    findNearestEnemy(enemies) {
      let nearest = null;
      let minDistance = this.attackRange;

      for (const enemy of enemies) {
        const distance = this.distanceTo(enemy);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = enemy;
        }
      }

      return nearest;
    }
  }

  const state = {
    gameTime: 0,
    leftBase: null,
    rightBase: null,
    leftTower: null,
    rightTower: null,
    peons: [],
    leftSpawnTimer: 0,
    rightSpawnTimer: 0,
    leftSpawnSlotIndex: 0,
    rightSpawnSlotIndex: 0,
    slashEffects: [],
    nextEntityId: 1,
    leftHpLost: 0,
    rightHpLost: 0,
    leftAttacksLanded: 0,
    rightAttacksLanded: 0,
    leftGold: 0,
    rightGold: 0,
    shrineControl: 'neutral',
    shrineTickCounter: 0,
    leftUpgrades: null,
    rightUpgrades: null,
    decisionLogEnabled: false,
    decisionLogMaxEntries: 8000,
    decisionLog: [],
  };

  function createUpgradeState() {
    return {
      damageLevel: 0,
      healthLevel: 0,
      spawnLevel: 0,
    };
  }

  function createSpawnSlots() {
    const laneHeight = constants.LANE_BOTTOM - constants.LANE_TOP;
    const laneCenterY = (constants.LANE_TOP + constants.LANE_BOTTOM) / 2;
    const maxSpread = Math.max(0, Math.floor(laneHeight / 2) - 2);
    const clampedSpread = Math.max(0, Math.min(constants.SPAWN_SLOT_PADDING, maxSpread));
    const usableTop = laneCenterY - clampedSpread;
    const usableBottom = laneCenterY + clampedSpread;
    const slotCount = Math.max(2, constants.SPAWN_SLOT_COUNT);
    const step = (usableBottom - usableTop) / (slotCount - 1);
    const slots = [];

    for (let index = 0; index < slotCount; index++) {
      slots.push(usableTop + index * step);
    }

    return slots;
  }

  const spawnSlots = [];

  function rebuildSpawnSlots() {
    const nextSlots = createSpawnSlots();
    spawnSlots.splice(0, spawnSlots.length, ...nextSlots);

    if (spawnSlots.length > 0) {
      state.leftSpawnSlotIndex = state.leftSpawnSlotIndex % spawnSlots.length;
      state.rightSpawnSlotIndex = state.rightSpawnSlotIndex % spawnSlots.length;
    }

    return spawnSlots;
  }

  function setSpawnLayout(config = {}) {
    const nextPadding = Number(config.padding);
    const nextSlotCount = Number(config.slotCount);

    if (Number.isFinite(nextPadding)) {
      constants.SPAWN_SLOT_PADDING = Math.max(0, Math.floor(nextPadding));
    }

    if (Number.isFinite(nextSlotCount)) {
      constants.SPAWN_SLOT_COUNT = Math.max(2, Math.floor(nextSlotCount));
    }

    rebuildSpawnSlots();

    return {
      padding: constants.SPAWN_SLOT_PADDING,
      slotCount: constants.SPAWN_SLOT_COUNT,
      slots: spawnSlots.slice(),
    };
  }

  function setStructureDamageScaling(config = {}) {
    const nextTowerPerMinute = Number(config.towerDamagePerMinute);
    const nextBasePerMinute = Number(config.baseDamagePerMinute);

    if (Number.isFinite(nextTowerPerMinute)) {
      constants.TOWER_DAMAGE_PER_MINUTE = Math.max(0, nextTowerPerMinute);
    }

    if (Number.isFinite(nextBasePerMinute)) {
      constants.BASE_DAMAGE_PER_MINUTE = Math.max(0, nextBasePerMinute);
    }

    updateStructureDamageByTime();

    return {
      towerDamagePerMinute: constants.TOWER_DAMAGE_PER_MINUTE,
      baseDamagePerMinute: constants.BASE_DAMAGE_PER_MINUTE,
    };
  }

  function setEconomyValues(config = {}) {
    const nextKillBountyGold = Number(config.killBountyGold);
    const nextShrineGoldPerSecond = Number(config.shrineGoldPerSecond);
    const nextUpgradeBaseCost = Number(config.upgradeBaseCost);

    if (Number.isFinite(nextKillBountyGold)) {
      constants.KILL_BOUNTY_GOLD = Math.max(0, Math.round(nextKillBountyGold));
    }

    if (Number.isFinite(nextShrineGoldPerSecond)) {
      constants.SHRINE_GOLD_PER_SECOND = Math.max(0, Math.round(nextShrineGoldPerSecond));
    }

    if (Number.isFinite(nextUpgradeBaseCost)) {
      constants.UPGRADE_BASE_COST = Math.max(0, Math.round(nextUpgradeBaseCost));
    }

    return {
      killBountyGold: constants.KILL_BOUNTY_GOLD,
      shrineGoldPerSecond: constants.SHRINE_GOLD_PER_SECOND,
      upgradeBaseCost: constants.UPGRADE_BASE_COST,
    };
  }

  function currentElapsedMinutes() {
    return state.gameTime / (constants.TICK_RATE * 60);
  }

  function updateStructureDamageByTime() {
    const elapsedMinutes = currentElapsedMinutes();
    const towerDamage = constants.TOWER_DAMAGE + elapsedMinutes * constants.TOWER_DAMAGE_PER_MINUTE;
    const baseDamage = constants.BASE_DAMAGE + elapsedMinutes * constants.BASE_DAMAGE_PER_MINUTE;

    state.leftTower.damage = towerDamage;
    state.rightTower.damage = towerDamage;
    state.leftBase.damage = baseDamage;
    state.rightBase.damage = baseDamage;
  }

  function initEntities() {
    state.nextEntityId = 1;
    state.leftBase = new Base('left', 2000, 2000);
    state.rightBase = new Base('right', 2000, 2000);
    state.leftTower = new Tower('left', constants.TOWER_HP, constants.TOWER_HP);
    state.rightTower = new Tower('right', constants.TOWER_HP, constants.TOWER_HP);
    state.peons = [];
    state.leftSpawnTimer = 0;
    state.rightSpawnTimer = 0;
    state.leftSpawnSlotIndex = 0;
    state.rightSpawnSlotIndex = 0;
    state.slashEffects = [];
    state.gameTime = 0;
    state.leftHpLost = 0;
    state.rightHpLost = 0;
    state.leftAttacksLanded = 0;
    state.rightAttacksLanded = 0;
    state.leftGold = 0;
    state.rightGold = 0;
    state.shrineControl = 'neutral';
    state.shrineTickCounter = 0;
    state.leftUpgrades = createUpgradeState();
    state.rightUpgrades = createUpgradeState();
    state.decisionLog = [];
    rebuildSpawnSlots();
    updateStructureDamageByTime();
  }

  function getUpgradesForSide(side) {
    return side === 'left' ? state.leftUpgrades : state.rightUpgrades;
  }

  function getGoldForSide(side) {
    return side === 'left' ? state.leftGold : state.rightGold;
  }

  function spendGold(side, amount) {
    if (amount <= 0) {
      return true;
    }

    const currentGold = getGoldForSide(side);
    if (currentGold < amount) {
      return false;
    }

    if (side === 'left') {
      state.leftGold -= amount;
    } else {
      state.rightGold -= amount;
    }

    return true;
  }

  function getUpgradeCost(level, type = 'generic') {
    const multiplierByType = {
      damage: constants.UPGRADE_DAMAGE_COST_MULTIPLIER,
      health: constants.UPGRADE_HEALTH_COST_MULTIPLIER,
      spawn: constants.UPGRADE_SPAWN_COST_MULTIPLIER,
    };

    const multiplier = multiplierByType[type] ?? 1;
    return Math.round(constants.UPGRADE_BASE_COST * multiplier * (2 ** level));
  }

  function getPeonStatsForSide(side) {
    const upgrades = getUpgradesForSide(side);
    return {
      maxHealth: constants.PEON_HP + upgrades.healthLevel * constants.UPGRADE_HEALTH_PER_LEVEL,
      damage: constants.PEON_DAMAGE + upgrades.damageLevel * constants.UPGRADE_DAMAGE_PER_LEVEL,
    };
  }

  function getSpawnCountForSide(side) {
    const upgrades = getUpgradesForSide(side);
    return constants.SPAWN_COUNT + upgrades.spawnLevel * constants.UPGRADE_SPAWN_COUNT_PER_LEVEL;
  }

  function getUpgradeSnapshot() {
    const left = state.leftUpgrades;
    const right = state.rightUpgrades;

    return {
      left: {
        damageLevel: left.damageLevel,
        healthLevel: left.healthLevel,
        spawnLevel: left.spawnLevel,
        nextDamageCost: getUpgradeCost(left.damageLevel, 'damage'),
        nextHealthCost: getUpgradeCost(left.healthLevel, 'health'),
        nextSpawnCost: getUpgradeCost(left.spawnLevel, 'spawn'),
      },
      right: {
        damageLevel: right.damageLevel,
        healthLevel: right.healthLevel,
        spawnLevel: right.spawnLevel,
        nextDamageCost: getUpgradeCost(right.damageLevel, 'damage'),
        nextHealthCost: getUpgradeCost(right.healthLevel, 'health'),
        nextSpawnCost: getUpgradeCost(right.spawnLevel, 'spawn'),
      },
    };
  }

  function buyUpgrade(side, type) {
    if (side !== 'left' && side !== 'right') {
      return { ok: false, reason: 'invalid-side' };
    }

    const upgrades = getUpgradesForSide(side);
    const typeToLevelKey = {
      damage: 'damageLevel',
      health: 'healthLevel',
      spawn: 'spawnLevel',
    };
    const levelKey = typeToLevelKey[type];
    if (!levelKey) {
      return { ok: false, reason: 'invalid-upgrade-type' };
    }

    const currentLevel = upgrades[levelKey];
    const cost = getUpgradeCost(currentLevel, type);
    if (!spendGold(side, cost)) {
      return { ok: false, reason: 'insufficient-gold', cost, currentGold: getGoldForSide(side) };
    }

    upgrades[levelKey]++;
    pushDecisionLog({
      event: 'upgrade',
      side,
      upgradeType: type,
      newLevel: upgrades[levelKey],
      cost,
      remainingGold: getGoldForSide(side),
    });

    return {
      ok: true,
      side,
      type,
      cost,
      newLevel: upgrades[levelKey],
      remainingGold: getGoldForSide(side),
    };
  }

  function awardGold(side, amount) {
    if (amount <= 0) {
      return;
    }

    if (side === 'left') {
      state.leftGold += amount;
    } else if (side === 'right') {
      state.rightGold += amount;
    }
  }

  function getShrineController(livingPeons) {
    const leftHasMapControl = livingPeons.some(peon => peon.side === 'left' && peon.x > width / 2);
    const rightHasMapControl = livingPeons.some(peon => peon.side === 'right' && peon.x < width / 2);

    if (leftHasMapControl && !rightHasMapControl) {
      return 'left';
    }

    if (rightHasMapControl && !leftHasMapControl) {
      return 'right';
    }

    return 'neutral';
  }

  function tickShrineIncome(livingPeons) {
    const controller = getShrineController(livingPeons);

    if (controller !== state.shrineControl) {
      state.shrineControl = controller;
      state.shrineTickCounter = 0;
    }

    if (controller === 'neutral') {
      return;
    }

    state.shrineTickCounter++;
    while (state.shrineTickCounter >= constants.TICK_RATE) {
      awardGold(controller, constants.SHRINE_GOLD_PER_SECOND);
      state.shrineTickCounter -= constants.TICK_RATE;
    }
  }

  function entityType(entity) {
    if (!entity) {
      return null;
    }

    if (typeof entity.isAlive === 'function') {
      return 'peon';
    }

    if (entity.width) {
      return 'tower';
    }

    return 'base';
  }

  function pushDecisionLog(entry) {
    if (!state.decisionLogEnabled) {
      return;
    }

    state.decisionLog.push({ tick: state.gameTime, ...entry });
    if (state.decisionLog.length > state.decisionLogMaxEntries) {
      state.decisionLog.shift();
    }
  }

  function setDecisionLogEnabled(enabled) {
    state.decisionLogEnabled = Boolean(enabled);
  }

  function clearDecisionLog() {
    state.decisionLog = [];
  }

  function getDecisionLog(limit = null) {
    if (typeof limit === 'number' && limit > 0) {
      return state.decisionLog.slice(-limit);
    }

    return state.decisionLog.slice();
  }

  function addSlashEffect(attacker, target) {
    state.slashEffects.push({
      fromX: attacker.x,
      fromY: attacker.y,
      toX: target.x,
      toY: target.y,
      side: attacker.side,
      ttl: constants.SLASH_EFFECT_TTL,
      maxTtl: constants.SLASH_EFFECT_TTL,
    });
  }

  function spawnUnits(side) {
    const spawnX = side === 'left' ? constants.LANE_LEFT + 20 : constants.LANE_RIGHT - 20;
    const spawnCount = getSpawnCountForSide(side);
    const peonStats = getPeonStatsForSide(side);

    for (let index = 0; index < spawnCount; index++) {
      const slotIndex = side === 'left' ? state.leftSpawnSlotIndex : state.rightSpawnSlotIndex;
      const spawnY = spawnSlots[slotIndex];
      state.peons.push(new Peon(side, spawnX, spawnY, peonStats));

      if (side === 'left') {
        state.leftSpawnSlotIndex = (state.leftSpawnSlotIndex + 1) % spawnSlots.length;
      } else {
        state.rightSpawnSlotIndex = (state.rightSpawnSlotIndex + 1) % spawnSlots.length;
      }
    }
  }

  function findNearestEnemyPeon(peon, enemies, maxRange = peon.visionRange) {
    let nearest = null;
    let minDistance = maxRange;
    const epsilon = 0.0001;

    for (const enemy of enemies) {
      if (!enemy.isAlive()) {
        continue;
      }

      const distance = peon.distanceTo(enemy);
      if (distance < minDistance - epsilon) {
        minDistance = distance;
        nearest = enemy;
      } else if (nearest && Math.abs(distance - minDistance) <= epsilon && enemy.id < nearest.id) {
        nearest = enemy;
      }
    }

    return nearest;
  }

  function isPeonEntity(entity) {
    return typeof entity?.isAlive === 'function';
  }

  function isEnemyAheadOrNearby(peon, enemyPeon) {
    const backwardTolerance = peon.attackRange + 8;

    if (peon.side === 'left') {
      return enemyPeon.x >= peon.x - backwardTolerance;
    }

    return enemyPeon.x <= peon.x + backwardTolerance;
  }

  function shouldKeepCurrentTarget(peon, currentTarget, crossedMidline, visibleEnemyTarget) {
    if (!isTargetAttackable(currentTarget)) {
      return false;
    }

    const targetDistance = peon.distanceTo(currentTarget);

    if (isPeonEntity(currentTarget)) {
      return targetDistance <= peon.attackRange
        || (targetDistance <= peon.visionRange && isEnemyAheadOrNearby(peon, currentTarget));
    }

    // Structures are only kept while no enemy peon is visible.
    // Crossing the midline relaxes structure vision gating, but it must not lock a peon
    // onto a structure once an enemy peon comes into view.
    if (visibleEnemyTarget) {
      return false;
    }

    return crossedMidline || targetDistance <= peon.visionRange;
  }

  function hasCrossedMidline(peon) {
    if (peon.side === 'left') {
      return peon.x >= width / 2;
    }

    return peon.x <= width / 2;
  }

  function findStructureTargetForPeon(peon, ignoreVision = false) {
    const canSee = target => ignoreVision || peon.distanceTo(target) <= peon.visionRange;

    if (peon.side === 'left') {
      if (!state.rightTower.isDestroyed() && canSee(state.rightTower)) {
        return state.rightTower;
      }

      if (!state.rightBase.isDestroyed() && canSee(state.rightBase)) {
        return state.rightBase;
      }

      return null;
    }

    if (!state.leftTower.isDestroyed() && canSee(state.leftTower)) {
      return state.leftTower;
    }

    if (!state.leftBase.isDestroyed() && canSee(state.leftBase)) {
      return state.leftBase;
    }

    return null;
  }

  function queueAttack(attackQueue, target, damage, attackerSide) {
    if (!target) {
      return;
    }

    attackQueue.push({ target, damage, attackerSide });
  }

  function findDesiredTargetForPeon(peon, enemyPeons) {
    const crossedMidline = hasCrossedMidline(peon);
    const forwardEnemyPeons = enemyPeons.filter(enemyPeon => isEnemyAheadOrNearby(peon, enemyPeon));
    const visibleEnemyTarget = findNearestEnemyPeon(peon, forwardEnemyPeons);
    const structureTarget = findStructureTargetForPeon(peon, crossedMidline);

    return {
      crossedMidline,
      visibleEnemyTarget,
      desiredTarget: visibleEnemyTarget || structureTarget,
    };
  }

  function chooseMeleeAttackTarget(peon, preferredTarget, enemyCandidates, plannedDamage) {
    const inRangeEnemies = enemyCandidates
      .filter(enemy => enemy.isAlive() && peon.distanceTo(enemy) <= peon.attackRange)
      .sort((a, b) => {
        const distanceDiff = peon.distanceTo(a) - peon.distanceTo(b);
        if (Math.abs(distanceDiff) > 0.0001) {
          return distanceDiff;
        }

        return a.id - b.id;
      });

    if (inRangeEnemies.length === 0) {
      return null;
    }

    const getRemainingHealth = enemy => enemy.health - (plannedDamage.get(enemy) || 0);
    const hasOtherViableTarget = currentEnemy => inRangeEnemies.some(enemy => enemy !== currentEnemy && getRemainingHealth(enemy) > 0);

    const preferredRemaining = preferredTarget
      ? getRemainingHealth(preferredTarget)
      : 0;

    if (
      preferredTarget
      && inRangeEnemies.includes(preferredTarget)
      && preferredRemaining > 0
      && (preferredRemaining > peon.damage || !hasOtherViableTarget(preferredTarget))
    ) {
      return preferredTarget;
    }

    const nearestDistance = peon.distanceTo(inRangeEnemies[0]);
    const distanceSlack = 4;
    const closeCandidates = inRangeEnemies.filter(enemy => peon.distanceTo(enemy) <= nearestDistance + distanceSlack);

    // First priority: if we can finish an enemy now, take the lowest HP executable kill.
    const killCandidates = closeCandidates.filter(enemy => {
      const remainingHealth = getRemainingHealth(enemy);
      return remainingHealth > 0
        && remainingHealth <= peon.damage
        && ((plannedDamage.get(enemy) || 0) === 0 || !hasOtherViableTarget(enemy));
    });

    if (killCandidates.length > 0) {
      killCandidates.sort((a, b) => {
        const remainingA = getRemainingHealth(a);
        const remainingB = getRemainingHealth(b);
        if (remainingA !== remainingB) {
          return remainingA - remainingB;
        }

        const distanceDiff = peon.distanceTo(a) - peon.distanceTo(b);
        if (Math.abs(distanceDiff) > 0.0001) {
          return distanceDiff;
        }

        return a.id - b.id;
      });

      return killCandidates[0];
    }

    closeCandidates.sort((a, b) => {
      const remainingA = getRemainingHealth(a);
      const remainingB = getRemainingHealth(b);
      if (remainingA !== remainingB) {
        return remainingA - remainingB;
      }

      const distanceDiff = peon.distanceTo(a) - peon.distanceTo(b);
      if (Math.abs(distanceDiff) > 0.0001) {
        return distanceDiff;
      }

      return a.id - b.id;
    });

    for (const enemy of closeCandidates) {
      const remainingHealth = getRemainingHealth(enemy);
      if (remainingHealth > 0) {
        return enemy;
      }
    }

    return closeCandidates[0] || inRangeEnemies[0];
  }

  function isTargetAttackable(target) {
    if (!target) {
      return false;
    }

    if (typeof target.isAlive === 'function') {
      return target.isAlive();
    }

    if (typeof target.isDestroyed === 'function') {
      return !target.isDestroyed();
    }

    return true;
  }

  function applyQueuedAttacks(attackQueue) {
    const damageByTarget = new Map();

    for (const attack of attackQueue) {
      const currentDamage = damageByTarget.get(attack.target) || 0;
      damageByTarget.set(attack.target, currentDamage + attack.damage);

      if (attack.attackerSide === 'left') {
        state.leftAttacksLanded++;
      } else if (attack.attackerSide === 'right') {
        state.rightAttacksLanded++;
      }
    }

    for (const [target, damage] of damageByTarget.entries()) {
      const targetKind = entityType(target);
      const structureProtected = targetKind === 'tower' && state.gameTime < constants.STRUCTURE_DAMAGE_GRACE_TICKS;
      const baseProtected = targetKind === 'base' && state.gameTime < constants.BASE_DAMAGE_GRACE_TICKS;
      const effectiveDamage = structureProtected || baseProtected ? 0 : damage;

      const healthBefore = target.health;
      target.takeDamage(effectiveDamage);
      const healthLost = Math.max(0, healthBefore - target.health);

      if (target.side === 'left') {
        state.leftHpLost += healthLost;
      } else if (target.side === 'right') {
        state.rightHpLost += healthLost;
      }

      if (isPeonEntity(target) && healthBefore > 0 && target.health <= 0) {
        const killerSide = target.side === 'left' ? 'right' : 'left';
        awardGold(killerSide, constants.KILL_BOUNTY_GOLD);
      }
    }
  }

  function tick() {
    for (const slash of state.slashEffects) {
      slash.ttl--;
    }
    state.slashEffects = state.slashEffects.filter(slash => slash.ttl > 0);

    state.leftSpawnTimer--;
    state.rightSpawnTimer--;

    if (state.leftSpawnTimer <= 0) {
      spawnUnits('left');
      state.leftSpawnTimer = constants.SPAWN_INTERVAL_TICKS;
    }

    if (state.rightSpawnTimer <= 0) {
      spawnUnits('right');
      state.rightSpawnTimer = constants.SPAWN_INTERVAL_TICKS;
    }

    state.leftBase.update();
    state.rightBase.update();
    state.leftTower.update();
    state.rightTower.update();
    updateStructureDamageByTime();

    // Clean up dead/off-lane peons and log death events before tick-summary
    const peonsBeforeCleanup = new Map(state.peons.map(p => [p.id, p]));
    
    state.peons = state.peons.filter(peon => {
      if (!peon.isAlive()) {
        return false;
      }

      if (!Number.isFinite(peon.x) || !Number.isFinite(peon.y)) {
        return false;
      }

      if (peon.isOffLane()) {
        return false;
      }

      if (peon.y < constants.LANE_TOP - 80 || peon.y > constants.LANE_BOTTOM + 80) {
        return false;
      }

      return true;
    });
    
    // Log death events for removed peons
    const peonsAfterCleanup = new Set(state.peons.map(p => p.id));
    for (const [peonId, peon] of peonsBeforeCleanup) {
      if (!peonsAfterCleanup.has(peonId)) {
        let killedBy = 'unknown';
        if (!peon.isAlive()) {
          killedBy = 'damage';
        } else if (!Number.isFinite(peon.x) || !Number.isFinite(peon.y)) {
          killedBy = 'invalid-position';
        } else if (peon.isOffLane()) {
          killedBy = 'off-lane';
        } else if (peon.y < constants.LANE_TOP - 80 || peon.y > constants.LANE_BOTTOM + 80) {
          killedBy = 'boundary';
        }
        
        pushDecisionLog({
          event: 'death',
          peonId: peon.id,
          side: peon.side,
          killedBy,
        });
      }
    }

    const livingPeons = state.peons.filter(peon => peon.isAlive() && !peon.isOffLane());
    const enemyPeonsLeft = livingPeons.filter(peon => peon.side === 'right');
    const enemyPeonsRight = livingPeons.filter(peon => peon.side === 'left');
    const attackQueue = [];
    const plannedDamage = new Map();

    for (const peon of livingPeons) {
      peon.update();
    }

    for (const peon of livingPeons) {
      const enemyPeons = peon.side === 'left' ? enemyPeonsLeft : enemyPeonsRight;
      const { crossedMidline, visibleEnemyTarget, desiredTarget } = findDesiredTargetForPeon(peon, enemyPeons);
      const previousTarget = peon.target;
      const keepCurrent = peon.target && shouldKeepCurrentTarget(peon, peon.target, crossedMidline, visibleEnemyTarget);
      const strategyTarget = keepCurrent ? peon.target : desiredTarget;

      // Melee override: always engage any enemy peon in attack range regardless of strategy target.
      // This prevents peons from ignoring enemies standing right next to them (e.g. at the midline crossing).
      const inMeleeRange = visibleEnemyTarget && peon.distanceTo(visibleEnemyTarget) <= peon.attackRange;
      const target = inMeleeRange ? visibleEnemyTarget : strategyTarget;

      if (target) {
        peon.setTarget(target);
        if (peon.canAttack()) {
          // Use all enemy peons as melee candidates — the midline filter is for strategic movement
          // only, not for who can be hit when already in melee range.
          let attackTarget = target;

          if (isPeonEntity(target)) {
            attackTarget = chooseMeleeAttackTarget(peon, target, enemyPeons, plannedDamage);
            if (!attackTarget) {
              attackTarget = target;
            }
          }

          if (attackTarget && isTargetAttackable(attackTarget) && peon.distanceTo(attackTarget) <= peon.attackRange) {
            queueAttack(attackQueue, attackTarget, peon.damage, peon.side);
            plannedDamage.set(attackTarget, (plannedDamage.get(attackTarget) || 0) + peon.damage);
            addSlashEffect(peon, attackTarget);
            peon.resetAttackCooldown();
            pushDecisionLog({
              event: 'attack',
              peonId: peon.id,
              side: peon.side,
              targetId: attackTarget.id,
              targetType: entityType(attackTarget),
              targetSide: attackTarget.side,
              damage: peon.damage,
            });
          }
        }

        if (!previousTarget || previousTarget.id !== target.id) {
          pushDecisionLog({
            event: 'retarget',
            peonId: peon.id,
            side: peon.side,
            fromTargetId: previousTarget ? previousTarget.id : null,
            toTargetId: target.id,
            toTargetType: entityType(target),
            crossedMidline,
          });
        }
      } else {
        peon.clearTarget();
        if (previousTarget) {
          pushDecisionLog({
            event: 'clear-target',
            peonId: peon.id,
            side: peon.side,
            fromTargetId: previousTarget.id,
          });
        }
      }
    }

    if (state.leftTower.canAttack() && !state.leftTower.isDestroyed()) {
      const target = state.leftTower.findNearestEnemy(enemyPeonsLeft);
      if (target) {
        queueAttack(attackQueue, target, state.leftTower.damage, state.leftTower.side);
        state.leftTower.resetAttackCooldown();
        state.leftTower.recordShot(target);
      }
    }

    if (state.rightTower.canAttack() && !state.rightTower.isDestroyed()) {
      const target = state.rightTower.findNearestEnemy(enemyPeonsRight);
      if (target) {
        queueAttack(attackQueue, target, state.rightTower.damage, state.rightTower.side);
        state.rightTower.resetAttackCooldown();
        state.rightTower.recordShot(target);
      }
    }

    if (state.leftBase.canAttack() && !state.leftBase.isDestroyed()) {
      const target = state.leftBase.findNearestEnemy(enemyPeonsLeft);
      if (target) {
        queueAttack(attackQueue, target, state.leftBase.damage, state.leftBase.side);
        state.leftBase.resetAttackCooldown();
        state.leftBase.recordShot(target);
      }
    }

    if (state.rightBase.canAttack() && !state.rightBase.isDestroyed()) {
      const target = state.rightBase.findNearestEnemy(enemyPeonsRight);
      if (target) {
        queueAttack(attackQueue, target, state.rightBase.damage, state.rightBase.side);
        state.rightBase.resetAttackCooldown();
        state.rightBase.recordShot(target);
      }
    }

    applyQueuedAttacks(attackQueue);

    const movementSnapshot = new Map(
      livingPeons
        .filter(peon => peon.isAlive())
        .map(peon => [peon.id, { x: peon.x, y: peon.y }])
    );

    for (const peon of livingPeons) {
        if (!peon.isAlive()) {
          continue;
        }

      if (peon.target && !isTargetAttackable(peon.target)) {
        peon.clearTarget();
      }

        if (peon.target) {
          const targetPosition = isPeonEntity(peon.target)
            ? movementSnapshot.get(peon.target.id) || peon.target
            : peon.target;
          peon.moveTowardTarget(targetPosition);
        } else {
        peon.move();
      }
    }

    tickShrineIncome(state.peons.filter(peon => peon.isAlive() && !peon.isOffLane()));

      pushDecisionLog({
        event: 'tick-summary',
        leftPeons: state.peons.filter(peon => peon.side === 'left' && peon.isAlive() && !peon.isOffLane()).length,
        rightPeons: state.peons.filter(peon => peon.side === 'right' && peon.isAlive() && !peon.isOffLane()).length,
        leftHpLost: state.leftHpLost,
        rightHpLost: state.rightHpLost,
        leftGold: state.leftGold,
        rightGold: state.rightGold,
        shrineControl: state.shrineControl,
        leftDamageLevel: state.leftUpgrades.damageLevel,
        leftHealthLevel: state.leftUpgrades.healthLevel,
        leftSpawnLevel: state.leftUpgrades.spawnLevel,
        rightDamageLevel: state.rightUpgrades.damageLevel,
        rightHealthLevel: state.rightUpgrades.healthLevel,
        rightSpawnLevel: state.rightUpgrades.spawnLevel,
      });

    state.gameTime++;
  }

  function addPeon(side, x, y, overrides = {}) {
    const peon = new Peon(side, x, y, getPeonStatsForSide(side));
    Object.assign(peon, overrides);
    state.peons.push(peon);
    return peon;
  }

  function clearPeons() {
    state.peons = [];
  }

  initEntities();

  return {
    constants,
    layout: {
      laneLeft: constants.LANE_LEFT,
      laneRight: constants.LANE_RIGHT,
      laneTop: constants.LANE_TOP,
      laneBottom: constants.LANE_BOTTOM,
      laneCenter: width / 2,
      spawnSlots,
      width,
      height,
    },
    state,
    tick,
    spawnUnits,
    setSpawnLayout,
    setStructureDamageScaling,
    setEconomyValues,
    buyUpgrade,
    getUpgradeSnapshot,
    initEntities,
    addPeon,
    clearPeons,
    setDecisionLogEnabled,
    clearDecisionLog,
    getDecisionLog,
    testHooks: {
      entityType,
      findNearestEnemyPeon,
      findDesiredTargetForPeon,
      findStructureTargetForPeon,
      queueAttack,
      chooseMeleeAttackTarget,
      isTargetAttackable,
    },
  };
}

if (typeof window !== 'undefined') {
  window.createSimulation = createSimulation;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createSimulation };
}