(function(globalScope) {
  function createGameSelection({ canvas, baseCanvasWidth, baseCanvasHeight, state, getSelectionInfoEl }) {
    let selectedEntityRef = null;

    function pickEntityFromCanvasClick(event) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = baseCanvasWidth / rect.width;
      const scaleY = baseCanvasHeight / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      const candidates = [];

      for (const peon of state.peons) {
        if (!peon.isAlive()) {
          continue;
        }

        const dx = x - peon.x;
        const dy = y - peon.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= peon.size + 4) {
          candidates.push({ type: 'peon', entity: peon, distance });
        }
      }

      const towerHitPadding = 6;
      for (const tower of [state.leftTower, state.rightTower]) {
        if (tower.isDestroyed()) {
          continue;
        }

        const halfW = tower.width / 2 + towerHitPadding;
        const halfH = tower.height / 2 + towerHitPadding;
        if (x >= tower.x - halfW && x <= tower.x + halfW && y >= tower.y - halfH && y <= tower.y + halfH) {
          const dx = x - tower.x;
          const dy = y - tower.y;
          candidates.push({ type: 'tower', entity: tower, distance: Math.sqrt(dx * dx + dy * dy) });
        }
      }

      for (const base of [state.leftBase, state.rightBase]) {
        if (base.isDestroyed()) {
          continue;
        }

        const dx = x - base.x;
        const dy = y - base.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= base.size + 6) {
          candidates.push({ type: 'base', entity: base, distance });
        }
      }

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => a.distance - b.distance);
      return candidates[0];
    }

    function updateSelectionHud() {
      const selectionInfoEl = getSelectionInfoEl();
      if (!selectionInfoEl) {
        return;
      }

      if (!selectedEntityRef) {
        selectionInfoEl.textContent = 'Click a unit or structure to inspect stats.';
        return;
      }

      const { type, entity } = selectedEntityRef;
      if (!entity) {
        selectionInfoEl.textContent = 'Selection unavailable.';
        return;
      }

      if (type === 'peon' && !entity.isAlive()) {
        selectionInfoEl.textContent = 'Selected peon died.';
        return;
      }

      if ((type === 'tower' || type === 'base') && entity.isDestroyed()) {
        selectionInfoEl.textContent = `Selected ${type} is destroyed.`;
        return;
      }

      const hp = `${entity.health}/${entity.maxHealth}`;
      const dmg = Number.isFinite(entity.damage) ? entity.damage : '-';
      const range = Number.isFinite(entity.attackRange) ? entity.attackRange : '-';
      const side = entity.side ?? '-';
      const id = Number.isFinite(entity.id) ? entity.id : '-';
      selectionInfoEl.textContent = `${type.toUpperCase()} #${id} | side ${side} | HP ${hp} | DMG ${dmg} | RNG ${range}`;
    }

    function handleCanvasClick(event) {
      selectedEntityRef = pickEntityFromCanvasClick(event);
      updateSelectionHud();
    }

    function clearSelection() {
      selectedEntityRef = null;
    }

    return {
      clearSelection,
      handleCanvasClick,
      updateSelectionHud,
    };
  }

  const api = { createGameSelection };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.LegionGameSelection = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);