// Модель проекта MVC
// Глобальные переменные
const url_service = './'
const mm = 0.01  // минимальный зазор между рулонами
const offset2D = 20;
const slider = document.getElementById('rolls-slider');// Инициализация ползунка
const sliderValue = document.getElementById('slider-value');
const originalRollPositions = new Map();// Храним оригинальные позиции
const FreeStyle = document.getElementById('FreeStyle');
const CrossStyle = document.getElementById('CrossStyle');
const prevBtn = document.getElementById('prev-container');
const nextBtn = document.getElementById('next-container');
const infoSpan = document.getElementById('current-container-info');
let scene, camera, renderer, dragControls, controls;
let oContainerIndex = 0; // Индекс текущего ТСа
let oContainer = null;   // Ссылка на текущий ТС
let oRolls = null; // набор рулонов для отдгрузки в состав ТС
let topSvg = 0;
let nextRollId = 1;
let rollSets = [];
let draggedRoll = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let originalPosition = {x: 0, y: 0, z: 0};
let validTargets = [];
let snapAnimationFrame = null;
let isShiftPressed = false;
let isCtrlPressed = false;
let isAltPressed = false;
let currentScheme = null;
let progressTimeout;
let progressContainer = null;
let tsParams = {};
let currentViewMode = '1D'; // для хранения текущего режима '2D'  или '3D' или '1D'

class Roll {// рулон (единица груза) для загрузки в ТС или состав ТС (Контейнерный поезд)
	constructor(id, H, D, W) {
		this.id = id
		this.x = 0;
		this.y = 0;
		this.z = 0;
		this.s = 0;
		this.H = H
		this.D = D
		this.R = D/2
		this.W = W;
		this.row = 0;
		this.dim = 0;
		this.pId = 0;
		this.placementError = '';
		this.color = styleColorFillRoll(this);
	}
}// конец класса

class Rolls { // набор рулонов
	constructor(arr) {
		this.rolls = arr; // все рулоны
		this.count = arr.length // всего шт.
		this.num = 0; // текущий в наборе
		this.roll = this.rolls[this.num]; // текущий рулон
		this.exist = 1; //  еще есть не загруженные
		this.Dgroups = {}; // параметры групп диаметров
		this.Dmax = 0; // макс.диаметр
		this.Dmin = Infinity; // мин.диаметр
		this.D = this.rolls[this.num].D; // следущий диаметр для загрузки
		this.R = this.D/2; 
		this.Dcurrent = this.D; // текущий диаметр для загрузки
		this.Dused = 0; // рассчитано мест всех диметров
		this.rolls.sort( (a, b) => { if (a.D === b.D) return b.W - a.W; return b.D - a.D;} )
        this.Dorder = [];
        this.Dindex = 0;
        this.K = this.count; // Сколько всего нужно выбрать			
		for (const roll of this.rolls) {
			const D = roll.D;
			if (!this.Dgroups[D]) {
				this.Dgroups[D] = {
					rolls:	[],  // рулоны данного диметра
					portions: 0, // доля рулонов  данного диметра
					counts:	0, // рулонов в группе диаметров
					used:	0 // рассчитано мест данного диметра
				}
			}
			this.Dgroups[D].rolls.push(roll);
			this.Dgroups[D].counts++;
			this.Dgroups[D].portions = this.Dgroups[D].counts / this.count;
			this.Dgroups[D].used = 0;
			this.Dmax = Math.max(this.Dmax,D);
			this.Dmin = Math.min(this.Dmin,D);
		}
        this.generateLinearOrder();
    }
	addRoll(Roll) {
		this.rolls += Roll;
		this.count ++;
		
	}
    // Линейное распределение: большой диаметр в середине, уменьшение к краям
	generateLinearOrder() {
		const diameters = Object.keys(this.Dgroups).map(Number).sort((a, b) => a - b);
		this.Dorder = [];

		// Сначала собираем все доступные диаметры с учётом их количества
		const availableDiameters = [];
		for (const D of diameters) {
			for (let i = 0; i < this.Dgroups[D].counts; i++) {
				availableDiameters.push(D);
			}
		}

		// Если нет рулонов, возвращаем пустой массив
		if (availableDiameters.length === 0) {
			this.Dorder = [];
			return;
		}

		// Линейное распределение: большой диаметр в середине, уменьшение к краям
		for (let i = 0; i < this.K; i++) {
			// Нормализованная позиция от 0 до 1 (пик в середине)
			const pos = i / (this.K - 1);
			const linearPos =	diameters[diameters.length-1].counts < 4 ? pos : // [0.....1]
								pos <= 0.5	? pos * 2 :	2 - pos * 2;	// [0..1..0]
			// Выбираем индекс в availableDiameters (большие ближе к середине)
			const index = Math.floor(linearPos * (availableDiameters.length - 1));
			const selectedD = availableDiameters[index];

			this.Dorder.push(selectedD);
		};//console.log(this.Dorder)
		// Сбрасываем used (т.к. это временный расчёт)
		for (const D in this.Dgroups) {
			this.Dgroups[D].used = 0;
		}
	}

    nextD(index = null) {
        if (index !== null) {
            const pos = Math.min(1, Math.max(0, index));
            const i = Math.floor(pos * (this.Dorder.length - 1));
            const nextD = this.Dorder[i];
            this.Dcurrent = nextD;
            this.D = nextD;
            this.R = nextD / 2;//console.log(nextD)
            return nextD;
        }

        if (this.Dindex >= this.Dorder.length) {
            return this.Dcurrent;
        }
        const nextD = this.Dorder[this.Dindex++];
        this.Dcurrent = nextD;
        this.D = nextD;
        this.R = nextD / 2;//console.log(nextD)
        if (this.Dgroups[nextD]) {
            this.Dgroups[nextD].used++;
            this.Dused++;
        }
        return nextD;
    }
	nextRoll() { // получить рулон
        if (this.num >= this.count) {
            this.exist = 0;
            return null;
        }
        this.roll = this.rolls[this.num++];
        this.D = this.roll.D;
        this.R = this.D / 2;
        return this.roll;
    }	
}// конец класса

class Container { // Траспортное стредство для погрузки

	constructor(p) { //L, T, H, maxW, maxCML, maxCMT, maxKGL, maxKGT, minCMDoor, minDimX, trainIndex =0) {
		this.id = p.id;
		this.trainIndex = p.trainIndex;
		this.L = p.L;
		this.T = p.T;
		this.H = p.H;
		this.totalLoaded = 0;
		this.centerX = p.L / 2;
		this.centerY = p.T / 2;
		this.centerZ = p.H / 2;
		this.maxW = p.maxW;
		this.maxCML = p.maxCML;
		this.maxCMT = p.maxCMT;
		this.maxKGL = p.maxKGL;
		this.maxKGT = p.maxKGT;
		this.minCMDoor = p.minCMDoor;
		this.minDimX = p.minDimX;
		this.DimX = p.minDimX;
		this.DimY = 0;
		this.centerOfCont = { x: this.centerX, y: this.centerY, z: this.centerZ }; // Геометрически центр
		this.centerOfMass = { x: this.centerX, y: this.centerY, z: this.centerZ }; // центр массы груза
        this.oRolls = null;            // Объект рулоны для размещения 
		this.clearParam();
	}
	// Очистить рассчётные
	clearParam() {
        // 1. Груз
        this.rolls = [];               // Размещенные рулоны
        this.unplacedRolls = [];       // Неразмещенные рулоны
        this.totalW = 0;               // Общий вес груза
        
        // 2. Координаты центров
        this.centerX = this.L / 2;     // Геометрический центр по X
        this.centerY = this.T / 2;     // Геометрический центр по Y
        this.centerZ = this.H / 2;     // Геометрический центр по Z
        
        this.centerOfMass = {          // Центр масс груза
            x: this.centerX,
            y: this.centerY,
            z: this.centerZ
        };
        
        // 3. Временные параметры для алгоритма упаковки
        this.current_X = 0;            // Текущая позиция по длине
        this.rowNumber = 0;            // Номер текущего ряда
        this.rowPositions = [];        // Позиции в текущем ряду
        this.Positions = [];           // Все возможные позиции
        this.unplacedPositions = [];   // Неиспользованные позиции
        this.swaps = [];               // История перестановок
        
        // 4. Балансировочные параметры
        this.frontW = 0;               // Вес в передней части
        this.backW = 0;                // Вес в задней части
        this.leftW = 0;                // Вес слева
        this.rightW = 0;               // Вес справа
        this.DimX = this.minDimX;      // Текущее смещение по X
        this.DimY = 0;                 // Текущее смещение по Y
		this.gateTypeCenter  = document.getElementById('ts-type').value === 'Вагон'; // да - ворота по середине ТС, нет - ворота с краю 
    }
	// Новый метод получения позиций "на лету"
    getPositions() {
        return this.rolls.map(roll => ({
            x: roll.x,
            y: roll.y,
            z: roll.z,
            s: roll.s,
            D: roll.D,
            H: roll.H,
            W: roll.W
        }));
    }
	// Добавить неразмещенные
	addUnplacedRoll(roll, reason) {
		roll.placementError += reason;
		this.unplacedRolls.push(roll);
	}
	
    addRoll(roll) {
        // Проверяем, что рулон с таким ID еще не добавлен
        if (!this.rolls.some(r => r.id === roll.id)) {
            this.rolls.push(roll);
			this.oRolls.rolls.push(roll);
			this.totalW += roll.W;
            this.updateCenterOfMass();
            return true;
        }
        return false;
    }

	removeRoll(roll) {
        if (!roll || !this.oRolls) return false;
        
        // Ищем рулон в основном массиве
        const index = this.rolls.findIndex(r => r.id === roll.id);
        if (index !== -1) {
            this.rolls.splice(index, 1);
            this.totalW -= roll.W;
            this.updateCenterOfMass();
            return true;
        }
        
        // Ищем в oRolls (наборе рулонов контейнера)
        const rollsIndex = this.oRolls.rolls.findIndex(r => r.id === roll.id);
        if (rollsIndex !== -1) {
            this.oRolls.rolls.splice(rollsIndex, 1);
            // Не вычитаем вес здесь, так как он учтен в this.rolls
            return true;
        }
        
        return false;
    }

	async optimizedPlacementAsync(rollsToPlace = null) {
        /**
         * Улучшенный алгоритм упаковки рулонов с учетом:
         * - Динамического центра масс
         * - Ограничений по весу и габаритам
         * - Оптимального использования пространства
         * @param {Array|null} rollsToPlace - опциональный массив рулонов для размещения
         * @returns {Object} - результат упаковки {placed: Number, unplaced: Array}
         */
        // 1. Инициализация
		if (!this.oRolls) return false;	
		this.clearParam();
		
		const rolls = rollsToPlace || this.oRolls.rolls;
		
		if (!rolls || rolls.length === 0) return false;	

        const startTime = performance.now();
		
		
        let placedCount = 0;
        
		if (0) { // Дипс новый придумал но не допилил
			
			
			// 2. Предварительная сортировка рулонов
			const sortedRolls = this.sortRollsForPacking(rolls);
			console.log('---------------- async optimizedPlacementAsync')
			console.log(this)
			console.log(sortedRolls)
			console.log(rolls)
			// 3. Основной цикл упаковки
			for (const roll of sortedRolls) {
				if (!this.canFitRoll(roll)) {
					this.addUnplacedRoll(roll, "Превышение лимитов ТС");
					continue;
				}
				
				// 4. Поиск оптимальной позиции
				const bestPosition = this.findOptimalPosition(roll);
				
				if (bestPosition) {
					this.placeRoll(roll, bestPosition);
					placedCount++;
					
					// 5. Балансировка после каждого 5-го рулона
					if (placedCount % 30 === 0) {
						this.balanceCurrentLoad();
					}
				} else {
					this.addUnplacedRoll(roll, "Нет позиций");
				}
			}
			
			// 6. Финальная оптимизация
			this.finalizePlacement();
        
		} else 
			this.optimizedPlacement(); // моя упаковкка
		
        console.log(`Упаковка завершена за ${(performance.now() - startTime).toFixed(2)} мс`);
        return {
            placed: placedCount,
            unplaced: this.unplacedRolls
        };
    }

	optimizedPlacement(StartX=0) {
		console.log('=====optimizedPlacement by x '+StartX)
		//console.log(this.oRolls)
		//this.clearParam();
		this.Dfist = this.oRolls.D;	

		//предрасчёт позиций для набора диаметров с соблюдением пропроции в наборе руллов
		this.precalculatePositionsRolls(StartX);// расчет порядка растановки (жадный алгоритм вокруг оптимально центра, с учетом смещения вызванного дисбалансом веса загрузки)
		this.optimizeBalance();

		//растановка рулонов по позициям
		//const setRolls = new Set(this.rolls);	console.log(setRolls)
		//const oRolls =  //(r => !setRolls.has(r));	
		//console.log(oRolls)
		for (const Roll of this.oRolls.rolls.filter(roll => !this.rolls.some(r => r.id === roll.id)) ) { // для еще не размещенных
			this.findFreePosition(Roll);
		}
		if (document.getElementById('CrossStyle').checked && this.gateTypeCenter)	this.compactRollsInRange((this.L/2 - this.T), (this.L/2 + this.T)); // уплотняем
		this.totalLoaded = this.rolls.length; // сколько загружено	
		console.log(this.totalLoaded)
	}
   
    // Вспомогательные методы:

    sortRollsForPacking(rolls) {
        /**
         * Сортировка рулонов по приоритету упаковки:
         * 1. Более тяжелые рулоны
         * 2. Рулоны большего диаметра
         * 3. Рулоны с нечетными диаметрами (для лучшего заполнения пространства)
         */
        return [...rolls].sort((a, b) => {
            // Приоритет по весу
            const weightDiff = b.W - a.W;
            if (weightDiff !== 0) return weightDiff;
            
            // Затем по диаметру
            const diameterDiff = b.D - a.D;
            if (diameterDiff !== 0) return diameterDiff;
            
            // Нечетные диаметры имеют приоритет
            return (b.D % 2) - (a.D % 2);
        });
    }

    findOptimalPosition(roll) {
        /**
         * Поиск оптимальной позиции для рулона с учетом:
         * - Центра масс
         * - Существующих рулонов
         * - Ограничений ТСа
         */
        const candidates = [];
        
        
        // Вариант 2: Возле центра масс
        candidates.push(this.generateCenterPosition(roll));
        
        // Вариант 3: Возле рулонов такого же диаметра
        candidates.push(...this.generateClusterPositions(roll));

        // Вариант 1: Возле двери (если есть место)
        if (this.remainingCapacity('weight') > roll.W * 1.5) {
            candidates.push(this.generateDoorPosition(roll));
        }
        
        // Выбираем лучшую позицию
        return candidates
            .filter(pos => this.isPositionValid(pos, roll))
            .sort((a, b) => this.scorePosition(a) - this.scorePosition(b))[0];
    }

    generateDoorPosition(roll) {
        // Позиция у двери с отступом minCMDoor
        return {
            x: this.L - (this.gateTypeCenter ? 0 : this.minCMDoor) - roll.D/2,
            y: this.T/2,
            s: findAvailableLayer(this.L - (this.gateTypeCenter ? 0 : this.minCMDoor), this.T/2, roll)
        };
    }

    generateCenterPosition(roll) {
        // Позиция с учетом текущего центра масс
        const centerX = this.centerOfMass.x;
        const centerY = this.centerOfMass.y;
        
        return {
            x: centerX + (Math.random() - 0.5) * this.maxCML,
            y: centerY + (Math.random() - 0.5) * this.maxCMT,
            s: findAvailableLayer(centerX, centerY, roll)
        };
    }

    generateClusterPositions(roll) {
        // Поиск рулонов с таким же диаметром
        const sameDiameterRolls = this.rolls.filter(r => r.D === roll.D);
        if (sameDiameterRolls.length === 0) return [];
        
        // Генерация позиций вокруг каждого "кластера"
        return sameDiameterRolls.flatMap(clusterRoll => {
            const angle = Math.random() * Math.PI * 2;
            const distance = clusterRoll.D * (0.8 + Math.random() * 0.4);
            
            return [
                {
                    x: clusterRoll.x + Math.cos(angle) * distance,
                    y: clusterRoll.y + Math.sin(angle) * distance,
                    s: findAvailableLayer(clusterRoll.x, clusterRoll.y, roll)
                },
                // Симметричная позиция
                {
                    x: clusterRoll.x - Math.cos(angle) * distance,
                    y: clusterRoll.y - Math.sin(angle) * distance,
                    s: findAvailableLayer(clusterRoll.x, clusterRoll.y, roll)
                }
            ];
        });
    }

    isPositionValid(pos, roll) {
        // Проверка границ ТСа
        if (pos.x - roll.D/2 < 0 || pos.x + roll.D/2 > this.L) return false;
        if (pos.y - roll.D/2 < 0 || pos.y + roll.D/2 > this.T) return false;
        
        // Проверка пересечений с другими рулонами
        return !this.rolls.some(existingRoll => {
            const dx = existingRoll.x - pos.x;
            const dy = existingRoll.y - pos.y;
            const minDistance = (existingRoll.D + roll.D) / 2;
            return dx*dx + dy*dy < minDistance*minDistance;
        });
    }

    scorePosition(pos) {
        /**
         * Оценка позиции по:
         * 1. Близости к текущему центру масс
         * 2. Удаленности от двери
         * 3. Заполненности слоя
         */
        const massDist = Math.sqrt(
            Math.pow(pos.x - this.centerOfMass.x, 2) +
            Math.pow(pos.y - this.centerOfMass.y, 2)
        );
        
        const doorDist = this.L - pos.x;
        const layerPenalty = pos.s * 10; // Предпочтение нижним слоям
        
        return massDist + (doorDist * 0.5) + layerPenalty;
    }

    placeRoll(roll, position) {
        // Расчет высоты с учетом слоев
        let z = 0;
        for (const r of this.rolls) {
            if (Math.abs(r.x - position.x) < 0.1 && 
                Math.abs(r.y - position.y) < 0.1) {
                z += r.H;
            }
        }
        
        // Установка параметров рулона
        roll.x = position.x;
        roll.y = position.y;
        roll.z = z + roll.H/2;
        roll.s = position.s;
        roll.row = this.currentRow;
        
        this.addRoll(roll);
        this.updateCenterOfMass();
    }

    balanceCurrentLoad() {
        // Балансировка только что размещенных рулонов
        const recentRolls = this.rolls.slice(-5);
        
        for (const roll of recentRolls) {
            // Попробовать переместить рулон для улучшения баланса
            const newX = this.centerOfMass.x + (this.centerOfMass.x - roll.x) * 0.3;
            const newY = this.centerOfMass.y + (this.centerOfMass.y - roll.y) * 0.3;
            
            if (this.isPositionValid({x: newX, y: newY, s: roll.s}, roll)) {
                roll.x = newX;
                roll.y = newY;
            }
        }
        
        this.updateCenterOfMass();
    }

    finalizePlacement() {
        // 1. Оптимизация слоев
        this.optimizeLayers();
        
        // 2. Фиксация позиций для слайдера
        this.rolls.forEach(roll => {
            originalRollPositions.set(roll.id, {
                x: roll.x,
                y: roll.y,
                containerIndex: this.trainIndex
            });
        });
        
        // 3. Проверка ограничений
        this.validateConstraints();
    }

    optimizeLayers() {
        // Перераспределение рулонов между слоями
        const layers = {};
        
        // Группировка по позициям (x,y)
        this.rolls.forEach(roll => {
            const posKey = `${roll.x.toFixed(1)},${roll.y.toFixed(1)}`;
            if (!layers[posKey]) layers[posKey] = [];
            layers[posKey].push(roll);
        });
        
        // Оптимизация высоты в каждой позиции
        Object.values(layers).forEach(rolls => {
            // Сортировка по весу (тяжелые вниз)
            rolls.sort((a, b) => b.W - a.W);
            
            // Пересчет высот
            let currentZ = 0;
            rolls.forEach((roll, i) => {
                roll.z = currentZ + roll.H/2;
                roll.s = i + 1;
                currentZ += roll.H;
            });
        });
    }
	
	validateConstraints() {
        const violations = [];
        
        // Проверка центра масс
        const dx = Math.abs(this.centerOfMass.x - this.centerX);
        const dy = Math.abs(this.centerOfMass.y - this.centerY);
        
        if (dx > this.maxCML) {
            violations.push(`Центр масс по длине превышен на ${(dx - this.maxCML).toFixed(1)} см`);
        }
        
        if (dy > this.maxCMT) {
            violations.push(`Центр масс по ширине превышен на ${(dy - this.maxCMT).toFixed(1)} см`);
        }
        
        // Проверка весовых ограничений
        if (this.totalW > this.maxW) {
            violations.push(`Превышен максимальный вес на ${(this.totalW - this.maxW).toFixed(1)} кг`);
        }
        
        if (violations.length > 0) {
            console.warn("Нарушения ограничений:", violations);
        }
    }
	
	addRoll(roll) {
		this.rolls.push(roll);
		return roll; // Возвращаем сам рулон вместо стека
	}
	existSomeCross(arrPos,pos){ // есть хотя бы с одним пересечение
		return arrPos.some(p => DivCentrRoll(p,pos) > mm);
	}
	existSomeCrossRoll(arr,pos){ // есть хотя бы с одним пересечение
		return arr.some(p => p.s === pos.s && DivCentrRoll(p,pos) > mm); // Dist(p,pos) > mm
	}
	pushOnlyGood(C){ // в границах и нет хотя бы с одним пересечение
		if ( C && C.y >= this.oRolls.R && C.y <= this.T - this.oRolls.R && // внутри
				(this.gateTypeCenter ? // дверь в центре
					C.x <= this.L/2 - this.T/4	|| 
					C.x >= this.L/2 + this.T/4	||
					C.y <= this.T - this.minCMDoor - this.oRolls.R 
					: // дверь с краю
					C.x >= this.oRolls.R && C.x <= this.L - this.minCMDoor - this.oRolls.R 	) ) {
			if (! this.existSomeCross(this.Positions.filter(p =>  p.s===C.s && p.x > this.current_X - this.oRolls.D*2), C) ) { // нет пересечений с приняттыми поз.
				return true;
			}else{
				this.unplacedPositions.push({
					id: -(this.unplacedPositions.length + 1),
					x: C.x,
					y: C.y,
					z: 0,
					dim: 0,
					s: 0,
					row: this.rowNumber,
					D: C.D,
					R: C.D/2,
					H: '!',
					used: false,
					branchType: '?'
				});
				//console.log( this.Positions.filter(p => ( p.s===C.s && p.x > this.current_X - this.oRolls.D*2 ) ) )
			} 
		} 
		// console.log(C)
		// console.log('xxxxx')
		return false;
	}

   // метод предрасчета позиций начиная с параметра
    precalculatePositionsRolls(startX = 0) {
        this.rowNumber = startX === 0 ? 0 : 20;
        this.oRolls.nextD(0);
		this.current_X = startX ? startX : this.oRolls.R;
		const MAX_ROWS = 1000//3*this.L/this.oRolls.Dmin; // Защита от бесконечного цикла
		const startTime = Date.now();
		const MAX_TIME_MS = 5000; // Макс. время выполнения (5 сек)
		this.prio =	this.oRolls.D < this.T * 94/265 || Math.random() < 0.1  ? 0.05 : 0.95; // приоритетный вариант // только для узких рулонов (менее половины ширины ТС)
        while (this.current_X <= (this.gateTypeCenter ?  this.L/2 - this.T/4 :  this.L - this.oRolls.R - this.minCMDoor) ) {// Разделяем расчет для разных типов ТС
			
			this.rowPositions = [];//console.log('-row-'+this.rowNumber+'-x-'+this.current_X)
			let direction = this.rowNumber % 2 === 0 ? 1 : -1; // напрявление выкладывания четных рядов
			let start_Y = direction < 0 ? this.T - this.oRolls.R : this.oRolls.R;
			let leftPos = [];
			// Собираем возможные позиции для ряда
			if (this.rowNumber === 0) {	// Первый ряд - базовое заполнение
				this.rowPositions = this.generateFirstRow(start_Y, direction);//console.log(this.rowPositions)
			} else {
				const prevPositions = this.Positions.filter(p => p.x > this.current_X - this.oRolls.D);//console.log(this.oRolls.D)
				leftPos = this.calculatePositions(prevPositions, start_Y, direction); // змейкой скользим по пересечения кругов, начиная от краев поочереди
				if (this.rowPositions.length < this.T / this.oRolls.D) { //Проверка позиций между соседними рулонами если ряд не заполнен
					leftPos.push(...this.calculateBetweenPositions(prevPositions, direction));
				}	
				this.rowPositions.push(...leftPos);// Варианты между рулонами
				
  				// Случайное перемешивание с приоритетом
				this.rowPositions.sort((a, b) => (b.priority - a.priority) || (Math.random() < 0.2));
			}
			//Фильтруем позиции на валидность
			let validPositions = [];
			for (const pos of this.rowPositions) {
				if (this.pushOnlyGood(pos)) {
					validPositions.push(pos);
					if (validPositions.length >= 10) {// Лимит вариантов на ряд	
						console.log('пtребор в позиций ряду '+validPositions.length);
						break;
					}	
				}
			}
				
			//Обновляем current_X по добавленным позициям
			if (validPositions.length > 0) {
				this.current_X = Math.min(...validPositions.map(p => p.x)) + mm; 
			} else {
				this.current_X += this.oRolls.D * 0.866; // Фиксированный шаг если нет вариантов
			}
		   
			if (!this.gateTypeCenter && this.current_X < this.minDimX + this.oRolls.R && this.minDimX <= 2*this.minCMDoor ) {
				// не у вагона сдвигаем центр начала размещения, для компенсации пустого места у двери	
				this.current_X = this.minDimX + this.oRolls.R;//console.log(this.minDimX)
			}
		   
			//Добавляем валидные позиции в общий массив
			this.addValidPositions(validPositions);//console.log(this.Positions)
			
			//Выбираем диаметр для следующего ряда
			const progress = Math.min(1, (this.current_X - this.oRolls.R) / (this.L - (this.gateTypeCenter ? 0 : this.minCMDoor) - this.oRolls.R));
			this.oRolls.nextD(progress);
			this.rowNumber++;
			if (this.rowNumber >= MAX_ROWS) {
				console.warn(`Превышено максимальное количество рядов (${MAX_ROWS})`);
				break;
			}
			if (Date.now() - startTime > MAX_TIME_MS){
				console.warn(`Превышено время на формирование рядов (${MAX_TIME_MS})`);
				break;
			}	
		}
		if (this.gateTypeCenter){ //Центральные двери
			const centerPositions = [];
			for (const pos of this.Positions.map(p => ({...p, x:this.L - p.x, y:this.T - p.y})) ) { //
				if ( pos.x >= this.L/2 + this.T ) { // без повторный проверок...	
					this.Positions.push({	
						id: this.Positions.length + 1,
						branchType: pos.type,
						x: pos.x,
						y: pos.y,
						z: 0,
						dim: 0,
						s: pos.s,
						row: -pos.row,
						D: pos.D,
						R: pos.D/2,
						used: false
					});
					this.oRolls.Dgroups[pos.D].used++;
					this.oRolls.Dused++;
				} else { // уже обычно с проверками && this.pushOnlyGood(pos)
					centerPositions.push({...pos, y: this.T - pos.y}); // сим. по Y
					centerPositions.push(pos);// в центре добавим поз. сим. по Y,X
 					centerPositions.push({...pos, y: pos.R}); // край по Y
					// console.log('_x_')
					// console.log(pos.x)
					// console.log(this.L/2 + this.T/2 - pos.R)
				}
			}
			if (centerPositions.length > 0) {
				// Случайное перемешивание с приоритетом
				centerPositions.sort((a, b) => (Math.random() < 0.5));
				this.addValidPositions(centerPositions, false );//console.log(centerPositions)
			}	
			
		}
		console.log(this.Positions)
    }

	// Сортировка позиций по близости к центру
	optimizeBalance() {
		const currentDeviation = this.calculateCurrentDeviation();
		this.DimX -= currentDeviation.x;
		this.DimY -= currentDeviation.y;
		// просчет оптимально центра масс для размещения от него тяжелых
		for ( const pos of this.Positions) {
			if (this.gateTypeCenter) {	// Расстояние до ближайшего края (не центра!)
				const distToEdge = Math.min(
					Math.abs(pos.x - this.oRolls.R), 
					Math.abs(pos.x - (this.L - this.oRolls.R))
				);
				// Приоритет - сначала дальние от центра позиции
				pos.dim = (pos.s - 1) * this.L - distToEdge;
			} else {
				pos.dim = (pos.s-1) * this.L + DistCentr(pos.x,	this.L/2 + this.DimX,	pos.y,	this.T /2 + this.DimY);// сначало первые уровень * важность + смещения дисбаланса кг
			}
		}	
		// смысл: начиная от центра ТСа равномерно по весу укладываем + смещаем ближе к двери учитывая заданный от нее отстут для компенсации смещения из-за этого центра масс
		this.Positions.sort((a, b) =>  ( a.dim - b.dim ));
		// нумерация по сортировке
		let id = 0;
		for (const position of this.Positions) position.id = ++id;
	}

	// первый ряд
	generateFirstRow(start_Y, direction) {
		const positions = [];
		const random = Math.random();					
		const for2roll = this.T > 2*this.oRolls.D && this.T < 3*this.oRolls.D;	
		for (let y = ( for2roll && random < 0.1 ? this.T/2 : start_Y ) ; 
			 y >= this.oRolls.R && y <= this.T - this.oRolls.R; 
			 y += direction * ( for2roll && random > 0.9 ? this.T-this.oRolls.D : this.oRolls.D) ) {
			positions.push({
				type: 'first',
				priority: 1,
				x: this.current_X, // Math.max(this.current_X, this.minDimX + this.oRolls.R), // Добавлена проверка упора в стену
				y: y,
				D: this.oRolls.D,
				R: this.oRolls.R,
				s: 0
			});
			// Симметричная позиция
			this.unplacedPositions.push({
				id: -(this.unplacedPositions.length + 1),
				x: this.current_X,
				y: this.T - start_Y - direction * this.oRolls.D,
				z: 0,
				dim: 0,
				s: 0,
				row: this.rowNumber,
				D: this.oRolls.D,
				R: this.oRolls.D/2,
				H: '',
				used: false,
				type: 'first_row',
			});
		}
		if(for2roll) {
			this.unplacedPositions.push({
				id: -(this.unplacedPositions.length + 1),
				x: this.current_X,
				y: start_Y + direction * this.oRolls.D,
				z: 0,
				dim: 0,
				s: 0,
				row: this.rowNumber,
				D: this.oRolls.D,
				R: this.oRolls.D/2,
				H: '',
				used: false,
				type: 'first',
			});
			this.unplacedPositions.push({
				id: -(this.unplacedPositions.length + 1),
				x: this.current_X,
				y: this.T/2,
				z: 0,
				dim: 0,
				s: 0,
				row: this.rowNumber,
				D: this.oRolls.D,
				R: this.oRolls.D/2,
				H: '',
				used: false,
				type: 'first',
			});
			this.unplacedPositions.push({
				id: -(this.unplacedPositions.length + 1),
				x: this.current_X,
				y: start_Y + direction * (this.T-this.oRolls.D),
				z: 0,
				dim: 0,
				s: 0,
				row: this.rowNumber,
				D: this.oRolls.D,
				R: this.oRolls.D/2,
				H: '',
				used: false,
				type: 'first',
			});
		}
		return positions;
	}
	// ряд от стенки ТС
	calculateWallPositions(prevPos, start_Y, direction) {
		const positions = [];
		if (prevPos.length === 0) { return positions; }	//;	this.generateFirstRow(start_Y, direction)}; //positions;	
		var new_X = this.current_X;
		for (const p of prevPos.filter(p => Math.abs(p.y - start_Y) < (p.R + this.oRolls.R) ) ) { 									// из  ближние к стенке
			new_X = Math.max(new_X, p.x + divXCentrRoll(p, { R: this.oRolls.R, y:start_Y}) ); //Math.sqrt( (p.R + this.oRolls.R)**2 - (p.y - start_Y)**2 ) );	// ближний к двери
		}	
		if (new_X >= this.current_X) 
		for (let y = start_Y; 
			 y >= this.oRolls.R && y <= this.T - this.oRolls.R; 
			 y += direction * this.oRolls.D) {
			positions.push({
				type: 'wall',
				priority: this.prio,  
				x: new_X,
				y: y,
				D: this.oRolls.D,
				R: this.oRolls.R,
				s: 0
			});

			// Симметричная позиция
			positions.push({
				type: 'wall_sym',
				priority: 0.0001,
				x: new_X,
				y: this.T - y,
				D: this.oRolls.D,
				R: this.oRolls.R,
				s: 0
			});

		}
		return positions;
	}
	// между двумя сосоедними рулонами
	calculateBetweenPositions(prevPos, direction) {
		const positions = [];
		if (prevPos.length > 1 ) { 
			for (let i = 0; i < prevPos.length - 1; i++) {
				const A = direction < 0 ? prevPos[i] : prevPos[prevPos.length - 1 - i];
				const B = direction < 0 ? prevPos[i + 1] : prevPos[prevPos.length - 2 - i];
				if (A.y === B.y) continue;  // пропускаем, если на одной высоте
				let center = findCenterRollFromRolls(A, B, this.oRolls.D);
				if (center && Math.abs(center.x-this.current_X) < this.oRolls.R*0.866 + mm) {
					positions.push({
						type: 'между',
						priority: (1 - this.prio),
						x: center.x,
						y: center.y,
						D: this.oRolls.D,
						R: this.oRolls.R,
						s: 1,
						inter: [A, B]
					});
				}
			}
		}
		return positions;
	}
	// ряд от стенки ТС и межд рулонамиу
	calculatePositions(prevPos, start_Y, direction) {
		const positions = [];
		if (prevPos.length === 0) return positions;
		//1. Оптимизированная проверка позиций у стенки
		let base_X = this.current_X; 
		let last_pos;
		let cur_pos;
		// Находим максимальный X, чтобы не пересекаться с предыдущими рулонами
		for (const p of prevPos.filter(p => Math.abs(p.y - start_Y) < (p.R + this.oRolls.R))) {
			base_X = Math.max(base_X, p.x + divXCentrRoll(p, {R:this.oRolls.R, y:start_Y}) ); // Math.sqrt((p.R + this.oRolls.R) ** 2 - (p.y - start_Y) ** 2));
		}

		// Генерируем рулоны у стенки и корректируем X для каждого
		for (let y = start_Y; 
			 y >= this.oRolls.R && y <= this.T - this.oRolls.R; 
			 y += direction * this.oRolls.D) {
			if (y === start_Y) {
				last_pos = { // у стенки просто берем него начинаем строить впритык от соседей
						type: 'у стенки',
						priority: this.prio,
						x: base_X,
						y: y,
						D: this.oRolls.D,
						R: this.oRolls.R,
						s: 1
					};
				positions.push(last_pos); 
			} else {
				// Оптимизация: перемещаем вокруг последнего last_pos, пока рулон не коснётся ближайших соседей
				const cur_prevPos = prevPos.filter(p => Math.abs(p.y - y) < (p.R + this.oRolls.R) + mm);//console.log(cur_prevPos)
				cur_pos=null; //текущяя найденная позиция 
				for (const p of cur_prevPos) { // в R-полосе по Y по X на растоянии R+R от каждого
					const C = findCenterRollFromRolls(last_pos, p, this.oRolls.D); // находим первое персечение
					if (C) {
						cur_pos = {
							type: 'около последнего',
							priority: this.prio,
							x: C.x,
							y: C.y,
							D: this.oRolls.D,
							R: this.oRolls.R,
							s: 1,
							inter: [last_pos, p]
						};
						positions.push(cur_pos); 
					}
				}
				if(cur_pos) last_pos = cur_pos; //последняя найденная позиция, вокруг нее след.поиски в этом цикле 
			}		
		}

		return positions;
	}
	// есть два контакта у позиции
	exist2Contact(pos) {
		if (this.Positions.length === 0 )	return true; // не позиций допускается 
		let contactPoints = 0  //касания
		if (pos.x - pos.R <= mm || pos.x + pos.R >= this.L - (this.gateTypeCenter ? 0 : this.minCMDoor) - mm ) { 
			if (pos.y === this.T/2) { //крайний по центру допускается 
				return true;
			}	
			contactPoints++;				
		}	
		if (pos.y - pos.R <= mm || pos.y + pos.R >= this.T - mm) contactPoints++;
		let xmin = pos.x - pos.R - mm;	
		let xmax = pos.x + pos.R + mm;	
		const posRoll = this.Positions.filter(p => (p.x > xmin - p.R && p.x < xmax + p.R) ); // в пределах суммы их радиусов достаточно проверить
		for (const p of posRoll ) { //рулонов около по ширине
			if (Math.abs( DivCentrRoll(p, pos) ) <= mm) { // точное касание
				contactPoints++; 	
				if (contactPoints > 1 ) return true; //else  console.log(posRoll)
			}
		}
		return (contactPoints > 1 );
	}
	// Уплотняет рулоны в заданном диапазоне по X, смещая их до упора в стенки или соседние рулоны
	compactRollsInRange(startX, endX) {
		// 1. Получаем все рулоны в диапазоне и сортируем по Y (снизу вверх)
		const rollsInRange = this.rolls.filter(roll => 
			roll.x >= startX && roll.x <= endX //&& ! this.exist2Contact(roll)
		).sort((a, b) => a.y - b.y);

		// 2. Группируем рулоны по стопкам (одинаковые x,y)
		const positionGroups = {};
		rollsInRange.forEach(roll => {
			const posKey = `${roll.x.toFixed(1)},${roll.y.toFixed(1)}`;
			if (!positionGroups[posKey]) positionGroups[posKey] = [];
			const exist = this.exist2Contact(roll);//console.log(''+roll.id+' 2c:'+exist)
			if (!exist) positionGroups[posKey].push(roll);
			
		});

		// 3. Уплотнение для каждой группы
		Object.values(positionGroups).forEach(rollsInPos => {
			if (rollsInPos.length === 0) return;
			const baseRoll = rollsInPos[0];
			
			// 4. Сначала смещаем по Y вниз (к 0)
			let newY = baseRoll.R; // Минимально возможный Y (чтобы не выйти за границу)
			let newX = baseRoll.x;
			
			// Находим всех соседей снизу
			const bottomNeighbors = this.rolls.filter(r => 
				r.y < baseRoll.y && 
				Math.abs(r.x - baseRoll.x) < r.R + baseRoll.R + mm
			);
			
			if (bottomNeighbors.length > 0) {
				// Максимальный Y, при котором будет касание соседа снизу
				newY = Math.max(...bottomNeighbors.map(r => 
					r.y + Math.sqrt((r.R + baseRoll.R)**2 - (r.x - baseRoll.x)**2)
				));
			}
			
			// 5. Проверяем 2 контакта после смещения по Y
			let contacts = bottomNeighbors.length;
			if (newY - baseRoll.R <= mm) contacts++; // Касание нижней стенки
			
			// Если после смещения по Y нет 2 контактов - откатываем
			if (contacts < 2) newY = baseRoll.y;
			
			// 6. Затем смещаем по X влево (к 0)
			newX = Math.max(baseRoll.R, this.minDimX);
			
			// Находим всех соседей слева
			const leftNeighbors = this.rolls.filter(r => 
				r.x < baseRoll.x && 
				Math.abs(r.y - newY) < r.R + baseRoll.R + mm
			);
			
			if (leftNeighbors.length > 0) {
				// Максимальный X, при котором будет касание соседа слева
				newX = Math.max(...leftNeighbors.map(r => 
					r.x + Math.sqrt((r.R + baseRoll.R)**2 - (r.y - newY)**2)
				));
			}
			
			// 7. Проверяем 2 контакта после смещения по X
			contacts = leftNeighbors.length;
			if (newX - baseRoll.R <= mm) contacts++; // Касание левой стенки
			if (newY - baseRoll.R <= mm || newY + baseRoll.R >= this.T - mm) contacts++; // Касание стенок по Y
			
			// Если после смещения по X нет 2 контактов - откатываем
			if (contacts < 2) newX = baseRoll.x;
			
			// 8. Применяем изменения, если позиция изменилась
			if (newX && newY && (newX !== baseRoll.x || newY !== baseRoll.y)) {	
				console.log(' x '+newX+' у '+newY)
				rollsInPos.forEach(roll => {
					roll.x = newX;
					roll.y = newY;
				});
			}
		});

		// 9. Обновляем центр масс
		this.updateCenterOfMass();
		console.log("Уплотнение завершено в диапазоне X:", startX, "-", endX);
	}
	//добавь правильную поз.
	addValidPositions(Positions, check2Contact = true ) {
		for (const pos of Positions) {
			if ( !check2Contact || this.exist2Contact(pos) ) {
				if ( ! this.existSomeCross( this.Positions.filter(p =>(p.x >= pos.x - (this.oRolls.R + pos.R) - mm ) 
																	&&(p.x <= pos.x + (this.oRolls.R + pos.R) + mm )
																)
											, pos )) {
					for (let s = 1; s <= 3; s++) {
						this.Positions.push({	
							id: this.Positions.length + 1,
							branchType: pos.type,
							x: pos.x,
							y: pos.y,
							z: 0,
							dim: 0,
							s: s,
							row: this.rowNumber,
							D: pos.D,
							R: pos.D/2,
							used: false
						});
					}
					this.oRolls.Dgroups[pos.D].used++;
					this.oRolls.Dused++;
				} //else 	console.log(pos)
			} //else 	console.log(pos)
		}
	}	
	
	optimizeBalanceSwaps() {
		const maxIterations = 10;
		const improvementThreshold = 0;
		this.swaps=[];
		for (let i = 0; i < maxIterations; i++) {
			const currentDeviation = this.calculateCurrentDeviation();
			if (	currentDeviation.x < this.maxCML
				&&	currentDeviation.y < this.maxCMT
				&&	Math.abs(this.backW  - this.frontW	) < this.maxKGL
				&&	Math.abs(this.rightW - this.leftW	) < this.maxKGT	) {
				break;
			}
			let bestSwap = null;
			let bestImprovement = improvementThreshold;
			for (let j = 0; j < this.rolls.length; j++) {
				if(this.swaps.indexOf(j)==-1)	//for (let k = j + 1; k < this.rolls.length; k++) {// порядок престановки прямой
				for (let k = this.rolls.length-1; k > j + 1; k--) { // обратный порядок
					if(this.swaps.indexOf(k)==-1) {
						this.swapRolls(j, k);
						const newDeviation = this.calculateCurrentDeviation();
						const improvement =
							Math.abs(currentDeviation.x - newDeviation.x) +
							Math.abs(currentDeviation.y - newDeviation.y) ;
						if (improvement > bestImprovement) {
							bestImprovement = improvement;
							bestSwap = { j, k };
						}
						this.swapRolls(j, k);
					}
				}
			}
			if (bestImprovement > improvementThreshold && bestSwap !== null) {
				this.swapRolls(bestSwap.j, bestSwap.k);
				this.swaps.push(bestSwap.j);//this.swaps.push(bestSwap.k);//console.log("best "+bestImprovement+"  "+bestSwap.j+' <->'+bestSwap.k );
			} else {
			   break;
			}
		}
	}
	updateCenterOfMass() { // пресчет центров масс груза
		let totalW = 0, cmX = 0, cmY = 0, cmZ = 0;
		this.leftW = 0;
		this.rightW = 0;
		this.frontW = 0;
		this.backW = 0;
		this.rolls.forEach(roll => {
			totalW += roll.W;
			cmX += roll.x * roll.W;
			cmY += roll.y * roll.W;
			cmZ += roll.z * roll.W;
			//расчёт масс половинок ТСа. Уточнено пропорционально площади сегмента разделенного по хорде серединой ТСа
			var kSegment = roll.y + roll.R <= this.centerY	?	1:	(roll.y - roll.R < this.centerY	?	calculateCircleSegment(this.centerY-(roll.y-roll.R), roll.R) : 0);
			this.leftW	+= roll.W * kSegment;
			this.rightW += roll.W * (1 - kSegment);
				kSegment = roll.x + roll.R <= this.centerX	?	1:	(roll.x - roll.R < this.centerX	?	calculateCircleSegment(this.centerX-(roll.x-roll.R), roll.R) : 0);
			this.frontW	+= roll.W * kSegment;
			this.backW	+= roll.W * (1 - kSegment);
		});
		if (totalW > 0) {
			this.centerOfMass = {
				x: cmX / totalW,
				y: cmY / totalW,
				z: cmZ / totalW
			};
		}
		this.totalW = totalW;
	}
	isPositionOccupied(x, y, s) {
		return this.rolls.some(roll => 
			Math.abs(roll.x - x) < mm && 
			Math.abs(roll.y - y) < mm &&
			roll.s === s
    );
}	
	swapRolls(index1, index2) {
		const roll1 = this.rolls[index1];
		const roll2 = this.rolls[index2];
		// Если один из стеков пуст, то ничего не делаем
		if (!roll1 || !roll2 || roll1.length === 0 || roll2.length === 0) return;
		// Сохраняем позиции
		const pos1 = { x: roll1.x, y: roll1.y, s: roll1.s };
		const pos2 = { x: roll2.x, y: roll2.y, s: roll2.s };
		// Перемещаем стек1 в позицию стек2
		this.moveRollToPosition(roll1, pos2);
		// Перемещаем стек2 в позицию стек1
		this.moveRollToPosition(roll2, pos1);
		// Меняем стеки местами в массиве rolls (чтобы порядок соответствовал новым позициям)
		this.rolls[index1] = roll2;
		this.rolls[index2] = roll1;
		this.updateCenterOfMass();
	}
	moveRollToPosition(roll, targetPos) {
		// Обновляем координаты всех рулонов в стеке
		let currentZ = 0;
		// Проверяем рулоны под текущей позицией (если слой > 0)
		if (targetPos.s > 1) {
			const lowerRolls = this.rolls.filter(pos =>
				pos.x === targetPos.x &&
				pos.y === targetPos.y &&
				pos.s < targetPos.s
			);
			currentZ = lowerRolls.reduce((sum, pos) => sum + pos.H, 0);
		}
		// Устанавливаем новые координаты
		roll.x = targetPos.x;
		roll.y = targetPos.y;
		roll.s = targetPos.s;
		roll.z = currentZ + roll.H / 2;//console.log(currentZ)
	}
	validateContainer() {
		// Проверяем, что нет пересечений
		this.rolls.forEach((roll1, i) => {
			this.rolls.slice(i+1).forEach(roll2 => {
				if (this.checkCollision(roll1, roll2)) {
					console.error(`Collision between ${roll1.id} and ${roll2.id}`);
				}
			});
		});
	}	
	calculateCurrentDeviation() {
		return {
			x: this.centerOfMass.x - this.centerX,
			y: this.centerOfMass.y - this.centerY
		};
	}
	// поиск свободного места
	findFreePosition(roll) {
		for (const position of this.Positions) {
			if (!position.used 	&& this.canPlaceRoll(position,roll)
			) {
				position.used = this.setPlaceRoll(roll, position);
				if (position.used) {
					position.z = roll.z;//console.log(roll.z);console.log('^^^^')
					return true;
				}	
			}
		}
		this.addUnplacedRoll(roll,"-");
		return false;
	}
	// Проверки размещения в позиции
	canPlaceRoll(position, roll) {
		const D = roll.D
		const R = roll.R
		const x = position.x
		const y = position.y
		const s = position.s
		// внутри ТСа:
		if (x - R < 0				|| x + R > this.L - (this.gateTypeCenter ? 0 : this.minCMDoor)	) return false // не в длине
		//if (x - R < this.minDimX	|| x + R > this.L - (this.gateTypeCenter ? 0 : this.minCMDoor)) return false		

		if (y - R < 0 || y + R > this.T	) return false // не в ширине
		// в высоте
		let currentZ = 0
		if (s > 1) {
			for (const pos of this.rolls) {
				if ( pos.s < s && pos.x === x && pos.y === y ) {
					currentZ += pos.H
				}
			}
		}
		if (currentZ + roll.H > this.H) return false// не в высоте
		if (position.D !== roll.D ) return false; // не по диаметру
		if (this.totalW + roll.W > this.maxW) {
			return false;// перевес
		}
		return true;
	}
	// размещения в позиции рулона
	setPlaceRoll(roll, position) {
		let currentZ = 0;
		if (position.s > 1) {
			for (const pos of this.rolls) {	
				if (pos.x === position.x && pos.y === position.y && pos.s < position.s ) {
					currentZ += pos.H;
				}
			}
		}
		roll.pId = position.id;
		roll.x = position.x;
		roll.y = position.y;
		roll.z = currentZ + roll.H / 2; // высота меняется	
		roll.s = position.s;
		roll.row = position.row;
		roll.dim = position.dim;
		this.totalW += roll.W;
		this.addRoll(roll);
		return true;
	}

	//Центровать рулон нужно с того края верхнего ряда который в дисбалансе продольном (если такой есть)
	swapRollCenter() {	
		const topS = Math.max(...this.rolls.map(r => r.s)); // Определяем верхний слой
		var topSRols = this.rolls.filter(r => r.s === topS).sort( (a,b) => a.x - b.x); // Рулоны верхнего слоя
		if (topSRols.length === 0) return; // Проверка на пустой массив
		const fistRoll = topSRols[0];		// Находим рулоны с максимальной и минимальной X-координатой
		const lastRoll = topSRols[topSRols.length-1];//console.log(this.maxKGT)
		//  Централизуем только если дисбаланс по ширине
		if (Math.abs(this.rightW - this.leftW) > this.maxKGT) {	
			const isLeftHeavy = this.leftW > this.rightW;//console.log(isLeftHeavy)
			const isFrontHeavy = this.frontW > this.backW;//console.log(isFrontHeavy)
			//Определяем край для коррекции (с учетом дисбаланса по X)
			var kDoor, // напрвлени от двери
				targetRoll, // целевой рулон у которого выбираем позицию
				sourceRoll, // исходный рулон для переноса
				targetX, 
				targetY = this.T/2; // целевая позиция
			if (Math.abs(this.frontW - this.backW) > this.maxKGL) { // дисб.вес по длинне
				sourceRoll = isFrontHeavy ? fistRoll : lastRoll; // нач.ТС тяжелее, преносим нач.рулон в конец
				targetRoll = isFrontHeavy ? lastRoll : fistRoll;	// в конец 
				kDoor	= 1; // увелич по Х
			}else{ // в начале просто сдиг по ширине
				sourceRoll = fistRoll;
				targetRoll = fistRoll;
				kDoor	= -1; // уменьшать по Х
			}; 
			console.log(sourceRoll.x + ' ------> '+targetRoll.x)	
			// Корректируем в сторону, противоположную дисбалансу
			if (isLeftHeavy) {
				// Если левая сторона тяжелее - смещаем вправо				
				targetY = Math.min(targetY + targetRoll.R/2, this.T - targetRoll.R); //  Math.min(targetY, this.T/2);
			} else {
				// Если правая сторона тяжелее - смещаем влево      
				targetY = Math.max(targetY - targetRoll.R/2, targetRoll.R); // было Math.max(targetY, this.T/2);
			}

			// Ищем точку на середине касающ. соседнего рулона в этом слое
			const rolls = topSRols.filter(r => r.id!==targetRoll.id && Math.abs(r.x-targetRoll.x)-mm < r.R+targetRoll.R).sort( (a,b) => kDoor*(b.x - a.x) );//console.log(rolls)	
			
			if(rolls.length > 0){

				const rollC = rolls[0];
				targetX = rollC.x + kDoor * divXCentrRoll( rollC, { R: targetRoll.R, y:targetY} );// как персечение линии и круга	
				if( targetX >= sourceRoll.R && targetX <= this.L - (this.gateTypeCenter ? 0 : this.minCMDoor) - sourceRoll.R ){ // в пределах ТС
					let maxLowerZ = 0;
					let maxLowerS = 0;
					// Ищем два соседних рулона в слое ниже возле targetX
					for (let s = topS-1; s >= 1; s--) {
						let lowerRolls = this.rolls.filter(r =>	r.s === s &&	Math.abs(r.x - targetX) < targetRoll.R + mm	).sort((a,b) => a.y - b.y);//console.log(lowerRolls)
						if (lowerRolls.length > 1) {
							// 3. Вычисляем новую позицию с учетом дисбаланса
							let rollA = lowerRolls[lowerRolls.length-2]; // предпоследний
							let rollB = lowerRolls[lowerRolls.length-1]; // последний
							maxLowerZ = Math.max(	rollA.z + rollA.H/2,	rollB.z + rollB.H/2);
							maxLowerS = s;
							break; 
						}					
					}	
					// 4. Полное обновление позиции (аналог для центра)
					const newPos = {		
						x: targetX,
						y: targetY,
						z: maxLowerZ + sourceRoll.H/2, // меняем высоту
						s: maxLowerS + 1, // меняем слой
						D: sourceRoll.D,
						R: sourceRoll.R
					};//console.log(newPos)
					if (!this.existSomeCrossRoll(rolls, newPos)) { //this.rolls
						//сдвиг 
						sourceRoll.x = newPos.x;
						sourceRoll.y = newPos.y; 
						sourceRoll.z = newPos.z; 
						sourceRoll.s = newPos.s;						
						topSRols = topSRols.filter(r => r.id !== sourceRoll.id) // убираем из рулонов для опускания
					}
				}	
			}	
		}
		for ( let i = 0; i < topSRols.length; i++ ) 
			if (i < 2 || i >= topSRols.length - 2) 
				this.swapRollDown( topSRols[i] ); //два первых и два последних меняем с нижним
	}
	swapRollDown(roll) { //поменять с нижним если разные форматы	
		for (const r of this.rolls.filter(pos => pos.x === roll.x && pos.y === roll.y && pos.s === roll.s-1 && pos.H !== roll.H  && pos.D === roll.D ) ) {
			const currentS = r.s;
			r.s = roll.s;
			roll.s = currentS;
			r.z += roll.H;
			roll.z -= r.H;
		};
	}
	calculateDoorDistance() { // Расстояние от рулона до задней стенки (x = L)
		if (this.rolls.length === 0) return Infinity;
		let minDistance = Infinity;
		for (const roll of this.rolls) {
			const distance = this.L - (roll.x + roll.D/2);
			if (distance < minDistance) {
				minDistance = distance;
			}
		}
		return minDistance;
	}
	
	remainingCapacity(type = 'weight') { /*		Расчет оставшейся вместимости ТСа
		@param {string} type - тип расчета: 'weight' (по весу) или 'volume' (по объему)
		@returns {number} - остаточная вместимость в кг (для веса) или см³ (для объема)	*/
        
        // 1. Расчет по весу (основной лимит)
        if (type === 'weight') {
            return Math.max(0, this.maxW - this.totalW);
        }
        
        // 2. Расчет по объему (дополнительная проверка)
        if (type === 'volume') {
            // Общий объем ТСа
            const totalVolume = this.L * this.T * this.H;
            
            // Занятый объем (сумма объемов всех рулонов)
            const usedVolume = this.rolls.reduce((sum, roll) => {
                // Объем рулона (цилиндр): πr²h
                const rollVolume = Math.PI * Math.pow(roll.D/2, 2) * roll.H;
                return sum + rollVolume;
            }, 0);
            
            return Math.max(0, totalVolume - usedVolume);
        }
        
        // 3. Расчет по "эффективному пространству" (комбинированный показатель)
        if (type === 'efficiency') {
            const weightCapacity = this.maxW - this.totalW;
            const volumeCapacity = this.remainingCapacity('volume');
            
            // Нормализуем показатели для сравнения
            const normalizedWeight = weightCapacity / this.maxW;
            const normalizedVolume = volumeCapacity / (this.L * this.T * this.H);
            
            // Возвращаем худший показатель (лимитирующий фактор)
            return Math.min(normalizedWeight, normalizedVolume);
        }
        
        throw new Error(`Unknown capacity type: ${type}`);
    }	
	canFitRoll(roll) {/* Проверяет, поместится ли рулон в ТС
        @param {Roll} roll - объект рулона
        @returns {boolean} - true если поместится по весу и габаритам     */
        return (
            roll.W <= this.remainingCapacity('weight') && // По весу
            roll.D <= Math.min(this.T, this.H) &&         // По диаметру (должен влезать в сечение)
            roll.H <= this.H                              // По высоте
        );
    }
    getFillPercentage() { // Возвращает процент заполнения по основному ограничению (весу)
        return (this.totalW / this.maxW) * 100;
    }
    getCriticalResource() {// Определяет, что является лимитирующим фактором @returns {string} - 'weight', 'volume' или 'space'
        const weightLeft = this.remainingCapacity('weight');
        const volumeLeft = this.remainingCapacity('volume');
        if (weightLeft <= volumeLeft) return 'weight';
        return 'volume';
    }
	
	findBestTransferCandidate(targetContainer, options = {}) {
        /**
         * Находит лучший кандидата для переброски в целевой ТС
         * @param {Container} targetContainer - ТС-получатель
         * @param {Object} options - параметры выбора
         * @param {boolean} options.preserveClusters - сохранять ли группировку по диаметрам
         * @returns {Roll|null} - найденный рулон или null
		preserveClusters (по умолчанию true):
		Если true, не будет выбирать рулоны, которые являются единственными своего диаметра
		Если false, разрешает разбивать кластеры для лучшей балансировки
		Порог улучшения:
		Кандидат возвращается только если общее улучшение > 0
		Можно настроить через изменение формулы в calculateTransferImprovement()		 
         */
        
        // 1. Проверка входных параметров
        if (!(targetContainer instanceof Container)) {
            console.error("Целевой ТС не валиден");
            return null;
        }

        // 2. Фильтрация рулонов, которые могут поместиться в целевой ТС
        const candidates = this.rolls.filter(roll => 
            targetContainer.canFitRoll(roll) &&
            (!options.preserveClusters || this.hasSameDiameterCluster(roll))
        );

        if (candidates.length === 0) {
            return null;
        }

        // 3. Расчет текущего дисбаланса
        const currentImbalance = this.calculateImbalanceWith(targetContainer);

        // 4. Поиск рулона, который максимально улучшит баланс
        let bestCandidate = null;
        let bestImprovement = -Infinity;

        for (const candidate of candidates) {
            // Моделируем переброску
            const improvement = this.calculateTransferImprovement(
                candidate, 
                targetContainer,
                currentImbalance
            );

            // Обновляем лучшего кандидата
            if (improvement > bestImprovement) {
                bestCandidate = candidate;
                bestImprovement = improvement;
            }
        }

        // 5. Проверка минимального порога улучшения
        return bestImprovement > 0 ? bestCandidate : null;
    }

    findBestTransferCandidate(targetContainer, options = {}) {
        if (!targetContainer || !this.oRolls) return null;
        
        // Сортируем рулоны по приоритету для переноса
        const candidates = this.oRolls.rolls
            .filter(roll => targetContainer.canFitRoll(roll))
            .sort((a, b) => {
                // Сначала рулоны, которые больше улучшат баланс
                const aImprovement = this.calculateTransferImprovement(a, targetContainer);
                const bImprovement = this.calculateTransferImprovement(b, targetContainer);
                return bImprovement - aImprovement;
            });
        
        return candidates.length > 0 ? candidates[0] : null;
    }
    // Вспомогательные методы:

    hasSameDiameterCluster(roll) {
        /**
         * Проверяет, есть ли в ТСе другие рулоны такого же диаметра
         * (чтобы не разбивать существующие кластеры)
         */
        return this.rolls.some(r => 
            r.id !== roll.id && 
            Math.abs(r.D - roll.D) < 5 // Допуск 5мм
        );
    }

    calculateImbalanceWith(targetContainer) {
        /**
         * Рассчитывает текущий дисбаланс между ТСами
         * @returns {Object} - {x: number, y: number} - векторы дисбаланса
         */
        return {
            x: this.centerOfMass.x - targetContainer.centerOfMass.x,
            y: this.centerOfMass.y - targetContainer.centerOfMass.y,
            weight: this.totalW - targetContainer.totalW
        };
    }

    calculateTransferImprovement(roll, targetContainer, currentImbalance) {
        /**
         * Рассчитывает насколько улучшится баланс при переброске рулона
         * @returns {number} - показатель улучшения (чем больше, тем лучше)
         */
        // 1. Моделируем новые центры масс
        const newSourceCM = this.calculateNewCenterOfMass(roll, true);
        const newTargetCM = targetContainer.calculateNewCenterOfMass(roll, false);

        // 2. Новый дисбаланс
        const newImbalance = {
            x: newSourceCM.x - newTargetCM.x,
            y: newSourceCM.y - newTargetCM.y,
            weight: (this.totalW - roll.W) - (targetContainer.totalW + roll.W)
        };

        // 3. Разница в дисбалансе (евклидова метрика)
        const currentDiff = Math.sqrt(
            Math.pow(currentImbalance.x, 2) + 
            Math.pow(currentImbalance.y, 2)
        );
        
        const newDiff = Math.sqrt(
            Math.pow(newImbalance.x, 2) + 
            Math.pow(newImbalance.y, 2)
        );

        // 4. Учет весового баланса
        const weightBalanceImprovement = 
            Math.abs(currentImbalance.weight) - Math.abs(newImbalance.weight);

        // 5. Комбинированный показатель улучшения
        return (currentDiff - newDiff) * 10 + weightBalanceImprovement;
    }

    calculateNewCenterOfMass(roll, isRemoval) {
        /**
         * Рассчитывает новый центр масс при добавлении/удалении рулона
         * @param {boolean} isRemoval - true если рулон удаляется
         */
        const weightChange = isRemoval ? -roll.W : roll.W;
        const newTotalWeight = this.totalW + weightChange;

        if (newTotalWeight <= 0) {
            return { x: this.L / 2, y: this.T / 2, z: this.H / 2 };
        }

        const x = (this.centerOfMass.x * this.totalW + 
                  (isRemoval ? -1 : 1) * roll.x * roll.W) / newTotalWeight;
                  
        const y = (this.centerOfMass.y * this.totalW + 
                  (isRemoval ? -1 : 1) * roll.y * roll.W) / newTotalWeight;
                  
        const z = (this.centerOfMass.z * this.totalW + 
                  (isRemoval ? -1 : 1) * roll.z * roll.W) / newTotalWeight;

        return { x, y, z };
    }

	findTwoClosestRolls(roll) {
        if (this.rolls.length < 2) return null;
        
        // Исключаем сам рулон и рулоны в других слоях
        const otherRolls = this.rolls.filter(r => 	
            r.id !== roll.id && 
            r.s === roll.s &&  // Только в том же слое
            (r.x !== roll.x || r.y !== roll.y) // С разными центрами
        );
        if (otherRolls.length < 2) return null;
        
        // Сортируем по расстоянию до целевого рулона
		otherRolls.sort((a, b) => DistCentrRoll(a, roll) - DistCentrRoll(b, roll));

		const candidates = otherRolls.slice(0, 3); // Берем 3 ближайших для проверки	
		let bestPair = null;
		let minTotalDistance = Infinity;
		for (let i = 0; i < candidates.length; i++) {
			for (let j = i + 1; j < candidates.length; j++) {
				const roll1 = candidates[i];
				const roll2 = candidates[j];

				// Проверка коллинеарности
				// const colines = Math.abs(
					// (roll1.x - roll.x) * (roll2.y - roll.y) - 
					// (roll1.y - roll.y) * (roll2.x - roll.x)
				// );console.log(colines)
				// if (colines <= mm) continue;	

				// Проверка расстояний до целевого рулона
				 const dist1 = DistCentrRoll(roll1, roll);
				 const dist2 = DistCentrRoll(roll2, roll);

				// Правильная проверка расстояния между рулонами
				const distBetween = DistCentrRoll(roll1, roll2);
				const minAllowedDist = (roll1.R + roll2.R - mm);
				console.log(minAllowedDist)
				const maxAllowedDist = (roll1.R + roll.D + roll2.R + mm);//	console.log(maxAllowedDist)

				if (distBetween < minAllowedDist || distBetween > maxAllowedDist) {
					continue;
				}

				const totalDistance = dist1 + dist2;
				if (totalDistance < minTotalDistance) {
					bestPair = [roll1, roll2];
					minTotalDistance = totalDistance;	console.log('min ======= '+minTotalDistance)
				}
			}
		}

		return bestPair; // Может вернуть null если нет подходящей пары
	}	
    snapRollToContacts(roll) {
		const rollsMove = [];
        const closestRolls = this.findTwoClosestRolls(roll);		console.log(closestRolls)
        if (!closestRolls || closestRolls.length < 2) return rollsMove;
        
        const [roll1, roll2] = closestRolls;
        
        // Находим возможные новые позиции
        const newPositions = findCircleIntersections( roll1.x, roll1.y, roll1.R+roll.R, roll2.x, roll2.y, roll2.R+roll.R );//console.log(newPositions)	
        if (!newPositions || newPositions.length === 0) return rollsMove;	
        
        // Выбираем позицию, которая:
        // 1. Находится внутри контейнера
        // 2. Не пересекается с другими рулонами
        // 3. Минимально удалена от текущей позиции
        let bestPos = null;
        let minDistance = Infinity;
        
        for (const pos of newPositions) {
            // Проверка границ контейнера
            if (pos.x - roll.R < 0 || pos.x + roll.R > this.L ||
                pos.y - roll.R < 0 || pos.y + roll.R > this.T) {
                continue;
            }
            // Проверка пересечений с другими рулонами
            let hasCollision = false;
            for (const otherRoll of this.rolls) {
                if (otherRoll.y === roll.y && otherRoll.x === roll.x || otherRoll.id === roll1.id || otherRoll.id === roll2.id) {
                    continue;
                }
                
                if (DistCentrRoll(otherRoll, {x: pos.x, y: pos.y}) < (otherRoll.D + roll.D)/2 - mm) {
                    hasCollision = true;
                    break;
                }
            }
            
            if (hasCollision) continue;
            
            // Выбираем ближайшую валидную позицию
            const distance = DistCentrRoll(roll, {x: pos.x, y: pos.y});
            if (distance < minDistance) {
                bestPos = pos;	console.log(pos)
                minDistance = distance;	console.log(distance)
            }
        }
        console.log(bestPos)
        if (bestPos) {	
			const rX = roll.x;
			const rY = roll.y;
			// Обновляем позицию рулона и стопки
            for (const steckRoll of this.rolls.filter(r =>  r.x === rX && r.y === rY) ) {
				steckRoll.x = bestPos.x;
				steckRoll.y = bestPos.y;
				rollsMove.push(steckRoll);
				console.log(steckRoll)
			}	
        }
        
        return rollsMove;
    }
} // конец класса Container

class Train { // Состав (цепочка) ТС
	constructor(containersParams) {
		this.containers = containersParams.map((params, index) => 
			new Container({
				...params,
				trainIndex: index,
				id: `train-container-${Date.now()}-${index}`
			})
		);
		this.unplacedRolls = [];
	}

	addContainer(params) {
        const newContainer = new Container({...params, trainIndex: this.containers.length});
        this.containers.push(newContainer);
        
        // Обновляем навигацию
        if (oContainerIndex === this.containers.length - 2) {
            oContainerIndex++;
        }
        showContainer();
    }
	
	removeContainer(index) {
        if (index < 0 || index >= this.containers.length) return;
        
        const containerToRemove = this.containers[index];
        
        // Переносим рулоны в другие контейнеры перед удалением
        this.redistributeRolls(containerToRemove);
        
        // Удаляем контейнер
        this.containers.splice(index, 1);
        
        // Обновляем индексы
        this.containers.forEach((c, i) => c.trainIndex = i);
    }

	totalWeight() {
		return this.containers.reduce((sum, c) => sum + c.totalW, 0);
	}

	optimizePair(containerA, containerB) {
        const candidate = containerA.findBestTransferCandidate(containerB);
        if (!candidate) return false;
        
        if (containerA.removeRoll(candidate)) {
            containerB.addRoll(candidate);
            console.log(`Перенесен рулон ${candidate.id} из ТС ${containerA.trainIndex} в ТС ${containerB.trainIndex}`);
            return true;
        }
        return false;
    }
  
    getContainerForRoll(roll) {
        /**
         * Находит лучший ТС для конкретного рулона
         * @returns {Container|null} - подходящий ТС или null
         */
        // 1. Проверяем ТСы с таким же диаметром
        for (const container of this.containers) {
            if (container.rolls.some(r => r.D === roll.D) && 
                container.canFitRoll(roll)) {
                return container;
            }
        }
        
        // 2. Ищем ТС с максимальным свободным местом
        return this.containers
            .filter(c => c.canFitRoll(roll))
            .sort((a, b) => b.remainingCapacity() - a.remainingCapacity())[0] || null;
    }

	balanceContainers() {
		for (let i = 0; i < this.containers.length - 1; i++) {
			for (let j = i + 1; j < this.containers.length; j++) {
				const source = this.containers[i];
				const target = this.containers[j];
				
				const candidate = source.findBestTransferCandidate(target, {
					preserveClusters: true
				});
				
				if (candidate) {
					source.removeRoll(candidate);
					target.addRoll(candidate);
					console.log(`Перемещен рулон ${candidate.id} из ${i} в ${j}`);
				}
			}
		}
	}

	balanceTrain() {
        // Сортируем контейнеры по загруженности
        const sortedContainers = [...this.containers].sort((a, b) => 
            b.totalW - a.totalW
        );
        
        // Балансируем между самым загруженным и самым пустым
        const mostLoaded = sortedContainers[0];
        const leastLoaded = sortedContainers[sortedContainers.length - 1];
        
        // Переносим до 3 рулонов за раз
        this.transferRollsToContainer(mostLoaded, leastLoaded, 3);
        
        // После переноса выполняем оптимизацию размещения
        this.containers.forEach(container => {
            container.optimizedPlacement();
        });

		// Балансировка веса между ТСами
/*		const avgWeight = this.totalWeight() / this.containers.length;
		
		// Перемещение рулонов между ТСами
		this.containers.forEach(container => {
		  if (container.totalW < avgWeight * 0.9) {
//			this.transferRollsToContainer(container);
		  }
		});
		
		for (let i = 0; i < this.containers.length - 1; i++) {
			for (let j = i + 1; j < this.containers.length; j++) {
				this.optimizePair(this.containers[i], this.containers[j]);
			}
		}
 */ 
	}

    transferRollsToContainer(source, target, maxTransfers = 3) {
		/*
		 * Перемещает рулоны из одного контейнера в другой
		 * @param {Container} source - исходный контейнер
		 * @param {Container} target - целевой контейнер
		 * @param {number} maxTransfers - максимальное количество рулонов для переноса
		 */
		if (!source || !target || source === target || !source.oRolls || !source.oRolls.rolls) return 0;
			
		let transferred = 0;
		
		// Сортируем рулоны по приоритету переноса
		const sortedRolls = [...source.oRolls.rolls]
			.sort((a, b) => b.W - a.W); // Сначала самые тяжелые
		
		for (const roll of sortedRolls) {
			if (transferred >= maxTransfers) break;
			
			if (target.canFitRoll(roll) && source.removeRoll(roll)) {
				target.addRoll(roll);
				transferred++;
			}
		}
		
		return transferred;
	}	
 
    distributeRolls(rolls) {
        /**
         * Распределяет рулоны между ТС цепочки с учетом:
         * - Баланса загрузки между ТС
         * - Группировки рулонов по диаметрам
         * - Оптимального заполнения каждого ТС
         */
        
        // 1. Подготовка данных
        const startTime = performance.now();
        let remainingRolls = [...rolls];
        this.unplacedRolls = [];
        
        // 2. Группировка рулонов по диаметрам (для минимизации разнообразия)
        const diameterGroups = this.groupRollsByDiameter(remainingRolls);	
        
        // 3. Распределение групп по ТС
        diameterGroups.forEach(group => {
            this.distributeGroup(group);
        });
        
        // 4. Логирование результатов
        console.log(`Распределение завершено за ${(performance.now() - startTime).toFixed(2)} мс`);
        console.log(`Результат: ${this.containers.map(c => c.rolls.length).join('|')} рулонов, ${this.unplacedRolls.length} не размещено`);
    }

    // Вспомогательные методы:
    groupRollsByDiameter(rolls) {
        /**
         * Группирует рулоны по диаметру с расчетом метаданных
         * @returns {Array} - массив групп в порядке приоритета распределения
         */
        const groupsMap = {};
        
        // Формирование групп
        rolls.forEach(roll => {
            if (!groupsMap[roll.D]) {
                groupsMap[roll.D] = {
                    diameter: roll.D,
                    rolls: [],
                    totalWeight: 0,
                    avgWeight: 0,
                    priority: 0
                };
            }
            groupsMap[roll.D].rolls.push(roll);
            groupsMap[roll.D].totalWeight += roll.W;
        });
        
        // Расчет приоритетов групп
        Object.values(groupsMap).forEach(group => {
            group.avgWeight = group.totalWeight / group.rolls.length;
            
            // Приоритет = (количество рулонов * средний вес) / диаметр
            group.priority = (group.rolls.length * group.avgWeight) / group.diameter;
        });
        
        // Сортировка групп по приоритету (наивысший первый)
        return Object.values(groupsMap).sort((a, b) => b.priority - a.priority);
    }

    distributeGroup(group) {
        /**
         * Распределяет рулоны одной группы по ТСам
         * @param {Object} group - группа рулонов одного диаметра
         */
        let remainingGroupRolls = [...group.rolls];
        
        // Стратегия распределения:
        // 1. Сначала заполняем ТСы, где уже есть такой диаметр
        this.fillExistingClusters(remainingGroupRolls, group.diameter);
        
        // 2. Затем распределяем в ТСы с наибольшим свободным местом
        this.fillByCapacity(remainingGroupRolls);
        
        // 3. Оставшиеся рулоны помещаем в unplacedRolls
        this.unplacedRolls.push(...remainingGroupRolls);
    }

    fillExistingClusters(rolls, diameter) {//Заполняет ТС, где уже есть рулоны этого диаметра
        for (let i = 0; i < this.containers.length && rolls.length > 0; i++) {
            const container = this.containers[i];
            
            // Если в ТСе уже есть такой диаметр
            if (container.rolls.some(r => r.D === diameter)) {
                // Берем самые тяжелые рулоны сначала
                rolls.sort((a, b) => b.W - a.W);
                
                for (let j = 0; j < rolls.length; j++) {
                    if (container.canFitRoll(rolls[j])) {
                        container.addRoll(rolls[j]);
						container.totalW += rolls[j].W;
                        rolls.splice(j, 1);
                        j--; // Корректировка индекса после удаления
                    }
                }
            }
        // пересоздаем обект руны к распр.
        }
		for (const container of this.containers) {
			if(container.rolls.length)
				container.oRolls = new Rolls(container.rolls);
		}	//console.log(this.containers)

    }

    fillByCapacity(rolls) {        //Распределяет рулоны по ТСам с учетом свободного места
        // Сортируем ТСы по убыванию свободного места
         const sortedContainers = [...this.containers].sort((a, b) => 
             b.remainingCapacity() - a.remainingCapacity()
         );

        // Распределяем рулоны в ТСы с наибольшим свободным местом
        for (const container of sortedContainers) {
            for (let i = 0; i < rolls.length; i++) {
                if (container.canFitRoll(rolls[i])) {
                    container.addRoll(rolls[i]);
					container.totalW += rolls[i].W;
                    rolls.splice(i, 1);
                    i--; // Корректировка индекса после удаления
                }
                
                if (rolls.length === 0) break;
            }
            
            if (rolls.length === 0) break;
        }
        // пересоздаем обект руны к распр.
		for (const container of this.containers) {
			if(container.rolls.length)
				container.oRolls = new Rolls(container.rolls);
		}	
		console.log(this.containers)
    }
   
    redistributeRolls(sourceContainer) {
		if (!sourceContainer.oRolls) return;
        
        const rollsToRedistribute = [...sourceContainer.oRolls.rolls];
        
        rollsToRedistribute.forEach(roll => {
            const targetContainer = this.containers.find(c => 
                c !== sourceContainer && c.canFitRoll(roll)
            );
            
            if (targetContainer) {
                sourceContainer.removeRoll(roll);
                targetContainer.addRoll(roll);
            } else {
                this.unplacedRolls.push(roll);
            }
        });
    }
	
	async optimizeLoading(rolls) {
				
		console.log('optimizeLoading')
		// 1. Создаем объект Rolls для всего набора
		const allRolls = new Rolls(rolls);
		
		// 2. Распределяем рулоны между контейнерами
		this.distributeRolls(allRolls.rolls);	
		
		// 3. Оптимизируем загрузку в каждом контейнере
		// await Promise.all(
			// this.containers.map(container => {
				// console.log(container)
				// container.optimizedPlacementAsync();
				// return container;
			// })
		// );
		
		//Оптимизируем каждый контейнер
		this.containers.forEach(container => {
			if (container.oRolls && container.oRolls.rolls.length > 0) {
				console.log(container)
				container.optimizedPlacementAsync();
			}
		});
		
		// Если есть неразмещенные рулоны, создаем новый контейнер
		if (this.unplacedRolls.length > 0) {
			const lastContainer = this.containers[this.containers.length - 1];
			const newContainer = new Container({
				...lastContainer,
				trainIndex: this.containers.length,
				id: `container-${Date.now()}-${this.containers.length}`
			});
			
			// Переносим неразмещенные рулоны в новый контейнер
			newContainer.oRolls = new Rolls([...this.unplacedRolls]);
			this.containers.push(newContainer);
			
			// Пытаемся разместить рулоны в новом контейнере
			const result = newContainer.optimizedPlacement();
			
			// Обновляем список неразмещенных рулонов
			this.unplacedRolls = result.unplaced || [];
			
			// Если после этого остались неразмещенные, рекурсивно создаем еще один контейнер
			if (this.unplacedRolls.length > 0) {
				this.optimizeLoading(this.unplacedRolls);
			}
		}
	}	

} // конец класса train

// служебные

function DistCentr(x1,x2,y1,y2) { // дистанция между ценрами рулонов
	return Math.sqrt( (x1-x2)**2 + (y1-y2)**2 );
}

function DistCentrRoll(A,B) { // дистанция между ценрами рулонов
	return Math.sqrt( (A.x - B.x)**2 + (A.y - B.y)**2 );
}

function DivCentrRoll(A,B) { // дистанция между ценрами рулонов	// console.log((A.R + B.R)**2)	// console.log(0- (A.x - B.x)**2 - (A.y - B.y)**2)
	return (A.R + B.R)**2 - (A.x - B.x)**2 - (A.y - B.y)**2;	
}

function divXCentrRoll(A,B) {// между X по квадрантному уравнению
	return Math.sqrt( (A.R + B.R)**2 - (A.y - B.y)**2 );
}

function divYCentrRoll(A,B) {// между X по квадрантному уравнению
	return Math.sqrt( (A.R + B.R)**2 - (A.x - B.x)**2 );
}

function calculateCircleSegment(G,R) {
	if (G < 0 || G > 2*R) {
		return 0;//console.log("пропорция деления круга не правильна! G"+G+" R"+R);
    }
    // Центральный угол (в радианах) для меньшего сегмента: θ = 2 * arccos(H/R)
    const theta = 2 * Math.acos( Math.abs( G - R ) / R );
    // Площадь меньшего сегмента: (θ - sinθ) * R² / 2
    const segmentArea = (theta - Math.sin(theta)) * R * R / 2;
    // Площадь круга: πR²
    const circleArea = Math.PI * R * R;
    return ( G > R ? 1 - segmentArea / circleArea : 0+segmentArea / circleArea); // .toFixed(3) G в [0,D] если G > R , то большая часть площади
}

function calcW(h, d) {// Модифицируем функцию calcW для более реалистичных значений:
    const r = d/2;
    // Более точная формула с учетом плотности бумаги (0.7-0.9 г/см³)
    const Pp = Math.PI * (0.00070 + Math.random() * 0.0003); 
    return Math.round(r * r * h * Pp);
}

function calcWset(el = document.querySelector('.roll-set')) {
	const _el = ( el !== document.querySelector('.roll-set') ?	el.parentElement : el);
	const _h = parseFloat(_el.querySelector('.roll-H').value);
	const _d = parseFloat(_el.querySelector('.roll-D').value);
	//вес набора
	_el.querySelector('.roll-W').value = calcW(_h,_d);
}

function calcWsetAll(){//итог по весу наборов
	const rollsW = document.getElementById('rolls-W')
	const listW = document.querySelectorAll('.roll-W');//console.log(listW)
	const listK = document.querySelectorAll('.roll-count');//console.log(listW)
	if (rollsW && listW && listK) {
		var TotalW = 0;
		//listW.forEach(elemW => {TotalW += parseFloat(elemW.value) *  parseFloat(listK[listW.indexOf(elemW)].value);});
		for (let k=0; k < listK.length; k++){
			TotalW += parseFloat(listW[k].value) *  parseFloat(listK[k].value);
		}
		rollsW.textContent = TotalW+'кг' ;
	}	
}

function calculateContainerCount(rolls) {// Вспомогательные функции:
    const totalWeight = rolls.reduce((sum, r) => sum + r.W, 0);
    const maxWeight = parseFloat(document.getElementById('maxW').value);
    
    // Базовый расчет + 20% буфер
    let count = Math.ceil(totalWeight / (maxWeight * 0.8));
    
    // Ограничиваем максимальное количество
    return Math.min(Math.max(count, 1), 100);
}

// расчет общей высоты рулонов в позиции
function calculateTotalHeightAtPosition(x, y, s) {
    let totalHeight = 0;
    for (const roll of oContainer.rolls) {
		if (Math.abs(roll.x - x) < mm && Math.abs(roll.y - y) < mm && roll.s < s) {
			totalHeight += roll.H;
		}
    }
    return totalHeight;
}

function createRollsFromImportSets() {
    const rolls = [];
    let idCounter = 1; // Счетчик для уникальных ID

    // Предполагаем, что данные уже загружены в переменную excelData
    // В реальном коде нужно использовать библиотеку для парсинга Excel (например, xlsx)
    // Здесь приведен упрощенный пример для данных из вашего файла
    
    // Пример данных (в реальном коде это будет результат парсинга Excel)
    const excelData = [
        { 'Диаметр, см': 100, 'формат, см': 100, 'вес, кг': 800 },
        { 'Диаметр, см': 120, 'формат, см': 102, 'вес, кг': 900 },
    ];

    excelData.forEach(row => {
        if (row['Диаметр, см'] && row['вес, кг']) {
            rolls.push({
                id: idCounter++,
                H: parseFloat(row['формат, см'] || 0), // Высота из колонки "формат, см"
                D: parseFloat(row['Диаметр, см']),     // Диаметр
                W: parseFloat(row['вес, кг']),         // Вес
                R: parseFloat(row['Диаметр, см']) / 2, // Радиус
                x: 0,
                y: 0,
                z: 0,
                s: 0 // Слой (0 - не размещен)
            });
        }
    });

    return rolls;
}

// Функция для создания рулонов из данных Excel
function createRollsFromExcelData(excelData) {
    const rolls = [];
    let idCounter = 1;

    excelData.forEach(row => {
        // Проверяем, что есть необходимые данные (диаметр и вес)
        if (row['Диаметр, см'] && row['вес, кг']) {
            rolls.push({
                id: idCounter++,
                H: parseFloat(row['формат, см'] || 0),  // Высота (если нет - 0)
                D: parseFloat(row['Диаметр, см']),      // Диаметр
                W: parseFloat(row['вес, кг']),          // Вес
                R: parseFloat(row['Диаметр, см']) / 2,  // Радиус
                x: 0, y: 0, z: 0, s: 0                 // Позиции и слой
            });
        }
    });

    return rolls;
}
// Функция для обработки загруженного файла
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Используем библиотеку xlsx для парсинга
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

    // Создаем рулоны из импортированных данных
    const rolls = createRollsFromImportSets(jsonData);
    return rolls;
}

// Основная функция для обработки загруженного файла
async function handleExcelUploadV1(event) {
    const file = event.target.files[0];
    if (!file) return null;

    // Проверка расширения файла
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        showError("Пожалуйста, выберите файл Excel (.xlsx или .xls)");
        return null;
    }

    try {
        showLoadingProgress("Чтение файла Excel...");
        
        // 1. Читаем файл как ArrayBuffer
        const data = await file.arrayBuffer();
        
        // 2. Парсим книгу Excel с обработкой ошибок
        let workbook;
        try {
            workbook = XLSX.read(data, {
                type: 'array',
                cellDates: true,
                cellStyles: true,
                sheetStubs: true
            });
        } catch (parseError) {
            console.error("Ошибка парсинга Excel:", parseError);
            throw new Error("Файл повреждён или имеет неверный формат");
        }
        
        // 3. Проверяем наличие листов
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error("В файле нет ни одного листа");
        }
        
        // 4. Получаем первый лист с проверкой
        const firstSheetName = workbook.SheetNames[0];	console.log(workbook.SheetNames)
        const worksheet = workbook.Sheets[firstSheetName];
        
        if (!worksheet) {
            throw new Error(`Лист '${firstSheetName}' не найден или повреждён`);
        }
        
        // 5. Конвертируем в JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            defval: null, // возвращать null для пустых ячеек
            raw: false   // преобразовывать даты и числа
        });
        
        // 6. Проверяем данные
        if (!jsonData || jsonData.length === 0) {
            throw new Error("Лист не содержит данных");
        }
        
			   
		// 7. Создаём рулоны и формируем параметры для rollset
		const rolls = createRollsFromExcelData(jsonData);
		if (rolls.length === 0) {
			throw new Error("Не найдены подходящие данные рулонов");
		}

		// Группируем рулоны по диаметру и высоте для создания rollset
		const rollGroups = {};
		rolls.forEach(roll => {
			const key = `${roll.D}_${roll.H}`;
			if (!rollGroups[key]) {
				rollGroups[key] = {
					diameters: [],
					heights: [],
					weights: [],
					count: 0
				};
			}
			rollGroups[key].diameters.push(roll.D);
			rollGroups[key].heights.push(roll.H);
			rollGroups[key].weights.push(roll.W);
			rollGroups[key].count++;
		});

		// Формируем параметры для rollset
		const rollSets = [];
		Object.keys(rollGroups).forEach(key => {
			const group = rollGroups[key];
			
			// Рассчитываем средние значения
			const avgD = group.diameters.reduce((a, b) => a + b, 0) / group.diameters.length;
			const avgH = group.heights.reduce((a, b) => a + b, 0) / group.heights.length;
			const avgW = group.weights.reduce((a, b) => a + b, 0) / group.weights.length;
			
			rollSets.push({
				diameter: parseFloat(avgD.toFixed(1)),
				height: parseFloat(avgH.toFixed(1)),
				weight: parseFloat(avgW.toFixed(1)),
				count: group.count
			});
		});

		// Обновляем UI с новыми rollset (если нужно)
		const rollSetsContainer = document.getElementById('roll-sets-container');
		if (rollSetsContainer) {
			// Очищаем существующие наборы
			rollSetsContainer.innerHTML = '';
			// Добавляем новые наборы
			rollSets.forEach((roll, index) => {
				addRollSet(roll.H, roll.D, roll.W, roll.count);
			})	
		}

        if (rolls.length === 0) {
            throw new Error("Не найдены подходящие данные рулонов");
        }
        
        return rolls;
        
    } catch (error) {
        console.error("Ошибка обработки Excel:", error);
        showError(`Ошибка импорта: ${error.message}`);
        return null;
    } finally {
        hideLoadingProgress();
        event.target.value = ''; // Сбрасываем input
    }
}
async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        showError("Файл не выбран");
        return null;
    }

    // Проверка расширения файла
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showError("Поддерживаются только файлы Excel (.xlsx, .xls) или CSV");
        return null;
    }


    try {
        showLoadingProgress("Анализ файла...");

        // 1. Читаем файл (разные методы для CSV и Excel)
        let workbook;
        const data = await file.arrayBuffer();

        if (file.name.match(/\.csv$/i)) {
            // Обработка CSV
            const text = new TextDecoder().decode(data);
            workbook = XLSX.read(text, { type: 'string' });
        } else {
            // Обработка Excel с защитой от повреждённых файлов
            try {
                workbook = XLSX.read(data, {
                    type: 'array',
                    cellDates: true,
                    sheetStubs: true, // Игнорировать отсутствующие листы
                    bookVBA: true    // Поддержка макросов
                });
            } catch (e) {
                console.error("Ошибка парсинга Excel:", e);
                throw new Error("Файл повреждён или защищён паролем");
            }
        }

console.log("Структура файла:", {
	SheetNames: workbook.SheetNames,
	Props: workbook.Props,
	Sheets: Object.keys(workbook.Sheets)
});


        // 2. Проверка структуры файла
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error("Файл не содержит ни одного листа");
        }

        // 3. Безопасное извлечение первого листа
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        if (!worksheet || !worksheet['!ref']) {
            throw new Error("Лист пуст или повреждён");
        }

        // 4. Конвертация в JSON с обработкой ошибок
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: false,
            blankrows: false
        });

        if (!jsonData || jsonData.length === 0) {
            throw new Error("Нет данных для импорта");
        }

        // 5. Создание рулонов с проверкой
        const rolls = createRollsFromExcelData(jsonData);//console.log(jsonData)	
        if (rolls.length === 0) {
			console.log(rolls)
            throw new Error("Не найдены подходящие данные (проверьте колонки)");
        }

        // 6. Формирование rollset (добавлено по вашему запросу)
        const rollSets = generateRollSets(rolls);
		// Обновляем UI с новыми rollset (если нужно)
		if (rollSets && rolls && rolls.length > 0) {
			// Очищаем текущие наборы
			document.querySelectorAll('.roll-set').forEach(el => el.remove());
			
			// Добавляем новые наборы
			rollSets.forEach((roll, index) => {	
				addRollSet(roll.H, roll.D, roll.W, roll.count);
				console.log(rollSets)
			})	
			calcWsetAll();
			loadRolls();
			// Добавляем рулоны в текущий контейнер
			showMessage(`Успешно импортировано ${rolls.length} рулонов`);
		}
        //updateRollSetsUI(rollSets);
        return rolls;

    } catch (error) {
        console.error("Ошибка импорта:", error);
        showError(`Ошибка: ${error.message}`);
        return null;
    } finally {
        hideLoadingProgress();
        event.target.value = ''; // Сброс поля выбора файла
    }
}
function updateRollSetsUI(rollSets) {
    const rollSetsContainer = document.getElementById('roll-sets-container');
    if (!rollSetsContainer) return;

    // Очищаем существующие наборы
    rollSetsContainer.innerHTML = '';

    // Добавляем новые наборы
    rollSets.forEach((set, index) => {
        const setElement = document.createElement('div');
        setElement.className = 'roll-set';
        setElement.innerHTML = `
            <div class="roll-set-header">
                <span>Набор #${index + 1}</span>
                <button class="btn-remove-set" data-index="${index}">×</button>
            </div>
            <div class="roll-set-fields">
                <label>
                    <span>Диаметр (D):</span>
                    <input type="number" class="roll-D" value="${set.diameter}" step="0.1" min="1">
                </label>
                <label>
                    <span>Высота (H):</span>
                    <input type="number" class="roll-H" value="${set.height}" step="0.1" min="1">
                </label>
                <label>
                    <span>Вес (W):</span>
                    <input type="number" class="roll-W" value="${set.weight}" step="0.1" min="0.1">
                </label>
                <label>
                    <span>Количество:</span>
                    <input type="number" class="roll-count" value="${set.count}" min="1">
                </label>
            </div>
        `;
        rollSetsContainer.appendChild(setElement);
    });

    // Добавляем обработчики для кнопок удаления
    document.querySelectorAll('.btn-remove-set').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            rollSetsContainer.removeChild(this.closest('.roll-set'));
        });
    });
}

// Генерация rollset с усреднёнными значениями
function generateRollSets(rolls) {
    const groups = {};

    rolls.forEach(roll => {
        const key = `${roll.D.toFixed(1)}_${roll.H.toFixed(1)}`;
        if (!groups[key]) {
            groups[key] = {
                D: [],
                H: [],
                W: [],
                count: 0
            };
        }
        groups[key].D.push(roll.D);
        groups[key].H.push(roll.H);
        groups[key].W.push(roll.W);
        groups[key].count++;
    });

    return Object.keys(groups).map(key => {
        const g = groups[key];
        return {
            D: average(g.D),
            H: average(g.H),
            W: average(g.W),
            count: g.count
        };
    });
}

// Вспомогательная функция для среднего значения
function average(arr) {
    return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
}

// Улучшенная функция создания рулонов с проверкой данных
function createRollsFromExcelData(excelData) {
    const rolls = [];
    let idCounter = 1;
    let skippedRows = 0;

    excelData.forEach((row, index) => {
        try {
            // Проверяем обязательные поля
            if (!row['Диаметр, см'] || !row['вес, кг']) {
                skippedRows++;
                return;
            }

            // Парсим значения с проверкой
            const diameter = parseFloat(row['Диаметр, см']);
            const weight = parseFloat(row['вес, кг']);
            const height = parseFloat(row['формат, см'] || 0);

            if (isNaN(diameter) || isNaN(weight) || diameter <= 0 || weight <= 0) {
                console.warn(`Некорректные данные в строке ${index + 1}`);
                skippedRows++;
                return;
            }

            rolls.push({
                id: idCounter++,
                H: height,
                D: diameter,
                W: weight,
                R: diameter / 2,
                x: 0, y: 0, z: 0, s: 0
            });
        } catch (e) {
            console.warn(`Ошибка обработки строки ${index + 1}:`, e);
            skippedRows++;
        }
    });

    if (skippedRows > 0) {
        showMessage(`Пропущено ${skippedRows} строк с некорректными данными`);
    }

    return rolls;
}

// Инициализация загрузчика
function initExcelImport() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'excel-import';
    fileInput.accept = '.xlsx,.xls';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (event) => {
        showLoadingProgress("!!!Импорт данных из Excel...");
        
        try {
            const rolls = await handleExcelUpload(event);
            
            if (rolls && rolls.length > 0) {
                // Очищаем текущие рулоны
                oContainer.rolls = [];
                
                // Добавляем новые рулоны
                oContainer.addRoll(rolls);
                oContainer.updateCenterOfMass();
                
                // Обновляем интерфейс
                generateView();
                updateUI();
                
                showMessage(`!!!Успешно импортировано ${rolls.length} рулонов`);
            }
        } finally {
            hideLoadingProgress();
            // Сбрасываем значение input для возможности повторной загрузки того же файла
            event.target.value = '';
        }
    });
    
    document.body.appendChild(fileInput);
    
    // Создаем кнопку для запуска импорта
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-import';
    importBtn.innerHTML = '<i class="fas fa-file-excel"></i> Импорт из Excel';
    importBtn.onclick = () => fileInput.click();
    
    // Добавляем кнопку в интерфейс (например, в блок управления)
    const controls = document.getElementById('controls-container');
    if (controls) {
        controls.appendChild(importBtn);
    }
}
// Инициализируем при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    initExcelImport();
});
// Инициализация обработчика
document.getElementById('excel-import').addEventListener('change', async (event) => {
    if (!confirm("Удалить и Загрузить наборы рулонов их вашей таблицы?")) return;
	const rolls = await handleExcelUpload(event);
});

function createRollsFromSets() {
    const rolls = [];
    let idCounter = 1; // Счетчик для уникальных ID
    
    document.querySelectorAll('.roll-set').forEach(set => {
        const H = parseFloat(set.querySelector('.roll-H').value);
        const D = parseFloat(set.querySelector('.roll-D').value);
        const W = parseFloat(set.querySelector('.roll-W').value);
        const count = parseInt(set.querySelector('.roll-count').value);
        
        for (let i = 0; i < count; i++) {
            rolls.push({
                id: idCounter++, // Увеличиваем счетчик для каждого нового рулона
                H: H,
                D: D,
                W: W,
                R: D / 2,
                x: 0,
                y: 0,
                z: 0,
                s: 0 // Слой (0 - не размещен)
            });
        }
    });
    
    return rolls;
}

function getValidatedContainerParams() {
    const params = {
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
    
    // Валидация параметров
    if (Object.values(params).some(isNaN)) {
        throw new Error("Некорректные параметры ТСа");
    }
    
    return params;
}

function findCircleIntersections(x1, y1, r1, x2, y2, r2) { // поиск точек пересечения двух окружностей
	// Вычисляем вектор между центрами и квадрат расстояния
	const dx = x2 - x1;
	const dy = y2 - y1;
	// const dSquared = dx * dx + dy * dy;
	const d = DistCentr(x2,x1,y2,y1);//console.log("("+x1+","+y1+","+r1+","+x2+","+y2+","+r2+") d="+d );
	// Проверка случаев отсутствия пересечений :cite[4]:cite[7]
	// console.log(d > r1 + r2)
	if (d > r1 + r2) return [];    // Окружности не пересекаются	
	// console.log(Math.abs(r1 - r2))
	if (d < Math.abs(r1 - r2)) return [];  // Одна окружность внутри другой
	// console.log(1e-10)
	if (d < 1e-10) return [];       // Центры совпадают
	// Вычисляем коэффициент 'a' (расстояние от центра 1 до точки P0)
	const a = (r1 * r1 - r2 * r2 + d**2) / (2 * d);
	// Вычисляем высоту 'h' (расстояние от P0 до точек пересечения)
	const h = Math.sqrt(r1 * r1 - a * a);
	// Вычисляем точку P0 :cite[4]:cite[7]
	const x0 = x1 + (a * dx) / d;
	const y0 = y1 + (a * dy) / d;
	// Вычисляем смещение перпендикуляра к линии центров
	const px = (h * dy) / d;
	const py = (h * dx) / d;//console.log("("+(x0 + px)+","+(y0 - py)+") ("+(x0 - px)+","+(y0 + py)+")" );
	return [
		{ x: x0 + px, y: y0 - py },
		{ x: x0 - px, y: y0 + py }
	];
}

function findCenterRollFromRolls(a,b,cD) { // Поиск большего по Х центра рулона касающегося двух рулонов из параметров
	const c = findCircleIntersections(
		a.x, a.y, (0+ a.D + cD)/2,
		b.x, b.y, (0+ b.D + cD)/2);
	if ( c.length > 0 ) {
		return c[0].x > c[1].x ?  c[0] : c[1];  	// 	Выбираем из двух пересечений-центров с большим X (меньший будет перескать места уже расчитан.)
	} else	return false;
}
// для поиска рулона по ID
function findRollById(id) {
    for (const roll of oContainer.rolls) {
		if (roll.id === id) return roll;
    }
    return null;
}

function saveOriginalPositions() { //сохранение исходных позиций
    originalRollPositions.clear();
    currentTrain.containers.forEach(container => {
        container.rolls.forEach(roll => {
            originalRollPositions.set(roll.id, {
                x: roll.x,
                y: roll.y,
                containerIndex: container.trainIndex
            });
        });
    });
}

function getSchemeData() {// Получить данные схемы
    if (!currentTrain || currentTrain.containers.length === 0) return null;
    
    // Собираем настройки рулонов
    const rollSets = [];
    document.querySelectorAll('.roll-set').forEach(setEl => {
        rollSets.push({
            H: parseFloat(setEl.querySelector('.roll-H').value),
            D: parseFloat(setEl.querySelector('.roll-D').value),
            W: parseFloat(setEl.querySelector('.roll-W').value),
            count: parseInt(setEl.querySelector('.roll-count').value)
        });
    });
    
    // Собираем данные по всем ТС в цепочке
    const containersData = currentTrain.containers.map(container => ({
        params: {
            L: container.L,
            T: container.T,
            H: container.H,
            maxW: container.maxW,
            maxCML: container.maxCML,
            maxCMT: container.maxCMT,
            maxKGL: container.maxKGL,
            maxKGT: container.maxKGT,
            minCMDoor: container.minCMDoor,
            minDimX: container.minDimX
        },
        rolls: container.rolls.map(r => ({
            id: r.id,
            H: r.H,
            D: r.D,
            W: r.W,
            x: r.x,
            y: r.y,
            z: r.z,
            s: r.s,
            row: r.row,
            color: r.color
        })),
        centerOfMass: container.centerOfMass
    }));
    
    return {
        timestamp: new Date().toISOString(),
        version: "1.1", // Версия формата с поддержкой цепочки ТС
        trainParams: {
            containerCount: currentTrain.containers.length,
            totalWeight: currentTrain.totalWeight()
        },
        containers: containersData,
        rollSets: rollSets,
        unplacedRolls: currentTrain.unplacedRolls.map(r => ({
            id: r.id,
            H: r.H,
            D: r.D,
            W: r.W,
            placementError: r.placementError
        })),
        uiState: {
            sliderValue: document.getElementById('rolls-slider').value,
            FreeStyle: document.getElementById('FreeStyle').checked,
            CrossStyle: document.getElementById('CrossStyle').checked,
            currentContainerIndex: oContainerIndex
        }
    };
}

function loadScheme(scheme) {// Инициализация обработчиков для кнопок загрузки/сохранения
    if (!scheme) return;
    
    // 1. Очищаем текущие данные
    currentTrain = new Train([]);
    oContainerIndex = 0;
    
    // 2. Восстанавливаем наборы рулонов
    document.querySelectorAll('.roll-set').forEach(el => el.remove());
    if (scheme.rollSets && scheme.rollSets.length > 0) {
        scheme.rollSets.forEach(roll => {
            addRollSet(roll.H, roll.D, roll.W, roll.count);
        });
    } else {
        // Дефолтные значения, если в схеме нет наборов
        addRollSet(100, 120, 870, 28);
    }
    
    // 3. Восстанавливаем цепочку ТС
    if (scheme.version === "1.1" && scheme.containers) {
        // Новая версия с поддержкой цепочки ТС
        scheme.containers.forEach(containerData => {
            const container = new Container({
                ...containerData.params,
                trainIndex: currentTrain.containers.length,
                id: `container-${Date.now()}-${currentTrain.containers.length}`
            });
            
            // Восстанавливаем рулоны
            container.rolls = containerData.rolls.map(r => {
                const roll = new Roll(r.id, r.H, r.D, r.W);
                Object.assign(roll, {
                    x: r.x,
                    y: r.y,
                    z: r.z,
                    s: r.s,
                    row: r.row,
                    color: r.color || styleColorFillRoll(roll)
                });
                return roll;
            });
            
            // Восстанавливаем центр масс
            container.centerOfMass = containerData.centerOfMass || {
                x: container.L / 2,
                y: container.T / 2,
                z: container.H / 2
            };
            
            currentTrain.containers.push(container);
        });
        
        // Восстанавливаем неразмещенные рулоны
        if (scheme.unplacedRolls) {
            currentTrain.unplacedRolls = scheme.unplacedRolls.map(r => {
                const roll = new Roll(r.id, r.H, r.D, r.W);
                roll.placementError = r.placementError || "";
                return roll;
            });
        }
        
        // Восстанавливаем текущий ТС
        oContainerIndex = scheme.uiState?.currentContainerIndex || 0;
        if (oContainerIndex >= currentTrain.containers.length) {
            oContainerIndex = currentTrain.containers.length - 1;
        }
        oContainer = currentTrain.containers[oContainerIndex];
    } else {
        // Старая версия схемы (один ТС)
        const containerParams = scheme.containerParams || {
            L: 1203,
            T: 235,
            H: 259,
            maxW: 25500,
            maxCML: 30,
            maxCMT: 10,
            maxKGL: 1500,
            maxKGT: 500,
            minCMDoor: 50,
            minDimX: 25
        };
        
        const container = new Container({
            ...containerParams,
            trainIndex: 0,
            id: `container-${Date.now()}-0`
        });
        
        // Восстанавливаем рулоны
        if (scheme.rolls) {
            container.rolls = scheme.rolls.map(r => {
                const roll = new Roll(r.id, r.H, r.D, r.W);
                Object.assign(roll, {
                    x: r.x,
                    y: r.y,
                    z: r.z,
                    s: r.s,
                    row: r.row,
                    color: r.color || styleColorFillRoll(roll)
                });
                return roll;
            });
        }
        
        // Восстанавливаем центр масс
        container.centerOfMass = scheme.centerOfMass || {
            x: container.L / 2,
            y: container.T / 2,
            z: container.H / 2
        };
        
        // Восстанавливаем неразмещенные рулоны
        if (scheme.unplacedRolls) {
            currentTrain.unplacedRolls = scheme.unplacedRolls.map(r => {
                const roll = new Roll(r.id, r.H, r.D, r.W);
                roll.placementError = r.placementError || "";
                return roll;
            });
        }
        
        currentTrain.containers.push(container);
        oContainer = container;
    }
    
    // 4. Восстанавливаем UI состояние
    if (scheme.uiState) {
        document.getElementById('rolls-slider').value = scheme.uiState.sliderValue || 0;
        document.getElementById('FreeStyle').checked = scheme.uiState.FreeStyle !== false;
        document.getElementById('CrossStyle').checked = scheme.uiState.CrossStyle || false;
    }
    
    // 5. Обновляем интерфейс
    generateView();
    updateUI();
    
    // 6. Сохраняем оригинальные позиции для слайдера
    saveOriginalPositions();
}
