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
    LEFT_PEON_HP_BONUS: 5,
    PEON_DAMAGE: 10,
    PEON_ATTACK_RATE: 1,
    PEON_ATTACK_RANGE: 16,
    PEON_VISION_RANGE: 90,
    TOWER_ATTACK_RANGE: 150,
    TOWER_ATTACK_RATE: 0.5,
    TOWER_DAMAGE: 25,
    TOWER_VISION_RANGE: 150,
    BASE_ATTACK_RANGE: 200,
    BASE_ATTACK_RATE: 0.5,
    BASE_DAMAGE: 15,
    BASE_VISION_RANGE: 200,
    SPAWN_INTERVAL_TICKS: Math.floor(60 * 3),
    SPAWN_COUNT: options.spawnCount ?? 1,
    SPAWN_SLOT_PADDING: 40,
    SPAWN_SLOT_COUNT: 7,
  };

  class Peon {
    constructor(side, x, y) {
      this.id = state.nextEntityId++;
      this.side = side;
      this.x = x;
      this.y = y;
      this.maxHealth = constants.PEON_HP + (side === 'left' ? constants.LEFT_PEON_HP_BONUS : 0);
      this.health = this.maxHealth;
      this.size = constants.PEON_SIZE;
      this.velocityX = side === 'left' ? constants.PEON_SPEED : -constants.PEON_SPEED;
      this.attackCooldown = constants.TICK_RATE / constants.PEON_ATTACK_RATE;
      // Spawn-ready attack prevents "arrived but never swung" cases when units die quickly on contact.
      this.ticksSinceLastAttack = this.attackCooldown;
      this.attackRange = constants.PEON_ATTACK_RANGE;
      this.visionRange = constants.PEON_VISION_RANGE;
      this.damage = constants.PEON_DAMAGE;
      this.target = null;
    }

    update() {
      this.ticksSinceLastAttack++;
    }

    move() {
      if (!this.target) {
        this.x += this.velocityX / constants.TICK_RATE;
      }
    }

    moveTowardTarget() {
      if (!this.target) {
        return;
      }

      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
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
    }

    takeDamage(damage) {
      this.health = Math.max(0, this.health - damage);
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
    }

    takeDamage(damage) {
      this.health = Math.max(0, this.health - damage);
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
    decisionLogEnabled: false,
    decisionLogMaxEntries: 8000,
    decisionLog: [],
  };

  function createSpawnSlots() {
    const laneY = height / 2;
    const half = Math.floor(constants.SPAWN_SLOT_COUNT / 2);
    const step = 12;
    const slots = [];

    for (let index = 0; index < constants.SPAWN_SLOT_COUNT; index++) {
      slots.push(laneY + (index - half) * step);
    }

    return slots;
  }

  const spawnSlots = createSpawnSlots();

  function initEntities() {
    state.nextEntityId = 1;
    state.leftBase = new Base('left', 2000, 2000);
    state.rightBase = new Base('right', 2000, 2000);
    state.leftTower = new Tower('left', 500, 500);
    state.rightTower = new Tower('right', 500, 500);
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
    state.decisionLog = [];
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
    const midX = (attacker.x + target.x) * 0.5;
    const midY = (attacker.y + target.y) * 0.5;
    const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);

    state.slashEffects.push({
      x: midX,
      y: midY,
      angle,
      side: attacker.side,
      ttl: 10,
      maxTtl: 10,
    });
  }

  function spawnUnits(side) {
    const spawnX = side === 'left' ? constants.LANE_LEFT + 20 : constants.LANE_RIGHT - 20;

    for (let index = 0; index < constants.SPAWN_COUNT; index++) {
      const slotIndex = side === 'left' ? state.leftSpawnSlotIndex : state.rightSpawnSlotIndex;
      const spawnY = spawnSlots[slotIndex];
      state.peons.push(new Peon(side, spawnX, spawnY));

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

  function shouldKeepCurrentTarget(peon, currentTarget, crossedMidline, visibleEnemyTarget, desiredTarget) {
    if (!isTargetAttackable(currentTarget)) {
      return false;
    }

    if (crossedMidline && desiredTarget && desiredTarget !== currentTarget) {
      const currentIsPeon = isPeonEntity(currentTarget);
      const desiredIsPeon = isPeonEntity(desiredTarget);
      if (!currentIsPeon && desiredIsPeon) {
        return false;
      }
    }

    const targetDistance = peon.distanceTo(currentTarget);

    // Controlled retargeting: switch only when the new candidate is clearly better.
    if (desiredTarget && desiredTarget !== currentTarget) {
      const desiredDistance = peon.distanceTo(desiredTarget);
      const switchAdvantage = 8;
      if (desiredDistance + switchAdvantage < targetDistance) {
        return false;
      }
    }

    if (isPeonEntity(currentTarget)) {
      return targetDistance <= peon.visionRange;
    }

    if (crossedMidline) {
      return true;
    }

    // Before midline, keep structure target only when no enemy peon is visible.
    return !visibleEnemyTarget && targetDistance <= peon.visionRange;
  }

  function hasCrossedMidline(peon) {
    if (peon.side === 'left') {
      return peon.x >= width / 2;
    }

    return peon.x <= width / 2;
  }

  function isOnAttackerSide(peon, enemyPeon) {
    if (peon.side === 'left') {
      return enemyPeon.x >= width / 2;
    }

    return enemyPeon.x <= width / 2;
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

    const preferredRemaining = preferredTarget
      ? preferredTarget.health - (plannedDamage.get(preferredTarget) || 0)
      : 0;

    if (preferredTarget && inRangeEnemies.includes(preferredTarget) && preferredRemaining > 0) {
      return preferredTarget;
    }

    const nearestDistance = peon.distanceTo(inRangeEnemies[0]);
    const distanceSlack = 4;
    const closeCandidates = inRangeEnemies.filter(enemy => peon.distanceTo(enemy) <= nearestDistance + distanceSlack);

    // First priority: if we can finish an enemy now, take the lowest HP executable kill.
    const killCandidates = closeCandidates.filter(enemy => {
      const remainingHealth = enemy.health - (plannedDamage.get(enemy) || 0);
      return remainingHealth > 0 && remainingHealth <= peon.damage;
    });

    if (killCandidates.length > 0) {
      killCandidates.sort((a, b) => {
        const remainingA = a.health - (plannedDamage.get(a) || 0);
        const remainingB = b.health - (plannedDamage.get(b) || 0);
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
      const remainingA = a.health - (plannedDamage.get(a) || 0);
      const remainingB = b.health - (plannedDamage.get(b) || 0);
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
      const remainingHealth = enemy.health - (plannedDamage.get(enemy) || 0);
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
      const healthBefore = target.health;
      target.takeDamage(damage);
      const healthLost = Math.max(0, healthBefore - target.health);

      if (target.side === 'left') {
        state.leftHpLost += healthLost;
      } else if (target.side === 'right') {
        state.rightHpLost += healthLost;
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

    const livingPeons = state.peons.filter(peon => peon.isAlive() && !peon.isOffLane());
    const enemyPeonsLeft = livingPeons.filter(peon => peon.side === 'right');
    const enemyPeonsRight = livingPeons.filter(peon => peon.side === 'left');
    const attackQueue = [];
    const plannedDamage = new Map();

    pushDecisionLog({
      event: 'tick-summary',
      leftPeons: enemyPeonsRight.length,
      rightPeons: enemyPeonsLeft.length,
      leftHpLost: state.leftHpLost,
      rightHpLost: state.rightHpLost,
    });

    for (const peon of livingPeons) {
      peon.update();
    }

    for (const peon of livingPeons) {
      const crossedMidline = hasCrossedMidline(peon);
      const enemyPeons = peon.side === 'left' ? enemyPeonsLeft : enemyPeonsRight;
      let enemyCandidatesForMelee = enemyPeons;

      let desiredTarget = null;
      if (crossedMidline) {
        // Post-midline hunt: clear enemy peons on attacker side first, then structures.
        const enemiesOnAttackerSide = enemyPeons.filter(enemyPeon => isOnAttackerSide(peon, enemyPeon));
        enemyCandidatesForMelee = enemiesOnAttackerSide;
        const huntTarget = findNearestEnemyPeon(peon, enemiesOnAttackerSide, Number.POSITIVE_INFINITY);
        desiredTarget = huntTarget || findStructureTargetForPeon(peon, true);
      } else {
        const enemyPeonTarget = findNearestEnemyPeon(peon, enemyPeons);
        const structureTarget = enemyPeonTarget ? null : findStructureTargetForPeon(peon, false);
        desiredTarget = enemyPeonTarget || structureTarget;
      }

      const visibleEnemyTarget = findNearestEnemyPeon(peon, enemyPeons);
      const previousTarget = peon.target;
      const keepCurrent = peon.target && shouldKeepCurrentTarget(peon, peon.target, crossedMidline, visibleEnemyTarget, desiredTarget);
      const target = keepCurrent ? peon.target : desiredTarget;

      if (target) {
        peon.setTarget(target);
        if (peon.canAttack()) {
          let attackTarget = target;

          if (peon.side === 'left' && isPeonEntity(target)) {
            attackTarget = chooseMeleeAttackTarget(peon, target, enemyCandidatesForMelee, plannedDamage);
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

    for (const peon of livingPeons) {
        if (!peon.isAlive()) {
          continue;
        }

      if (peon.target && !isTargetAttackable(peon.target)) {
        peon.clearTarget();
      }

        if (peon.target) {
          peon.moveTowardTarget();
        } else {
        peon.move();
      }
    }

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
    state.gameTime++;
  }

  function addPeon(side, x, y, overrides = {}) {
    const peon = new Peon(side, x, y);
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
    initEntities,
    addPeon,
    clearPeons,
    setDecisionLogEnabled,
    clearDecisionLog,
    getDecisionLog,
    testHooks: {
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