// Представление проекта MVC

// Отрисовка 3D Схема
function initScene3D() {
	// параметры сцены
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xf5f5f5);
	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
	camera.position.set(400, 300, 500);
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
}

// Отрисовка 3D Схема
function setupScene3D() {
	// Освещение и оси должны быть пересозданы
	const ambientLight = new THREE.AmbientLight(0x404040);
	scene.add(ambientLight);
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(1, 1, 1);
	scene.add(directionalLight);
	const axesHelper = new THREE.AxesHelper(100);
	axesHelper.position.set(0, 0, 0);
	scene.add(axesHelper);
	// ТС
	const containerGeometry = new THREE.BoxGeometry(
		oContainer.L,
		oContainer.H,
		oContainer.T
	);
	const containerMaterial = new THREE.MeshPhongMaterial({
		color: 0xffffff, // белый цвет лучше работает с прозрачностью
		transparent: true,
		opacity: 0.05, // почти полностью прозрачный
		depthWrite: false,
		side: THREE.DoubleSide, // отображаем обе стороны
		wireframe: false
	});
	const containerMesh = new THREE.Mesh(containerGeometry, containerMaterial);
	containerMesh.position.set(
		oContainer.centerX,
		oContainer.centerZ,
		oContainer.centerY
	);
	scene.add(containerMesh);
	// Разделительная линия между половинками дверей
	const doorGroup = new THREE.Group();
	const dividerGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(oContainer.L, 0			, oContainer.centerY),
		new THREE.Vector3(oContainer.L, oContainer.H, oContainer.centerY)
	]);
	const dividerMaterial = new THREE.LineBasicMaterial({ color: 0x009900 });
	const divider = new THREE.Line(dividerGeometry, dividerMaterial);
	doorGroup.add(divider);
	scene.add(doorGroup);
	// Дисбаланс масс
	const edges = new THREE.EdgesGeometry(containerGeometry);
	const line = new THREE.LineSegments(
		edges,
		new THREE.LineBasicMaterial({ color: 0x009900, linewidth: 1 })
	);
	line.position.copy(containerMesh.position);
	scene.add(line);
    // Рулоны размещенные
	oContainer.rolls.forEach(roll => {
        // const cylinder0 = new THREE.Mesh(geometry, material);
        // cylinder0.position.set(roll.x, roll.z, roll.y);
        // scene.add(cylinder0);
		const cylinderGeometry = new THREE.CylinderGeometry(
			roll.D/2, roll.D/2, roll.H, 32
		);
		const cylinderMaterial = new THREE.MeshPhongMaterial({
			color: new THREE.Color(roll.color),
			transparent: true,
			opacity: 0.5
		});
		const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
		cylinder.position.set(roll.x, roll.z, roll.y);
		cylinder.userData = { id: roll.id };
		scene.add(cylinder);
		// Сохраняем ссылку на 3D объект
		roll.mesh3D = cylinder;
		// Создаем метку для 3D
		const labelText = `${roll.id}: ${roll.H}`;
		const label = createRollLabel3D(labelText);
		label.position.set(
			roll.x,
			roll.z + roll.H / 2 + 5,
			roll.y
		);
		// Инициализируем масштаб
		updateLabelScale(label, camera);
		scene.add(label);
		// Сохраняем ссылку на метку
		roll.label3D = label;
    });
	// Container center 
	const centerGeometry = new THREE.SphereGeometry(6, 16, 16);
	const centerMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
	const centerMarker = new THREE.Mesh(centerGeometry, centerMaterial);
	centerMarker.position.set(
		oContainer.centerX,
		oContainer.centerZ,
		oContainer.centerY
	);
	scene.add(centerMarker);
	// Center of mass (red)
	const cmGeometry = new THREE.SphereGeometry(9, 16, 16);
	const cmMaterial = new THREE.MeshBasicMaterial({ color: 0xff3311 });
	const cmMarker = new THREE.Mesh(cmGeometry, cmMaterial);
	cmMarker.position.set(
		oContainer.centerOfMass.x,
		oContainer.centerOfMass.z,
		oContainer.centerOfMass.y
	);
	scene.add(cmMarker);
	// Line between centers
	const lineGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(
			oContainer.centerX,
			oContainer.centerZ,
			oContainer.centerY
		),
		new THREE.Vector3(
			oContainer.centerOfMass.x,
			oContainer.centerOfMass.z,
			oContainer.centerOfMass.y
		)
	]);
	const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00FF00, linewidth: 1 });
	const centerLine = new THREE.Line(lineGeometry, lineMaterial);
	scene.add(centerLine);
	// линию отступа двери
	const doorLineGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(oContainer.L - oContainer.minCMDoor, 0, 0),
		new THREE.Vector3(oContainer.L - oContainer.minCMDoor, 0, oContainer.T)
	]);
	const doorLineMaterial = new THREE.LineBasicMaterial({
		color: 0xFF0000,
		linewidth: 3
	});
	const doorLine = new THREE.Line(doorLineGeometry, doorLineMaterial);
	scene.add(doorLine);
	// Делаем линию полупрозрачной и добавляем на пол
	const floorLineMaterial = new THREE.LineBasicMaterial({
		color: 0xFF0000,
		linewidth: 2,
		transparent: true,
		opacity: 0.7
	});
	const floorLine = new THREE.Line(doorLineGeometry, floorLineMaterial);
//	floorLine.rotation.x = Math.PI / 2; // Поворачиваем на 90 градусов для отображения на полу
//	floorLine.position.y = 2; // Чуть выше пола, чтобы не было конфликтов
	scene.add(floorLine);
	// После создания всех объектов
	initDragControls();
}

function createRollLabel3D(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 40; // Базовый размер шрифта
    context.font = `${fontSize}px Arial`;
    const textWidth = context.measureText(text).width;
    canvas.width = textWidth + 10;
    canvas.height = fontSize + 10;
    context.fillStyle = 'rgba(51,51,51,0.9)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width / 5, canvas.height / 5, 1);
    // Сохраняем исходные размеры для масштабирования
    sprite.userData.baseScale = sprite.scale.clone();
    return sprite;
}

function updateLabelScale(label, camera) {
    if (!label.userData.baseScale) return;
    // Рассчитываем расстояние от метки до камеры
    const distance = label.position.distanceTo(camera.position);
    // Масштабируем в зависимости от расстояния (можно настроить коэффициент)
    const scaleFactor = distance * 0.01;
    label.scale.copy(label.userData.baseScale).multiplyScalar(scaleFactor);
}

// Подписи рулона
function createRollLabel(text) {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	const fontSize = 18;
	// Измеряем ширину текста
	context.font = `${fontSize}px Arial`;
	const textWidth = context.measureText(text).width;
	// Устанавливаем размеры canvas
	canvas.width = textWidth + 20;
	canvas.height = fontSize + 10;
	// Рисуем фон
//    context.fillStyle = 'rgba(200, 200, 200, 0.5)';
//    context.fillRect(0, 0, canvas.width, canvas.height);
	// Рисуем текст
	context.font = `${fontSize}px Arial`;
	context.fillStyle = '#AA6600';
	context.textAlign = 'center';
	context.textBaseline = 'smol'; //  middle
	context.fillText(text, canvas.width / 2, canvas.height / 2);
	// Создаем текстуру
	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true
	});
	// Создаем спрайт
	const sprite = new THREE.Sprite(material);
	sprite.scale.set(canvas.width * 0.5, canvas.height * 0.5, 1);
	return sprite;
}

function findClosestPosition3D(x, y, roll) {
    // Ищем свободные позиции с учетом слоев
    // for (let s = 1; s <= 3; s++) {
        // const pos = this.Positions.find(p => 
            // !this.isPositionOccupied(p.x, p.y, s) &&
            // p.D === roll.D &&
            // this.canPlaceRoll(p, roll)
        // );
        // if (pos) return { pos, z: this.calculateZForPosition(pos.x, pos.y, s) };
    // }
    // return null;
	
    let closestPos = null;
    let minDist = Infinity;
    let targetZ = 0;
    let targetS = 1;
    // Ищем среди всех позиций
    for (const pos of oContainer.Positions) {
        if (pos.D !== roll.D) continue;
        const dx = pos.x - x;
        const dy = pos.y - y;
        const dist = dx*dx + dy*dy;
        if (dist < minDist && dist < (roll.D * roll.D)) {
            // Рассчитываем высоту стопки в этой позиции
            let currentZ = 0;
            let layers = 0;
            for (const r of oContainer.rolls) {
                if (Math.abs(r.x - pos.x) < mm && 
                    Math.abs(r.y - pos.y) < mm) {
                    currentZ += r.H;
                    layers = Math.max(layers, r.s);
                }
            }
            // Если позиция свободна или можно добавить новый слой
            if (currentZ + roll.H < oContainer.H) {
                minDist = dist;
                closestPos = pos;
                targetZ = currentZ;
                targetS = layers + 1;//console.log(currentZ + roll.H)        
            } 
		}
    }
    return closestPos ? { 
        pos: closestPos, 
        z: targetZ + roll.H/2, // Центр рулона
        s: targetS 
    } : null;
}

function animateSnap3D(roll, targetPos, callback) {
    const roll3D = findRoll3DObject(roll.id);
    if (!roll3D) return;
    const startPos = roll3D.position.clone();
    const endPos = new THREE.Vector3(
        targetPos.x, 
        targetPos.z || roll.z, // Используем переданное Z или текущее
        targetPos.y
    );
    const duration = 300;
    const startTime = performance.now();
    const animate = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        roll3D.position.lerpVectors(startPos, endPos, progress);
        if (roll.label3D) {
            roll.label3D.position.copy(roll3D.position);
            roll.label3D.position.y += roll.H/2 + 5;
            updateLabelScale(roll.label3D, camera);
        }
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else if (callback) {
            callback();
        }
    };
    requestAnimationFrame(animate);
}
//  Отрисовка 2D Схема
// Скрипт для отрисовки SVG
function renderViews2D() {
    const viewsContainer = document.getElementById('views-container');
    viewsContainer.innerHTML = "";// очистим схем 2D
    
    // Отрисовываем только текущий контейнер
    const container = currentTrain.containers[oContainerIndex];
    

	// Вид сверху
	const topView = document.createElement('div');
	topView.className = 'print-container active';
	topView.id = 'topView';
	topSvg = createSvgElement('svg', {
		width	: oContainer.L+offset2D*2,
		height	: oContainer.T+offset2D*2,
		viewBox	: '0 0 '+(oContainer.L+offset2D*2)+' '+(oContainer.T+offset2D*2)
	});
    drawTopView(topSvg, container);
    topView.appendChild(topSvg);
    viewsContainer.appendChild(topView);

	// Вид спереди
	const FrontView = document.createElement('div');
	FrontView.className = 'print-container';
	FrontView.id = 'FrontView';
	const FrontSvg = createSvgElement('svg', {
		width: oContainer.L+offset2D*2,
		height: oContainer.H+offset2D*2,
		viewBox: '0 0 '+(oContainer.L+offset2D*2)+' '+(oContainer.H+offset2D*2)
	});
	FrontSvg.id = 'FrontSvg';
	drawFrontView(FrontSvg);
	FrontView.appendChild(FrontSvg);
	viewsContainer.appendChild(FrontView);
	// Виды с торцов
	const sideViews = document.createElement('div');
	sideViews.className = 'print-container';
	sideViews.id = 'sideViews';
	// Вид с торца (двери)
	const doorSvg = createSvgElement('svg', {
		width: oContainer.T + offset2D*2,
		height: oContainer.H + offset2D*2,
		viewBox: '0 0 '+(oContainer.T + offset2D*2)+' '+(oContainer.H + offset2D*2)
	});
	drawDoorView(doorSvg);
	sideViews.appendChild(doorSvg);
	// Вид с противоположного торца
	const rearSvg = createSvgElement('svg', {
		width: oContainer.T + offset2D*2,
		height: oContainer.H + offset2D*2,
		viewBox: '0 0 '+(oContainer.T + offset2D*2)+' '+(oContainer.H + offset2D*2)
	});
	drawRearView(rearSvg);
	sideViews.appendChild(rearSvg);
	viewsContainer.appendChild(sideViews);
}
// для создания SVG-элемента
function createSvgElement(tag, attrs) {
	const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
	if (attrs) for (const [key, value] of Object.entries(attrs)) {
		elem.setAttribute(key, value);
	}
	return elem;
}
// Текст
function drawTextSVG(svg, txt ,x, y, id=0) {
	const textElem = createSvgElement('text', {	x: x, y: y, class: 'dim-text','text-anchor': 'middle', 'data-roll-id': id});
	textElem.textContent = txt;
	svg.appendChild(textElem);
}
// Линия отступа двери
function LineDoor(svg,Y){
    const doorOffset = ( oContainer.gateTypeCenter ?  Y : oContainer.L ) - oContainer.minCMDoor;
    const doorLine = createSvgElement('line', {
        x1: offset2D + (oContainer.gateTypeCenter ? oContainer.L/2 - Y/4	: doorOffset),
        y1: offset2D + (oContainer.gateTypeCenter ? doorOffset				: 0 ),
        x2: offset2D + (oContainer.gateTypeCenter ? oContainer.L/2 + Y/4	: doorOffset),
        y2: offset2D + (oContainer.gateTypeCenter ? doorOffset				: Y ),
        stroke: '#FF0000',
        'stroke-width': 1,
        'stroke-dasharray': '5,7'
    });
    svg.appendChild(doorLine);
    // Подпись отступа
    drawTextSVG(svg, `${oContainer.minCMDoor}`, offset2D + (oContainer.gateTypeCenter ? oContainer.L/2 : doorOffset), offset2D + (oContainer.gateTypeCenter ? Y : offset2D) );
}
// для отрисовки текстовой метки
function drawRollLabel(svg, roll) {
    const _text = createSvgElement('text', {
        x: offset2D + roll.x,
        y: offset2D + roll.y - (roll.s-2)*20 - 10,
        'text-anchor': 'middle',
        'data-roll-id': roll.id,
		'style' : "Color:rgba(204,153,51)",
        class: 'roll-label'
    });
    _text.textContent = `${roll.id}.${roll.H}`;
    svg.appendChild(_text);
}
// для отрисовки рулона 2D
function drawRoll(svg, roll) {
	const circle = createSvgElement('circle', {
		cx: roll.x + offset2D,
		cy: roll.y + offset2D,
		r:	roll.D / 2,
		class: 'roll-circle',
		'style' : "fill:"+styleColorFillRoll(roll),
		'data-roll-id': roll.id
	});
	// Добавляем обработчики событий для перетаскивания
	circle.addEventListener('mousedown', startDrag);
	circle.addEventListener('touchstart', startDrag, {passive: false});
	svg.appendChild(circle);
	drawRollLabel(svg, roll); // Добавляем метку
}
// для отрисовки позиции 2D
function drawPos(svg, pos) {
	const circle = createSvgElement('circle', {
		cx: pos.x + offset2D,
		cy: pos.y + offset2D,
		r:	pos.D / 2,
		class: 'roll-pos',
		'data-roll-id': pos.id
	});
	// Добавляем обработчики событий для перетаскивания
	svg.appendChild(circle);
	//drawRollLabel(svg, pos); // Добавляем метку
}
// Отрисовка вида сверху
function drawTopView(svg, oContainer,index = "1") {
    drawTextSVG(svg, `Вид сверху ТС ${index} ${oContainer.rolls.length}/${oContainer.totalW} кг`, oContainer.L/2, offset2D/2 );
    const container = createSvgElement('rect', {
        x: offset2D,
        y: offset2D,
        width: oContainer.L,
        height: oContainer.T,
        class: 'container-rect'
    });
    svg.appendChild(container);
	LineDoor(svg,oContainer.T);
    // позиции тест
    oContainer.unplacedPositions.forEach(p => drawPos(svg, p));
    // Рулоны
    oContainer.rolls.sort((a, b) => a.s - b.s).forEach(roll => drawRoll(svg, roll));
	// Оси и подписи
	//drawAxis(svg, offset2D, offset2D, oContainer.L, oContainer.T, 'X(Длина)', 'Y(Ширина)');
	// Центр ТС (зеленая точка)
	const centerCircle = createSvgElement('circle', {
		cx: offset2D + oContainer.centerX,
		cy: offset2D + oContainer.centerY,
		r: 4,
		fill: '#00FF00',
		stroke: '#009900',
		'stroke-width': 1
	});
	svg.appendChild(centerCircle);
	// Центр масс (красная точка)
	const massCenterCircle = createSvgElement('circle', {
		cx: offset2D + oContainer.centerOfMass.x,
		cy: offset2D + oContainer.centerOfMass.y,
		r: 6,
		fill: '#FF3311',
		stroke: '#CC0000',
		'stroke-width': 1
	});
	svg.appendChild(massCenterCircle);
	// Линия между центрами
	const centerLine = createSvgElement('line', {
		x1: offset2D + oContainer.centerX,
		y1: offset2D + oContainer.centerY,
		x2: offset2D + oContainer.centerOfMass.x,
		y2: offset2D + oContainer.centerOfMass.y,
		stroke: '#00AA00',
		'stroke-width': 1,
		'stroke-dasharray': '3,2'
	});
	
	svg.appendChild(centerLine);
    // Добавляем обработчики для всего SVG
    svg.addEventListener('mousemove', dragRoll);
    svg.addEventListener('touchmove', dragRoll, {passive: false});
    svg.addEventListener('mouseup', endDrag);
    svg.addEventListener('touchend', endDrag);
    svg.addEventListener('mouseleave', endDrag);
}
// Отрисовка вида сбоку
function drawFrontView(svg) {
    drawTextSVG(svg, "Вид спереди:", oContainer.L/2, offset2D/2  );
    // ТС
    const container = createSvgElement('rect', {
        x: offset2D,
        y: offset2D,
        width: oContainer.L,
        height: oContainer.H,
        class: 'container-rect'
    });
    svg.appendChild(container);
	LineDoor(svg,oContainer.H);
    // Рулоны
    oContainer.rolls.sort((a, b) => a.x - b.x).forEach(roll => {
		const y = offset2D + oContainer.H - (roll.z + roll.H / 2)
			, x = offset2D + roll.x - roll.D / 2;
		// Рулоны представлены прямоугольниками (вид сбоку)
		const rect = createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			class: 'roll-rect',
			'style' : "fill:"+styleColorFillRoll(roll),
			'data-roll-id': roll.id // Добавляем идентификатор
		});
		svg.appendChild(rect);
		drawTextSVG(svg, ''+ roll.id + ': '+ roll.H, x+roll.D / 2 , y + roll.H / 2 + roll.y/5 - 10, roll.id );
    });
	// Оси и подписи
	drawAxis(svg, offset2D, offset2D, oContainer.L, oContainer.H, 'X=(Длина)', 'Z-(Высота)');
	   // Центр ТСа (зеленая точка)
	const centerCircle = createSvgElement('circle', {
		cx: offset2D + oContainer.centerX,
		cy: offset2D + oContainer.H - oContainer.centerZ,
		r: 4,
		fill: '#00FF00',
		stroke: '#009900',
		'stroke-width': 1
	});
	svg.appendChild(centerCircle);
	// Центр масс (красная точка)
	const massCenterCircle = createSvgElement('circle', {
		cx: offset2D + oContainer.centerOfMass.x,
		cy: offset2D + oContainer.H - oContainer.centerOfMass.z,
		r: 6,
		fill: '#FF3311',
		stroke: '#CC0000',
		'stroke-width': 1
	});
	svg.appendChild(massCenterCircle);
	// Линия между центрами
	const centerLine = createSvgElement('line', {
		x1: offset2D + oContainer.centerX,
		y1: offset2D + oContainer.H - oContainer.centerZ,
		x2: offset2D + oContainer.centerOfMass.x,
		y2: offset2D + oContainer.H - oContainer.centerOfMass.z,
		stroke: '#00AA00',
		'stroke-width': 1,
		'stroke-dasharray': '3,2'
	});
	svg.appendChild(centerLine);
}
// Отрисовка вида со стороны двери
function drawDoorView(svg) {
	drawTextSVG(svg, "Вид от двери:", offset2D*10, offset2D*2 );
	// ТС
	const container = createSvgElement('rect', {
		x: offset2D,
		y: offset2D,
		width: oContainer.T,
		height: oContainer.H,
		class: 'container-rect'
	});
	svg.appendChild(container);
	// Рулоны
	nn=0;
	oContainer.rolls.sort((a, b) => a.x - b.x).forEach(roll => {
		const y = offset2D + oContainer.H - (roll.z + roll.H / 2)
			, x = offset2D + (oContainer.T - roll.y) - roll.D / 2 ;
		// Рулоны представлены прямоугольниками (вид сбоку)
		const rect = createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			'style' : "fill:"+styleColorFillRoll(roll),
			class: 'roll-rect'
		});
		svg.appendChild(rect);
		drawTextSVG(svg, ''+ (++nn) + ': '+ roll.H, x+20 , y + roll.H - (oContainer.L - roll.x)/10 + 20 ); //
	});
	// Оси и подписи
	drawAxis(svg, offset2D, offset2D, oContainer.T, oContainer.H, ' Y (Ширина)', 'Z (Высота)');
}
// Отрисовка вида с противоположного торца
function drawRearView(svg) {
	drawTextSVG(svg, "Вид с торца:", offset2D*10, offset2D*2 );
	// ТС
	const container = createSvgElement('rect', {
		x: offset2D,
		y: offset2D,
		width: oContainer.T,
		height: oContainer.H,
		class: 'container-rect'
	});
	svg.appendChild(container);
	// Рулоны (зеркальное отображение)
	const rollsOnX = oContainer.rolls
	rollsOnX.sort((a, b) => b.x - a.x);
	rollsOnX.forEach(roll => {
		const y = offset2D + oContainer.H - (roll.z + roll.H / 2)
			, x = offset2D + roll.y - roll.D / 2 ;
		const rect = createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			'style' : "fill:"+styleColorFillRoll(roll),
			class: 'roll-rect'
		});
		svg.appendChild(rect);
		drawTextSVG(svg, ''+ roll.H, x + roll.D / 2, y + roll.H - (roll.x)/10 + 12); //+ (++nn) + ': '+
	});
	// Оси и подписи
	drawAxis(svg, offset2D, offset2D, oContainer.T, oContainer.H, 'Y (Ширина)', 'Z (Высота)');
}
// Изменение цвета рулона по его параметрам
function styleColorFillRoll(roll) {
	return "rgba("+(255-10*roll.s)+","+(50+Math.abs(255-3*(roll.D-80))).toFixed(0)+","+((roll.H/2)).toFixed(0)+",0.5)"; //.toFixed(0)
}	
// Отрисовка осей и подписей
function drawAxis(svg, x, y, T, H, xLabel, yLabel) {
	// Ось X
	const xAxis = createSvgElement('line', {
		x1: 0,
		y1: y + H/2,
		x2: x + T,
		y2: y + H/2,
		class: 'axis'
	});
	svg.appendChild(xAxis);
	// Ось Y
	const yAxis = createSvgElement('line', {
		x1: x + T/2,
		y1: 0,
		x2: x + T/2,
		y2: y + H,
		class: 'axis'
	});
	svg.appendChild(yAxis);
	// Размерные линии
	drawDimension(svg, x		, y + H, x + T, y + H, 	0		, offset2D	, ' '+xLabel+'-'+T+' ');
	drawDimension(svg, x + T, y			, x + T, y + H,	offset2D, 0			, ' '+yLabel+'-'+H+' ');
}
// Отрисовка размерных линий
function drawDimension(svg, x1, y1, x2, y2, offsetx, offsety, text) {
	// Основная линия
	const line = createSvgElement('line', {
		x1: x1 + offsetx,
		y1: y1 + offsety,
		x2: x2 + offsetx,
		y2: y2 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(line);
	// Выноски
	const ext1 = createSvgElement('line', {
		x1: x1,
		y1: y1,
		x2: x1 + offsetx,
		y2: y1 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(ext1);
	const ext2 = createSvgElement('line', {
		x1: x2,
		y1: y2,
		x2: x2 + offsetx,
		y2: y2 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(ext2);
	// Текст
	const textElem = createSvgElement('text', {
		x: offsetx===0 ? (x1 + x2) / 2 : x1 + offsetx,
		y: offsety===0 ? (y1 + y2) / 2 : y1 + offsety,
		class: 'dim-text',
		'text-anchor': 'middle',
		'transform': offsety===0 ? 'rotate(-90, ' + (x1 + 1.5*offsetx) + ', ' + (y1 + y2 / 2) + ')' : ''
	});
	textElem.textContent = text;
	svg.appendChild(textElem);
}

function updateFrontViewRollPosition(roll) {
    const frontSvg = document.getElementById('FrontSvg');
    if (!frontSvg) return;
    const rect = frontSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
    if (!rect) return;
    const y = offset2D + oContainer.H - (roll.z + roll.H / 2);
    const x = offset2D + roll.x - roll.D / 2;
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('height', roll.H);
    // Обновляем текст
    const text = frontSvg.querySelector(`text[data-roll-id="${roll.id}"]`);
    if (text) { 
        text.setAttribute('x', x + roll.D / 2);
        text.setAttribute('y', y + roll.H / 2 - 5);
    }
}

function updateSideViews(roll) {
    // Door View (вид со стороны двери)
    const doorSvg = document.querySelector('#panel2D .print-container:nth-child(3) svg');
    if (doorSvg) {
        const rect = doorSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
        if (rect) {
            rect.setAttribute('x', offset2D + (oContainer.T - roll.y) - roll.D / 2);
            rect.setAttribute('y', offset2D + oContainer.H - (roll.z + roll.H / 2));
        }
    }
    // Rear View (вид с противоположной стороны)
    const rearSvg = document.querySelector('#panel2D .print-container:nth-child(4) svg');
    if (rearSvg) {
        const rect = rearSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
        if (rect) {
            rect.setAttribute('x', offset2D + roll.y - roll.D / 2);
            rect.setAttribute('y', offset2D + oContainer.H - (roll.z + roll.H / 2));
        }
    }
}

function update2DViews(roll) {
	if (!roll) return;
	const oldText = topSvg.querySelector(`text[data-roll-id="${roll.id}"]`);
    if (oldText) {
        oldText.setAttribute('x', roll.x + offset2D);
        oldText.setAttribute('y', roll.y + offset2D - 10);
		updateFrontViewRollPosition(roll);
		updateSideViews(roll);
    }
}

function updateAllViews(roll) {
    // Обновляем вид сверху
    const topCircle = document.querySelectorAll(`circle[data-roll-id="${roll.id}"]`);
    if (topCircle) topCircle.forEach(Circle => { 
        Circle.setAttribute('cx', roll.x + offset2D);
        Circle.setAttribute('cy', roll.y + offset2D);
    })
    const oldText = document.querySelectorAll(`text[data-roll-id="${roll.id}"]`);
    if (oldText) oldText.forEach(oText => { 
        oText.setAttribute('x', roll.x + offset2D);
        oText.setAttribute('y', roll.y + offset2D - (roll.s-2)*20 - 10)
    })

    // Обновляем вид спереди
    updateFrontViewRollPosition(roll);
    
    // Обновляем виды с торцов
    updateSideViews(roll);

    // Обновляем 3D представление, если оно активно
    if (currentViewMode === '3D' && roll.mesh3D) {
        roll.mesh3D.position.set(roll.x, roll.z, roll.y);
        if (roll.label3D) {
            roll.label3D.position.set(
                roll.x,
                roll.z + roll.H/2 + 5,
                roll.y
            );
            updateLabelScale(roll.label3D, camera);
        }
    }
}

function findRoll3DObject(rollId) {
    let rollObject = null;
    scene.traverse(function(child) {
        if (child.userData && child.userData.id === rollId && child instanceof THREE.Mesh) {
            rollObject = child;
        }
    });
    return rollObject;
}

function getCapacityClass(container) { // получить класс состояния
    const percent = container.getFillPercentage();
    if (percent > 90) return 'critical';
    if (percent > 70) return 'warning';
    return 'normal';
}

function showModal() {// Функции для работы с модальным окном
    document.getElementById('scheme-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('scheme-modal').style.display = 'none';
}

async function showServerSchemes() {// Показать список схем с сервера
    try {
        const response = await fetch( url_service+'list_schemes.php');
        if (!response.ok) throw new Error('Ошибка загрузки списка');
        
        const schemes = await response.json();
        renderSchemeList(schemes);
        showModal();
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Не удалось загрузить список схем');
    }
}

function renderSchemeList(schemes) {// Отобразить список схем в модальном окне
    const listContainer = document.getElementById('scheme-list');
    listContainer.innerHTML = '';
    
    if (schemes.length === 0) {
        listContainer.innerHTML = '<p>Нет сохраненных схем на сервере</p>';
        return;
    }
    
    schemes.forEach(scheme => {
        const schemeItem = document.createElement('div');
        schemeItem.style.padding = '10px';
        schemeItem.style.borderBottom = '1px solid #eee';
        schemeItem.style.cursor = 'pointer';
        schemeItem.style.display = 'flex';
        schemeItem.style.justifyContent = 'space-between';
        
        schemeItem.innerHTML = `<div>
<button class="load-btn" data-scheme="${scheme}"> ↤ </button>
<span>${scheme}</span>
<button class="delete-btn" data-scheme="${scheme}">x</button></div>`;
        
        listContainer.appendChild(schemeItem);
    });
    
    // Добавляем обработчики для новых кнопок
    document.querySelectorAll('.load-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const schemeName = e.target.getAttribute('data-scheme');
            await loadSchemeFromServer(schemeName);
            closeModal();
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const schemeName = e.target.getAttribute('data-scheme');
            if (confirm(`Удалить схему "${schemeName}"?`)) {
                await deleteSchemeFromServer(schemeName);
                await showServerSchemes(); // Обновляем список
            }
        });
    });
}

async function initTsSelector() {// Загрузка и инициализация параметров ТС
    await loadTsConfig();
    populateTsSelector();
    
    const savedParams = localStorage.getItem('customTsParams');
    if (savedParams) {
        const params = JSON.parse(savedParams);
        Object.keys(params).forEach(key => {
            const elem = document.getElementById(key);
            if (elem) elem.value = params[key];	
        });
		return;
    }

}

function generateTrainView() {// рисовать состав ТС
	renderViews2D();
	renderTrainListView();
	// После отрисовки всех ТС показываем текущий 
	//showContainer();
}

function renderTrainListView() { //для отрисовки миниатюр видов сверху
    const containers = document.getElementById('views-container-list');
    containers.innerHTML = '';
    
    // Группируем одинаковые ТС
    const containerGroups = [];
    let currentGroup = null;
    
    currentTrain.containers.forEach((container, index) => {
        const containerKey = `${container.L}x${container.T}x${container.H}_${container.rolls.length}`;
        
        if (!currentGroup || currentGroup.key !== containerKey) {
            currentGroup = {
                key: containerKey,
                count: 1,
                firstIndex: index,
                indexes: [index],
                container: container
            };
            containerGroups.push(currentGroup);
        } else {
            currentGroup.count++;
            currentGroup.indexes.push(index);
        }
    });

    // Рендерим группы
    containerGroups.forEach(group => {
        const tsElement = document.createElement('div');
        tsElement.className = 'train-container-view';
        
        // Проверяем, входит ли текущий ТС в эту группу
        const isActive = group.indexes.includes(oContainerIndex);
        
        if (isActive) {
            tsElement.classList.add('active');
        }
        
        // Добавляем обработчик клика
        tsElement.addEventListener('click', () => {
            oContainerIndex = group.firstIndex; // Переходим к первому ТС в группе
            oContainer = currentTrain.containers[oContainerIndex];
            oContainer.updateCenterOfMass();
            renderTrainListView();
            updateUI();
        });

        // Создаем миниатюру вида сверху
        const svg = createSvgElement('svg', {
            width: group.container.L + offset2D*2,
            height: group.container.T + offset2D*2,
            viewBox: `0 0 ${group.container.L + offset2D*2} ${group.container.T + offset2D*2}`,
            'data-container-index': group.firstIndex
        });
       
        // Формируем текст подписи
        let labelText;
        if (group.count === 1) {
            labelText = `${group.firstIndex + 1}`;
        } else if (group.count <= 3) {
            labelText = `${group.indexes.map(i => i + 1).join(', ')}`;
        } else {
            labelText = `${group.indexes[0] + 1}-${group.indexes[group.indexes.length - 1] + 1} (${group.count} шт)`;
        }
        
        drawTopView(svg, group.container, labelText);//	console.log(group.container)
        
        tsElement.appendChild(svg);
        containers.appendChild(tsElement);
    });
    // Инициализируем drag-n-drop для всех рулонов
    initDragBetweenContainers();
}

function drawContainerView(svg, container) {//с конкретным ТС
    drawTopView(svg, oContainer); 
    if (container === currentTrain.containers[0]) {
        // Для первого ТСа добавляем оси и подписи
        drawAxis(svg, offset2D, offset2D, container.L, container.T, 'X-(Длина)', 'Y-(Ширина)');
    }
}

function highlightTransferCandidates() {
    if (!currentTrain) return;
    
    const source = currentTrain.containers[0];
    const target = currentTrain.containers[1];
    const candidate = source.findBestTransferCandidate(target);
    
    if (candidate) {
        const rollElement = document.querySelector(`[data-roll-id="${candidate.id}"]`);
        if (rollElement) {
            rollElement.classList.add('transfer-candidate');
        }
    }
}

function updateNavigation() {// обновления состояния
	if (!currentTrain || currentTrain.containers.length === 0) {
		prevBtn.disabled = true;
		nextBtn.disabled = true;
		infoSpan.textContent = "Нет ТС";
		return;
	}
	
	prevBtn.disabled = oContainerIndex === 0;
	nextBtn.disabled = oContainerIndex === currentTrain.containers.length - 1;
	
	infoSpan.textContent = `ТС ${oContainerIndex + 1}/${currentTrain.containers.length}`;
}

function initContainerNavigation() {// Инициализация навигации
	// Элементы управления
	const prevBtn = document.getElementById('prev-container');
	const nextBtn = document.getElementById('next-container');
	const infoSpan = document.getElementById('current-container-info');
	

	
	// Обработчики событий
	prevBtn.addEventListener('click', () => {
		if (oContainerIndex > 0) {
			oContainerIndex--;
			showContainer();
		}
	});
	
	nextBtn.addEventListener('click', () => {
		if (oContainerIndex < currentTrain.containers.length - 1) {
			oContainerIndex++;
			showContainer();
		}
	});
	
	document.addEventListener('keydown', (e) => {
		if (!currentTrain) return;
		
		// Стрелка влево - предыдущий ТС
		if (e.key === 'ArrowLeft') {
			if (oContainerIndex > 0) {
				oContainerIndex--;
				showContainer();
			}
			e.preventDefault();
		}
		
		// Стрелка вправо - следующий ТС
		if (e.key === 'ArrowRight') {
			if (oContainerIndex < currentTrain.containers.length - 1) {
				oContainerIndex++;
				showContainer();
			}
			e.preventDefault();
		}
	});    
	document.getElementById('add-container').addEventListener('click', addСontainerСlick);

	document.getElementById('remove-container').addEventListener('click', removeСontainerСlick);	
	// Инициализация
	updateNavigation();
}

function addСontainerСlick() { //добавить ТС
	if (!currentTrain) return;
	const params = getValidatedContainerParams();
	currentTrain.addContainer(params);
	renderTrainOverview();
}

function removeСontainerСlick() { //добавить ТС
	if (!currentTrain || currentTrain.containers.length <= 1) return;
	currentTrain.removeContainer(oContainerIndex);
	if (oContainerIndex = currentTrain.containers.length) oContainerIndex--;	
	renderTrainOverview();
}

function showContainer(index = oContainerIndex) { //показать ТС
    if (index < 0 || index >= currentTrain.containers.length) return;
    
    oContainerIndex = index;
    oContainer = currentTrain.containers[index];
    
    // Обновляем информацию о текущем ТС
    document.getElementById('current-container-info').textContent = 
        `ТС ${index + 1}/${currentTrain.containers.length}`;
    
    // Активируем/деактивируем кнопки навигации
    document.getElementById('prev-container').disabled = index <= 0;
    document.getElementById('next-container').disabled = index >= currentTrain.containers.length - 1;
    
	// Обновляем список если в режиме просмотра списка
    if (currentViewMode === '1D') {
        //renderTrainList();	
		//currentViewMode = '2D';
    } 
	// Генерируем представление
    generateView();	
	renderTrainOverview();
    updateUI();
}

function renderTrainOverview() {//показ состава ТС для навигации
	if (!currentTrain || currentTrain.containers.length === 0) return;
	
	const svg = document.getElementById('train-svg');
	svg.innerHTML = ''; // Очищаем предыдущее изображение
	
	const containerWidth = 35;
	const containerHeight = 15;
	const spacing = 2;
	const startX = 5;
	const startY = 5;
	
	// Общая ширина для центрирования
	const totalWidth = currentTrain.containers.length * (containerWidth + spacing) - spacing;
	
	// Рисуем ТС
	currentTrain.containers.forEach((container, index) => {
		const x = startX + index * (containerWidth + spacing);
		const y = startY;
		
		// Индикатор текущего ТС
		if (index === oContainerIndex) {
			const indicator = createSvgElement( 'rect', {
				x		: x - 5,
				y		: y - 5,
				width	: containerWidth + 10,
				height	: containerHeight + 10,
				rx		: 4,
				class	:'current-container-indicator'
			});
			svg.appendChild(indicator);
		}
		
		// ТС
		const rect = createSvgElement( 'rect', {
			x: x,
			y: y,
			width: containerWidth,
			height: containerHeight,
			rx: 3,
			class: 'train-container-rect'
		});
		rect.dataset.index = index;
		
		// Градиент заливки по степени заполненности
		const fillPercent = Math.min(100, (container.totalW / container.maxW) * 100);
		rect.style.fill = `url(#fill-gradient-${index})`;
		
		svg.appendChild(rect);
		
		// Создаем градиент
		const defs = svg.querySelector('defs') || createSvgElement( 'defs');
		const gradient = createSvgElement( 'linearGradient',{
			x1: '0%',
			y1: '0%',
			x2: '100%',
			y2: '0%'
		});
		gradient.id = `fill-gradient-${index}`;
		
		const stop1 = createSvgElement( 'stop',{	offset: `${fillPercent}%`,	'stop-color': (fillPercent > 90 ? '#4CAF5033' : fillPercent > 70 ? '#ff980033' : '#ff572233') });
		const stop2 = createSvgElement( 'stop',{	offset: `${fillPercent}%`,	'stop-color': '#f5f5f5' });
		
		gradient.appendChild(stop1);
		gradient.appendChild(stop2);
		defs.appendChild(gradient);
		svg.appendChild(defs);
		
		// Текст с информацией
		const text = createSvgElement( 'text', {x: x + containerWidth / 2,y: y + containerHeight / 2 + 5,class: 'train-container-text'});
		text.textContent = `${index + 1}:${Math.round(fillPercent)}%`
		svg.appendChild(text);

	});
	
	// Обработчик кликов
	svg.querySelectorAll('.train-container-rect').forEach(rect => {
		rect.addEventListener('click', () => {
			const index = parseInt(rect.dataset.index);
			if (index !== oContainerIndex) {
				oContainerIndex = index;
				showContainer();
			}
		});
	});
	addTooltips();

}

function renderTrainOverview() {
    if (!currentTrain || currentTrain.containers.length === 0) return;
    
    const svg = document.getElementById('train-svg');
    svg.innerHTML = ''; // Очищаем предыдущее изображение
    
    const containerWidth = 50;
    const containerHeight = 15;
    const spacing = 2;
    const startX = 5;
    const startY = 5;
    
    // Группируем одинаковые ТС
    const containerGroups = [];
    let currentGroup = null;
    
    currentTrain.containers.forEach((container, index) => {
        const containerKey = `${container.L}x${container.T}x${container.H}_${container.rolls.length}`;
        
        if (!currentGroup || currentGroup.key !== containerKey) {
            currentGroup = {
                key: containerKey,
                count: 1,
                firstIndex: index,
                indexes: [index],
                container: container
            };
            containerGroups.push(currentGroup);
        } else {
            currentGroup.count++;
            currentGroup.indexes.push(index);
        }
    });

    // Рисуем только уникальные ТС (по одному из каждой группы)
    containerGroups.forEach(group => {
        const x = startX + (containerGroups.indexOf(group) * (containerWidth + spacing));
        const y = startY;
        
        // Индикатор текущего ТС (если текущий ТС входит в эту группу)
        const isActive = group.indexes.includes(oContainerIndex);
        
        if (isActive) {
            const indicator = createSvgElement('rect', {
                x: x - 5,
                y: y - 5,
                width: containerWidth + 10,
                height: containerHeight + 10,
                rx: 4,
                class: 'current-container-indicator'
            });
            svg.appendChild(indicator);
        }
        
        // ТС
        const rect = createSvgElement( 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', containerWidth);
        rect.setAttribute('height', containerHeight);
        rect.setAttribute('rx', 3);
        rect.setAttribute('class', 'train-container-rect');
        rect.dataset.index = group.firstIndex; // Связываем с первым ТС в группе
        
        // Градиент заливки по степени заполненности
        const fillPercent = Math.min(100, (group.container.totalW / group.container.maxW) * 100);
        rect.style.fill = `url(#fill-gradient-${group.firstIndex})`;
        
        svg.appendChild(rect);
        
        // Создаем градиент
        const defs = svg.querySelector('defs') || createSvgElement( 'defs');
        const gradient = createSvgElement( 'linearGradient');
        gradient.id = `fill-gradient-${group.firstIndex}`;
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '0%');
        
        const stop1 = createSvgElement( 'stop',{  offset: `${fillPercent}%`,  'stop-color': fillPercent > 90 ? '#4CAF5033' : fillPercent > 70 ? '#ff980033' : '#ff572233'});
        const stop2 = createSvgElement( 'stop',{  offset: `${fillPercent}%`,  'stop-color': '#f5f5f5'});
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        svg.appendChild(defs);
        
        // Текст с информацией
        const text = createSvgElement( 'text',{  x: x + containerWidth / 2, y: y + containerHeight / 2 + 5, 	class: 'train-container-text'});
        
        // Формируем текст подписи
        if (group.count === 1) {
            text.textContent = `${group.firstIndex + 1}`;
        } else if (group.count <= 3) {
            text.textContent = `${group.indexes.map(i => i + 1).join(', ')}`;
        } else {
            text.textContent = `${group.indexes[0] + 1}-${group.indexes[group.indexes.length - 1] + 1}`;
        }
        
        svg.appendChild(text);
    });
    
    // Обработчик кликов
    svg.querySelectorAll('.train-container-rect').forEach(rect => {
        rect.addEventListener('click', () => {
            const index = parseInt(rect.dataset.index);
            if (index !== oContainerIndex) {
                oContainerIndex = index;
                showContainer();
            }
        });
    });
    
    addTooltips();
}

function addTooltips() {//посказка
    if (1 || !currentTrain) return;
    
    const tooltip = document.createElement('div');
    tooltip.id = 'train-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.background = 'rgba(0,0,0,0.8)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '5px';
    tooltip.style.borderRadius = '3px';
    tooltip.style.zIndex = '1000';
    document.body.appendChild(tooltip);
    
    const svg = document.getElementById('train-svg');
    svg.querySelectorAll('.train-container-rect').forEach(rect => {
        rect.addEventListener('mouseenter', (e) => {
            const index = parseInt(rect.dataset.index);
            const container = currentTrain.containers[index];
            
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <div>ТС ${index + 1}</div>
                <div>Заполнен: ${Math.round((container.totalW / container.maxW)*100)}%</div>
                <div>Рулонов: ${container.rolls.length}</div>
                <div>ЦМ: X=${container.centerOfMass.x.toFixed(1)} Y=${container.centerOfMass.y.toFixed(1)}</div>
            `;
        });
        
        rect.addEventListener('mousemove', (e) => {
            tooltip.style.left = `${e.pageX + 10}px`;
            tooltip.style.top = `${e.pageY + 10}px`;
        });
        
        rect.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

function showLoadingProgress(message, duration = 2000) {    // Показывает индикатор загрузки с прогрессом
    // 1. Скрываем предыдущий индикатор, если он есть
    hideLoadingProgress();
    
    // 2. Создаем ТС прогресса
    progressContainer = document.createElement('div');
    progressContainer.id = 'loading-progress';
    progressContainer.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        color: white;
        font-family: Arial, sans-serif;
    `;
    
    // 3. Создаем элемент сообщения
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style = `
        font-size: 24px;
        margin-bottom: 20px;
        text-align: center;
        max-width: 80%;
    `;
    
    // 4. Создаем ТС для прогресс-бара
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style = `
        width: 300px;
        height: 20px;
        background: #333;
        border-radius: 10px;
        overflow: hidden;
    `;
    
    // 5. Создаем сам прогресс-бар
    const progressBar = document.createElement('div');
    progressBar.id = 'progress-bar';
    progressBar.style = `
        height: 100%;
        width: 0%;
        background: linear-gradient(to right, #4CAF50, #8BC34A);
        transition: width 0.5s ease;
    `;
    
    // 6. Собираем структуру
    progressBarContainer.appendChild(progressBar);
    progressContainer.appendChild(messageEl);
    progressContainer.appendChild(progressBarContainer);
    document.body.appendChild(progressContainer);
    
    // 7. Анимируем прогресс-бар
    let progress = 0;
    const interval = 50;
    const steps = duration / interval;
    const increment = 100 / steps;
    
    const animateProgress = () => {
        progress += increment;
        progressBar.style.width = `${Math.min(progress, 100)}%`;
        
        if (progress < 100) {
            progressTimeout = setTimeout(animateProgress, interval);
        }
    };
    
    animateProgress();
}

function hideLoadingProgress() {
    /**
     * Скрывает индикатор загрузки
     */
    if (progressContainer) {
        progressContainer.remove();
        progressContainer = null;
    }
    if (progressTimeout) {
        clearTimeout(progressTimeout);
        progressTimeout = null;
    }
}

function showMessage(text) {// успешных сообщений
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #4CAF50;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 3000;
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => msg.remove(), 3000);
}

function showFinalStats() {// статистика
    return;
	if (!currentTrain || currentTrain.containers.length === 0) return;
    
    // 1. Создаем ТС для статистики
    const statsContainer = document.createElement('div');
    statsContainer.id = 'final-stats';
    statsContainer.style = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 5px 30px rgba(0,0,0,0.3);
        z-index: 3000;
        width: 80%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        font-family: Arial, sans-serif;
    `;
    
    // 2. Рассчитываем общую статистику
    const totalRolls = currentTrain.containers.reduce((sum, c) => sum + c.rolls.length, 0);
    const totalWeight = currentTrain.containers.reduce((sum, c) => sum + c.totalW, 0);
    const totalCapacity = currentTrain.containers.reduce((sum, c) => sum + c.maxW, 0);
    const utilization = totalCapacity > 0 ? (totalWeight / totalCapacity * 100) : 0;
    
    // 3. Создаем HTML-структуру
    statsContainer.innerHTML = `
        <div style="text-align: center; margin-top: 20px;">
            <button id="close-stats">Закрыть</button>
        </div>
        <h2 style="text-align: center; margin-top: 0; color: #2c3e50;">Итоги загрузки</h2>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div style="flex: 1; text-align: center; padding: 10px; background: #f9f9f9; border-radius: 5px;">
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${currentTrain.containers.length}</div>
                <div>ТС</div>
            </div>
            
            <div style="flex: 1; text-align: center; padding: 10px; background: #f9f9f9; border-radius: 5px; margin: 0 10px;">
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${totalRolls}</div>
                <div>Рулонов</div>
            </div>
            
            <div style="flex: 1; text-align: center; padding: 10px; background: #f9f9f9; border-radius: 5px;">
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${Math.round(utilization)}%</div>
                <div>Использование</div>
            </div>
        </div>
        
        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Детали по ТС</h3>
        <div id="containers-stats" style="margin-bottom: 15px;"></div>
        
        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Эффективность загрузки</h3>
        <div id="efficiency-stats"></div>
        
    `;
    
    // 4. Заполняем детали по ТС
    const containersStats = statsContainer.querySelector('#containers-stats');
    currentTrain.containers.forEach((container, index) => {
        const containerUtilization = (container.totalW / container.maxW * 100);
        const cmOffsetX = Math.abs(container.centerOfMass.x - container.centerX);
        const cmOffsetY = Math.abs(container.centerOfMass.y - container.centerY);
        
        const containerEl = document.createElement('div');
        containerEl.style = `
            padding: 10px;
            margin-bottom: 8px;
            background: ${index === oContainerIndex ? '#e3f2fd' : '#f9f9f9'};
            border-radius: 5px;
            display: flex;
            justify-content: space-between;
        `;
        containerEl.innerHTML = `
            <div style="font-weight: bold;">ТС ${index + 1}</div>
            <div>${container.rolls.length} рулонов</div>
            <div>${Math.round(containerUtilization)}% заполнен</div>
            <div>ЦМ: ${cmOffsetX.toFixed(1)}/${cmOffsetY.toFixed(1)} см</div>
        `;
        // containerEl.addEventListener('click', () => {
            // oContainerIndex = index;
            // showCurrentContainer();
            // document.querySelector('#final-stats').remove();
        // });
        containersStats.appendChild(containerEl);
    });
    
    // 5. Добавляем диаграмму эффективности
    const efficiencyStats = statsContainer.querySelector('#efficiency-stats');
    efficiencyStats.innerHTML = `
        <div style="display: flex; align-items: flex-end; height: 150px; margin: 15px 0;">
            ${currentTrain.containers.map((c, i) => {
                const height = ((c.totalW / c.maxW * 100) + 10).toFixed(0) ;//console.log(height)
                const color = i === oContainerIndex ? '#3498db' : '#95a5a6';
                return `
                    <div style="
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        margin: 0 5px;
                    ">
                        <div style="
                            width: 30px;
                            height: ${height}px;
                            background: ${color};
                            border-radius: 3px 3px 0 0;
                        "></div>
                        <div style="margin-top: 5px; font-size: 12px;">${i + 1}</div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div style="display: flex; justify-content: space-around; margin-top: 10px;">
            <div><span style="display: inline-block; width: 12px; height: 12px; background: #3498db;"></span> Текущий</div>
            <div><span style="display: inline-block; width: 12px; height: 12px; background: #95a5a6;"></span> Другие</div>
        </div>
    `;
    
    // 6. Добавляем кнопку закрытия
    statsContainer.querySelector('#close-stats').addEventListener('click', () => {
        statsContainer.remove();
    });
    
    // 7. Добавляем на страницу
    document.body.appendChild(statsContainer);
	
   
    // 8. Анимация появления
    statsContainer.style.opacity = '0';
    statsContainer.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
        statsContainer.style.opacity = '1';
    }, 10);
	showBalanceWarnings();
	
}

function showBalanceWarnings() {// Показ предупреждений о дисбалансе
    if (!currentTrain) return;
    
    const warnings = [];
    
    currentTrain.containers.forEach((container, index) => {
        // Проверка смещения центра масс
        const dx = Math.abs(container.centerOfMass.x - container.centerX);
        const dy = Math.abs(container.centerOfMass.y - container.centerY);
        
        if (dx > container.maxCML) {
            warnings.push(`ТС ${index + 1}: смещение по длине ${dx.toFixed(1)} см (допуск ${container.maxCML} см)`);
        }
        
        if (dy > container.maxCMT) {
            warnings.push(`ТС ${index + 1}: смещение по ширине ${dy.toFixed(1)} см (допуск ${container.maxCMT} см)`);
        }
        
        // Проверка весового дисбаланса
        const frontBackDiff = Math.abs(container.frontW - container.backW);
        if (frontBackDiff > container.maxKGL) {
            warnings.push(`ТС ${index + 1}: дисбаланс по длине ${frontBackDiff.toFixed(1)} кг (допуск ${container.maxKGL} кг)`);
        }
        
        const leftRightDiff = Math.abs(container.leftW - container.rightW);
        if (leftRightDiff > container.maxKGT) {
            warnings.push(`ТС ${index + 1}: дисбаланс по ширине ${leftRightDiff.toFixed(1)} кг (допуск ${container.maxKGT} кг)`);
        }
    });
    
    if (warnings.length > 0) {
        const warningsContainer = document.createElement('div');
        warningsContainer.id = 'balance-warnings';
        warningsContainer.innerHTML = '<div class = "warnings">⚠️Требуется балансировка <ul>'+ warnings.map(w => '<li>'+w+'</li>')+'</ul></div>';
        document.body.appendChild(warningsContainer);
        // Автоскрытие через 10 секунд
        setTimeout(() => {
            if (warningsContainer.parentNode) {
                warningsContainer.parentNode.removeChild(warningsContainer);
            }
        }, 1500);
    }
}

function initSchemeHandlers() {// Инициализация обработчиков для кнопок загрузки/сохранения
    document.getElementById('download-scheme').addEventListener('click', downloadScheme);
    document.getElementById('save-scheme').addEventListener('click', saveSchemeToServer);
    document.getElementById('load-scheme').addEventListener('click', () => {
        document.getElementById('scheme-file').click();
    });
    document.getElementById('scheme-file').addEventListener('change', loadSchemeFromFile);
    
    // Для кнопки загрузки с сервера
    document.getElementById('load-from-server').addEventListener('click', async () => {
        try {
            const response = await fetch( url_service+'get_schemes.php');
            const schemes = await response.json();
            
            if (schemes.length > 0) {
                showSchemeListModal(schemes);
            } else {
                alert('Нет сохраненных схем на сервере');
            }
        } catch (error) {
            console.error('Ошибка загрузки списка схем:', error);
            alert('Ошибка соединения с сервером');
        }
    });
}

function showSchemeListModal(schemes) {// Показ модального окна со списком схем
    const modal = document.getElementById('scheme-modal');
    const list = document.getElementById('scheme-list');
    
    list.innerHTML = '';
    schemes.forEach(scheme => {
        const item = document.createElement('div');
        item.className = 'scheme-item';
        item.innerHTML = `
            <div>
                <strong>${scheme.name}</strong>
                <small>${new Date(scheme.date).toLocaleString()}</small>
                <button class="load-btn" data-id="${scheme.id}">Загрузить</button>
                <button class="delete-btn" data-id="${scheme.id}">Удалить</button>
            </div>
            <div>ТС: ${scheme.containerCount || 1}, Вес: ${scheme.totalWeight || 0} кг</div>
        `;
        list.appendChild(item);
    });
    
    // Обработчики для кнопок
    list.querySelectorAll('.load-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const schemeId = btn.getAttribute('data-id');
            try {
                const response = await fetch( url_service+`get_scheme.php?id=${schemeId}`);
                const scheme = await response.json();
                loadScheme(scheme);
                modal.style.display = 'none';
            } catch (error) {
                console.error('Ошибка загрузки схемы:', error);
                alert('Ошибка загрузки схемы');
            }
        });
    });
    
    list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Удалить эту схему?')) {
                const schemeId = btn.getAttribute('data-id');
                try {
                    const response = await fetch( url_service+`delete_scheme.php?id=${schemeId}`);
                    const result = await response.json();
                    if (result.success) {
                        btn.closest('.scheme-item').remove();
                    } else {
                        alert('Ошибка удаления: ' + result.message);
                    }
                } catch (error) {
                    console.error('Ошибка удаления схемы:', error);
                    alert('Ошибка удаления схемы');
                }
            }
        });
    });
    
    // Кнопка закрытия
    document.getElementById('close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    modal.style.display = 'block';
}

function generateView() {// генерации видов
	
	if( currentViewMode === '2D')	
		generateView2D();
	else if( currentViewMode === '3D')
		generateView3D();
	else 	
		generateTrainView();
}

function generateView1D() {// Пересоздание плоского вида
	currentViewMode = '1D';
	updateViewMode();
	generateTrainView();
	updateUI();
}

function generateView2D() {// Пересоздание плоского вида
	currentViewMode = '2D';
	updateViewMode();
	renderViews2D();
	updateUI();
}

function generateView3D() {// Пересоздание обьемного вида
	if (!oContainer) return;
	currentViewMode = '3D';
	updateViewMode();
	if (scene)	while(scene.children.length > 0) {	// Корректная очистка сцены
		const obj = scene.children[0];
		if (obj.geometry) obj.geometry.dispose();
		if (obj.material) obj.material.dispose();
		scene.remove(obj);
	}
	else  initScene3D();
	setupScene3D();
	init3DDragControls(); // Добавляем контролы заново
	adjustCamera();
	animate();			// Принудительный ререндер
	updateUI();
}

function toggleViewMode() { // переключения режимов
    currentViewMode = currentViewMode === '1D' ? '2D' : '2D';
	updateViewMode();
}

function updateViewMode() { // обновления вида
    document.getElementById('panel2D'			).style.display		= currentViewMode==='1D' || currentViewMode==='3D'	? 'none'	: 'block';	
    document.getElementById('train-list-view'	).style.display		= currentViewMode==='1D'							? 'block'	: 'none';	
	if (currentViewMode==='1D') {
		const curContainer = document.querySelector('.cur-active');
		if (curContainer) { 
			curContainer.classList.add('active');
			curContainer.classList.remove('cur-active');
			console.log(curContainer.classList)
		}	
		document.querySelector('#topView').classList.remove('active');console.log(document.querySelector('#topView').classList)
	} else {
		const curContainer = document.querySelector('#train-list-view .active')
		if (curContainer ){
			curContainer.classList.add('cur-active');
			curContainer.classList.remove('active');
			console.log(curContainer.classList)
		}	
		document.querySelector('#topView').classList.add('active');
	}		
}

function createTrainListView() {// Создаем список ТС если его нет
    const listView = document.createElement('div');
    listView.id = 'train-list-view';
    
    // Позиционируем список рядом с основными элементами управления
    const trainControls = document.getElementById('train-controls');
    trainControls.parentNode.insertBefore(listView, trainControls.nextSibling);
    
    renderTrainList();
}

function renderTrainList() {// Рендерим список ТС
    const listView = document.getElementById('train-list-view');
    if (!listView) return;
 
    // Добавляем обработчики клика
    document.querySelectorAll('.train-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            showContainer(index);
            currentViewMode = '2D';
            updateViewMode();
        });
    });
    
    // Показываем неразмещенные рулоны если есть
    if (currentTrain.unplacedRolls.length > 0) {
        const unplacedDiv = document.createElement('div');
        unplacedDiv.className = 'unplaced-rolls';
        unplacedDiv.innerHTML = `
            <h4>Неразмещенные рулоны (${currentTrain.unplacedRolls.length}):</h4>
            <ul>
                ${currentTrain.unplacedRolls.map(roll => `
                    <li>${roll.id}: ${roll.H}×${roll.D} (${roll.W}кг)</li>
                `).join('')}
            </ul>
            <button id="create-new-container">+ Добавить ТС</button>
        `;
        listView.appendChild(unplacedDiv);
        
        document.getElementById('create-new-container').addEventListener('click', addСontainerСlick);
    }
}

function drawTopViewForList(svg, container) {//упрощен. вер.
    // ТС
    const rect = createSvgElement('rect', {
        x: offset2D,
        y: offset2D,
        width: container.L,
        height: container.T,
        class: 'container-rect'
    });
    svg.appendChild(rect);
    
    // Рулоны
    container.rolls.forEach(roll => {
        const circle = createSvgElement('circle', {
            cx: roll.x + offset2D,
            cy: roll.y + offset2D,
            r: roll.D / 2,
            class: 'roll-circle',
            'style': `fill:${styleColorFillRoll(roll)}`,
            'data-roll-id': roll.id,
            'data-container-index': container.trainIndex
        });
        svg.appendChild(circle);
    });
}

function initDragBetweenContainers() { // между ТС
    let draggedRoll = null;
    let sourceContainerIndex = null;
    
    // Опции для событий touch
    const passiveOptions = { passive: false, capture: true };
    
    document.querySelectorAll('.roll-circle').forEach(circle => {
        circle.addEventListener('mousedown', startDragBetween);
        circle.addEventListener('touchstart', startDragBetween, passiveOptions);
    });
    
    document.querySelectorAll('.train-container-view').forEach(container => {
        container.addEventListener('mousemove', dragBetween);
        container.addEventListener('touchmove', dragBetween, passiveOptions);
        container.addEventListener('mouseup', endDragBetween);
        container.addEventListener('touchend', endDragBetween, passiveOptions);
        container.addEventListener('touchcancel', endDragBetween, passiveOptions);
		container.addEventListener('dblclick', handleRollDoubleClick);
    });
    
    function startDragBetween(e) {
        // Предотвращаем стандартное поведение только для touch-событий
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
        
        const circle = e.target;
        sourceContainerIndex = parseInt(circle.closest('svg').dataset.containerIndex);
        const rollId = parseInt(circle.dataset.rollId);
        
        draggedRoll = currentTrain.containers[sourceContainerIndex].rolls
            .find(r => r.id === rollId);
        
        if (draggedRoll) {
            circle.classList.add('dragging');
        }
    }
    
    function dragBetween(e) {
        if (!draggedRoll) return;
        e.preventDefault();
        
        // Можно добавить визуальное выделение при перетаскивании
    }
    
    function endDragBetween(e) {
        if (!draggedRoll) return;
        e.preventDefault();
        
        const targetContainer = e.target.closest('.train-container-view');
        if (!targetContainer) return;
        
        const targetIndex = parseInt(targetContainer.querySelector('svg').dataset.containerIndex);
        
        if (sourceContainerIndex !== targetIndex) {
            // Пытаемся перенести рулон
            const targetContainer = currentTrain.containers[targetIndex];
            if (targetContainer.canFitRoll(draggedRoll)) {
                currentTrain.containers[sourceContainerIndex].removeRoll(draggedRoll);
                targetContainer.addRoll(draggedRoll);
                
                // Обновляем представление
                renderTrainListView();
                updateUI();
            }
        }
        
        // Сбрасываем состояние
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        draggedRoll = null;
        sourceContainerIndex = null;
    }
}

function updateUI() {// отрисовка интерфейса
    // Обновляем информацию о текущем ТС
    document.getElementById('current-container-info').textContent = `ТС ${oContainerIndex + 1}/${currentTrain.containers.length}`;
	
	document.getElementById('container-L').textContent = oContainer.L;
	document.getElementById('container-T').textContent = oContainer.T;
	document.getElementById('container-H').textContent = oContainer.H;
	element = document.getElementById('container-W')
	const containerFullW = (100 * oContainer.totalW / oContainer.maxW)
	element.textContent = oContainer.totalW + '/' + oContainer.maxW + ' кг ' +containerFullW.toFixed() +'%';
	if (containerFullW <= 90) {
		element.classList.add('warning');
	} else if (containerFullW <= 100) {
		element.classList.add('normal');
	} else {
		element.classList.add('critical');
	}
	// Container center
	document.getElementById('container-center-x').textContent = (oContainer.centerX).toFixed(1);
	document.getElementById('container-center-y').textContent = (oContainer.centerY).toFixed(1);
	document.getElementById('container-center-z').textContent = (oContainer.centerZ).toFixed(1);
	// Center of mass
	//console.log(oContainer.centerOfMass)
	document.getElementById('mass-center-x').textContent = (oContainer.centerOfMass.x).toFixed(1);
	document.getElementById('mass-center-y').textContent = (oContainer.centerOfMass.y).toFixed(1);
	document.getElementById('mass-center-z').textContent = (oContainer.centerOfMass.z).toFixed(1);
	// Deviations
	const deviationX = (oContainer.centerOfMass.x - oContainer.centerX).toFixed(1);
	const deviationY = (oContainer.centerOfMass.y - oContainer.centerY).toFixed(1);
	updateDeviationDisplay('deviation-x1', deviationX, oContainer.maxCML);
	updateDeviationDisplay('deviation-y1', deviationY, oContainer.maxCMT);
	updateDeviationDisplay('deviation-xW', (oContainer.backW  - oContainer.frontW).toFixed(1), oContainer.maxKGL);
	updateDeviationDisplay('deviation-yW', (oContainer.rightW - oContainer.leftW).toFixed(1), oContainer.maxKGT );
	document.getElementById('placed-count').textContent = oContainer.totalLoaded;
	document.getElementById('unplaced-count').textContent = oContainer.unplacedRolls.length;
	// Placement errors
	const errorList = document.getElementById('error-list');
	errorList.innerHTML = '';
	if (oContainer.unplacedRolls.length === 0) {
		errorList.innerHTML = '<div>Всё размещено!</div>';
	} else {
		errorList.innerHTML = '<div class="error">Не размещено:</div>';
		oContainer.unplacedRolls.forEach( roll => {
			const errorItem = document.createElement('div');
			errorItem.className = 'error-item';
			errorItem.innerHTML = '<strong>'+roll.id+'</strong>: <small>'+roll.H+', '+roll.D+', '+roll.W+'</small> '+roll.placementError;
			errorList.appendChild(errorItem);
		});
	}
	// Расстояние до дверей
	const doorDistance = oContainer.calculateDoorDistance();
	document.getElementById('door-distance').textContent = doorDistance === Infinity ? "Нет рулонов" : doorDistance.toFixed(1);
	document.getElementById('minDimX').value = oContainer.DimX.toFixed(2);

	// Общая информация по цепочке
	document.getElementById('train-info').innerHTML = `
		ТС: ${currentTrain.containers.length}<br>
		Общий вес: ${currentTrain.totalWeight()} кг<br>
		Не размещено: ${currentTrain.unplacedRolls.length} рулонов
		`;
}

function dravPrintScheme() {// подготовки для печати схемы
	// Создаем ТС для печати
    const printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    
    // Копируем нужные элементы
    const title = document.createElement('h2');
    title.textContent = `Схема загрузки (${new Date().toLocaleString()})`;
    printContainer.appendChild(title);

	// Добавляем информацию о схеме
    const infoDiv = document.createElement('div');
    infoDiv.style.margin = '50px 0';
    infoDiv.innerHTML = `
        <h3>Параметры загрузки:</h3>
        <p>ТС: ${oContainer.L} см (длина) × ${oContainer.T} см (ширина) × ${oContainer.H} см (высота)</p>
        <p>Общий вес: ${oContainer.totalW} кг (макс. ${oContainer.maxW} кг)</p>
        <p>Центр масс: X=${oContainer.centerOfMass.x.toFixed(1)} см, Y=${oContainer.centerOfMass.y.toFixed(1)} см</p>
        <p>Отклонение: ${Math.abs(oContainer.centerOfMass.x - oContainer.centerX).toFixed(1)} см (допуск ${oContainer.maxCML} см)</p>
    `;
    printContainer.appendChild(infoDiv);
    
	const table = document.createElement('table');
	table.style.width = '100%';
	table.style.borderCollapse = 'collapse';
	table.style.margin = '20px 0';
	table.innerHTML = `
		<thead>
			<tr>
				<th>№</th>
				<th>Диаметр</th>
				<th>Высота</th>
				<th>Вес</th>
				<th>Позиция (X,Y)</th>
				<th>Слой</th>
			</tr>
		</thead>
		<tbody>
			${oContainer.rolls.map(roll => `
				<tr>
					<td>${roll.id}</td>
					<td>${roll.D} см</td>
					<td>${roll.H} см</td>
					<td>${roll.W} кг</td>
					<td>${roll.x.toFixed(1)}, ${roll.y.toFixed(1)}</td>
					<td>${roll.s}</td>
				</tr>
			`).join('')}
		</tbody>
		<tfoot>
			<tr>
				<td colspan="3" style="text-align:right;">Всего:</td>
				<td>${oContainer.totalW} кг</td>
				<td colspan="2">${oContainer.rolls.length} рулонов</td>
			</tr>
		</tfoot>
	`;
	printContainer.appendChild(table);	
	return printContainer;
}

function showError(message) {// Показ ошибок
    const errorEl = document.createElement('div');
    errorEl.id = 'error-message';
    errorEl.textContent = message;
    errorEl.style = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff5722;
        color: white;
        padding: 15px 30px;
        border-radius: 5px;
        z-index: 3000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: fadeIn 0.3s, fadeOut 0.3s 2.7s;
    `;
    
    document.body.appendChild(errorEl);
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        if (errorEl.parentNode) {
            errorEl.parentNode.removeChild(errorEl);
        }
    }, 3000);
}

async function init() {// Начальная инициализация

	await initTsSelector();
	// Обработчики	
	document.getElementById('print-1d').addEventListener('click', generateView1D);
	document.getElementById('print-2d').addEventListener('click', generateView2D);
	document.getElementById('print-3d').addEventListener('click', generateView3D);
	document.getElementById('generate-rolls').addEventListener('click',  loadRolls);
	document.getElementById('more-optimize').addEventListener('click', moreOptimizeBalance);
	document.getElementById('random-rolls').addEventListener('click', generateRandomRollSets);
	document.querySelectorAll('#container-settings input').forEach(input => {
		input.addEventListener('change', saveCustomTsParams);
	});
	window.addEventListener('resize', onWindowResize);
	document.getElementById('update-container').addEventListener('click', loadRolls);
	slider.addEventListener('input', sliderInput);

	// для клавиши Shift
	document.addEventListener('keydown'	, function(e) {if (e.key === 'Shift') isShiftPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.key === 'Shift') isShiftPressed = false;});
	// для клавиши Ctrl
	document.addEventListener('keydown'	, function(e) {if (e.ctrlKey) isCtrlPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.ctrlKey) isCtrlPressed = false;});
	// для клавиши Alt
	document.addEventListener('keydown'	, function(e) {if (e.altKey) isAltPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.altKey) isAltPressed = false;});
	// Добавляем обработчик двойного клика
	document.addEventListener('dblclick', handleRollDoubleClick);	
	// Сохранение/загрузка схемы
	document.getElementById('save-scheme').addEventListener('click', saveSchemeToFile);
	document.getElementById('download-scheme').addEventListener('click', downloadScheme);
	document.getElementById('scheme-file').addEventListener('change', loadSchemeFromFile);
	document.getElementById('load-from-server').addEventListener('click', showServerSchemes);
	document.getElementById('close-modal').addEventListener('click', closeModal);
	document.getElementById('print-scheme').addEventListener('click', printScheme);
	document.getElementById('print-Train').addEventListener('click', printTrain); 
	//document.getElementById('toggle-view').addEventListener('click', toggleViewMode);
	document.getElementById('load-scheme').addEventListener('click', function() {
		document.getElementById('scheme-file').click();
	});
	document.getElementById('more-optimize').addEventListener('click', () => {
		showLoadingProgress("Оптимизация размещения...", 100);
		setTimeout(() => {
			moreOptimizeBalance();
			hideLoadingProgress();
			generateView();
		}, 100);
	});
	// При сохранении схемы
	document.getElementById('save-scheme').addEventListener('click', () => {
		showLoadingProgress("Сохранение схемы...", 150);
		
		setTimeout(() => {
			saveSchemeToFile();
			hideLoadingProgress();
			showMessage("Схема успешно сохранена!");
		}, 160);
	});	
	
	// Наборы рулонов
	initRollSettings();
	initContainerNavigation();

}

init(); // Запуск приложения