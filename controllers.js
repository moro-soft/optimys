// Контроллеры проекта MVC
function animate() {
	if (wa.camera) {
		requestAnimationFrame(animate);
		if (wa.controls) wa.controls.update();
		wa.renderer.render(wa.scene, wa.camera);
	}	
}

function adjustcamera() {
	const bbox = new THREE.Box3().setFromObject(wa.scene);
	const center = new THREE.Vector3(
		(bbox.min.x + bbox.max.x) / 2,
		(bbox.min.y + bbox.max.y) / 2,
		(bbox.min.z + bbox.max.z) / 2
	);
	const size = bbox.getSize(new THREE.Vector3());
	const maxDim = Math.max(size.x, size.y, size.z);
	const fov = wa.camera.fov * (Math.PI / 180);
	let distance = maxDim / (2 * Math.tan(fov / 2));
	wa.camera.position.set(
		center.x + distance * 0.5,
		center.y + distance * 0.3,
		center.z + distance * 0.7
	);
	wa.controls.target.copy(center);
	wa.controls.update();
	wa.camera.far = distance * 3;
	wa.camera.updateProjectionMatrix();
}

function onWindowResize() {
	if (wa.camera) {
		wa.camera.aspect = window.innerWidth / window.innerHeight;
		wa.camera.updateProjectionMatrix();
		wa.renderer.setSize(window.innerWidth, window.innerHeight);
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
    if (wa.snapAnimationFrame) cancelAnimationFrame(wa.snapAnimationFrame);
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
            wa.snapAnimationFrame = requestAnimationFrame(animate);
        } else {
            element.classList.remove('snapping');
            wa.snapAnimationFrame = null;
            if (callback) callback();
            // Теперь можно безопасно сбросить wa.draggedRoll
            wa.draggedRoll = null;
        }
    };
    wa.snapAnimationFrame = requestAnimationFrame(animate);
}

function sliderInput() {
	const offsetX = parseFloat(this.value);
	// 1. Находим минимальный и максимальный X среди всех рулонов
	let minCurrentX = Infinity;
	let maxCurrentX = -Infinity;
	wa.oContainer.rolls.forEach(roll => {
		const originalPos = wa.originalRollPositions.get(roll.id);
		const newX = originalPos.x + offsetX;
		minCurrentX = Math.min(minCurrentX, newX - roll.R); // Учитываем радиус
		maxCurrentX = Math.max(maxCurrentX, newX + roll.R); // Учитываем радиус
	});
	// 2. Проверяем границы ТСа
	const containerMinX = 0;
	const containerMaxX = wa.oContainer.L - wa.oContainer.minCMDoor;
	let actualOffset = offsetX;
	if (minCurrentX < containerMinX) {
		actualOffset += (containerMinX - minCurrentX); // Сдвигаем вправо
	} else if (maxCurrentX > containerMaxX) {
		actualOffset -= (maxCurrentX - containerMaxX); // Сдвигаем влево
	}
	// В проверке границ:
	if (minCurrentX < containerMinX || maxCurrentX > containerMaxX) {
		wa.sliderValue.classList.add('out-of-bounds');
	} else {
		wa.sliderValue.classList.remove('out-of-bounds');
	}
	// 3. Применяем корректный сдвиг
	wa.oContainer.rolls.forEach(roll => {
		const originalPos = wa.originalRollPositions.get(roll.id);
		roll.x = originalPos.x + actualOffset;
		// Обновляем 3D объекты
		if (roll.mesh3D) {
			roll.mesh3D.position.x = roll.x;
			if (roll.label3D) roll.label3D.position.x = roll.x;
		}
	});
	// Обновляем UI
	document.getElementById('rolls-slider').value = actualOffset;
	wa.sliderValue.textContent = actualOffset.toFixed(1);
	wa.generateView();
	wa.oContainer.updateCenterOfMass();
	updateUI();
}

function initDragControls() {
	// Получаем все объекты для перетаскивания (только рулоны)
    const draggableObjects = [];
    wa.scene.traverse(function(child) {
        if (child.userData && child.userData.id && child instanceof THREE.Mesh) {
            draggableObjects.push(child);
        }
    });
    // Создаем контролы
    wa.dragControls = new THREE.DragControls([draggableObjects], wa.camera, wa.renderer.domElement);
    // Обработчики событий
    wa.dragControls.addEventListener('dragstart', function(event) {
        // Отключаем вращение камеры при перетаскивании
        wa.controls.enabled = false;
        // Находим соответствующий рулон
        const roll = findRollById(event.object.userData.id);
        if (roll) {
            wa.draggedRoll = roll;
            wa.originalPosition = {
                x: roll.x,
                y: roll.y,
                z: roll.z
            };
        }
    });
	wa.dragControls.addEventListener('dragend', function(event) {
		if (wa.draggedRoll) {
			// Обновляем позицию рулона
			wa.draggedRoll.x = event.object.position.x;
			wa.draggedRoll.y = event.object.position.z; // z в 3D = y в 2D
			wa.draggedRoll.z = event.object.position.y;
			// Обновляем метку
			if (wa.draggedRoll.label3D) {
				wa.draggedRoll.label3D.position.copy(event.object.position);
				wa.draggedRoll.label3D.position.y += wa.draggedRoll.H/2 + 5;
				// Добавляем обновление масштаба метки
				updateLabelScale(wa.draggedRoll.label3D, wa.camera);
			}
		}
	});
    wa.dragControls.addEventListener('drag', function(event) {
        // Обновляем позицию в реальном времени
        if (wa.draggedRoll) {
            wa.draggedRoll.mesh3D.position.copy(event.object.position);
            // Обновляем метку
            if (wa.draggedRoll.label3D) {
                wa.draggedRoll.label3D.position.copy(event.object.position);
                wa.draggedRoll.label3D.position.y += wa.draggedRoll.H/2 + 5;
            }
        }
    });
}

function init3DDragControls() {
    wa.dragControls = new THREE.DragControls(
        getDraggableObjects(), 
        wa.camera, 
        wa.renderer.domElement
    );
    wa.dragControls.addEventListener('dragstart', function(event) {
        wa.controls.enabled = false; // Отключаем вращение камеры
        const roll = findRollById(event.object.userData.id);
        if (roll) {
            wa.draggedRoll = roll;
            wa.originalPosition = { x: roll.x, y: roll.y, z: roll.z };
        }
    });
	wa.dragControls.addEventListener('dragend', function() {
		wa.controls.enabled = true;
		if (wa.draggedRoll) {
			const closest = wa.findClosestPosition3D(wa.draggedRoll.x, wa.draggedRoll.y, wa.draggedRoll);
			if (closest) {
				// Проверяем, что рулон не выходит за высоту ТСа
				const totalHeight = calculateTotalHeightAtPosition(closest.pos.x, closest.pos.y, closest.s);
				if (totalHeight + wa.draggedRoll.H > wa.oContainer.H) {
					// Возвращаем на исходную позицию, если не хватает места
					wa.animateSnap3D(wa.draggedRoll, { 
						x: wa.originalPosition.x, 
						y: wa.originalPosition.y,
						z: wa.originalPosition.z 
					}, () => {
						wa.draggedRoll.x = wa.originalPosition.x;
						wa.draggedRoll.y = wa.originalPosition.y;
						wa.draggedRoll.z = wa.originalPosition.z;
						wa.update2DViews(wa.draggedRoll);
						wa.oContainer.updateCenterOfMass();
						updateUI();
					});
					wa.draggedRoll = null;
					return;
				}
				// Сохраняем старую позицию
				const oldX = wa.draggedRoll.x;
				const oldY = wa.draggedRoll.y;
				const oldS = wa.draggedRoll.s;
				// Обновляем параметры рулона
				wa.draggedRoll.x = closest.pos.x;
				wa.draggedRoll.y = closest.pos.y;
				wa.draggedRoll.z = closest.z;
				wa.draggedRoll.s = closest.s;
				// Обновляем 3D объект
				const roll3D = findRoll3DObject(wa.draggedRoll.id);
				if (roll3D) {
					roll3D.position.set(closest.pos.x, closest.z, closest.pos.y);
					// Обновляем метку
					if (wa.draggedRoll.label3D) {
						wa.draggedRoll.label3D.position.set(
							closest.pos.x,
							closest.z + wa.draggedRoll.H/2 + 5,
							closest.pos.y
						);
						updateLabelScale(wa.draggedRoll.label3D, wa.camera);
					}
				}
				// Анимация прилипания
				wa.animateSnap3D(wa.draggedRoll, { 
					x: closest.pos.x, 
					y: closest.pos.y,
					z: closest.z 
				}, () => {
					// Обновляем структуры данных ТСа
					updateContainerAfterDrag(wa.draggedRoll, oldX, oldY, oldS);
					wa.oContainer.updateCenterOfMass();
					updateUI();
				});
				return;
			}
			// Возврат на исходную позицию если не нашли подходящее место
			wa.animateSnap3D(wa.draggedRoll, { 
				x: wa.originalPosition.x, 
				y: wa.originalPosition.y,
				z: wa.originalPosition.z 
				}, () => {//console.log(wa.draggedRoll)
			});
			wa.draggedRoll = null;
		}
	});
    wa.dragControls.addEventListener('drag', function(event) {
        if (wa.draggedRoll) {
            // Обновляем данные рулона при перемещении
            wa.draggedRoll.x = event.object.position.x;
            wa.draggedRoll.y = event.object.position.z; // z в 3D = y в 2D
            wa.draggedRoll.z = event.object.position.y;
            // Обновляем метку в реальном времени
            if (wa.draggedRoll.label3D) {
                wa.draggedRoll.label3D.position.copy(event.object.position);
                wa.draggedRoll.label3D.position.y += wa.draggedRoll.H / 2 + 5;
            }
        }
    });
}

function getDraggableObjects() {
    const draggable = [];
    wa.scene.traverse(function(child) {
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
    wa.draggedRoll = wa.oContainer.rolls.find(r => r.id === rollId) || 	
                 wa.oContainer.unplacedRolls.find(r => r.id === rollId);
    //console.log(wa.oContainer.rolls)
    if (wa.draggedRoll) {
        wa.originalPosition = {
            x: wa.draggedRoll.x || wa.draggedRoll.R,
            y: wa.draggedRoll.y || (wa.oContainer.T + wa.draggedRoll.R)
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
         wa.dragOffsetX = svgPt.x - parseFloat(circle.getAttribute('cx'));
         wa.dragOffsetY = svgPt.y - parseFloat(circle.getAttribute('cy'));
        
        // Подсветка допустимых позиций
        highlightValidPositions(wa.draggedRoll,svg);
        circle.classList.add('dragging');
    } else 	console.log(wa.draggedRoll)

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
        x: svgPt.x -  wa.offset2D,
        y: svgPt.y -  wa.offset2D
    };
}

function dragRollOld(e) {
	if (!wa.draggedRoll) return;	
    e.preventDefault();
    const svg = document.querySelector('.active svg');	
    if (!svg) {
		return;//console.log(wa.draggedRoll);
	}
    const circle = document.querySelector(`circle[data-roll-id="${wa.draggedRoll.id}"]`);
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
    let x = svgPt.x -  wa.dragOffsetX;
    let y = svgPt.y -  wa.dragOffsetY;

    
    if (wa.isCtrlPressed) {
        // При зажатом Shift фиксируем Y-координату
        y = wa.originalPosition.y +  wa.offset2D;
        // Находим все рулоны правее текущего
        const rollsToMove = wa.oContainer.rolls.filter(r => 
            r.x >= wa.draggedRoll.x 
            //&& Math.abs(r.y - wa.draggedRoll.y) < wa.mm 
            //&& r.id !== wa.draggedRoll.id
        );
        // Вычисляем смещение по X
        const deltaX = x -  wa.offset2D - wa.draggedRoll.x;//console.log((deltaX);
        // Обновляем позиции всех рулонов
        rollsToMove.forEach(roll => {
            roll.x += deltaX;
            const rollCircle = document.querySelector(`circle[data-roll-id="${roll.id}"]`);
            if (rollCircle)		rollCircle.setAttribute('cx', roll.x +  wa.offset2D);
			wa.updateAllViews(roll);			// Обновляем все представления для всех перемещаемых рулонов
        });
    }
    if (wa.isShiftPressed) {
        // Находим все рулоны ниже текущего и по Х
        const rollsToMove = wa.oContainer.rolls.filter(r => Math.abs(r.x - wa.draggedRoll.x) < wa.mm );
        // Вычисляем смещение 
        const deltaX = x -  wa.offset2D - wa.draggedRoll.x;
        const deltaY = y -  wa.offset2D - wa.draggedRoll.y;
        // Обновляем позиции всех рулонов
        rollsToMove.forEach(roll => {
            roll.x += deltaX;
            roll.y += deltaY;
            const rollCircle = document.querySelector(`circle[data-roll-id="${roll.id}"]`);
            if (rollCircle) {
				rollCircle.setAttribute('cx', x);
				rollCircle.setAttribute('cy', y);
			}
			wa.updateAllViews(roll);			// Обновляем все представления для всех перемещаемых рулонов
        });
    }
	// Обновляем только текущий рулон
	circle.setAttribute('cx', x);
	circle.setAttribute('cy', y);
	
	// Предварительное обновление других представлений
	wa.draggedRoll.x = x -  wa.offset2D;
	wa.draggedRoll.y = y -  wa.offset2D;
	wa.updateAllViews(wa.draggedRoll);
    // Подсветка ближайшей допустимой позиции
    highlightClosestPosition(wa.draggedRoll.x, wa.draggedRoll.y);
	console.log(`mouse-roll(${pt.x-wa.draggedRoll.x},${pt.y-wa.draggedRoll.y})`);	
	
}
function dragRoll(e) {
    if (!wa.draggedRoll) return;
    e.preventDefault();

    // Получаем текущие координаты мыши в системе контейнера
    const {x: mouseX, y: mouseY} = getMousePositionInContainer(e);
    
    // Рассчитываем новые координаты объекта
    let newX = mouseX -  wa.dragOffsetX;
    let newY = mouseY -  wa.dragOffsetY;
    
    if (wa.isCtrlPressed) {
        // 1D режим - фиксируем Y координату
        newY = wa.originalPosition.y;
        
        // Рассчитываем смещение только по X
        const deltaX = newX - wa.draggedRoll.x;
        
        // Перемещаем все рулоны правее текущего
        wa.oContainer.rolls
            .filter(r => r.x >= wa.draggedRoll.x)
            .forEach(roll => {
                roll.x += deltaX;
				wa.updateAllViews(roll);

            });
    } 
    else if (wa.isShiftPressed) {
        // 2D режим - полная свобода перемещения
        const deltaX = newX - wa.draggedRoll.x;
        const deltaY = newY - wa.draggedRoll.y;
        
        // Перемещаем все рулоны в той же колонке
        wa.oContainer.rolls
            .filter(r => Math.abs(r.x - wa.draggedRoll.x) < wa.mm)
            .forEach(roll => {
                roll.x += deltaX;
                roll.y += deltaY;
				wa.updateAllViews(roll);
            });
    } 
	// Обновляем только текущий рулон
	wa.draggedRoll.x = newX;
	wa.draggedRoll.y = newY;
	wa.updateAllViews(wa.draggedRoll);
    // Подсветка ближайшей допустимой позиции
    highlightClosestPosition(wa.draggedRoll.x, wa.draggedRoll.y);  
	console.log(`Drag: mouse=(${mouseX},${mouseY}), roll=(${wa.draggedRoll.x},${wa.draggedRoll.y})`);	
	console.log(`mouse-roll(${mouseX-wa.draggedRoll.x},${mouseY-wa.draggedRoll.y})`);	
}

function endDrag(e) {
    if (!wa.draggedRoll) return;
    e.preventDefault();

    const circle = document.querySelector(`circle[data-roll-id="${wa.draggedRoll.id}"]`);
    if (!circle) return;

/*
    // Проверяем, не был ли уже добавлен этот рулон
    const alreadyExists = wa.oContainer.rolls.some(r => r.id === wa.draggedRoll.id);
    
    if (alreadyExists && wasUnplaced) {
        // Удаляем дубликат из unplacedRolls
        const index = wa.oContainer.unplacedRolls.findIndex(r => r.id === wa.draggedRoll.id);
        if (index !== -1) {
            wa.oContainer.unplacedRolls.splice(index, 1);
        }
        return;
    }
*/	
    circle.classList.remove('dragging');

    const currentX = parseFloat(circle.getAttribute('cx')) -  wa.offset2D;
    const currentY = parseFloat(circle.getAttribute('cy')) -  wa.offset2D;

    // Проверяем, был ли рулон в unplacedRolls
    const wasUnplaced = wa.oContainer.unplacedRolls.some(r => r.id === wa.draggedRoll.id);

    if (wa.isAltPressed) { 
		// Удаляем рулоны правее xPos из wa.oContainer.rolls
		wa.oContainer.rolls = wa.oContainer.rolls.filter(roll => roll.x <= wa.draggedRoll.x);
		// Удаляем позиции правее xPos из wa.oContainer.Positions
		wa.oContainer.Positions = wa.oContainer.Positions.filter(pos => pos.x <= wa.draggedRoll.x);
		wa.oContainer.unplacedPositions = wa.oContainer.unplacedPositions.filter(pos => pos.x <= wa.draggedRoll.x);
		// Также очищаем 3D сцену от удаленных рулонов
		// wa.scene.traverse(child => {
			// if (child.userData && child.userData.id) {
				// const roll = findRollById(child.userData.id);
				// if (roll && roll.x >= xPos) {
					// wa.scene.remove(child);
					// if (roll.label3D) wa.scene.remove(roll.label3D);
				// }
			// }
		// });
		// Пересоздаем рулоны (ваш существующий метод оптимизации)
		wa.oContainer.optimizedPlacement(wa.draggedRoll.x - wa.draggedRoll.R - wa.mm); // Передаем текущий X как начальную точку оптимизации	
		// Обновляем представления
		wa.generateView();
		updateUI();
        wa.draggedRoll = null;
        wa.isAltPressed = false;
		return;
    }
    
    if (wa.isShiftPressed || wa.isCtrlPressed) {
        // При зажатом Shift просто обновляем позиции без проверки коллизий
        wa.draggedRoll.x = currentX;
        wa.draggedRoll.y = currentY;
        
        // Обновляем все представления
        wa.updateAllViews(wa.draggedRoll);
        wa.oContainer.updateCenterOfMass();
        updateUI();
        clearHighlights();
        wa.isCtrlPressed = false;
        wa.isShiftPressed = false;
        //return;
    } 
	const targetX = (FreeStyle.checked ? currentX : wa.originalPosition.x);
	const targetY = (FreeStyle.checked ? currentY : wa.originalPosition.y);

	// Проверяем доступность позиции
	const positionCheck = isPositionAvailable(targetX, targetY, wa.draggedRoll, true);
	
	if (positionCheck.available) {
		// Если рулон был не размещен, удаляем его из unplacedRolls
		if (wasUnplaced) {
			const index = wa.oContainer.unplacedRolls.findIndex(r => r.id === wa.draggedRoll.id);
			if (index !== -1) {
				wa.oContainer.unplacedRolls.splice(index, 1);
			}
			// Добавляем в основной массив rolls, если еще не там
			if (!wa.oContainer.rolls.some(r => r.id === wa.draggedRoll.id)) {
				wa.oContainer.rolls.push(wa.draggedRoll);
			}
		}

		// Обновляем данные рулона
		wa.draggedRoll.x = targetX;
		wa.draggedRoll.y = targetY;
		wa.draggedRoll.s = positionCheck.s || 1;
		wa.draggedRoll.z = positionCheck.totalH + wa.draggedRoll.H / 2;

		// Анимация и обновление UI
		animateSnap(circle, targetX +  wa.offset2D, targetY +  wa.offset2D, () => {
			wa.update2DViews(wa.draggedRoll);
			wa.oContainer.updateCenterOfMass();
			updateUI();
		});
	} else {
		if (!FreeStyle.checked) {

			// Если позиция недоступна и рулон был не размещен, возвращаем его в unplacedRolls
			if (wasUnplaced) {
				wa.draggedRoll.x = 0;
				wa.draggedRoll.y = 0;
				wa.draggedRoll.z = 0;
				wa.draggedRoll.s = 0;
				
				if (!wa.oContainer.unplacedRolls.some(r => r.id === wa.draggedRoll.id)) {
					wa.oContainer.unplacedRolls.push(wa.draggedRoll);
				}
			}
			
			// Возвращаем на исходную позицию
			animateSnap(circle, wa.originalPosition.x +  wa.offset2D, wa.originalPosition.y +  wa.offset2D, () => {
				if (wasUnplaced) {
					// Обновляем позицию в unplacedRolls
					const unplacedCircle = document.querySelector(`circle[data-roll-id="${wa.draggedRoll.id}"]`);
					if (unplacedCircle) {
						unplacedCircle.setAttribute('cx',  wa.offset2D + wa.oContainer.T + wa.draggedRoll.R);
						unplacedCircle.setAttribute('cy',  wa.offset2D + wa.oContainer.T + wa.draggedRoll.R);
					}
				}
			});
		}	
	}
	    // Сбрасываем состояние перетаскивания
    wa.draggedRoll = null;
    wa.isCtrlPressed = false;
    wa.isShiftPressed = false;
    clearHighlights();
}

function highlightValidPositions(roll,svg) {// подсветки допустимых позиций
    // Очищаем предыдущие подсветки
    clearHighlights();
    // Находим все позиции с таким же диаметром
	wa.validTargets = wa.oContainer.Positions.filter(pos => 
		pos.D === roll.D &&  // pos.used &&  // не только занятые
		!(	pos.s > 1 && pos.s !== wa.originalPosition.s && 
			Math.abs(pos.x - wa.originalPosition.x) < wa.mm && 
			Math.abs(pos.y - wa.originalPosition.y) < wa.mm
		)
	); // и не принятые из рассчитанных
	wa.validTargets.push(...wa.oContainer.unplacedPositions.filter(pos => 
		pos.D === roll.D &&  // pos.used &&  // не только занятые
		!(	pos.s > 1 && pos.s !== wa.originalPosition.s && 
			Math.abs(pos.x - wa.originalPosition.x) < wa.mm && 
			Math.abs(pos.y - wa.originalPosition.y) < wa.mm
		)
	));
    // Подсвечиваем их
    wa.validTargets.forEach(pos => {
        const circle = wa.createSvgElement('circle', {
            cx: pos.x +  wa.offset2D,
            cy: pos.y +  wa.offset2D,
            r: pos.D / 2,
            class: 'valid-drop-target',
            'data-pos-id': pos.id
        });
        svg.appendChild(circle);
    });
}

function clearHighlights() {// Очистка подсветки
    document.querySelectorAll('.valid-drop-target').forEach(el => el.remove());
    wa.validTargets = [];
}

function highlightClosestPosition(x, y) {// Подсветка ближайшей позиции
    let minDist = Infinity;
    let closestPos = null;
    wa.validTargets.forEach(pos => {
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
    if (closestPos && minDist < (wa.draggedRoll.D )) {
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
    if (x - roll.R < 0 || x + roll.R > wa.oContainer.L - wa.oContainer.minCMDoor ||
        y - roll.R < 0 || y + roll.R > wa.oContainer.T) {
        return false;
    }
    // Проверяем пересечение с другими рулонами
    for (const otherRoll of wa.oContainer.rolls) {
		if (ignoreCurrent && otherRoll.id === roll.id) continue;
		if (DivCentrRoll(otherRoll, roll) > wa.mm) {
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
    const posRolls = wa.oContainer.rolls.filter(r => r.id!==roll.id
		&& blockingRoll
		&&	Math.abs(r.x - blockingRoll.x) < wa.mm
		&&	Math.abs(r.y - blockingRoll.y) < wa.mm	).sort((a, b) => a.s - b.s);
	for (const r of posRolls) {	
        currentH		+= r.H;
        availableLayer	= r.s + 1;
    
	}
	// Проверяем превышение высоты ТСа
	if (currentH + roll.H > wa.oContainer.H) {	
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
        wa.isCtrlPressed = false;
        // Принудительно завершаем перетаскивание если отпустили Ctrl
        if (wa.draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
    if (e.key === 'Shift') {
        wa.isShiftPressed = false;
        // Принудительно завершаем перетаскивание если отпустили Shift
        if (wa.draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
	if (e.key === 'Alt') {
        wa.isAltPressed = false;
        if (wa.draggedRoll) endDrag({type: 'keyup', preventDefault: () => {}});
    }
}

function handleKeyDown(e) {
    if (e.key === 'Control' || e.key === 'Meta') wa.isCtrlPressed = true;
    if (e.key === 'Shift') wa.isShiftPressed = true;
	if (e.key === 'Alt') wa.isAltPressed = true;
}

function handleRollDoubleClick(e) {
    e.preventDefault();
	
    const svg = document.querySelector('.active svg');	
    if (!svg) return;
    
    // Получаем ID рулона из атрибута data-roll-id
    const rollId = e.target.getAttribute('data-roll-id');	console.log(rollId)
    if (!rollId) return;
   
    // Находим рулон в модели
    const roll = wa.oContainer.rolls.find(r => r.id == rollId);	console.log(roll)
    if (!roll) return;
    
    // Применяем "прилипание"
    for (const rollMove of wa.oContainer.snapRollToContacts(roll)) {
        // Обновляем представление
        const circle = document.querySelector(`circle[data-roll-id="${rollMove.id}"]`);	
        if (circle) {
            circle.setAttribute('cx', rollMove.x +  wa.offset2D);
            circle.setAttribute('cy', rollMove.y +  wa.offset2D); 
        }
		wa.updateAllViews(rollMove);
    }
}

function updateContainerAfterDrag(rollNew, oldX, oldY, oldS) {// Новая для обновления структур данных ТСа после перетаскивания
    var currentZ = 0;
	var currentS = 1;
    var newRoll = findRollById(rollNew.id);//console.log(rollNew)
    if (newRoll) {
        // Обновляем Z-координаты рулонов в старой позиции 
        if (Math.abs(rollNew.x - oldX) > wa.mm && Math.abs(rollNew.y - oldY) > wa.mm ) { //без его самого, возможно он ушел из позиции
			for (const roll of wa.oContainer.rolls.filter(roll => roll.id !== rollNew.id && Math.abs(roll.x - oldX) < wa.mm && Math.abs(roll.y - oldY) < wa.mm ).sort((a, b) => a.s - b.s) ) {
				roll.z = currentZ + roll.H / 2;
				roll.s = currentS;
				currentZ += roll.H;//console.log((currentZ)
				currentS += currentS;
			}
		}
		// Обновляем Z-координаты рулонов в новой позиции, в т.н. преносимый
		currentZ = 0;
		currentS = 1;
		for (const roll of wa.oContainer.rolls.filter(roll => Math.abs(roll.x - rollNew.x) < wa.mm && Math.abs(roll.y - rollNew.y) < wa.mm ).sort((a, b) => a.s - b.s) ) {
			roll.z = currentZ + roll.H / 2;
			roll.s = currentS;
			currentZ += roll.H;
			currentS += 1;
		}
		if(newRoll.s === 1 && FreeStyle.checked){ //по ним нет стопки (s=1 он на полу) и свободная постановка вне позиции, ставиться на нижние рулоны, если есть определим максимумы их 
			currentZ = 0;
			currentS = 1;										//без его самого, возможно он ушел из позиции
			for (const roll of wa.oContainer.rolls.filter(roll => roll.id !== rollNew.id && Math.abs(roll.x - rollNew.x) < rollNew.R + wa.mm && Math.abs(roll.y - rollNew.y) < rollNew.R + wa.mm ) ) {
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
    wa.controls = document.createElement('div');
    wa.controls.className = 'container-controls';
    
    wa.controls.innerHTML = `
        <button class="btn-optimize" data-id="${container.id}">
            Оптимизировать
        </button>
        <button class="btn-balance" data-id="${container.id}">
            Балансировать
        </button>
    `;
    
    // Обработчики событий
    wa.controls.querySelector('.btn-optimize').addEventListener('click', () => {
        container.optimizedPlacement();
        generateTrainView();
        updateUI();
    });
    
    wa.controls.querySelector('.btn-balance').addEventListener('click', () => {
        wa.currentTrain.balanceContainers(container);
        generateTrainView();
        updateUI();
    });
    
    return wa.controls;
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
		const currentDeviation = wa.oContainer.calculateCurrentDeviation();
		if (	currentDeviation.x <= wa.oContainer.maxCML
			&&	currentDeviation.y <= wa.oContainer.maxCMT
			&&	Math.abs(wa.oContainer.backW  - wa.oContainer.frontW	) <= wa.oContainer.maxKGL
			&&	Math.abs(wa.oContainer.rightW - wa.oContainer.leftW	) <= wa.oContainer.maxKGT	) break // нашли оптимальное
		wa.oContainer.optimizedPlacement(); 
		wa.oContainer.updateCenterOfMass();
	}
	wa.oContainer.swapRollCenter();
	wa.oContainer.updateCenterOfMass();	// Пересчет масс
	wa.generateView();
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
			const response = await fetch( wa.url_service+'save_scheme.php', {
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
        const response = await fetch( wa.url_service+`data/${schemeName}`);
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
    let printContainer = wa.dravPrintScheme();
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




function loadTsParams() {// Загрузка параметров в форму
    const tsType = document.getElementById('ts-type').value;
    if (tsType === 'Свой') {
        // Для пользовательского типа разрешаем ручное редактирование
        // document.querySelectorAll('#container-settings input').forEach(input => {
            // input.disabled = false;
        // });
        //return;
    }
    
    if (!wa.tsParams[tsType]) {
        alert('Параметры для выбранного типа ТС не найдены');
        return;
    }
    
    const params = wa.tsParams[tsType];
    
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
        const response = await fetch( wa.url_service+'update_ts_config.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newParams)
        });
        
        const result = await response.json();
        
        if (result.success) {
            await wa.loadTsConfig(); // Перезагружаем конфиг
            wa.populateTsSelector(); // Обновляем селектор
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
        wa.showLoadingProgress("Начинаем оптимизацию...");
        // 2. Создаем рулоны из текущих наборов
        const rolls = createRollsFromSets();
        if (rolls.length === 0) {
            wa.showError("Нет рулонов для загрузки!");
            return;
        }
        // 3. Рассчитываем оптимальное количество ТСов
        const containerCount = calculateContainerCount(rolls);
        // 4. Получаем параметры ТС из UI (с валидацией)
        const containerParams = getValidatedContainerParams();
        // 5. Создаем цепочку ТСов
        wa.currentTrain = new Train(
            Array.from({length: containerCount}, (_, i) => ({
                ...containerParams,
                trainIndex: i,
                id: generateContainerId(i)
            }))
        );
		// Инициализируем навигацию
		wa.oContainerIndex = 0;
		wa.showContainer();		
        // 6. Оптимизируем загрузку с визуальным прогрессом
        await wa.currentTrain.optimizeLoading(rolls);
		moreOptimizeBalance(5);
        saveOriginalPositions();
        // 7. Визуализируем результат
		wa.renderTrainOverview(); // Первоначальная отрисовка
        wa.generateView();
		wa.updateViewMode()
        // 8. Обновляем UI и сохраняем позиции
		wa.updateUI();
        saveOriginalPositions();
		wa.hideLoadingProgress()
		// 9. Показываем итоговую статистику
		setTimeout(() => {
			wa.showFinalStats();
		}, 1000);
        // 10. Сохраняем текущую схему перед изменениями
        saveSchemeToFile();

    } catch (error) {
        //console.error("Ошибка загрузки:", error);
        wa.showError(`Ошибка: ${error.message}`);
    }
}

function printTrain() {// Печать сосава ТС
	saveSchemeToFile();    // Сначала сохраняем текущую схему
    // Инициируем печать
    window.print();
    
}
