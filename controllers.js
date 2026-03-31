// Контроллеры проекта MVC
function animate() {
	if (camera) {
		requestAnimationFrame(animate);
		if (controls) controls.update();
		renderer.render(scene, camera);
	}	
}

function adjustCamera() {
	const bbox = new THREE.Box3().setFromObject(scene);
	const center = new THREE.Vector3(
		(bbox.min.x + bbox.max.x) / 2,
		(bbox.min.y + bbox.max.y) / 2,
		(bbox.min.z + bbox.max.z) / 2
	);
	const size = bbox.getSize(new THREE.Vector3());
	const maxDim = Math.max(size.x, size.y, size.z);
	const fov = camera.fov * (Math.PI / 180);
	let distance = maxDim / (2 * Math.tan(fov / 2));
	camera.position.set(
		center.x + distance * 0.5,
		center.y + distance * 0.3,
		center.z + distance * 0.7
	);
	controls.target.copy(center);
	controls.update();
	camera.far = distance * 3;
	camera.updateProjectionMatrix();
}

function onWindowResize() {
	if (camera) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	}	
}

function animateTransfer(roll, fromContainer, toContainer) {// Анимации перераспределения:
    // Проверяем, что рулон еще не в целевом контейнере
    if (toContainer.rolls.some(r => r.id === roll.id)) {
        return;
    }
   
    // Удаляем из исходного контейнера
    fromContainer.removeRoll(roll.id);
    
    // Создаем летающий объект рулона
    const flyingRoll = createFlyingRoll(roll);
    
    // Анимация перемещения
    anime({
        targets: flyingRoll,
        translateX: [fromContainer.position, toContainer.position],
        duration: 1000,
        easing: 'easeInOutQuad',
        complete: () => {
            // Проверяем еще раз перед добавлением
            if (!toContainer.rolls.some(r => r.id === roll.id)) {
                toContainer.addRoll(roll);
            }
            flyingRoll.remove();
        }
    });

}

function animateSnap(element, targetX, targetY, callback) {// Вынесенная анимации
    if (snapAnimationFrame) cancelAnimationFrame(snapAnimationFrame);
    element.classList.add('snapping');
    const startX = parseFloat(element.getAttribute('cx'));
    const startY = parseFloat(element.getAttribute('cy'));
    const startTime = performance.now();
    const duration = 300;
    const animate = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const newX = startX + (targetX - startX) * progress;
        const newY = startY + (targetY - startY) * progress;
        element.setAttribute('cx', newX);
        element.setAttribute('cy', newY);
        if (progress < 1) {
            snapAnimationFrame = requestAnimationFrame(animate);
        } else {
            element.classList.remove('snapping');
            snapAnimationFrame = null;
            if (callback) callback();
            // Теперь можно безопасно сбросить draggedRoll
            draggedRoll = null;
        }
    };
    snapAnimationFrame = requestAnimationFrame(animate);
}

function sliderInput() {
	const offsetX = parseFloat(this.value);
	// 1. Находим минимальный и максимальный X среди всех рулонов
	let minCurrentX = Infinity;
	let maxCurrentX = -Infinity;
	oContainer.rolls.forEach(roll => {
		const originalPos = originalRollPositions.get(roll.id);
		const newX = originalPos.x + offsetX;
		minCurrentX = Math.min(minCurrentX, newX - roll.R); // Учитываем радиус
		maxCurrentX = Math.max(maxCurrentX, newX + roll.R); // Учитываем радиус
	});
	// 2. Проверяем границы ТСа
	const containerMinX = 0;
	const containerMaxX = oContainer.L - oContainer.minCMDoor;
	let actualOffset = offsetX;
	if (minCurrentX < containerMinX) {
		actualOffset += (containerMinX - minCurrentX); // Сдвигаем вправо
	} else if (maxCurrentX > containerMaxX) {
		actualOffset -= (maxCurrentX - containerMaxX); // Сдвигаем влево
	}
	// В проверке границ:
	if (minCurrentX < containerMinX || maxCurrentX > containerMaxX) {
		sliderValue.classList.add('out-of-bounds');
	} else {
		sliderValue.classList.remove('out-of-bounds');
	}
	// 3. Применяем корректный сдвиг
	oContainer.rolls.forEach(roll => {
		const originalPos = originalRollPositions.get(roll.id);
		roll.x = originalPos.x + actualOffset;
		// Обновляем 3D объекты
		if (roll.mesh3D) {
			roll.mesh3D.position.x = roll.x;
			if (roll.label3D) roll.label3D.position.x = roll.x;
		}
	});
	// Обновляем UI
	slider.value = actualOffset;
	sliderValue.textContent = actualOffset.toFixed(1);
	generateView();
	oContainer.updateCenterOfMass();
	updateUI();
}

function initDragControls() {
	// Получаем все объекты для перетаскивания (только рулоны)
    const draggableObjects = [];
    scene.traverse(function(child) {
        if (child.userData && child.userData.id && child instanceof THREE.Mesh) {
            draggableObjects.push(child);
        }
    });
    // Создаем контролы
    dragControls = new THREE.DragControls([draggableObjects], camera, renderer.domElement);
    // Обработчики событий
    dragControls.addEventListener('dragstart', function(event) {
        // Отключаем вращение камеры при перетаскивании
        controls.enabled = false;
        // Находим соответствующий рулон
        const roll = findRollById(event.object.userData.id);
        if (roll) {
            draggedRoll = roll;
            originalPosition = {
                x: roll.x,
                y: roll.y,
                z: roll.z
            };
        }
    });
	dragControls.addEventListener('dragend', function(event) {
		if (draggedRoll) {
			// Обновляем позицию рулона
			draggedRoll.x = event.object.position.x;
			draggedRoll.y = event.object.position.z; // z в 3D = y в 2D
			draggedRoll.z = event.object.position.y;
			// Обновляем метку
			if (draggedRoll.label3D) {
				draggedRoll.label3D.position.copy(event.object.position);
				draggedRoll.label3D.position.y += draggedRoll.H/2 + 5;
				// Добавляем обновление масштаба метки
				updateLabelScale(draggedRoll.label3D, camera);
			}
		}
	});
    dragControls.addEventListener('drag', function(event) {
        // Обновляем позицию в реальном времени
        if (draggedRoll) {
            draggedRoll.mesh3D.position.copy(event.object.position);
            // Обновляем метку
            if (draggedRoll.label3D) {
                draggedRoll.label3D.position.copy(event.object.position);
                draggedRoll.label3D.position.y += draggedRoll.H/2 + 5;
            }
        }
    });
}

function init3DDragControls() {
    const dragControls = new THREE.DragControls(
        getDraggableObjects(), 
        camera, 
        renderer.domElement
    );
    dragControls.addEventListener('dragstart', function(event) {
        controls.enabled = false; // Отключаем вращение камеры
        const roll = findRollById(event.object.userData.id);
        if (roll) {
            draggedRoll = roll;
            originalPosition = { x: roll.x, y: roll.y, z: roll.z };
        }
    });
	dragControls.addEventListener('dragend', function() {
		controls.enabled = true;
		if (draggedRoll) {
			const closest = findClosestPosition3D(draggedRoll.x, draggedRoll.y, draggedRoll);
			if (closest) {
				// Проверяем, что рулон не выходит за высоту ТСа
				const totalHeight = calculateTotalHeightAtPosition(closest.pos.x, closest.pos.y, closest.s);
				if (totalHeight + draggedRoll.H > oContainer.H) {
					// Возвращаем на исходную позицию, если не хватает места
					animateSnap3D(draggedRoll, { 
						x: originalPosition.x, 
						y: originalPosition.y,
						z: originalPosition.z 
					}, () => {
						draggedRoll.x = originalPosition.x;
						draggedRoll.y = originalPosition.y;
						draggedRoll.z = originalPosition.z;
						update2DViews(draggedRoll);
						oContainer.updateCenterOfMass();
						updateUI();
					});
					draggedRoll = null;
					return;
				}
				// Сохраняем старую позицию
				const oldX = draggedRoll.x;
				const oldY = draggedRoll.y;
				const oldS = draggedRoll.s;
				// Обновляем параметры рулона
				draggedRoll.x = closest.pos.x;
				draggedRoll.y = closest.pos.y;
				draggedRoll.z = closest.z;
				draggedRoll.s = closest.s;
				// Обновляем 3D объект
				const roll3D = findRoll3DObject(draggedRoll.id);
				if (roll3D) {
					roll3D.position.set(closest.pos.x, closest.z, closest.pos.y);
					// Обновляем метку
					if (draggedRoll.label3D) {
						draggedRoll.label3D.position.set(
							closest.pos.x,
							closest.z + draggedRoll.H/2 + 5,
							closest.pos.y
						);
						updateLabelScale(draggedRoll.label3D, camera);
					}
				}
				// Анимация прилипания
				animateSnap3D(draggedRoll, { 
					x: closest.pos.x, 
					y: closest.pos.y,
					z: closest.z 
				}, () => {
					// Обновляем структуры данных ТСа
					updateContainerAfterDrag(draggedRoll, oldX, oldY, oldS);
					oContainer.updateCenterOfMass();
					updateUI();
				});
				return;
			}
			// Возврат на исходную позицию если не нашли подходящее место
			animateSnap3D(draggedRoll, { 
				x: originalPosition.x, 
				y: originalPosition.y,
				z: originalPosition.z 
				}, () => {//console.log(draggedRoll)
			});
			draggedRoll = null;
		}
	});
    dragControls.addEventListener('drag', function(event) {
        if (draggedRoll) {
            // Обновляем данные рулона при перемещении
            draggedRoll.x = event.object.position.x;
            draggedRoll.y = event.object.position.z; // z в 3D = y в 2D
            draggedRoll.z = event.object.position.y;
            // Обновляем метку в реальном времени
            if (draggedRoll.label3D) {
                draggedRoll.label3D.position.copy(event.object.position);
                draggedRoll.label3D.position.y += draggedRoll.H / 2 + 5;
            }
        }
    });
}

function getDraggableObjects() {
    const draggable = [];
    scene.traverse(function(child) {
        if (child.userData && child.userData.id && child instanceof THREE.Mesh) {
            draggable.push(child);
        }
    });
    return draggable;
}

function startDrag(e) {
    e.preventDefault();
    const circle = e.target;
    const rollId = parseInt(circle.getAttribute('data-roll-id'));	
    
    // Ищем рулон сначала в размещенных, потом в неразмещенных
    draggedRoll = oContainer.rolls.find(r => r.id === rollId) || 	
                 oContainer.unplacedRolls.find(r => r.id === rollId);
    //console.log(oContainer.rolls)
    if (draggedRoll) {
        originalPosition = {
            x: draggedRoll.x || draggedRoll.R,
            y: draggedRoll.y || (oContainer.T + draggedRoll.R)
        };
        
        // Вычисляем смещение
		let svg = document.querySelector('.active svg');		
		if (!svg) { return;}
        const pt = svg.createSVGPoint();
		
        if (e.type === 'mousedown') {
            pt.x = e.clientX;
            pt.y = e.clientY;
        } else if (e.type === 'touchstart') {
            pt.x = e.touches[0].clientX;
            pt.y = e.touches[0].clientY;
        }
        
        const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
        dragOffsetX = svgPt.x - parseFloat(circle.getAttribute('cx'));
        dragOffsetY = svgPt.y - parseFloat(circle.getAttribute('cy'));
        
        // Подсветка допустимых позиций
        highlightValidPositions(draggedRoll,svg);
        circle.classList.add('dragging');
    } else 	console.log(draggedRoll)

	// Добавляем обработчики для отслеживания отпускания клавиш
	document.addEventListener('keyup', handleKeyUp);
	document.addEventListener('keydown', handleKeyDown);
}
function getMousePositionInContainer(e) {
    const svg = document.querySelector('.active svg');
    if (!svg) return {x: 0, y: 0};
    
    const pt = svg.createSVGPoint();
    pt.x = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    pt.y = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    return {
        x: svgPt.x - offset2D,
        y: svgPt.y - offset2D
    };
}

function dragRollOld(e) {
	if (!draggedRoll) return;	
    e.preventDefault();
    const svg = document.querySelector('.active svg');	
    if (!svg) {
		return;//console.log(draggedRoll);
	}
    const circle = document.querySelector(`circle[data-roll-id="${draggedRoll.id}"]`);
	if (!circle) return;	
	const pt = svg.createSVGPoint();
    if (e.type === 'mousemove') {
        pt.x = e.clientX;
        pt.y = e.clientY;
    } else if (e.type === 'touchmove') {
        pt.x = e.touches[0].clientX;
        pt.y = e.touches[0].clientY;
    }
    
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    let x = svgPt.x - dragOffsetX;
    let y = svgPt.y - dragOffsetY;

    
    if (isCtrlPressed) {
        // При зажатом Shift фиксируем Y-координату
        y = originalPosition.y + offset2D;
        // Находим все рулоны правее текущего
        const rollsToMove = oContainer.rolls.filter(r => 
            r.x >= draggedRoll.x 
            //&& Math.abs(r.y - draggedRoll.y) < mm 
            //&& r.id !== draggedRoll.id
        );
        // Вычисляем смещение по X
        const deltaX = x - offset2D - draggedRoll.x;//console.log((deltaX);
        // Обновляем позиции всех рулонов
        rollsToMove.forEach(roll => {
            roll.x += deltaX;
            const rollCircle = document.querySelector(`circle[data-roll-id="${roll.id}"]`);
            if (rollCircle)		rollCircle.setAttribute('cx', roll.x + offset2D);
			updateAllViews(roll);			// Обновляем все представления для всех перемещаемых рулонов
        });
    }
    if (isShiftPressed) {
        // Находим все рулоны ниже текущего и по Х
        const rollsToMove = oContainer.rolls.filter(r => Math.abs(r.x - draggedRoll.x) < mm );
        // Вычисляем смещение 
        const deltaX = x - offset2D - draggedRoll.x;
        const deltaY = y - offset2D - draggedRoll.y;
        // Обновляем позиции всех рулонов
        rollsToMove.forEach(roll => {
            roll.x += deltaX;
            roll.y += deltaY;
            const rollCircle = document.querySelector(`circle[data-roll-id="${roll.id}"]`);
            if (rollCircle) {
				rollCircle.setAttribute('cx', x);
				rollCircle.setAttribute('cy', y);
			}
			updateAllViews(roll);			// Обновляем все представления для всех перемещаемых рулонов
        });
    }
	// Обновляем только текущий рулон
	circle.setAttribute('cx', x);
	circle.setAttribute('cy', y);
	
	// Предварительное обновление других представлений
	draggedRoll.x = x - offset2D;
	draggedRoll.y = y - offset2D;
	updateAllViews(draggedRoll);
    // Подсветка ближайшей допустимой позиции
    highlightClosestPosition(draggedRoll.x, draggedRoll.y);
	console.log(`mouse-roll(${pt.x-draggedRoll.x},${pt.y-draggedRoll.y})`);	
	
}
function dragRoll(e) {
    if (!draggedRoll) return;
    e.preventDefault();

    // Получаем текущие координаты мыши в системе контейнера
    const {x: mouseX, y: mouseY} = getMousePositionInContainer(e);
    
    // Рассчитываем новые координаты объекта
    let newX = mouseX - dragOffsetX;
    let newY = mouseY - dragOffsetY;
    
    if (isCtrlPressed) {
        // 1D режим - фиксируем Y координату
        newY = originalPosition.y;
        
        // Рассчитываем смещение только по X
        const deltaX = newX - draggedRoll.x;
        
        // Перемещаем все рулоны правее текущего
        oContainer.rolls
            .filter(r => r.x >= draggedRoll.x)
            .forEach(roll => {
                roll.x += deltaX;
				updateAllViews(roll);

            });
    } 
    else if (isShiftPressed) {
        // 2D режим - полная свобода перемещения
        const deltaX = newX - draggedRoll.x;
        const deltaY = newY - draggedRoll.y;
        
        // Перемещаем все рулоны в той же колонке
        oContainer.rolls
            .filter(r => Math.abs(r.x - draggedRoll.x) < mm)
            .forEach(roll => {
                roll.x += deltaX;
                roll.y += deltaY;
				updateAllViews(roll);
            });
    } 
	// Обновляем только текущий рулон
	draggedRoll.x = newX;
	draggedRoll.y = newY;
	updateAllViews(draggedRoll);
    // Подсветка ближайшей допустимой позиции
    highlightClosestPosition(draggedRoll.x, draggedRoll.y);  
	console.log(`Drag: mouse=(${mouseX},${mouseY}), roll=(${draggedRoll.x},${draggedRoll.y})`);	
	console.log(`mouse-roll(${mouseX-draggedRoll.x},${mouseY-draggedRoll.y})`);	
}

function endDrag(e) {
    if (!draggedRoll) return;
    e.preventDefault();

    const circle = document.querySelector(`circle[data-roll-id="${draggedRoll.id}"]`);
    if (!circle) return;

/*
    // Проверяем, не был ли уже добавлен этот рулон
    const alreadyExists = oContainer.rolls.some(r => r.id === draggedRoll.id);
    
    if (alreadyExists && wasUnplaced) {
        // Удаляем дубликат из unplacedRolls
        const index = oContainer.unplacedRolls.findIndex(r => r.id === draggedRoll.id);
        if (index !== -1) {
            oContainer.unplacedRolls.splice(index, 1);
        }
        return;
    }
*/	
    circle.classList.remove('dragging');

    const currentX = parseFloat(circle.getAttribute('cx')) - offset2D;
    const currentY = parseFloat(circle.getAttribute('cy')) - offset2D;

    // Проверяем, был ли рулон в unplacedRolls
    const wasUnplaced = oContainer.unplacedRolls.some(r => r.id === draggedRoll.id);

    if (isAltPressed) { 
		// Удаляем рулоны правее xPos из oContainer.rolls
		oContainer.rolls = oContainer.rolls.filter(roll => roll.x <= draggedRoll.x);
		// Удаляем позиции правее xPos из oContainer.Positions
		oContainer.Positions = oContainer.Positions.filter(pos => pos.x <= draggedRoll.x);
		oContainer.unplacedPositions = oContainer.unplacedPositions.filter(pos => pos.x <= draggedRoll.x);
		// Также очищаем 3D сцену от удаленных рулонов
		// scene.traverse(child => {
			// if (child.userData && child.userData.id) {
				// const roll = findRollById(child.userData.id);
				// if (roll && roll.x >= xPos) {
					// scene.remove(child);
					// if (roll.label3D) scene.remove(roll.label3D);
				// }
			// }
		// });
		// Пересоздаем рулоны (ваш существующий метод оптимизации)
		oContainer.optimizedPlacement(draggedRoll.x-draggedRoll.R-mm); // Передаем текущий X как начальную точку оптимизации	
		// Обновляем представления
		generateView();
		updateUI();
        draggedRoll = null;
        isAltPressed = false;
		return;
    }
    
    if (isShiftPressed || isCtrlPressed) {
        // При зажатом Shift просто обновляем позиции без проверки коллизий
        draggedRoll.x = currentX;
        draggedRoll.y = currentY;
        
        // Обновляем все представления
        updateAllViews(draggedRoll);
        oContainer.updateCenterOfMass();
        updateUI();
        clearHighlights();
        isCtrlPressed = false;
        isShiftPressed = false;
        //return;
    } 
	const targetX = (FreeStyle.checked ? currentX : originalPosition.x);
	const targetY = (FreeStyle.checked ? currentY : originalPosition.y);

	// Проверяем доступность позиции
	const positionCheck = isPositionAvailable(targetX, targetY, draggedRoll, true);
	
	if (positionCheck.available) {
		// Если рулон был не размещен, удаляем его из unplacedRolls
		if (wasUnplaced) {
			const index = oContainer.unplacedRolls.findIndex(r => r.id === draggedRoll.id);
			if (index !== -1) {
				oContainer.unplacedRolls.splice(index, 1);
			}
			// Добавляем в основной массив rolls, если еще не там
			if (!oContainer.rolls.some(r => r.id === draggedRoll.id)) {
				oContainer.rolls.push(draggedRoll);
			}
		}

		// Обновляем данные рулона
		draggedRoll.x = targetX;
		draggedRoll.y = targetY;
		draggedRoll.s = positionCheck.s || 1;
		draggedRoll.z = positionCheck.totalH + draggedRoll.H / 2;

		// Анимация и обновление UI
		animateSnap(circle, targetX + offset2D, targetY + offset2D, () => {
			update2DViews(draggedRoll);
			oContainer.updateCenterOfMass();
			updateUI();
		});
	} else {
		if (!FreeStyle.checked) {

			// Если позиция недоступна и рулон был не размещен, возвращаем его в unplacedRolls
			if (wasUnplaced) {
				draggedRoll.x = 0;
				draggedRoll.y = 0;
				draggedRoll.z = 0;
				draggedRoll.s = 0;
				
				if (!oContainer.unplacedRolls.some(r => r.id === draggedRoll.id)) {
					oContainer.unplacedRolls.push(draggedRoll);
				}
			}
			
			// Возвращаем на исходную позицию
			animateSnap(circle, originalPosition.x + offset2D, originalPosition.y + offset2D, () => {
				if (wasUnplaced) {
					// Обновляем позицию в unplacedRolls
					const unplacedCircle = document.querySelector(`circle[data-roll-id="${draggedRoll.id}"]`);
					if (unplacedCircle) {
						unplacedCircle.setAttribute('cx', offset2D + oContainer.T + draggedRoll.R);
						unplacedCircle.setAttribute('cy', offset2D + oContainer.T + draggedRoll.R);
					}
				}
			});
		}	
	}
	    // Сбрасываем состояние перетаскивания
    draggedRoll = null;
    isCtrlPressed = false;
    isShiftPressed = false;
    clearHighlights();
}

function highlightValidPositions(roll,svg) {// подсветки допустимых позиций
    // Очищаем предыдущие подсветки
    clearHighlights();
    // Находим все позиции с таким же диаметром
	validTargets = oContainer.Positions.filter(pos => 
		pos.D === roll.D &&  // pos.used &&  // не только занятые
		!(	pos.s > 1 && pos.s !== originalPosition.s && 
			Math.abs(pos.x - originalPosition.x) < mm && 
			Math.abs(pos.y - originalPosition.y) < mm
		)
	); // и не принятые из рассчитанных
	validTargets.push(...oContainer.unplacedPositions.filter(pos => 
		pos.D === roll.D &&  // pos.used &&  // не только занятые
		!(	pos.s > 1 && pos.s !== originalPosition.s && 
			Math.abs(pos.x - originalPosition.x) < mm && 
			Math.abs(pos.y - originalPosition.y) < mm
		)
	));
    // Подсвечиваем их
    validTargets.forEach(pos => {
        const circle = createSvgElement('circle', {
            cx: pos.x + offset2D,
            cy: pos.y + offset2D,
            r: pos.D / 2,
            class: 'valid-drop-target',
            'data-pos-id': pos.id
        });
        svg.appendChild(circle);
    });
}

function clearHighlights() {// Очистка подсветки
    document.querySelectorAll('.valid-drop-target').forEach(el => el.remove());
    validTargets = [];
}

function highlightClosestPosition(x, y) {// Подсветка ближайшей позиции
    let minDist = Infinity;
    let closestPos = null;
    validTargets.forEach(pos => {
        const dx = pos.x - x;
        const dy = pos.y - y;
        const dist = dx*dx + dy*dy;
        if (dist < minDist) {
            minDist = dist;
            closestPos = pos;
        }
    });
    // Сбрасываем подсветку всех позиций
    document.querySelectorAll('.valid-drop-target').forEach(el => {
        el.style.stroke = '#00FF00';
        el.style.strokeWidth = '3';
    });
    // Подсвечиваем ближайшую
    if (closestPos && minDist < (draggedRoll.D )) {
        const target = document.querySelector(`.valid-drop-target[data-pos-id="${closestPos.id}"]`);
        if (target) {
            target.style.stroke = '#0000FF';
            target.style.strokeWidth = '5';
			target.style.strokeDasharray = '0'

        }
    }
}

function isPositionAvailable(x, y, roll, ignoreCurrent = false) {
    // Проверяем выход за границы ТСа
    if (x - roll.R < 0 || x + roll.R > oContainer.L - oContainer.minCMDoor ||
        y - roll.R < 0 || y + roll.R > oContainer.T) {
        return false;
    }
    // Проверяем пересечение с другими рулонами
    for (const otherRoll of oContainer.rolls) {
		if (ignoreCurrent && otherRoll.id === roll.id) continue;
		if (DivCentrRoll(otherRoll, roll) > mm) {
			// Проверяем возможность размещения выше
			return findAvailableLayer(x, y, roll, otherRoll);
		}
    }
    return { available: true, s: 1, totalH: 0 };
}

function findAvailableLayer(x, y, roll, blockingRoll) {
    // Проверяем возможность размещения в следующих слоях
    let currentH = 0;
    let availableLayer = 1;
    const posRolls = oContainer.rolls.filter(r => r.id!==roll.id
		&& blockingRoll
		&&	Math.abs(r.x - blockingRoll.x) < mm
		&&	Math.abs(r.y - blockingRoll.y) < mm	).sort((a, b) => a.s - b.s);
	for (const r of posRolls) {	
        currentH		+= r.H;
        availableLayer	= r.s + 1;
    
	}
	// Проверяем превышение высоты ТСа
	if (currentH + roll.H > oContainer.H) {	
		return { available: false }; // Нельзя разместить - превышение высоты
	}
    return { 
        available: true, 
        s: availableLayer,
        totalH: currentH
    };
}

function handleKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlPressed = false;
        // Принудительно завершаем перетаскивание если отпустили Ctrl
        if (draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
    if (e.key === 'Shift') {
        isShiftPressed = false;
        // Принудительно завершаем перетаскивание если отпустили Shift
        if (draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
	if (e.key === 'Alt') {
        isAltPressed = false;
        if (draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
}

function handleKeyDown(e) {
    if (e.key === 'Control' || e.key === 'Meta') isCtrlPressed = true;
    if (e.key === 'Shift') isShiftPressed = true;
	if (e.key === 'Alt') isAltPressed = true;
}

function handleRollDoubleClick(e) {
    e.preventDefault();
	
    const svg = document.querySelector('.active svg');	
    if (!svg) return;
    
    // Получаем ID рулона из атрибута data-roll-id
    const rollId = e.target.getAttribute('data-roll-id');	console.log(rollId)
    if (!rollId) return;
   
    // Находим рулон в модели
    const roll = oContainer.rolls.find(r => r.id == rollId);	console.log(roll)
    if (!roll) return;
    
    // Применяем "прилипание"
    for (const rollMove of oContainer.snapRollToContacts(roll)) {
        // Обновляем представление
        const circle = document.querySelector(`circle[data-roll-id="${rollMove.id}"]`);	
        if (circle) {
            circle.setAttribute('cx', rollMove.x + offset2D);
            circle.setAttribute('cy', rollMove.y + offset2D); 
        }
		updateAllViews(rollMove);
    }
}

function updateContainerAfterDrag(rollNew, oldX, oldY, oldS) {// Новая для обновления структур данных ТСа после перетаскивания
    var currentZ = 0;
	var currentS = 1;
    var newRoll = findRollById(rollNew.id);//console.log(rollNew)
    if (newRoll) {
        // Обновляем Z-координаты рулонов в старой позиции 
        if (Math.abs(rollNew.x - oldX) > mm && Math.abs(rollNew.y - oldY) > mm ) { //без его самого, возможно он ушел из позиции
			for (const roll of oContainer.rolls.filter(roll => roll.id !== rollNew.id && Math.abs(roll.x - oldX) < mm && Math.abs(roll.y - oldY) < mm ).sort((a, b) => a.s - b.s) ) {
				roll.z = currentZ + roll.H / 2;
				roll.s = currentS;
				currentZ += roll.H;//console.log((currentZ)
				currentS += currentS;
			}
		}
		// Обновляем Z-координаты рулонов в новой позиции, в т.н. преносимый
		currentZ = 0;
		currentS = 1;
		for (const roll of oContainer.rolls.filter(roll => Math.abs(roll.x - rollNew.x) < mm && Math.abs(roll.y - rollNew.y) < mm ).sort((a, b) => a.s - b.s) ) {
			roll.z = currentZ + roll.H / 2;
			roll.s = currentS;
			currentZ += roll.H;
			currentS += 1;
		}
		if(newRoll.s === 1 && FreeStyle.checked){ //по ним нет стопки (s=1 он на полу) и свободная постановка вне позиции, ставиться на нижние рулоны, если есть определим максимумы их 
			currentZ = 0;
			currentS = 1;										//без его самого, возможно он ушел из позиции
			for (const roll of oContainer.rolls.filter(roll => roll.id !== rollNew.id && Math.abs(roll.x - rollNew.x) < rollNew.R + mm && Math.abs(roll.y - rollNew.y) < rollNew.R + mm ) ) {
				currentZ = Math.max(roll.H,currentZ);
				currentS = Math.max(roll.H,currentS);
			}
			if(currentZ > 0) // есть внизу рулоны. поднимаем пертаскиваемый рулон 			
				newRoll.z = currentZ + newRoll.H / 2;
				newRoll.s = currentS + 1;
			}

    }
}

function updateDeviationDisplay(elementId, deviation, maxDeviation, maxDeviationBycenter) {
	const element = document.getElementById(elementId);
	const deviationPercent = Math.abs(deviation / maxDeviation) * 100;
	const spans = element.querySelectorAll('span'); // отклонение от центра
	spans[0].textContent = deviation;
	spans[1].textContent = maxDeviation; // допуск
	element.className = 'deviation';
	if (deviationPercent < 90) {
		element.classList.add('normal');
	} else if (deviationPercent <= 100) {
		element.classList.add('warning');
	} else {
		element.classList.add('critical');
	}
}

function generateContainerId(index) {
    return `container-${Date.now()}-${index}`;
}

function createContainerControls(container) {
    const controls = document.createElement('div');
    controls.className = 'container-controls';
    
    controls.innerHTML = `
        <button class="btn-optimize" data-id="${container.id}">
            Оптимизировать
        </button>
        <button class="btn-balance" data-id="${container.id}">
            Балансировать
        </button>
    `;
    
    // Обработчики событий
    controls.querySelector('.btn-optimize').addEventListener('click', () => {
        container.optimizedPlacement();
        generateTrainView();
        updateUI();
    });
    
    controls.querySelector('.btn-balance').addEventListener('click', () => {
        currentTrain.balanceContainers(container);
        generateTrainView();
        updateUI();
    });
    
    return controls;
}


function addRollSet(H = 88, D = 90, W = 800, count = 1) {// добавления нового набора рулонов
	const rollSetsContainer = document.querySelector('#rolls-settings');
	const rollSetTemplate = 
		`<div class="roll-set" onChange="calcWsetAll()" >
			<div class="setting-row">
				<input  class="roll-count" min="0" step="1" value="`+ count +`" type="number" > рул. 
			</div>
			<div class="setting-row colorH"  onChange="calcWset(this)" >
				<input class="roll-H colorH" min="1" step="1" value="`+ H +`" type="number" > см Ф
			</div>
			<div class="setting-row colorD"  onChange="calcWset(this)"  >
				<input  class="roll-D colorD" min="1" step="1" value="`+ D +`" type="number" > см D
			</div>
			<div class="setting-row colorW">
				<input  class="roll-W colorW" min="1" step="1" value="`+ W +`" type="number" > кг	
			</div>
			<button class="remove-roll-set" title="Удалить"> - </button>
		</div>`;
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = rollSetTemplate;
	const newSet = tempDiv.firstElementChild;
	// Вставка перед кнопкой "Добавить набор"
	rollSetsContainer.insertAdjacentElement('beforeend', newSet);
	// Обработчик удаления
	newSet.querySelector('.remove-roll-set').addEventListener('click', function() {	newSet.remove()	});
}

function moreOptimizeBalance(iterN = 1) {// Продолжить оптимизацию
	for (let i = 0; i < iterN; i++) { // количество рассчетов с разным сдвигом веса к двери
		const currentDeviation = oContainer.calculateCurrentDeviation();
		if (	currentDeviation.x <= oContainer.maxCML
			&&	currentDeviation.y <= oContainer.maxCMT
			&&	Math.abs(oContainer.backW  - oContainer.frontW	) <= oContainer.maxKGL
			&&	Math.abs(oContainer.rightW - oContainer.leftW	) <= oContainer.maxKGT	) break // нашли оптимальное
		oContainer.optimizedPlacement(); 
		oContainer.updateCenterOfMass();
	}
	oContainer.swapRollCenter();
	oContainer.updateCenterOfMass();	// Пересчет масс
	generateView();
}

function generateRandomRollSets() {// Новая генерации случайных наборов
    if (!confirm("Удалить и добавить случайные наборы рулонов?")) return;
	// Очищаем текущие наборы
    document.querySelectorAll('.roll-set').forEach(el => el.remove());
    
    // Параметры ограничения (можно вынести в настройки)
    const MAX_TOTAL_WEIGHT = parseFloat(document.getElementById('maxW').value); // Макс. общий вес (кг)
    const MAX_ATTEMPTS = 100;       // Макс. попыток генерации
    const MIN_ROLLS = 3;            // Мин. количество наборов
    const MAX_ROLLS = 6;            // Макс. количество наборов
    
    let totalWeight = 0;
    let attempts = 0;
    let numSets = MIN_ROLLS + Math.floor(Math.random() * (MAX_ROLLS - MIN_ROLLS + 1));
    const usedDiameters = new Set();
    
    // Генерация с контролем веса
    while (attempts < MAX_ATTEMPTS) {
        // Сброс при превышении попыток
        if (attempts > 0) {
            document.querySelectorAll('.roll-set').forEach(el => el.remove());
            totalWeight = 0;
            usedDiameters.clear();
        }
        
        let success = true;
        
        // Генерация наборов
        for (let i = 0; i < numSets; i++) {
            let D, H, W, count;
            
            // Уникальный диаметр
            do {
                D = 90 + Math.floor(Math.random() * 35);
                if (attempts > 50) D *= 0.9; // Уменьшаем диаметр после 50 попыток
            } while (usedDiameters.has(D) && attempts < MAX_ATTEMPTS);
            
            usedDiameters.add(D);
            
            // Случайные параметры
            H = 80 + Math.floor(Math.random() * 50);
            W = calcW(H, D);
            count = 2 + Math.floor(Math.random() * 50);
            
            // Проверка общего веса
            if (totalWeight + (W * count) > MAX_TOTAL_WEIGHT) {
                // Корректируем количество
                count = Math.max(2, Math.floor((MAX_TOTAL_WEIGHT - totalWeight) / W));
            }
            
            // Добавляем набор
            addRollSet(H, D, W, count);
            totalWeight += W * count;
            
            // Прерываем если превысили вес
            if (totalWeight >= MAX_TOTAL_WEIGHT*0.99) {
                success = true;
                break;
            }
        }
        
        if (success && totalWeight >= MAX_TOTAL_WEIGHT*0.99) { // Хотя бы 70% от максимума
            break;
        }
        
        attempts++;
    }    
    // Обновляем параметры после генерации
	calcWsetAll();
    loadRolls();
}

function initRollSettings() {// Инициализация настроек рулонов
	// Добавляем обработчики
	document.getElementById('add-roll-set').addEventListener('click', function() {
		
			if (document.querySelector('.roll-set')===null) 
				addRollSet(102, 120, 870, 28);
			else {
				const _h = parseFloat(document.querySelector('.roll-set').querySelector('.roll-H').value);
				const _d = parseFloat(document.querySelector('.roll-set').querySelector('.roll-D').value);
				const _k = parseFloat(document.querySelector('.roll-set').querySelector('.roll-count').value);
				addRollSet(_h, _d, calcW(_h,_d), _k);
			}
			
	});
	
	// Добавляем начальный набор, если прошлой схемы нет в сохранении
	let schemeData = localStorage.getItem('schemeData');
	if (schemeData) {
        loadScheme(JSON.parse(schemeData));
		//let arrRolls = JSON.parse(schemeData);
		// if (arrRolls && arrRolls.length > 0 ) arrRolls.forEach( roll => addRollSet(roll.H, roll.D, roll.W, roll.count));
		// else	addRollSet(100, 120, 870, 28);
	}
	else	addRollSet(105, 120, 870, 28);
	calcWsetAll();
	loadRolls();
}

async function saveSchemeToServer(s) {// Сохранение схемы в файл (в каталоге приложения) для отправки схемы на сервер
	const schemeData = s ? s :	getSchemeData();
	if (!schemeData) return;
	if (window.location.protocol !== 'file:'){ // nолько для запуска с сервера
		try {
			const response = await fetch( url_service+'save_scheme.php', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(schemeData)
			});

			const result = await response.json();
			
//			if (result.success) {
			//	console.log(result);
//			}
		} catch (error) {
			console.error('Ошибка при сохранении:', error);
			// alert('Ошибка соединения с сервером');
		}
	} 
	localStorage.setItem('schemeData', JSON.stringify(schemeData));
}

async function saveSchemeToFile() {
     await saveSchemeToServer();
}

function downloadScheme() {// Скачивание схемы
	// Сохраняем текущую схему перед загрузкой новых рулонов
    const scheme = getSchemeData();
    if (!scheme) return;
    
    const json = JSON.stringify(scheme, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    downloadFile(url, `Оптимус_схема_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    saveSchemeToServer(scheme);

}

function downloadFile(url, filename) {// Общая для скачивания файла
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadSchemeFromFile(event) {// Загрузка схемы из файла
    const file = event.target.files[0];
    if (!file) {alert(`Нет файла: ${file.name}`);return;}

    // Сначала сохраняем текущую схему
    saveSchemeToFile();
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const scheme = JSON.parse(e.target.result);
            loadScheme(scheme);
            alert(`Схема загружена из файла: ${file.name}`);
        } catch (error) {
            console.error('Ошибка загрузки схемы:', error);
            alert('Ошибка при загрузке файла схемы');
        }
    };
    reader.readAsText(file);
}

async function loadSchemeFromServer(schemeName) {// Загрузка схемы с сервера
    try {
        const response = await fetch( url_service+`data/${schemeName}`);
        if (!response.ok) throw new Error('Схема не найдена');
        
        const scheme = await response.json();
        loadScheme(scheme);
        alert(`Схема "${schemeName}" успешно загружена`);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        alert('Не удалось загрузить схему');
    }
}

async function deleteSchemeFromServer(schemeName) {// Удаление схемы с сервера
    try {
        const response = await fetch('delete_scheme.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename: schemeName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Схема "${schemeName}" удалена`);
        } else {
            alert(`Ошибка удаления: ${result.message}`);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка соединения с сервером');
    }
}

function printScheme() {// для подготовки и печати схемы
    let printContainer = dravPrintScheme();
	// Временно добавляем ТС в документ
    document.body.appendChild(printContainer);
    // Удаляем ненужные элементы перед печатью
    const elementsToHide = printContainer.querySelectorAll('button, input, .no-print');
    elementsToHide.forEach(el => el.classList.add('no-print'));
    // Инициируем печать
    window.print();
    // Удаляем ТС после печати
    setTimeout(() => {
        document.body.removeChild(printContainer);
    }, 1000);
}

async function loadTsConfig() {// Загрузка конфигурации ТС
    try {
		tsParams = {
			'Контейнер': {
				L: 1203, T: 235, H: 259,
				maxW: 25500, maxCML: 30, maxCMT: 10,
				maxKGL: 1500, maxKGT: 500,
				minCMDoor: 50, minDimX: 25
			},
			'Вагон': {
				L: 1330, T: 265, H: 270,
				maxW: 68000, maxCML: 50, maxCMT: 15,
				maxKGL: 3000, maxKGT: 1000,
				minCMDoor: 20, minDimX: 0
			}
		};
		if (window.location.protocol !== 'file:') {        
			const response = await fetch( url_service+'TS.ini');//console.log(response)
			if (!response || !response.ok) {
				throw new Error('Не удалось загрузить TS.ini');
			}else{
				const iniData = await response.text();//console.log(iniData)
				parseIniFile(iniData);
				return;
			} 
		}	
    } catch (error) {
        console.error('Ошибка загрузки TS.ini:', error);
    }
}

function populateTsSelector() {// Заполнение селектора типами ТС
    const tsTypeSelect = document.getElementById('ts-type');
    const savedValue = localStorage.getItem('lastSelectedTsType');
    const currentValue = savedValue || tsTypeSelect.value;
    
    // Очищаем все опции, кроме "Свой"
    tsTypeSelect.innerHTML = '';
    
    // Добавляем типы из TS.ini
   Object.keys(tsParams).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        
        // Устанавливаем selected для первого элемента, если нет сохраненного значения
        if (currentValue === '' && Object.keys(tsParams).indexOf(type) === 0) {
            option.selected = true;
        } else if (type === currentValue) {
            option.selected = true;
        }
        
        tsTypeSelect.appendChild(option);
    });
    
    // Добавляем "Свой" тип
    const customOption = document.createElement('option');
    customOption.value = 'Свой';
    customOption.textContent = 'Свой';
    // Проверяем, нужно ли выбрать "Пользовательский" тип
    if (currentValue === 'Свой') {
        customOption.selected = true;
    }
    tsTypeSelect.appendChild(customOption);
    
    // Если ничего не выбрано (например, при первой загрузке), выбираем первый элемент
    if (tsTypeSelect.value === '' && Object.keys(tsParams).length > 0) {
        tsTypeSelect.selectedIndex = 0;
    }
    
    tsTypeSelect.addEventListener('change', () => {
        localStorage.setItem('lastSelectedTsType', tsTypeSelect.value);
    });	
	
}

function parseIniFile(iniData) {// Парсинг INI файла (остается без изменений)
    const sections = iniData.split(/\[|\n\[/);
    tsParams = {};
    
    sections.forEach(section => {
        if (!section.trim()) return;
        
        const sectionEnd = section.indexOf(']');
        const sectionName = section.substring(0, sectionEnd).trim();
        const sectionContent = section.substring(sectionEnd + 1);
        
        tsParams[sectionName] = {};
        
        sectionContent.split('\n').forEach(line => {
            if (!line.trim() || line.startsWith(';')) return;
            
            const eqPos = line.indexOf('=');
            if (eqPos < 0) return;
            
            const key = line.substring(0, eqPos).trim();
            const value = line.substring(eqPos + 1).trim();
            
            if (key && value) {
                tsParams[sectionName][key] = isNaN(value) ? value : parseFloat(value);
            }
        });
    });
}

function loadTsParams() {// Загрузка параметров в форму
    const tsType = document.getElementById('ts-type').value;
    if (tsType === 'Свой') {
        // Для пользовательского типа разрешаем ручное редактирование
        // document.querySelectorAll('#container-settings input').forEach(input => {
            // input.disabled = false;
        // });
        //return;
    }
    
    if (!tsParams[tsType]) {
        alert('Параметры для выбранного типа ТС не найдены');
        return;
    }
    
    const params = tsParams[tsType];
    
    // Заполняем поля формы
    document.getElementById('L').value = params.L;
    document.getElementById('T').value = params.T;
    document.getElementById('H').value = params.H;
    document.getElementById('maxW').value = params.maxW;
    document.getElementById('maxCML').value = params.maxCML;
    document.getElementById('maxCMT').value = params.maxCMT;
    document.getElementById('maxKGL').value = params.maxKGL;
    document.getElementById('maxKGT').value = params.maxKGT;
    document.getElementById('minCMDoor').value = params.minCMDoor;
    document.getElementById('minDimX').value = params.minDimX;
    // Блокируем редактирование (кроме пользовательского режима)
    // document.querySelectorAll('#container-settings input').forEach(input => {
        // input.disabled = tsType !== 'Свой';
    // });
}

function saveCustomTsParams() {// Сохранение пользовательских параметров
    const tsType = document.getElementById('ts-type').value;
    //if (tsType !== 'Свой') return;
    
    const customParams = {
        L: parseFloat(document.getElementById('L').value),
        T: parseFloat(document.getElementById('T').value),
        H: parseFloat(document.getElementById('H').value),
        maxW: parseFloat(document.getElementById('maxW').value),
        maxCML: parseFloat(document.getElementById('maxCML').value),
        maxCMT: parseFloat(document.getElementById('maxCMT').value),
        maxKGL: parseFloat(document.getElementById('maxKGL').value),
        maxKGT: parseFloat(document.getElementById('maxKGT').value),
        minCMDoor: parseFloat(document.getElementById('minCMDoor').value),
        minDimX: parseFloat(document.getElementById('minDimX').value)
    };
    
    // Можно добавить сохранение в localStorage
    localStorage.setItem('customTsParams', JSON.stringify(customParams));
}

async function updateTsIni(newParams) {// Обновление TS.ini через AJAX
    try {
        const response = await fetch( url_service+'update_ts_config.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newParams)
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadTsConfig(); // Перезагружаем конфиг
            populateTsSelector(); // Обновляем селектор
            return true;
        } else {
            //console.error('Ошибка обновления TS.ini:', result.message);
            return false;
        }
    } catch (error) {
        //console.error('Ошибка сети:', error);
        return false;
    }
}

async function loadRolls() {	// грузим в в состав ТС

    try {
		// 1. Начинаем
        showLoadingProgress("Начинаем оптимизацию...");
        // 2. Создаем рулоны из текущих наборов
        const rolls = createRollsFromSets();
        if (rolls.length === 0) {
            showError("Нет рулонов для загрузки!");
            return;
        }
        // 3. Рассчитываем оптимальное количество ТСов
        const containerCount = calculateContainerCount(rolls);
        // 4. Получаем параметры ТС из UI (с валидацией)
        const containerParams = getValidatedContainerParams();
        // 5. Создаем цепочку ТСов
        currentTrain = new Train(
            Array.from({length: containerCount}, (_, i) => ({
                ...containerParams,
                trainIndex: i,
                id: generateContainerId(i)
            }))
        );
		// Инициализируем навигацию
		oContainerIndex = 0;
		showContainer();		
        // 6. Оптимизируем загрузку с визуальным прогрессом
        await currentTrain.optimizeLoading(rolls);
		moreOptimizeBalance(5);
        saveOriginalPositions();
        // 7. Визуализируем результат
		renderTrainOverview(); // Первоначальная отрисовка
        generateView();
		updateViewMode()
        // 8. Обновляем UI и сохраняем позиции
		updateUI();
        saveOriginalPositions();
		hideLoadingProgress()
		// 9. Показываем итоговую статистику
		setTimeout(() => {
			showFinalStats();
		}, 1000);
        // 10. Сохраняем текущую схему перед изменениями
        saveSchemeToFile();

    } catch (error) {
        //console.error("Ошибка загрузки:", error);
        showError(`Ошибка: ${error.message}`);
    }
}

function printTrain() {// Печать сосава ТС
	saveSchemeToFile();    // Сначала сохраняем текущую схему
    // Инициируем печать
    window.print();
    
}
