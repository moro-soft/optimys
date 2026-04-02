// Представление проекта MVC

class WA { // Web Application
    constructor() {
        // Константы
        this.mm = 0.01;  // минимальный зазор между рулонами
        this.offset2D = 20;
        
        // DOM элементы
        this.sliderValue = document.getElementById('slider-value');
        this.FreeStyle = document.getElementById('FreeStyle');
        this.prevBtn = document.getElementById('prev-container');
        this.nextBtn = document.getElementById('next-container');
        this.infoSpan = document.getElementById('current-container-info');
        
        // Коллекции и хранилища
        this.originalRollPositions = new Map(); // Храним оригинальные позиции
        this.rollSets = [];
        this.validTargets = [];
        this.tsParams = {};
        
        // Состояние приложения
		this.currentTrain = null;
        this.oContainerIndex = 0; // Индекс текущего ТСа
        this.oContainer = null;   // Ссылка на текущий ТС
        this.oRolls = null; // набор рулонов для отгрузки в состав ТС
        this.topSvg = 0;
        this.draggedRoll = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.originalPosition = {x: 0, y: 0, z: 0};
        this.snapAnimationFrame = null;
        this.isShiftPressed = false;
        this.isCtrlPressed = false;
        this.isAltPressed = false;
        this.progressTimeout = null;
        this.progressContainer = null;
        this.currentViewMode = '1D'; // для хранения текущего режима '2D' или '3D' или '1D'
        
        // Three.js объекты
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.dragControls = null;
        this.controls = null;
        
        // URL сервиса
        this.url_service = './';
    }

async init() {// Начальная инициализация
	
	await this.initTsSelector();
	// Обработчики	
	document.getElementById('print-1d').addEventListener('click', wa.generateView1D);
	document.getElementById('print-2d').addEventListener('click', wa.generateView2D);
	document.getElementById('print-3d').addEventListener('click', wa.generateView3D);
	document.getElementById('generate-rolls').addEventListener('click',  wa.loadRollsCom);
	document.getElementById('more-optimize').addEventListener('click', wa.moreOptimizeBalanceCom);
	document.getElementById('random-rolls').addEventListener('click', generateRandomRollSets);
	document.querySelectorAll('#container-settings input').forEach(input => {
		input.addEventListener('change', saveCustomTsParams);
	});
	window.addEventListener('resize', onWindowResize);
	document.getElementById('update-container').addEventListener('click', wa.loadRolls);
	document.getElementById('rolls-slider').addEventListener('input', sliderInput);

	// для клавиши Shift
	document.addEventListener('keydown'	, function(e) {if (e.key === 'Shift') this.isShiftPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.key === 'Shift') this.isShiftPressed = false;});
	// для клавиши Ctrl
	document.addEventListener('keydown'	, function(e) {if (e.ctrlKey) this.isCtrlPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.ctrlKey) this.isCtrlPressed = false;});
	// для клавиши Alt
	document.addEventListener('keydown'	, function(e) {if (e.altKey) this.isAltPressed = true;});
	document.addEventListener('keyup'	, function(e) {if (e.altKey) this.isAltPressed = false;});
	// Добавляем обработчик двойного клика
	document.addEventListener('dblclick', handleRollDoubleClick);	
	// Сохранение/загрузка схемы
	document.getElementById('save-scheme').addEventListener('click', saveSchemeToFile);
	document.getElementById('download-scheme').addEventListener('click', downloadScheme);
	document.getElementById('scheme-file').addEventListener('change', loadSchemeFromFile);
	document.getElementById('load-from-server').addEventListener('click', this.showServerSchemes);
	document.getElementById('close-modal').addEventListener('click', function() {document.getElementById('scheme-modal').style.display = 'none';});
	document.getElementById('print-scheme').addEventListener('click', printScheme);
	document.getElementById('print-Train').addEventListener('click', printTrain); 
	//document.getElementById('toggle-view').addEventListener('click', wa.toggleViewMode);
	document.getElementById('load-scheme').addEventListener('click', function() {document.getElementById('scheme-file').click();});
	document.getElementById('more-optimize').addEventListener('click', () => {
		wa.showLoadingProgress("Оптимизация размещения...", 100);
		setTimeout(() => {
			moreOptimizeBalance();
			wa.hideLoadingProgress();
			wa.generateView();
		}, 100);
	});
	// При сохранении схемы
	document.getElementById('save-scheme').addEventListener('click', () => {
		wa.showLoadingProgress("Сохранение схемы...", 150);
		
		setTimeout(() => {
			saveSchemeToFile();
			wa.hideLoadingProgress();
			wa.showMessage("Схема успешно сохранена!");
		}, 160);
	});	
	
	// Наборы рулонов
	initRollSettings();
	this.initContainerNavigation();

}
  
    // Методы для доступа к часто используемым свойствам
    get currentContainer() {
        return this.oContainer;
    }
    
    set currentContainer(container) {
        this.oContainer = container;
    }
    
    get currentRolls() {
        return this.oRolls;
    }
    
    set currentRolls(rolls) {
        this.oRolls = rolls;
    }
    
    // Методы для управления состоянием
    resetState() {
        this.originalRollPositions.clear();
        this.rollSets = [];
        this.validTargets = [];
        this.oContainerIndex = 0;
        this.oContainer = null;
        this.oRolls = null;
        this.topSvg = 0;
        this.draggedRoll = null;
    }
    
    // Методы для работы с DOM (если нужны)
    updateSliderValue(value) {
        if (this.sliderValue) {
            this.sliderValue.textContent = value;
        }
    }

moreOptimizeBalanceCom() {
	moreOptimizeBalance()
}
loadRollsCom() {
	loadRolls();
}

// Отрисовка 3D Схема
initScene3D() {
	// параметры сцены
	this.scene = new THREE.Scene();
	this.scene.background = new THREE.Color(0xf5f5f5);
	this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
	this.camera.position.set(400, 300, 500);
	this.renderer = new THREE.WebGLRenderer({ antialias: true });
	this.renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(this.renderer.domElement);
	this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
	this.controls.enableDamping = true;
	this.controls.dampingFactor = 0.05;
}

// Отрисовка 3D Схема
setupScene3D() {
	// Освещение и оси должны быть пересозданы
	const ambientLight = new THREE.AmbientLight(0x404040);
	this.scene.add(ambientLight);
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(1, 1, 1);
	this.scene.add(directionalLight);
	const axesHelper = new THREE.AxesHelper(100);
	axesHelper.position.set(0, 0, 0);
	this.scene.add(axesHelper);
	// ТС
	const containerGeometry = new THREE.BoxGeometry(
		this.oContainer.L,
		this.oContainer.H,
		this.oContainer.T
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
		this.oContainer.centerX,
		this.oContainer.centerZ,
		this.oContainer.centerY
	);
	this.scene.add(containerMesh);
	// Разделительная линия между половинками дверей
	const doorGroup = new THREE.Group();
	const dividerGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(this.oContainer.L, 0			, this.oContainer.centerY),
		new THREE.Vector3(this.oContainer.L, this.oContainer.H, this.oContainer.centerY)
	]);
	const dividerMaterial = new THREE.LineBasicMaterial({ color: 0x009900 });
	const divider = new THREE.Line(dividerGeometry, dividerMaterial);
	doorGroup.add(divider);
	this.scene.add(doorGroup);
	// Дисбаланс масс
	const edges = new THREE.EdgesGeometry(containerGeometry);
	const line = new THREE.LineSegments(
		edges,
		new THREE.LineBasicMaterial({ color: 0x009900, linewidth: 1 })
	);
	line.position.copy(containerMesh.position);
	this.scene.add(line);
    // Рулоны размещенные
	this.oContainer.rolls.forEach(roll => {
        // const cylinder0 = new THREE.Mesh(geometry, material);
        // cylinder0.position.set(roll.x, roll.z, roll.y);
        // this.scene.add(cylinder0);
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
		this.scene.add(cylinder);
		// Сохраняем ссылку на 3D объект
		roll.mesh3D = cylinder;
		// Создаем метку для 3D
		const labelText = `${roll.id}: ${roll.H}`;
		const label = this.createRollLabel3D(labelText);
		label.position.set(
			roll.x,
			roll.z + roll.H / 2 + 5,
			roll.y
		);
		// Инициализируем масштаб
		this.updateLabelScale(label);
		this.scene.add(label);
		// Сохраняем ссылку на метку
		roll.label3D = label;
    });
	// Container center 
	const centerGeometry = new THREE.SphereGeometry(6, 16, 16);
	const centerMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
	const centerMarker = new THREE.Mesh(centerGeometry, centerMaterial);
	centerMarker.position.set(
		this.oContainer.centerX,
		this.oContainer.centerZ,
		this.oContainer.centerY
	);
	this.scene.add(centerMarker);
	// Center of mass (red)
	const cmGeometry = new THREE.SphereGeometry(9, 16, 16);
	const cmMaterial = new THREE.MeshBasicMaterial({ color: 0xff3311 });
	const cmMarker = new THREE.Mesh(cmGeometry, cmMaterial);
	cmMarker.position.set(
		this.oContainer.centerOfMass.x,
		this.oContainer.centerOfMass.z,
		this.oContainer.centerOfMass.y
	);
	this.scene.add(cmMarker);
	// Line between centers
	const lineGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(
			this.oContainer.centerX,
			this.oContainer.centerZ,
			this.oContainer.centerY
		),
		new THREE.Vector3(
			this.oContainer.centerOfMass.x,
			this.oContainer.centerOfMass.z,
			this.oContainer.centerOfMass.y
		)
	]);
	const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00FF00, linewidth: 1 });
	const centerLine = new THREE.Line(lineGeometry, lineMaterial);
	this.scene.add(centerLine);
	// линию отступа двери
	const doorLineGeometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(this.oContainer.L - this.oContainer.minCMDoor, 0, 0),
		new THREE.Vector3(this.oContainer.L - this.oContainer.minCMDoor, 0, this.oContainer.T)
	]);
	const doorLineMaterial = new THREE.LineBasicMaterial({
		color: 0xFF0000,
		linewidth: 3
	});
	const doorLine = new THREE.Line(doorLineGeometry, doorLineMaterial);
	this.scene.add(doorLine);
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
	this.scene.add(floorLine);
	// После создания всех объектов
	initDragControls();
}

createRollLabel3D(text) { // Подписи рулона
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

updateLabelScale(label) {
    if (!label.userData.baseScale) return;
    // Рассчитываем расстояние от метки до камеры
    const distance = label.position.distanceTo(this.camera.position);
    // Масштабируем в зависимости от расстояния (можно настроить коэффициент)
    const scaleFactor = distance * 0.01;
    label.scale.copy(label.userData.baseScale).multiplyScalar(scaleFactor);
}

findClosestPosition3D(x, y, roll) {
	
    let closestPos = null;
    let minDist = Infinity;
    let targetZ = 0;
    let targetS = 1;
    // Ищем среди всех позиций
    for (const pos of this.oContainer.Positions) {
        if (pos.D !== roll.D) continue;
        const dx = pos.x - x;
        const dy = pos.y - y;
        const dist = dx*dx + dy*dy;
        if (dist < minDist && dist < (roll.D * roll.D)) {
            // Рассчитываем высоту стопки в этой позиции
            let currentZ = 0;
            let layers = 0;
            for (const r of this.oContainer.rolls) {
                if (Math.abs(r.x - pos.x) < this.mm && 
                    Math.abs(r.y - pos.y) < this.mm) {
                    currentZ += r.H;
                    layers = Math.max(layers, r.s);
                }
            }
            // Если позиция свободна или можно добавить новый слой
            if (currentZ + roll.H < this.oContainer.H) {
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

animateSnap3D(roll, targetPos, callback) {
    const roll3D = this.findRoll3DObject(roll.id);
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
            this.updateLabelScale(roll.label3D, this.camera);
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
renderViews2D() {
    const viewsContainer = document.getElementById('views-container');
    viewsContainer.innerHTML = "";// очистим схем 2D
    
    // Отрисовываем только текущий контейнер
    const container = this.currentTrain.containers[this.oContainerIndex];
    

	// Вид сверху
	const topView = document.createElement('div');
	topView.className = 'print-container active';
	topView.id = 'topView';
	this.topSvg = this.createSvgElement('svg', {
		width	: this.oContainer.L+ this.offset2D*2,
		height	: this.oContainer.T+ this.offset2D*2,
		viewBox	: '0 0 '+(this.oContainer.L+ this.offset2D*2)+' '+(this.oContainer.T+ this.offset2D*2)
	});
    this.drawTopView(this.topSvg, container);
    topView.appendChild(this.topSvg);
    viewsContainer.appendChild(topView);

	// Вид спереди
	const FrontView = document.createElement('div');
	FrontView.className = 'print-container';
	FrontView.id = 'FrontView';
	const FrontSvg = this.createSvgElement('svg', {
		width: this.oContainer.L+ this.offset2D*2,
		height: this.oContainer.H+ this.offset2D*2,
		viewBox: '0 0 '+(this.oContainer.L+ this.offset2D*2)+' '+(this.oContainer.H+ this.offset2D*2)
	});
	FrontSvg.id = 'FrontSvg';
	this.drawFrontView(FrontSvg);
	FrontView.appendChild(FrontSvg);
	viewsContainer.appendChild(FrontView);
	// Виды с торцов
	const sideViews = document.createElement('div');
	sideViews.className = 'print-container';
	sideViews.id = 'sideViews';
	// Вид с торца (двери)
	const doorSvg = this.createSvgElement('svg', {
		width: this.oContainer.T +  this.offset2D*2,
		height: this.oContainer.H +  this.offset2D*2,
		viewBox: '0 0 '+(this.oContainer.T +  this.offset2D*2)+' '+(this.oContainer.H +  this.offset2D*2)
	});
	this.drawDoorView(doorSvg);
	sideViews.appendChild(doorSvg);
	// Вид с противоположного торца
	const rearSvg = this.createSvgElement('svg', {
		width: this.oContainer.T +  this.offset2D*2,
		height: this.oContainer.H +  this.offset2D*2,
		viewBox: '0 0 '+(this.oContainer.T +  this.offset2D*2)+' '+(this.oContainer.H +  this.offset2D*2)
	});
	this.drawRearView(rearSvg);
	sideViews.appendChild(rearSvg);
	viewsContainer.appendChild(sideViews);
}
// для создания SVG-элемента
createSvgElement(tag, attrs) {
	const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
	if (attrs) for (const [key, value] of Object.entries(attrs)) {
		elem.setAttribute(key, value);
	}
	return elem;
}
// Текст
drawTextSVG(svg, txt ,x, y, id=0) {
	const textElem = this.createSvgElement('text', {	x: x, y: y, class: 'dim-text','text-anchor': 'middle', 'data-roll-id': id});
	textElem.textContent = txt;
	svg.appendChild(textElem);
}
// Линия отступа двери
LineDoor(svg,Y){
    const doorOffset = ( this.oContainer.gateTypeCenter ?  Y : this.oContainer.L ) - this.oContainer.minCMDoor;
    const doorLine = this.createSvgElement('line', {
        x1:  this.offset2D + (this.oContainer.gateTypeCenter ? this.oContainer.L/2 - 80	: doorOffset),
        y1:  this.offset2D + (this.oContainer.gateTypeCenter ? doorOffset			: 0 ),
        x2:  this.offset2D + (this.oContainer.gateTypeCenter ? this.oContainer.L/2 + 80	: doorOffset),
        y2:  this.offset2D + (this.oContainer.gateTypeCenter ? doorOffset			: Y ),
        stroke: '#FF0000',
        'stroke-width': 1,
        'stroke-dasharray': '5,7'
    });
    svg.appendChild(doorLine);
    // Подпись отступа
    this.drawTextSVG(svg, `${this.oContainer.minCMDoor}`,  this.offset2D + (this.oContainer.gateTypeCenter ? this.oContainer.L/2 : doorOffset),  this.offset2D + (this.oContainer.gateTypeCenter ? Y :  this.offset2D) );
}
// для отрисовки текстовой метки
drawRollLabel(svg, roll) {
    const _text = this.createSvgElement('text', {
        x:  this.offset2D + roll.x,
        y:  this.offset2D + roll.y - (roll.s-2)*20 - 10,
        'text-anchor': 'middle',
        'data-roll-id': roll.id,
		'style' : "Color:rgba(204,153,51)",
        class: 'roll-label'
    });
    _text.textContent = `${roll.id}.${roll.H}`;
    svg.appendChild(_text);
}
// для отрисовки рулона 2D
drawRoll(svg, roll) {
	const circle = this.createSvgElement('circle', {
		cx: roll.x +  this.offset2D,
		cy: roll.y +  this.offset2D,
		r:	roll.D / 2,
		class: 'roll-circle',
		'style' : "fill:"+this.styleColorFillRoll(roll),
		'data-roll-id': roll.id
	});
	// Добавляем обработчики событий для перетаскивания
	circle.addEventListener('mousedown', startDrag);
	circle.addEventListener('touchstart', startDrag, {passive: false});
	svg.appendChild(circle);
	this.drawRollLabel(svg, roll); // Добавляем метку
}
// для отрисовки позиции 2D
drawPos(svg, pos) {
	const circle = this.createSvgElement('circle', {
		cx: pos.x +  this.offset2D,
		cy: pos.y +  this.offset2D,
		r:	pos.D / 2,
		class: 'roll-pos',
		'data-roll-id': pos.id
	});
	// Добавляем обработчики событий для перетаскивания
	svg.appendChild(circle);
	//this.drawRollLabel(svg, pos); // Добавляем метку
}
// Отрисовка вида сверху
drawTopView(svg, oContainer,index = "1") {
    this.drawTextSVG(svg, `Вид сверху ТС ${index} ${oContainer.rolls.length}/${oContainer.totalW} кг`, oContainer.L/2,  this.offset2D/2 );
    const container = this.createSvgElement('rect', {
        x:  this.offset2D,
        y:  this.offset2D,
        width: oContainer.L,
        height: oContainer.T,
        class: 'container-rect'
    });
    svg.appendChild(container);
	this.LineDoor(svg,oContainer.T);
    // позиции тест
    oContainer.unplacedPositions.forEach(p => this.drawPos(svg, p));
    // Рулоны
    oContainer.rolls.sort((a, b) => a.s - b.s).forEach(roll => this.drawRoll(svg, roll));
	// Оси и подписи
	//this.drawAxis(svg,  this.offset2D,  this.offset2D, oContainer.L, oContainer.T, 'X(Длина)', 'Y(Ширина)');
	// Центр ТС (зеленая точка)
	const centerCircle = this.createSvgElement('circle', {
		cx:  this.offset2D + oContainer.centerX,
		cy:  this.offset2D + oContainer.centerY,
		r: 4,
		fill: '#00FF00',
		stroke: '#009900',
		'stroke-width': 1
	});
	svg.appendChild(centerCircle);
	// Центр масс (красная точка)
	const massCenterCircle = this.createSvgElement('circle', {
		cx:  this.offset2D + oContainer.centerOfMass.x,
		cy:  this.offset2D + oContainer.centerOfMass.y,
		r: 6,
		fill: '#FF3311',
		stroke: '#CC0000',
		'stroke-width': 1
	});
	svg.appendChild(massCenterCircle);
	// Линия между центрами
	const centerLine = this.createSvgElement('line', {
		x1:  this.offset2D + oContainer.centerX,
		y1:  this.offset2D + oContainer.centerY,
		x2:  this.offset2D + oContainer.centerOfMass.x,
		y2:  this.offset2D + oContainer.centerOfMass.y,
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
drawFrontView(svg) {
    this.drawTextSVG(svg, "Вид спереди:", this.oContainer.L/2,  this.offset2D/2  );
    // ТС
    const container = this.createSvgElement('rect', {
        x:  this.offset2D,
        y:  this.offset2D,
        width: this.oContainer.L,
        height: this.oContainer.H,
        class: 'container-rect'
    });
    svg.appendChild(container);
	this.LineDoor(svg,this.oContainer.H);
    // Рулоны
    this.oContainer.rolls.sort((a, b) => a.x - b.x).forEach(roll => {
		const y =  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2)
			, x =  this.offset2D + roll.x - roll.D / 2;
		// Рулоны представлены прямоугольниками (вид сбоку)
		const rect = this.createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			class: 'roll-rect',
			'style' : "fill:"+this.styleColorFillRoll(roll),
			'data-roll-id': roll.id // Добавляем идентификатор
		});
		svg.appendChild(rect);
		this.drawTextSVG(svg, ''+ roll.id + ': '+ roll.H, x+roll.D / 2 , y + roll.H / 2 + roll.y/5 - 10, roll.id );
    });
	// Оси и подписи
	this.drawAxis(svg,  this.offset2D,  this.offset2D, this.oContainer.L, this.oContainer.H, 'X=(Длина)', 'Z-(Высота)');
	   // Центр ТСа (зеленая точка)
	const centerCircle = this.createSvgElement('circle', {
		cx:  this.offset2D + this.oContainer.centerX,
		cy:  this.offset2D + this.oContainer.H - this.oContainer.centerZ,
		r: 4,
		fill: '#00FF00',
		stroke: '#009900',
		'stroke-width': 1
	});
	svg.appendChild(centerCircle);
	// Центр масс (красная точка)
	const massCenterCircle = this.createSvgElement('circle', {
		cx:  this.offset2D + this.oContainer.centerOfMass.x,
		cy:  this.offset2D + this.oContainer.H - this.oContainer.centerOfMass.z,
		r: 6,
		fill: '#FF3311',
		stroke: '#CC0000',
		'stroke-width': 1
	});
	svg.appendChild(massCenterCircle);
	// Линия между центрами
	const centerLine = this.createSvgElement('line', {
		x1:  this.offset2D + this.oContainer.centerX,
		y1:  this.offset2D + this.oContainer.H - this.oContainer.centerZ,
		x2:  this.offset2D + this.oContainer.centerOfMass.x,
		y2:  this.offset2D + this.oContainer.H - this.oContainer.centerOfMass.z,
		stroke: '#00AA00',
		'stroke-width': 1,
		'stroke-dasharray': '3,2'
	});
	svg.appendChild(centerLine);
}
// Отрисовка вида со стороны двери
drawDoorView(svg) {
	this.drawTextSVG(svg, "Вид от двери:",  this.offset2D*10,  this.offset2D*2 );
	// ТС
	const container = this.createSvgElement('rect', {
		x:  this.offset2D,
		y:  this.offset2D,
		width: this.oContainer.T,
		height: this.oContainer.H,
		class: 'container-rect'
	});
	svg.appendChild(container);
	// Рулоны
	let nn=0;
	this.oContainer.rolls.sort((a, b) => a.x - b.x).forEach(roll => {
		const y =  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2)
			, x =  this.offset2D + (this.oContainer.T - roll.y) - roll.D / 2 ;
		// Рулоны представлены прямоугольниками (вид сбоку)
		const rect = this.createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			'style' : "fill:"+this.styleColorFillRoll(roll),
			class: 'roll-rect'
		});
		svg.appendChild(rect);
		this.drawTextSVG(svg, ''+ (++nn) + ': '+ roll.H, x+20 , y + roll.H - (this.oContainer.L - roll.x)/10 + 20 ); //
	});
	// Оси и подписи
	this.drawAxis(svg,  this.offset2D,  this.offset2D, this.oContainer.T, this.oContainer.H, ' Y (Ширина)', 'Z (Высота)');
}
// Отрисовка вида с противоположного торца
drawRearView(svg) {
	this.drawTextSVG(svg, "Вид с торца:",  this.offset2D*10,  this.offset2D*2 );
	// ТС
	const container = this.createSvgElement('rect', {
		x:  this.offset2D,
		y:  this.offset2D,
		width: this.oContainer.T,
		height: this.oContainer.H,
		class: 'container-rect'
	});
	svg.appendChild(container);
	// Рулоны (зеркальное отображение)
	const rollsOnX = this.oContainer.rolls
	rollsOnX.sort((a, b) => b.x - a.x);
	rollsOnX.forEach(roll => {
		const y =  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2)
			, x =  this.offset2D + roll.y - roll.D / 2 ;
		const rect = this.createSvgElement('rect', {
			x: x,
			y: y,
			width: roll.D,
			height: roll.H,
			'style' : "fill:"+this.styleColorFillRoll(roll),
			class: 'roll-rect'
		});
		svg.appendChild(rect);
		this.drawTextSVG(svg, ''+ roll.H, x + roll.D / 2, y + roll.H - (roll.x)/10 + 12); //+ (++nn) + ': '+
	});
	// Оси и подписи
	this.drawAxis(svg,  this.offset2D,  this.offset2D, this.oContainer.T, this.oContainer.H, 'Y (Ширина)', 'Z (Высота)');
}
// Изменение цвета рулона по его параметрам
styleColorFillRoll(roll) {
	return "rgba("+(255-10*roll.s)+","+(50+Math.abs(255-3*(roll.D-80))).toFixed(0)+","+((roll.H/2)).toFixed(0)+",0.5)"; //.toFixed(0)
}	
// Отрисовка осей и подписей
drawAxis(svg, x, y, T, H, xLabel, yLabel) {
	// Ось X
	const xAxis = this.createSvgElement('line', {
		x1: 0,
		y1: y + H/2,
		x2: x + T,
		y2: y + H/2,
		class: 'axis'
	});
	svg.appendChild(xAxis);
	// Ось Y
	const yAxis = this.createSvgElement('line', {
		x1: x + T/2,
		y1: 0,
		x2: x + T/2,
		y2: y + H,
		class: 'axis'
	});
	svg.appendChild(yAxis);
	// Размерные линии
	this.drawDimension(svg, x		, y + H, x + T, y + H, 	0		,  this.offset2D	, ' '+xLabel+'-'+T+' ');
	this.drawDimension(svg, x + T, y			, x + T, y + H,	 this.offset2D, 0			, ' '+yLabel+'-'+H+' ');
}
// Отрисовка размерных линий
drawDimension(svg, x1, y1, x2, y2, offsetx, offsety, text) {
	// Основная линия
	const line = this.createSvgElement('line', {
		x1: x1 + offsetx,
		y1: y1 + offsety,
		x2: x2 + offsetx,
		y2: y2 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(line);
	// Выноски
	const ext1 = this.createSvgElement('line', {
		x1: x1,
		y1: y1,
		x2: x1 + offsetx,
		y2: y1 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(ext1);
	const ext2 = this.createSvgElement('line', {
		x1: x2,
		y1: y2,
		x2: x2 + offsetx,
		y2: y2 + offsety,
		class: 'dim-line'
	});
	svg.appendChild(ext2);
	// Текст
	const textElem = this.createSvgElement('text', {
		x: offsetx===0 ? (x1 + x2) / 2 : x1 + offsetx,
		y: offsety===0 ? (y1 + y2) / 2 : y1 + offsety,
		class: 'dim-text',
		'text-anchor': 'middle',
		'transform': offsety===0 ? 'rotate(-90, ' + (x1 + 1.5*offsetx) + ', ' + (y1 + y2 / 2) + ')' : ''
	});
	textElem.textContent = text;
	svg.appendChild(textElem);
}

updateFrontViewRollPosition(roll) {
    const frontSvg = document.getElementById('FrontSvg');
    if (!frontSvg) return;
    const rect = frontSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
    if (!rect) return;
    const y =  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2);
    const x =  this.offset2D + roll.x - roll.D / 2;
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

updateSideViews(roll) {
    // Door View (вид со стороны двери)
    const doorSvg = document.querySelector('#panel2D .print-container:nth-child(3) svg');
    if (doorSvg) {
        const rect = doorSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
        if (rect) {
            rect.setAttribute('x',  this.offset2D + (this.oContainer.T - roll.y) - roll.D / 2);
            rect.setAttribute('y',  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2));
        }
    }
    // Rear View (вид с противоположной стороны)
    const rearSvg = document.querySelector('#panel2D .print-container:nth-child(4) svg');
    if (rearSvg) {
        const rect = rearSvg.querySelector(`rect[data-roll-id="${roll.id}"]`);
        if (rect) {
            rect.setAttribute('x',  this.offset2D + roll.y - roll.D / 2);
            rect.setAttribute('y',  this.offset2D + this.oContainer.H - (roll.z + roll.H / 2));
        }
    }
}

update2DViews(roll) {
	if (!roll) return;
	const oldText = this.topSvg.querySelector(`text[data-roll-id="${roll.id}"]`);
    if (oldText) {
        oldText.setAttribute('x', roll.x +  this.offset2D);
        oldText.setAttribute('y', roll.y +  this.offset2D - 10);
		this.updateFrontViewRollPosition(roll);
		this.updateSideViews(roll);
    }
}

updateAllViews(roll) {
    // Обновляем вид сверху
    const topCircle = document.querySelectorAll(`circle[data-roll-id="${roll.id}"]`);
    if (topCircle) topCircle.forEach(Circle => { 
        Circle.setAttribute('cx', roll.x +  this.offset2D);
        Circle.setAttribute('cy', roll.y +  this.offset2D);
    })
    const oldText = document.querySelectorAll(`text[data-roll-id="${roll.id}"]`);
    if (oldText) oldText.forEach(oText => { 
        oText.setAttribute('x', roll.x +  this.offset2D);
        oText.setAttribute('y', roll.y +  this.offset2D - (roll.s-2)*20 - 10)
    })

    // Обновляем вид спереди
    this.updateFrontViewRollPosition(roll);
    
    // Обновляем виды с торцов
    this.updateSideViews(roll);

    // Обновляем 3D представление, если оно активно
    if (this.currentViewMode === '3D' && roll.mesh3D) {
        roll.mesh3D.position.set(roll.x, roll.z, roll.y);
        if (roll.label3D) {
            roll.label3D.position.set(
                roll.x,
                roll.z + roll.H/2 + 5,
                roll.y
            );
            this.updateLabelScale(roll.label3D, this.camera);
        }
    }
}

findRoll3DObject(rollId) {
    let rollObject = null;
    this.scene.traverse(function(child) {
        if (child.userData && child.userData.id === rollId && child instanceof THREE.Mesh) {
            rollObject = child;
        }
    });
    return rollObject;
}

async showServerSchemes() {// Показать список схем с сервера
    try {
        const response = await fetch( this.url_service+'list_schemes.php');
        if (!response.ok) throw new Error('Ошибка загрузки списка');
        
        const schemes = await response.json();
        this.renderSchemeList(schemes);
        document.getElementById('scheme-modal').style.display = 'block';
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Не удалось загрузить список схем');
    }
}

renderSchemeList(schemes) {// Отобразить список схем в модальном окне
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
            document.getElementById('scheme-modal').style.display = 'none';
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const schemeName = e.target.getAttribute('data-scheme');
            if (confirm(`Удалить схему "${schemeName}"?`)) {
                await deleteSchemeFromServer(schemeName);
                await this.showServerSchemes(); // Обновляем список
            }
        });
    });
}

parseIniFile(iniData) {// Парсинг INI файла (остается без изменений)
    const sections = iniData.split(/\[|\n\[/);
    this.tsParams = {};
    
    sections.forEach(section => {
        if (!section.trim()) return;
        
        const sectionEnd = section.indexOf(']');
        const sectionName = section.substring(0, sectionEnd).trim();
        const sectionContent = section.substring(sectionEnd + 1);
        
        this.tsParams[sectionName] = {};
        
        sectionContent.split('\n').forEach(line => {
            if (!line.trim() || line.startsWith(';')) return;
            
            const eqPos = line.indexOf('=');
            if (eqPos < 0) return;
            
            const key = line.substring(0, eqPos).trim();
            const value = line.substring(eqPos + 1).trim();
            
            if (key && value) {
                this.tsParams[sectionName][key] = isNaN(value) ? value : parseFloat(value);
            }
        });
    });
}

async loadTsConfig() {// Загрузка конфигурации ТС
    try {
		this.tsParams = {
			'Контейнер': {
				L: 1203, T: 235, H: 259,
				maxW: 25500, maxCML: 30, maxCMT: 10,
				maxKGL: 1500, maxKGT: 500,
				minCMDoor: 50, minDimX: 25
			},
			'Вагон': {
				L: 1768, T: 276, H: 286,
				maxW: 65000, maxCML: 50, maxCMT: 15,
				maxKGL: 3000, maxKGT: 1000,
				minCMDoor: 15, minDimX: 0
			}
		};
		console.log(this.url_service+'TS.ini')
		if (window.location.protocol !== 'file:') {        
			const response = await fetch( this.url_service+'TS.ini');console.log(response)
			if (!response || !response.ok) {
				throw new Error('Не удалось загрузить TS.ini');
			}else{
				const iniData = await response.text();//console.log(iniData)
				this.parseIniFile(iniData);
				return;
			} 
		}	
    } catch (error) {
        console.error('Ошибка загрузки TS.ini:', error);
    }
}


populateTsSelector() {// Заполнение селектора типами ТС
    const tsTypeSelect = document.getElementById('ts-type');
    const savedValue = localStorage.getItem('lastSelectedTsType');
    const currentValue = savedValue || tsTypeSelect.value;
    
    // Очищаем все опции, кроме "Свой"
    tsTypeSelect.innerHTML = '';
    
    // Добавляем типы из TS.ini
	Object.keys(this.tsParams).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        
        // Устанавливаем selected для первого элемента, если нет сохраненного значения
        if (currentValue === '' && Object.keys(this.tsParams).indexOf(type) === 0) {
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
    if (tsTypeSelect.value === '' && Object.keys(this.tsParams).length > 0) {
        tsTypeSelect.selectedIndex = 0;
    }
    
    tsTypeSelect.addEventListener('change', () => {
        localStorage.setItem('lastSelectedTsType', tsTypeSelect.value);
    });	
	
}

async initTsSelector() {// Загрузка и инициализация параметров ТС
    await this.loadTsConfig();
    this.populateTsSelector();
    
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


generateTrainView() {// рисовать состав ТС
	this.renderViews2D();
	this.renderTrainListView();
	// После отрисовки всех ТС показываем текущий 
	//this.showContainer();
}

renderTrainListView() { //для отрисовки миниатюр видов сверху
    const containers = document.getElementById('views-container-list');
    containers.innerHTML = '';
    
    // Группируем одинаковые ТС
    const containerGroups = [];
    let currentGroup = null;
    
    this.currentTrain.containers.forEach((container, index) => {
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
        const isActive = group.indexes.includes(this.oContainerIndex);
        
        if (isActive) {
            tsElement.classList.add('active');
        }
        
        // Добавляем обработчик клика
        tsElement.addEventListener('click', () => {
            this.oContainerIndex = group.firstIndex; // Переходим к первому ТС в группе
            this.oContainer = this.currentTrain.containers[this.oContainerIndex];
            this.oContainer.updateCenterOfMass();
            this.renderTrainListView();
            this.updateUI();
        });

        // Создаем миниатюру вида сверху
        const svg = this.createSvgElement('svg', {
            width: group.container.L +  this.offset2D*2,
            height: group.container.T +  this.offset2D*2,
            viewBox: `0 0 ${group.container.L +  this.offset2D*2} ${group.container.T +  this.offset2D*2}`,
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
        
        this.drawTopView(svg, group.container, labelText);//	console.log(group.container)
        
        tsElement.appendChild(svg);
        containers.appendChild(tsElement);
    });
    // Инициализируем drag-n-drop для всех рулонов
    this.initDragBetweenContainers();
}

// drawContainerView(svg, container) {//с конкретным ТС
    // this.drawTopView(svg, this.oContainer); 
    // if (container === this.currentTrain.containers[0]) {
        //Для первого ТСа добавляем оси и подписи
        // this.drawAxis(svg,  this.offset2D,  this.offset2D, container.L, container.T, 'X-(Длина)', 'Y-(Ширина)');
    // }
// }

// highlightTransferCandidates() {
    // if (!this.currentTrain) return;
    
    // const source = this.currentTrain.containers[0];
    // const target = this.currentTrain.containers[1];
    // const candidate = source.findBestTransferCandidate(target);
    
    // if (candidate) {
        // const rollElement = document.querySelector(`[data-roll-id="${candidate.id}"]`);
        // if (rollElement) {
            // rollElement.classList.add('transfer-candidate');
        // }
    // }
// }

updateNavigation() {// обновления состояния
	if (!this.currentTrain || this.currentTrain.containers.length === 0) {
		this.prevBtn.disabled = true;
		this.nextBtn.disabled = true;
		this.infoSpan.textContent = "Нет ТС";
		return;
	}
	
	this.prevBtn.disabled = this.oContainerIndex === 0;
	this.nextBtn.disabled = this.oContainerIndex === this.currentTrain.containers.length - 1;
	
	this.infoSpan.textContent = `ТС ${this.oContainerIndex + 1}/${this.currentTrain.containers.length}`;
}

initContainerNavigation() {// Инициализация навигации
	// Обработчики событий
	this.prevBtn.addEventListener('click', () => {
		if (this.oContainerIndex > 0) {
			this.oContainerIndex--;
			this.showContainer();
		}
	});
	
	this.nextBtn.addEventListener('click', () => {
		if (this.oContainerIndex < this.currentTrain.containers.length - 1) {
			this.oContainerIndex++;
			this.showContainer();
		}
	});
	
	document.addEventListener('keydown', (e) => {
		if (!this.currentTrain) return;
		
		// Стрелка влево - предыдущий ТС
		if (e.key === 'ArrowLeft') {
			if (this.oContainerIndex > 0) {
				this.oContainerIndex--;
				this.showContainer();
			}
			e.preventDefault();
		}
		
		// Стрелка вправо - следующий ТС
		if (e.key === 'ArrowRight') {
			if (this.oContainerIndex < this.currentTrain.containers.length - 1) {
				this.oContainerIndex++;
				this.showContainer();
			}
			e.preventDefault();
		}
	});    
	document.getElementById('add-container').addEventListener('click', wa.addСontainerСlick);

	document.getElementById('remove-container').addEventListener('click', wa.removeСontainerСlick);	
	// Инициализация
	this.updateNavigation();
}

addСontainerСlick() { //добавить ТС
	if (!this.currentTrain) return;
	const params = getValidatedContainerParams();
	this.currentTrain.addContainer(params);
	this.renderTrainOverview();
}

removeСontainerСlick() { //добавить ТС
	if (!this.currentTrain || this.currentTrain.containers.length <= 1) return;
	this.currentTrain.removeContainer(this.oContainerIndex);
	if (this.oContainerIndex = this.currentTrain.containers.length) this.oContainerIndex--;	
	this.renderTrainOverview();
}

showContainer(index = this.oContainerIndex) { //показать ТС
    if (index < 0 || index >= this.currentTrain.containers.length) return;
    
    this.oContainerIndex = index;
    this.oContainer = this.currentTrain.containers[index];
    
    // Обновляем информацию о текущем ТС
    document.getElementById('current-container-info').textContent = 
        `ТС ${index + 1}/${this.currentTrain.containers.length}`;
    
    // Активируем/деактивируем кнопки навигации
    document.getElementById('prev-container').disabled = index <= 0;
    document.getElementById('next-container').disabled = index >= this.currentTrain.containers.length - 1;
    
	// Обновляем список если в режиме просмотра списка
    if (this.currentViewMode === '1D') {
        //renderTrainList();	
		//this.currentViewMode = '2D';
    } 
	// Генерируем представление
    this.generateView();	
	this.renderTrainOverview();
    this.updateUI();
}

renderTrainOverview2() {//показ состава ТС для навигации
	if (!this.currentTrain || this.currentTrain.containers.length === 0) return;
	
	const svg = document.getElementById('train-svg');
	svg.innerHTML = ''; // Очищаем предыдущее изображение
	
	const containerWidth = 35;
	const containerHeight = 15;
	const spacing = 2;
	const startX = 5;
	const startY = 5;
	
	// Общая ширина для центрирования
	const totalWidth = this.currentTrain.containers.length * (containerWidth + spacing) - spacing;
	
	// Рисуем ТС
	this.currentTrain.containers.forEach((container, index) => {
		const x = startX + index * (containerWidth + spacing);
		const y = startY;
		
		// Индикатор текущего ТС
		if (index === this.oContainerIndex) {
			const indicator = this.createSvgElement( 'rect', {
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
		const rect = this.createSvgElement( 'rect', {
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
		const defs = svg.querySelector('defs') || this.createSvgElement( 'defs');
		const gradient = this.createSvgElement( 'linearGradient',{
			x1: '0%',
			y1: '0%',
			x2: '100%',
			y2: '0%'
		});
		gradient.id = `fill-gradient-${index}`;
		
		const stop1 = this.createSvgElement( 'stop',{	offset: `${fillPercent}%`,	'stop-color': (fillPercent > 90 ? '#4CAF5033' : fillPercent > 70 ? '#ff980033' : '#ff572233') });
		const stop2 = this.createSvgElement( 'stop',{	offset: `${fillPercent}%`,	'stop-color': '#f5f5f5' });
		
		gradient.appendChild(stop1);
		gradient.appendChild(stop2);
		defs.appendChild(gradient);
		svg.appendChild(defs);
		
		// Текст с информацией
		const text = this.createSvgElement( 'text', {x: x + containerWidth / 2,y: y + containerHeight / 2 + 5,class: 'train-container-text'});
		text.textContent = `${index + 1}:${Math.round(fillPercent)}%`
		svg.appendChild(text);

	});
	
	// Обработчик кликов
	svg.querySelectorAll('.train-container-rect').forEach(rect => {
		rect.addEventListener('click', () => {
			const index = parseInt(rect.dataset.index);
			if (index !== this.oContainerIndex) {
				this.oContainerIndex = index;
				this.showContainer();
			}
		});
	});
	this.addTooltips();

}

renderTrainOverview() {
    if (!this.currentTrain || this.currentTrain.containers.length === 0) return;
    
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
    
    this.currentTrain.containers.forEach((container, index) => {
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
        const isActive = group.indexes.includes(this.oContainerIndex);
        
        if (isActive) {
            const indicator = this.createSvgElement('rect', {
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
        const rect = this.createSvgElement( 'rect');
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
        const defs = svg.querySelector('defs') || this.createSvgElement( 'defs');
        const gradient = this.createSvgElement( 'linearGradient');
        gradient.id = `fill-gradient-${group.firstIndex}`;
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '0%');
        
        const stop1 = this.createSvgElement( 'stop',{  offset: `${fillPercent}%`,  'stop-color': fillPercent > 90 ? '#4CAF5033' : fillPercent > 70 ? '#ff980033' : '#ff572233'});
        const stop2 = this.createSvgElement( 'stop',{  offset: `${fillPercent}%`,  'stop-color': '#f5f5f5'});
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        svg.appendChild(defs);
        
        // Текст с информацией
        const text = this.createSvgElement( 'text',{  x: x + containerWidth / 2, y: y + containerHeight / 2 + 5, 	class: 'train-container-text'});
        
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
            if (index !== this.oContainerIndex) {
                this.oContainerIndex = index;
                this.showContainer();
            }
        });
    });
    
    this.addTooltips();
}

addTooltips() {//посказка
    if (1 || !this.currentTrain) return;
    
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
            const container = this.currentTrain.containers[index];
            
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

showLoadingProgress(message, duration = 2000) {    // Показывает индикатор загрузки с прогрессом
    // 1. Скрываем предыдущий индикатор, если он есть
    this.hideLoadingProgress();
    
    // 2. Создаем ТС прогресса
    this.progressContainer = document.createElement('div');
    this.progressContainer.id = 'loading-progress';
    this.progressContainer.style = `
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
    this.progressContainer.appendChild(messageEl);
    this.progressContainer.appendChild(progressBarContainer);
    document.body.appendChild(this.progressContainer);
    
    // 7. Анимируем прогресс-бар
    let progress = 0;
    const interval = 50;
    const steps = duration / interval;
    const increment = 100 / steps;
    
    const animateProgress = () => {
        progress += increment;
        progressBar.style.width = `${Math.min(progress, 100)}%`;
        
        if (progress < 100) {
            this.progressTimeout = setTimeout(animateProgress, interval);
        }
    };
    
    animateProgress();
}

hideLoadingProgress() {
    /**
     * Скрывает индикатор загрузки
     */
    if (this.progressContainer) {
        this.progressContainer.remove();
        this.progressContainer = null;
    }
    if (this.progressTimeout) {
        clearTimeout(this.progressTimeout);
        this.progressTimeout = null;
    }
}

showMessage(text) {// успешных сообщений
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

showFinalStats() {// статистика
    return;
	if (!this.currentTrain || this.currentTrain.containers.length === 0) return;
    
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
    const totalRolls = this.currentTrain.containers.reduce((sum, c) => sum + c.rolls.length, 0);
    const totalWeight = this.currentTrain.containers.reduce((sum, c) => sum + c.totalW, 0);
    const totalCapacity = this.currentTrain.containers.reduce((sum, c) => sum + c.maxW, 0);
    const utilization = totalCapacity > 0 ? (totalWeight / totalCapacity * 100) : 0;
    
    // 3. Создаем HTML-структуру
    statsContainer.innerHTML = `
        <div style="text-align: center; margin-top: 20px;">
            <button id="close-stats">Закрыть</button>
        </div>
        <h2 style="text-align: center; margin-top: 0; color: #2c3e50;">Итоги загрузки</h2>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div style="flex: 1; text-align: center; padding: 10px; background: #f9f9f9; border-radius: 5px;">
                <div style="font-size: 24px; font-weight: bold; color: #3498db;">${this.currentTrain.containers.length}</div>
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
    this.currentTrain.containers.forEach((container, index) => {
        const containerUtilization = (container.totalW / container.maxW * 100);
        const cmOffsetX = Math.abs(container.centerOfMass.x - container.centerX);
        const cmOffsetY = Math.abs(container.centerOfMass.y - container.centerY);
        
        const containerEl = document.createElement('div');
        containerEl.style = `
            padding: 10px;
            margin-bottom: 8px;
            background: ${index === this.oContainerIndex ? '#e3f2fd' : '#f9f9f9'};
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
            // this.oContainerIndex = index;
            // showCurrentContainer();
            // document.querySelector('#final-stats').remove();
        // });
        containersStats.appendChild(containerEl);
    });
    
    // 5. Добавляем диаграмму эффективности
    const efficiencyStats = statsContainer.querySelector('#efficiency-stats');
    efficiencyStats.innerHTML = `
        <div style="display: flex; align-items: flex-end; height: 150px; margin: 15px 0;">
            ${this.currentTrain.containers.map((c, i) => {
                const height = ((c.totalW / c.maxW * 100) + 10).toFixed(0) ;//console.log(height)
                const color = i === this.oContainerIndex ? '#3498db' : '#95a5a6';
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
	wa.showBalanceWarnings();
	
}

showBalanceWarnings() {// Показ предупреждений о дисбалансе
    if (!this.currentTrain) return;
    
    const warnings = [];
    
    this.currentTrain.containers.forEach((container, index) => {
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

/*
showSchemeListModal(schemes) {// Показ модального окна со списком схем
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
                const response = await fetch( this.url_service+`get_scheme.php?id=${schemeId}`);
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
                    const response = await fetch( this.url_service+`delete_scheme.php?id=${schemeId}`);
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
*/

generateView() {// генерации видов
	
	if( this.currentViewMode === '2D')	
		this.generateView2D();
	else if( this.currentViewMode === '3D')
		this.generateView3D();
	else 	
		this.generateTrainView();
}

generateView1D() {// Пересоздание плоского вида
	this.currentViewMode = '1D';
	this.updateViewMode();
	this.generateTrainView();
	this.updateUI();
}

generateView2D() {// Пересоздание плоского вида
	this.currentViewMode = '2D';
	this.updateViewMode();
	this.renderViews2D();
	this.updateUI();
}

generateView3D() {// Пересоздание обьемного вида
	if (!this.oContainer) return;
	this.currentViewMode = '3D';
	this.updateViewMode();
	if (this.scene)	while(this.scene.children.length > 0) {	// Корректная очистка сцены
		const obj = this.scene.children[0];
		if (obj.geometry) obj.geometry.dispose();
		if (obj.material) obj.material.dispose();
		this.scene.remove(obj);
	}
	else  this.initScene3D();
	this.setupScene3D();
	this.init3DDragControls(); // Добавляем контролы заново
	this.adjustcamera();
	this.animate();			// Принудительный ререндер
	this.updateUI();
}

toggleViewMode() { // переключения режимов
    this.currentViewMode = this.currentViewMode === '1D' ? '2D' : '2D';
	this.updateViewMode();
}

updateViewMode() { // обновления вида
    document.getElementById('panel2D'			).style.display		= this.currentViewMode==='1D' || this.currentViewMode==='3D'	? 'none'	: 'block';	
    document.getElementById('train-list-view'	).style.display		= this.currentViewMode==='1D'							? 'block'	: 'none';	
	if (this.currentViewMode==='1D') {
		const curContainer = document.querySelector('.cur-active');
		if (curContainer) { 
			curContainer.classList.add('active');
			curContainer.classList.remove('cur-active');
		}	
		document.querySelector('#topView').classList.remove('active');
	} else {
		const curContainer = document.querySelector('#train-list-view .active')
		if (curContainer ){
			curContainer.classList.add('cur-active');
			curContainer.classList.remove('active');
		}	
		document.querySelector('#topView').classList.add('active');
	}		
}
/*
createTrainListView() {// Создаем список ТС если его нет
    const listView = document.createElement('div');
    listView.id = 'train-list-view';
    
    // Позиционируем список рядом с основными элементами управления
    const trainControls = document.getElementById('train-controls');
    trainControls.parentNode.insertBefore(listView, trainControls.nextSibling);
    
    renderTrainList();
}

renderTrainList() {// Рендерим список ТС
    const listView = document.getElementById('train-list-view');
    if (!listView) return;
 
    // Добавляем обработчики клика
    document.querySelectorAll('.train-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            this.showContainer(index);
            this.currentViewMode = '2D';
            wa.updateViewMode();
        });
    });
    
    // Показываем неразмещенные рулоны если есть
    if (this.currentTrain.unplacedRolls.length > 0) {
        const unplacedDiv = document.createElement('div');
        unplacedDiv.className = 'unplaced-rolls';
        unplacedDiv.innerHTML = `
            <h4>Неразмещенные рулоны (${this.currentTrain.unplacedRolls.length}):</h4>
            <ul>
                ${this.currentTrain.unplacedRolls.map(roll => `
                    <li>${roll.id}: ${roll.H}×${roll.D} (${roll.W}кг)</li>
                `).join('')}
            </ul>
            <button id="create-new-container">+ Добавить ТС</button>
        `;
        listView.appendChild(unplacedDiv);
        
        document.getElementById('create-new-container').addEventListener('click', this.addСontainerСlick);
    }
}


drawTopViewForList(svg, container) {//упрощен. вер.
    // ТС
    const rect = this.createSvgElement('rect', {
        x:  this.offset2D,
        y:  this.offset2D,
        width: container.L,
        height: container.T,
        class: 'container-rect'
    });
    svg.appendChild(rect);
    
    // Рулоны
    container.rolls.forEach(roll => {
        const circle = this.createSvgElement('circle', {
            cx: roll.x +  this.offset2D,
            cy: roll.y +  this.offset2D,
            r: roll.D / 2,
            class: 'roll-circle',
            'style': `fill:${this.styleColorFillRoll(roll)}`,
            'data-roll-id': roll.id,
            'data-container-index': container.trainIndex
        });
        svg.appendChild(circle);
    });
}
*/
initDragBetweenContainers() { // между ТС
    this.draggedRoll = null;
    let sourceContainerIndex = null;
    
    // Опции для событий touch
    const passiveOptions = { passive: false, capture: true };
    
    document.querySelectorAll('.roll-circle').forEach(circle => {
        circle.addEventListener('mousedown', wa.startDragBetween);
        circle.addEventListener('touchstart', wa.startDragBetween, passiveOptions);
    });
    
    document.querySelectorAll('.train-container-view').forEach(container => {
        container.addEventListener('mousemove', wa.dragBetween);
        container.addEventListener('touchmove', wa.dragBetween, passiveOptions);
        container.addEventListener('mouseup', wa.endDragBetween);
        container.addEventListener('touchend', wa.endDragBetween, passiveOptions);
        container.addEventListener('touchcancel', wa.endDragBetween, passiveOptions);
		container.addEventListener('dblclick', handleRollDoubleClick);
    });
}
    
startDragBetween(e) {
	// Предотвращаем стандартное поведение только для touch-событий
	if (e.type === 'touchstart') {
		e.preventDefault();
	}
	
	const circle = e.target;
	sourceContainerIndex = parseInt(circle.closest('svg').dataset.containerIndex);
	const rollId = parseInt(circle.dataset.rollId);
	
	this.draggedRoll = this.currentTrain.containers[sourceContainerIndex].rolls
		.find(r => r.id === rollId);
	
	if (this.draggedRoll) {
		circle.classList.add('dragging');
	}
}

dragBetween(e) {
	if (!this.draggedRoll) return;
	e.preventDefault();
	
	// Можно добавить визуальное выделение при перетаскивании
}

endDragBetween(e) {
	if (!this.draggedRoll) return;
	e.preventDefault();
	
	const targetContainer = e.target.closest('.train-container-view');
	if (!targetContainer) return;
	
	const targetIndex = parseInt(targetContainer.querySelector('svg').dataset.containerIndex);
	
	if (sourceContainerIndex !== targetIndex) {
		// Пытаемся перенести рулон
		const targetContainer = this.currentTrain.containers[targetIndex];
		if (targetContainer.canFitRoll(this.draggedRoll)) {
			this.currentTrain.containers[sourceContainerIndex].removeRoll(this.draggedRoll);
			targetContainer.addRoll(this.draggedRoll);
			
			// Обновляем представление
			this.renderTrainListView();
			this.updateUI();
		}
	}
	
	// Сбрасываем состояние
	document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
	this.draggedRoll = null;
	sourceContainerIndex = null;
}

updateUI() {// отрисовка интерфейса
    // Обновляем информацию о текущем ТС
    document.getElementById('current-container-info').textContent = `ТС ${this.oContainerIndex + 1}/${this.currentTrain.containers.length}`;
	
	document.getElementById('container-L').textContent = this.oContainer.L;
	document.getElementById('container-T').textContent = this.oContainer.T;
	document.getElementById('container-H').textContent = this.oContainer.H;
	const contW = document.getElementById('container-W')
	const containerFullW = (100 * this.oContainer.totalW / this.oContainer.maxW)
	contW.textContent = this.oContainer.totalW + '/' + this.oContainer.maxW + ' кг ' +containerFullW.toFixed() +'%';
	if (containerFullW <= 90) {
		contW.classList.add('warning');
	} else if (containerFullW <= 100) {
		contW.classList.add('normal');
	} else {
		contW.classList.add('critical');
	}
	// Container center
	document.getElementById('container-center-x').textContent = (this.oContainer.centerX).toFixed(1);
	document.getElementById('container-center-y').textContent = (this.oContainer.centerY).toFixed(1);
	document.getElementById('container-center-z').textContent = (this.oContainer.centerZ).toFixed(1);
	// Center of mass
	//console.log(this.oContainer.centerOfMass)
	document.getElementById('mass-center-x').textContent = (this.oContainer.centerOfMass.x).toFixed(1);
	document.getElementById('mass-center-y').textContent = (this.oContainer.centerOfMass.y).toFixed(1);
	document.getElementById('mass-center-z').textContent = (this.oContainer.centerOfMass.z).toFixed(1);
	// Deviations
	const deviationX = (this.oContainer.centerOfMass.x - this.oContainer.centerX).toFixed(1);
	const deviationY = (this.oContainer.centerOfMass.y - this.oContainer.centerY).toFixed(1);
	updateDeviationDisplay('deviation-x1', deviationX, this.oContainer.maxCML);
	updateDeviationDisplay('deviation-y1', deviationY, this.oContainer.maxCMT);
	updateDeviationDisplay('deviation-xW', (this.oContainer.backW  - this.oContainer.frontW).toFixed(1), this.oContainer.maxKGL);
	updateDeviationDisplay('deviation-yW', (this.oContainer.rightW - this.oContainer.leftW).toFixed(1), this.oContainer.maxKGT );
	document.getElementById('placed-count').textContent = this.oContainer.totalLoaded;
	document.getElementById('unplaced-count').textContent = this.oContainer.unplacedRolls.length;
	// Placement errors
	const errorList = document.getElementById('error-list');
	errorList.innerHTML = '';
	if (this.oContainer.unplacedRolls.length === 0) {
		errorList.innerHTML = '<div>Всё размещено!</div>';
	} else {
		errorList.innerHTML = '<div class="error">Не размещено:</div>';
		this.oContainer.unplacedRolls.forEach( roll => {
			const errorItem = document.createElement('div');
			errorItem.className = 'error-item';
			errorItem.innerHTML = '<strong>'+roll.id+'</strong>: <small>'+roll.H+', '+roll.D+', '+roll.W+'</small> '+roll.placementError;
			errorList.appendChild(errorItem);
		});
	}
	// Расстояние до дверей
	const doorDistance = this.oContainer.calculateDoorDistance();
	document.getElementById('door-distance').textContent = doorDistance === Infinity ? "Нет рулонов" : doorDistance.toFixed(1);
	document.getElementById('minDimX').value = this.oContainer.DimX.toFixed(2);

	// Общая информация по цепочке
	document.getElementById('train-info').innerHTML = `
		ТС: ${this.currentTrain.containers.length}<br>
		Общий вес: ${this.currentTrain.totalWeight()} кг<br>
		Не размещено: ${this.currentTrain.unplacedRolls.length} рулонов
		`;
}

dravPrintScheme() {// подготовки для печати схемы
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
        <p>ТС: ${this.oContainer.L} см (длина) × ${this.oContainer.T} см (ширина) × ${this.oContainer.H} см (высота)</p>
        <p>Общий вес: ${this.oContainer.totalW} кг (макс. ${this.oContainer.maxW} кг)</p>
        <p>Центр масс: X=${this.oContainer.centerOfMass.x.toFixed(1)} см, Y=${this.oContainer.centerOfMass.y.toFixed(1)} см</p>
        <p>Отклонение: ${Math.abs(this.oContainer.centerOfMass.x - this.oContainer.centerX).toFixed(1)} см (допуск ${this.oContainer.maxCML} см)</p>
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
			${this.oContainer.rolls.map(roll => `
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
				<td>${this.oContainer.totalW} кг</td>
				<td colspan="2">${this.oContainer.rolls.length} рулонов</td>
			</tr>
		</tfoot>
	`;
	printContainer.appendChild(table);	
	return printContainer;
}

showError(message) {// Показ ошибок
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

}

const wa = new WA();	// Создаем глобальный экземпляр приложения
wa.init(); 				// Запуск приложения

