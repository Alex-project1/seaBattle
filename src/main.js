import './style.scss'

let size = null;
let dragging = false;
let touchTarget = null;
let movingShip = null;        // данные о перемещаемом корабле (координаты + id)
let currentShipSource = null; // .ship-piece, из которого тянем корабль
let currentShipId = null;     // id корабля (связывает палитру и клетки на поле)
let shipPieceIdCounter = 0;   // счётчик для уникальных id кораблей
let currentOrientation = 'horizontal'; // ориентация текущего перетаскиваемого/вращаемого корабля

// для мобильного тапа по кораблям на панели
let pendingShipPiece = null;
let panelTouchStartX = 0;
let panelTouchStartY;

// для мобильного тапа / drag по кораблям на поле
let pendingBoardCell = null;
let boardTouchStartX = 0;
let boardTouchStartY = 0;
const TAP_MOVE_THRESHOLD = 10; // порог в пикселях, чтобы отличить тап от жеста перетаскивания

const readyBtn = document.getElementById('readyBtn');

const shipBoxes = document.querySelectorAll('.ship-piece');
const shipBox = document.querySelector('.ships');

// превью перетаскиваемого корабля
let dragPreviewEl = null;

// ================== Служебные ==================
function isNotAllShipsIsDone() {
  if (!readyBtn.classList.contains('notReady')) {
    readyBtn.classList.add('notReady');
  }
  if (!shipBox.classList.contains('notReady')) {
    shipBox.classList.remove('done');
  }
}

function isAllShipsIsDone() {
  const isNotReady = [];
  console.log('ewewe');
  shipBoxes.forEach(ship => {
    if (!ship.classList.contains('done')) isNotReady.push('not');
  });
  if (isNotReady.length == 0) {
    readyBtn.classList.remove('notReady');
    shipBox.classList.add('done');
  }
}

// ================== Превью корабля (призрак) ==================
function createDragPreview(length, orientation) {
  if (dragPreviewEl) {
    dragPreviewEl.remove();
  }

  const preview = document.createElement('div');
  preview.classList.add('drag-preview');
  if (orientation === 'vertical') preview.classList.add('vertical');

  for (let i = 0; i < length; i++) {
    const item = document.createElement('div');
    item.classList.add('ship-piece-item');
    preview.appendChild(item);
  }

  document.body.appendChild(preview);
  dragPreviewEl = preview;
}

function updateDragPreviewPosition(x, y) {
  if (!dragPreviewEl) return;
  dragPreviewEl.style.left = `${x}px`;
  dragPreviewEl.style.top = `${y}px`;
}

function hideDragPreview() {
  if (!dragPreviewEl) return;
  dragPreviewEl.remove();
  dragPreviewEl = null;
}

// ================== Утилиты для кораблей на поле ==================
function getShipCellsFromCell(cell) {
  if (!cell.classList.contains('cell') || !cell.classList.contains('ship')) return [];

  const shipId = cell.dataset.shipId || null;
  const y = parseInt(cell.dataset.y, 10);
  const x = parseInt(cell.dataset.x, 10);
  const shipCells = [cell];

  // определяем ориентацию по соседям
  let orientation = 'single';

  const left = document.querySelector(`.cell[data-x="${x - 1}"][data-y="${y}"]`);
  const right = document.querySelector(`.cell[data-x="${x + 1}"][data-y="${y}"]`);
  const up = document.querySelector(`.cell[data-x="${x}"][data-y="${y - 1}"]`);
  const down = document.querySelector(`.cell[data-x="${x}"][data-y="${y + 1}"]`);

  if (
    (left && left.classList.contains('ship') && left.dataset.shipId === shipId) ||
    (right && right.classList.contains('ship') && right.dataset.shipId === shipId)
  ) {
    orientation = 'horizontal';
  } else if (
    (up && up.classList.contains('ship') && up.dataset.shipId === shipId) ||
    (down && down.classList.contains('ship') && down.dataset.shipId === shipId)
  ) {
    orientation = 'vertical';
  }

  if (orientation === 'horizontal') {
    // идём влево
    let xx = x - 1;
    while (xx >= 0) {
      const c = document.querySelector(`.cell[data-x="${xx}"][data-y="${y}"]`);
      if (c && c.classList.contains('ship') && c.dataset.shipId === shipId) {
        shipCells.unshift(c);
        xx--;
      } else break;
    }

    // идём вправо
    xx = x + 1;
    while (xx < 10) {
      const c = document.querySelector(`.cell[data-x="${xx}"][data-y="${y}"]`);
      if (c && c.classList.contains('ship') && c.dataset.shipId === shipId) {
        shipCells.push(c);
        xx++;
      } else break;
    }
  } else if (orientation === 'vertical') {
    // идём вверх
    let yy = y - 1;
    while (yy >= 0) {
      const c = document.querySelector(`.cell[data-x="${x}"][data-y="${yy}"]`);
      if (c && c.classList.contains('ship') && c.dataset.shipId === shipId) {
        shipCells.unshift(c);
        yy--;
      } else break;
    }

    // идём вниз
    yy = y + 1;
    while (yy < 10) {
      const c = document.querySelector(`.cell[data-x="${x}"][data-y="${yy}"]`);
      if (c && c.classList.contains('ship') && c.dataset.shipId === shipId) {
        shipCells.push(c);
        yy++;
      } else break;
    }
  }

  return shipCells;
}

// ================== Drag корабля с поля (ПК) ==================
function handleBoardShipDragStart(e) {
  const cell = e.target;

  // важно: начинаем перенос только если это именно клетка с кораблём
  if (!cell.classList.contains('cell') || !cell.classList.contains('ship')) {
    if (e.preventDefault) e.preventDefault();
    return;
  }

  const shipCells = getShipCellsFromCell(cell);
  if (!shipCells.length) return;

  const shipId = cell.dataset.shipId || null;

  // определяем ориентацию корабля
  const first = shipCells[0];
  const sameY = shipCells.every(c => c.dataset.y === first.dataset.y);
  const sameX = shipCells.every(c => c.dataset.x === first.dataset.x);

  let shipOrientation = 'horizontal';
  if (shipCells.length > 1 && sameX) shipOrientation = 'vertical';
  currentOrientation = shipOrientation;

  // запоминаем исходные координаты корабля
  movingShip = {
    coords: shipCells.map(c => ({
      x: parseInt(c.dataset.x, 10),
      y: parseInt(c.dataset.y, 10),
    })),
    shipId,
  };

  currentShipSource = null;
  currentShipId = shipId;
  size = shipCells.length;

  // временно убираем корабль с поля
  shipCells.forEach(clearShipFromCell);

  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', 'ship-move');
    e.dataTransfer.effectAllowed = 'move';
  }

  // превью перетаскиваемого корабля
  createDragPreview(size, currentOrientation);
  updateDragPreviewPosition(e.clientX, e.clientY);
}

function handleBoardShipDragEnd() {
  // убираем превью
  hideDragPreview();

  // Если dragend сработал, а movingShip ещё не был обнулён — корабль выкинули за поле
  if (movingShip && movingShip.shipId) {
    const source = document.querySelector(
      `.ship-piece[data-ship-id="${movingShip.shipId}"]`
    );
    if (source) {
      source.classList.remove('done');
      isNotAllShipsIsDone();
    }
  }

  size = null;
  movingShip = null;
  currentShipSource = null;
  currentShipId = null;
  currentOrientation = 'horizontal';
  clearHighlights();
}

// ================== Touch-старт корабля с поля (мобилка) ==================
function handleBoardShipTouchStart(e) {
  const cell = e.target.closest('.cell');
  if (!cell || !cell.classList.contains('ship')) return;

  const touch = e.touches[0];
  e.preventDefault();

  pendingBoardCell = cell;
  boardTouchStartX = touch.clientX;
  boardTouchStartY = touch.clientY;
}

function makeCellShip(cell) {
  cell.classList.add('ship');
  cell.classList.remove('highlight', 'error');

  // привязываем клетку к конкретному кораблю (из палитры)
  if (currentShipId) {
    cell.dataset.shipId = currentShipId;
  }

  cell.setAttribute('draggable', 'true');
  cell.addEventListener('dragstart', handleBoardShipDragStart);
  cell.addEventListener('dragend', handleBoardShipDragEnd);
  cell.addEventListener('touchstart', handleBoardShipTouchStart, { passive: false });
}

function clearShipFromCell(cell) {
  cell.classList.remove('ship', 'highlight', 'error');
  delete cell.dataset.shipId;
  // НЕ трогаем draggable и обработчики — чтобы dragend/touchend отработали корректно
}

// ================== Создание доски ==================
function createBoard(boxId) {
  const board = document.getElementById(boxId);

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.y = y;
      cell.dataset.x = x;
      board.appendChild(cell);

      // Drag & Drop для ПК
      cell.addEventListener('dragover', handleDragOver);
      cell.addEventListener('dragleave', clearHighlights);
      cell.addEventListener('drop', handleDrop);

      // Клик по клетке для поворота корабля (десктоп)
      cell.addEventListener('click', handleCellClick);
    }
  }
}

// ================== Drag / Drop ПК ==================
function handleDragOver(e) {
  e.preventDefault();
  if (!size) return;
  const cell = e.target.classList.contains('cell')
    ? e.target
    : e.target.closest('.cell');
  if (!cell) return;
  highlightPlacement(cell);
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
  e.preventDefault();
  if (!size) return;

  const cell = e.target.classList.contains('cell')
    ? e.target
    : e.target.closest('.cell');
  if (!cell) return;

  const placed = placeShip(cell);

  clearHighlights();
  size = null;

  // если это был перенос существующего корабля и поставить не получилось — откатить
  if (!placed && movingShip) {
    movingShip.coords.forEach(({ x, y }) => {
      const originCell = document.querySelector(
        `.cell[data-x="${x}"][data-y="${y}"]`
      );
      if (originCell) {
        currentShipId = movingShip.shipId || null;
        makeCellShip(originCell);
      }
    });
  }

  // если перетаскивали корабль с панели и успешно поставили — помечаем как использованный
  if (placed && currentShipSource) {
    currentShipSource.classList.add('done');
    isAllShipsIsDone();
  }

  currentShipSource = null;
  currentShipId = null;
  movingShip = null;
  currentOrientation = 'horizontal';
  // если сброс был вне поля — handleDrop не вызовется, корабль уже удалён
}

// ================== Touch для мобильных (общий) ==================
function handleTouchMove(e) {
  const touch = e.touches[0];

  // --- жест с панели: превращаем тап в drag, если ушли дальше порога ---
  if (pendingShipPiece && !dragging) {
    const dx = touch.clientX - panelTouchStartX;
    const dy = touch.clientY - panelTouchStartY;

    if (Math.abs(dx) > TAP_MOVE_THRESHOLD || Math.abs(dy) > TAP_MOVE_THRESHOLD) {
      const box = pendingShipPiece;
      pendingShipPiece = null;

      if (!box.classList.contains('done')) {
        size = parseInt(box.dataset.size, 10);
        dragging = true;
        currentShipSource = box;
        currentShipId = box.dataset.shipId;
        currentOrientation = box.dataset.orientation || 'horizontal';

        // превью для touch-drag с палитры
        createDragPreview(size, currentOrientation);
      }
    } else {
      // пока считаем это потенциальным тапом — не мешаем скроллу
      return;
    }
  }

  // --- жест с поля: превращаем тап в drag, если ушли дальше порога ---
  if (pendingBoardCell && !dragging) {
    const dx = touch.clientX - boardTouchStartX;
    const dy = touch.clientY - boardTouchStartY;

    if (Math.abs(dx) > TAP_MOVE_THRESHOLD || Math.abs(dy) > TAP_MOVE_THRESHOLD) {
      const cell = pendingBoardCell;

      const shipCells = getShipCellsFromCell(cell);
      if (!shipCells.length) {
        pendingBoardCell = null;
        return;
      }

      const shipId = cell.dataset.shipId || null;

      const first = shipCells[0];
      const sameY = shipCells.every(c => c.dataset.y === first.dataset.y);
      const sameX = shipCells.every(c => c.dataset.x === first.dataset.x);

      let shipOrientation = 'horizontal';
      if (shipCells.length > 1 && sameX) shipOrientation = 'vertical';
      currentOrientation = shipOrientation;

      movingShip = {
        coords: shipCells.map(c => ({
          x: parseInt(c.dataset.x, 10),
          y: parseInt(c.dataset.y, 10),
        })),
        shipId,
      };

      size = shipCells.length;
      dragging = true;
      currentShipSource = null;
      currentShipId = shipId;

      shipCells.forEach(clearShipFromCell);

      pendingBoardCell = null;

      // превью для touch-drag с поля
      createDragPreview(size, currentOrientation);
    } else {
      // пока считаем это потенциальным тапом
      return;
    }
  }

  if (!dragging || !size) return;

  e.preventDefault();

  const element = document.elementFromPoint(touch.clientX, touch.clientY);

  if (element && element.classList.contains('cell')) {
    clearHighlights();
    highlightPlacement(element);
    touchTarget = element;
  } else {
    // палец ушёл за пределы поля
    clearHighlights();
    touchTarget = null;
  }

  // двигаем призрак корабля за пальцем
  updateDragPreviewPosition(touch.clientX, touch.clientY);
}

function handleTouchEnd(e) {
  // ===== ТАП по кораблю на панели: смена ориентации =====
  if (pendingShipPiece && !dragging) {
    const box = pendingShipPiece;
    pendingShipPiece = null;

    e.preventDefault();

    if (!box.classList.contains('done')) {
      const current = box.dataset.orientation || 'horizontal';
      const next = current === 'horizontal' ? 'vertical' : 'horizontal';
      box.dataset.orientation = next;
      box.classList.toggle('vertical', next === 'vertical'); // под это можно стили добавить
    }

    touchTarget = null;
    size = null;
    movingShip = null;
    currentShipSource = null;
    currentShipId = null;
    currentOrientation = 'horizontal';
    clearHighlights();
    return;
  }

  // ===== ТАП по кораблю на поле: поворот =====
  if (pendingBoardCell && !dragging) {
    const cell = pendingBoardCell;
    pendingBoardCell = null;

    e.preventDefault();

    rotateShipAtCell(cell);

    touchTarget = null;
    size = null;
    movingShip = null;
    currentShipSource = null;
    currentShipId = null;
    currentOrientation = 'horizontal';
    clearHighlights();
    return;
  }

  // ===== Завершение drag'а (перенос с панели или с поля) =====
  if (dragging && size) {
    e.preventDefault();
    let placed = false;

    // убираем превью при отпускании пальца
    hideDragPreview();

    if (touchTarget && touchTarget.classList.contains('cell')) {
      placed = placeShip(touchTarget);
    }

    if (!placed && movingShip) {
      if (touchTarget) {
        // пытались поставить в плохое место -> вернём корабль назад
        movingShip.coords.forEach(({ x, y }) => {
          const originCell = document.querySelector(
            `.cell[data-x="${x}"][data-y="${y}"]`
          );
          if (originCell) {
            currentShipId = movingShip.shipId || null;
            makeCellShip(originCell);
          }
        });
      } else {
        // выкинули корабль за пределы поля -> освобождаем соответствующий ship-piece
        if (movingShip.shipId) {
          const source = document.querySelector(
            `.ship-piece[data-ship-id="${movingShip.shipId}"]`
          );
          if (source) {
            source.classList.remove('done');
            isNotAllShipsIsDone();
          }
        }
      }
    }

    // если тянули с панели и успешно поставили — помечаем как использованный
    if (placed && currentShipSource) {
      currentShipSource.classList.add('done');
      isAllShipsIsDone();
    }
  }

  dragging = false;
  touchTarget = null;
  size = null;
  movingShip = null;
  currentShipSource = null;
  currentShipId = null;
  currentOrientation = 'horizontal';
  pendingShipPiece = null;
  pendingBoardCell = null;
  clearHighlights();
}

// ================== Подсветка ==================
function clearHighlights() {
  document
    .querySelectorAll(
      '.highlight, .error, .around-highlight, .around-error'
    )
    .forEach(c =>
      c.classList.remove(
        'highlight',
        'error',
        'around-highlight',
        'around-error'
      )
    );
}

function highlightPlacement(cell) {
  if (!cell.classList.contains('cell') || !size) return;

  clearHighlights();

  const startX = parseInt(cell.dataset.x);
  const startY = parseInt(cell.dataset.y);
  const orientation = currentOrientation || 'horizontal';

  const shipCells = [];
  let fits = true;

  if (orientation === 'horizontal') {
    fits = startX + size <= 10;
    for (let i = 0; i < size; i++) {
      const target = document.querySelector(
        `.cell[data-x="${startX + i}"][data-y="${startY}"]`
      );
      if (target) shipCells.push(target);
    }
  } else {
    fits = startY + size <= 10;
    for (let i = 0; i < size; i++) {
      const target = document.querySelector(
        `.cell[data-x="${startX}"][data-y="${startY + i}"]`
      );
      if (target) shipCells.push(target);
    }
  }

  const hasShip = shipCells.some(c => c.classList.contains('ship'));

  const adjacentCells = [];
  shipCells.forEach(c => {
    const x = parseInt(c.dataset.x);
    const y = parseInt(c.dataset.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighbor = document.querySelector(
          `.cell[data-x="${x + dx}"][data-y="${y + dy}"]`
        );
        if (
          neighbor &&
          !shipCells.includes(neighbor) &&
          !adjacentCells.includes(neighbor)
        ) {
          adjacentCells.push(neighbor);
        }
      }
    }
  });

  const hasAdjacentShip = adjacentCells.some(c =>
    c.classList.contains('ship')
  );
  const canPlace = fits && !hasShip && !hasAdjacentShip;

  shipCells.forEach(c =>
    c.classList.add(canPlace ? 'highlight' : 'error')
  );
  adjacentCells.forEach(c =>
    c.classList.add(canPlace ? 'around-highlight' : 'around-error')
  );
}

// ================== Размещение корабля ==================
function placeShip(cell) {
  if (!cell.classList.contains('cell') || !size) return false;

  const startX = parseInt(cell.dataset.x);
  const startY = parseInt(cell.dataset.y);
  const orientation = currentOrientation || 'horizontal';

  const shipCells = [];
  let fits = true;

  if (orientation === 'horizontal') {
    fits = startX + size <= 10;
    for (let i = 0; i < size; i++) {
      const target = document.querySelector(
        `.cell[data-x="${startX + i}"][data-y="${startY}"]`
      );
      if (target) shipCells.push(target);
    }
  } else {
    fits = startY + size <= 10;
    for (let i = 0; i < size; i++) {
      const target = document.querySelector(
        `.cell[data-x="${startX}"][data-y="${startY + i}"]`
      );
      if (target) shipCells.push(target);
    }
  }

  const adjacentCells = [];
  shipCells.forEach(c => {
    const x = parseInt(c.dataset.x);
    const y = parseInt(c.dataset.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighbor = document.querySelector(
          `.cell[data-x="${x + dx}"][data-y="${y + dy}"]`
        );
        if (
          neighbor &&
          !shipCells.includes(neighbor) &&
          !adjacentCells.includes(neighbor)
        ) {
          adjacentCells.push(neighbor);
        }
      }
    }
  });

  const hasShip = shipCells.some(c => c.classList.contains('ship'));
  const hasAdjacentShip = adjacentCells.some(c =>
    c.classList.contains('ship')
  );
  const canPlace = fits && !hasShip && !hasAdjacentShip;

  if (!canPlace) return false;

  shipCells.forEach(makeCellShip);

  return true;
}

// ================== Клик по клетке поля (поворот корабля, десктоп) ==================
function handleCellClick(e) {
  const cell = e.target;
  if (!cell.classList.contains('ship')) return;
  // не крутим во время drag'а
  if (movingShip || size) return;

  rotateShipAtCell(cell);
}

function rotateShipAtCell(cell) {
  if (!cell.classList.contains('ship')) return;

  const shipCells = getShipCellsFromCell(cell);
  const length = shipCells.length;
  if (!length || length === 1) return; // одиночку крутить бессмысленно

  const shipId = cell.dataset.shipId;

  // определяем текущую ориентацию
  const first = shipCells[0];
  const sameY = shipCells.every(c => c.dataset.y === first.dataset.y);
  const sameX = shipCells.every(c => c.dataset.x === first.dataset.x);

  let oldOrientation = 'horizontal';
  if (length > 1 && sameX) oldOrientation = 'vertical';

  const newOrientation =
    oldOrientation === 'horizontal' ? 'vertical' : 'horizontal';

  const oldCoords = shipCells.map(c => ({
    x: parseInt(c.dataset.x, 10),
    y: parseInt(c.dataset.y, 10),
  }));

  const pivotX = parseInt(cell.dataset.x, 10);
  const pivotY = parseInt(cell.dataset.y, 10);

  // временно убираем корабль
  shipCells.forEach(clearShipFromCell);

  currentShipId = shipId;
  size = length;
  currentOrientation = newOrientation;

  let placed = false;

  if (newOrientation === 'horizontal') {
    // пробуем все возможные стартовые X, чтобы pivotX входил в корабль
    for (let startX = pivotX - (length - 1); startX <= pivotX; startX++) {
      if (startX < 0 || startX + length > 10) continue;
      const startCell = document.querySelector(
        `.cell[data-x="${startX}"][data-y="${pivotY}"]`
      );
      if (!startCell) continue;
      if (placeShip(startCell)) {
        placed = true;
        break;
      }
    }
  } else {
    // вертикальный вариант — двигаем стартовый Y
    for (let startY = pivotY - (length - 1); startY <= pivotY; startY++) {
      if (startY < 0 || startY + length > 10) continue;
      const startCell = document.querySelector(
        `.cell[data-x="${pivotX}"][data-y="${startY}"]`
      );
      if (!startCell) continue;
      if (placeShip(startCell)) {
        placed = true;
        break;
      }
    }
  }

  if (!placed) {
    // не нашли куда повернуть — откатываем
    currentOrientation = oldOrientation;
    currentShipId = shipId;
    size = length;

    oldCoords.forEach(({ x, y }) => {
      const c = document.querySelector(
        `.cell[data-x="${x}"][data-y="${y}"]`
      );
      if (c) makeCellShip(c);
    });
  }

  size = null;
  currentShipId = null;
  currentOrientation = 'horizontal';
}

// ================== Создание кораблей (панель) ==================
function createShipItems(shipBoxesSelector) {
  const shipBoxEls = document.querySelectorAll(shipBoxesSelector);

  shipBoxEls.forEach(box => {
    const shipLength = parseInt(box.dataset.size);

    // уникальный id для каждой "заготовки" корабля
    const shipId = `ship-${shipPieceIdCounter++}`;
    box.dataset.shipId = shipId;
    box.dataset.orientation = 'horizontal'; // изначально гориз.

    box.setAttribute('draggable', 'true');

    for (let x = 0; x < shipLength; x++) {
      const shipItem = document.createElement('div');
      shipItem.classList.add('ship-piece-item');
      box.appendChild(shipItem);
    }

    // Клик по кораблю на панели — поменять ориентацию (десктоп)
    box.addEventListener('click', () => {
      if (box.classList.contains('done')) return;
      const current = box.dataset.orientation || 'horizontal';
      const next = current === 'horizontal' ? 'vertical' : 'horizontal';
      box.dataset.orientation = next;
      box.classList.toggle('vertical', next === 'vertical'); // под это можешь в SCSS задать поворот/ориентацию
    });

    // Drag для ПК
    box.addEventListener('dragstart', e => {
      // если корабль уже поставлен на поле — больше не даём его тащить
      if (box.classList.contains('done')) {
        e.preventDefault();
        return;
      }
      size = shipLength;
      currentShipSource = box;
      currentShipId = shipId;
      currentOrientation = box.dataset.orientation || 'horizontal';
      if (e.dataTransfer) e.dataTransfer.setData('text/plain', 'ship');

      // превью для drag с палитры
      createDragPreview(shipLength, currentOrientation);
      updateDragPreviewPosition(e.clientX, e.clientY);
    });

    box.addEventListener('dragend', () => {
      size = null;
      currentShipSource = null;
      currentShipId = null;
      currentOrientation = 'horizontal';
      clearHighlights();
      hideDragPreview();
    });

    // Touch для мобильных: отличаем тап (поворот) от перетаскивания
    box.addEventListener('touchstart', e => {
      if (box.classList.contains('done')) return;
      const touch = e.touches[0];
      e.preventDefault();
      pendingShipPiece = box;
      panelTouchStartX = touch.clientX;
      panelTouchStartY = touch.clientY;
    }, { passive: false });
  });
}

// ================== Инициализация ==================
document.addEventListener('DOMContentLoaded', () => {
  createBoard('playerBoard');
  createShipItems('.ship-piece');

  // Глобальные события touch для мобильных
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: false });

  // Кнопка рандомной расстановки кораблей
  const randomBtn = document.getElementById('randomShips');
  if (randomBtn) {
    randomBtn.addEventListener('click', randomizeShips);
  }
  const clearShipsBtn = document.getElementById('clearShips');
  const readyBtn = document.getElementById('readyBtn');
  const clearAll = document.querySelectorAll('.clear');

  if (clearShipsBtn) {
    clearShipsBtn.addEventListener('click', () => {
      clearBoardShips();
      clearAll.forEach(clear => clear.classList.remove('done'));
      readyBtn.classList.add('notReady');
    });
  }

  // глобальное обновление позиции превью при drag мышью
  document.addEventListener('dragover', (e) => {
    updateDragPreviewPosition(e.clientX, e.clientY);
  });
});

// ================== Полная очистка поля от кораблей ==================
function clearBoardShips() {
  hideDragPreview();

  const cells = document.querySelectorAll('#playerBoard .cell');

  cells.forEach(cell => {
    // убираем корабли и подсветку
    cell.classList.remove('ship', 'highlight', 'error', 'around-highlight', 'around-error');
    delete cell.dataset.shipId;

    // убираем drag'овые обработчики с клеток, которые были кораблями
    cell.removeAttribute('draggable');
    cell.removeEventListener('dragstart', handleBoardShipDragStart);
    cell.removeEventListener('dragend', handleBoardShipDragEnd);
    cell.removeEventListener('touchstart', handleBoardShipTouchStart);
  });
}

// ================== Рандомная расстановка всех кораблей ==================
function randomizeShips() {
  hideDragPreview(); // если вдруг что-то тащили в этот момент

  // на всякий случай сбросим любые текущие drag-состояния
  dragging = false;
  touchTarget = null;
  pendingShipPiece = null;
  pendingBoardCell = null;
  movingShip = null;
  size = null;
  currentShipSource = null;
  currentShipId = null;
  currentOrientation = 'horizontal';
  clearHighlights();

  // очищаем поле от старых кораблей
  clearBoardShips();

  // помечаем все корабли в панели как "нерасставленные"
  shipBoxes.forEach(box => box.classList.remove('done'));
  isNotAllShipsIsDone();

  // запомним старые значения глобальных переменных, чтобы потом вернуть
  const prevSize = size;
  const prevOrientation = currentOrientation;
  const prevShipId = currentShipId;
  const prevMovingShip = movingShip;
  const prevSource = currentShipSource;

  // пробуем по очереди расставить каждый корабль
  for (const box of shipBoxes) {
    const shipLength = parseInt(box.dataset.size, 10);
    const shipId = box.dataset.shipId;

    let placed = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 500;

    while (!placed && attempts < MAX_ATTEMPTS) {
      attempts++;

      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      currentOrientation = orientation;
      size = shipLength;
      currentShipId = shipId;
      currentShipSource = null; // не с панели перетаскиваем, а программно

      let startX, startY;

      if (orientation === 'horizontal') {
        startX = Math.floor(Math.random() * (10 - shipLength + 1)); // 0..(10-length)
        startY = Math.floor(Math.random() * 10);                     // 0..9
      } else {
        startX = Math.floor(Math.random() * 10);
        startY = Math.floor(Math.random() * (10 - shipLength + 1));
      }

      const startCell = document.querySelector(
        `.cell[data-x="${startX}"][data-y="${startY}"]`
      );
      if (!startCell) continue;

      if (placeShip(startCell)) {
        placed = true;
        box.classList.add('done');
      }
    }

    if (!placed) {
      console.warn('Не удалось случайно расставить все корабли, попробуй ещё раз.');
      // если что-то пошло не так — считаем, что расстановка не готова
      size = prevSize;
      currentOrientation = prevOrientation;
      currentShipId = prevShipId;
      movingShip = prevMovingShip;
      currentShipSource = prevSource;
      isNotAllShipsIsDone();
      return;
    }
  }

  // вернём глобальные значения
  size = prevSize;
  currentOrientation = prevOrientation;
  currentShipId = prevShipId;
  movingShip = prevMovingShip;
  currentShipSource = prevSource;

  // все корабли успешно стоят -> кнопка готовности активируется
  isAllShipsIsDone();
}

// ================== Получение матрицы кораблей ==================
function getBoardMatrix() {
  const cells = document.querySelectorAll('#playerBoard .cell');
  const matrix = Array.from({ length: 10 }, () => Array(10).fill(0));

  cells.forEach(cell => {
    const x = parseInt(cell.dataset.x, 10);
    const y = parseInt(cell.dataset.y, 10);
    matrix[y][x] = cell.classList.contains('ship') ? 1 : 0;
  });

  console.log(matrix);
  return matrix;
}

const btn = document.querySelector('.getBtn');
btn.addEventListener('click', () => getBoardMatrix());
