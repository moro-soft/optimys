<?php
class Roll {
    public $id;
    public $height; // теперь по оси Z
    public $diameter;
    public $weight;
    public $color;
    public $x = 0;  // длина контейнера
    public $y = 0;  // ширина контейнера
    public $z = 0;  // высота (вертикаль)
    public $placementError = null;

public function __construct($id, $height, $diameter, $weight) {
	$this->id = $id;
	$this->height = $height;
	$this->diameter = $diameter;
	$this->weight = $weight;
	$this->color = sprintf('#%06X', mt_rand(0, 0xFFFFFF));
}

}

class Container {
    public $totalLoaded = 0;
    public $length; // X
    public $width;  // Y
    public $height; // Z
    public $maxWeight;
    public $maxCMDeviationLength;
    public $maxCMDeviationWidth;
    public $stacks = [];
    public $unplacedRolls = [];
    public $totalWeight = 0;
    public $centerOfMass = ['x' => 0, 'y' => 0, 'z' => 0];
    public $echo = '';	

	public $occupiedPositions = [];
    public $currentRow = 0;
    public $currentRowDiameter = 0;

    public $Positions = [];

	public function __construct($length, $width, $height, $maxWeight, $maxCMDeviationLength, $maxCMDeviationWidth) {
	$this->length = $length;
	$this->width = $width;
	$this->height = $height;
	$this->maxWeight = $maxWeight;
	$this->maxCMDeviationLength = $maxCMDeviationLength;
	$this->maxCMDeviationWidth = $maxCMDeviationWidth;
	}

	private function precalculatePositions($diameter) { // Находит ближайшую свободную позицию к центру
		$this->Positions = [];
		$this->usedPositions = [];
		
		$r = $diameter/2; // Первый ряд у стенки
		$y = $r;
		$row = 0;
		while ($y >= $r and  $y <= $this->width - $r and $row<=4) { // рядов в ширину
			// Расчет стартовой X-позиции для ряда
			$startX = $this->calculateRowStartX($row, $diameter, $y);
			
			// Заполняем весь ряд
			$x = $startX;
			$col = 0;
			//$this->$echo.= " x=".$x;
			while (  $x >= $r and $x <= $this->length - $r and $col<=20) { // рулонов в линну
				$s = 1;
				//$this->$echo.= " y=".$y." x=".$x." <=".($this->length - $r)." >=". $r." $col=".$col;
				while (  $s >= 1 and $s <3) { // рулонов в линну
					$this->Positions[] = [
						'x' => $x,
						'y' => $y,
						'z' => 0,
						's' => $s,
						'row' => $row,
						'diameter' => $diameter,
						'used' => false
					];
					$s++;
				}	
				$x += $diameter;
				$col++;
			}
			
			// Переход к следующему ряду
			$row++;
			$y = $this->calculateNextRowY($y, $row, $diameter);
	//		$this->$echo.= " y=".$y." y<=".($this->width - $r).">=". $r." <=". ($this->width - $r);
		}
		
		//print_r($this->Positions);
		// Сортировка позиций
		usort($this->Positions, function($a, $b) {
			if ($a['s'] == $b['s']) 
				return abs($a['x']- $this->length/2) + abs($a['y']- $this->width/2) <=>  abs($b['x']- $this->length/2) + abs($b['y']- $this->width/2);
			else 	
				return $a['s'] <=> $b['s'];
		});
	}

	private function calculateRowStartX($row, $diameter, $currentY) {
		$r = $diameter/2;
		if ($row == 0) {
			return $r; // Первый ряд у торцевой стенки
		}
		// Расчет X по формуле: 
		// X = √(diameter² - (width - diameter)²)
		$xMAX = $diameter + $r;
		$xMIN = $r;
		$yMAX = $this->width - $r;
		$y1 = min($r + $diameter, max( $r + $diameter * 0.886, $yMAX)); // для 2 ряда
		$x1 = min($xMAX,max($xMIN, sqrt(abs(pow($diameter, 2) - pow($y1-$r, 2))) + $r ));
		//$x1 = sqrt(abs(pow($diameter, 2) - pow($this->width - $diameter, 2))) + $r ;
		//$this->$echo.=  " row=".$row." ?=".($row % 2 == 0)." x1=".round($x1, 2)."=\!". ($diameter)." )2 - ". ($this->width - $diameter).")2 | +".$r;
		// Корректировка для нечетных рядов
		return ($row % 2 == 1) ? $x1 : $r;
	}

	private function calculateNextRowY($y, $row, $diameter) {
		// Формула для Y следующего ряда:
		$r = $diameter/2;
		$yMAX = $this->width - $r;
		$y1 = min($y + $diameter, max( $y + $diameter * 0.886, $yMAX)); // для 2 ряда
		//$this->$echo.= " row=".$row." y=". $y1 ."=". ($y ."+". $diameter ) ."||". ($this->width ."-". $y ."-". $r ) ;
		return $y1;
	}


	public function addUnplacedRoll($roll, $reason) {
		$roll->placementError = $reason;
		$this->unplacedRolls[] = $roll;
	}

	private function canPlaceStack($x, $y, $diameter, $s) {
		$r = $diameter/2; //Радиус
		$q = 5; // см. допуск контакта
		// Проверка границ контейнера
		if ($x - $r < 0 || $x + $r > $this->length) return false;
		if ($y - $r < 0 || $y + $r > $this->width) return false;
		
		// Проверка контакта минимум с двумя точками (стенками или соседями)
		$contactPoints = 0;
		
		// Контакт с левой стенкой
		if ($x - $r <= $q) $contactPoints++;
		
		// Контакт с правой стенкой
		if ($x + $r >= $this->length - $q) $contactPoints++;
		
		// Контакт с передней стенкой
		if ($y - $r <= $q) $contactPoints++;
		
		// Контакт с задней стенкой
		if ($y + $r >= $this->width - $q) $contactPoints++;
		
		// Проверка контакта с соседними рулонами
		
	//	foreach ($this->Positions as $pos) {
		foreach ($this->occupiedPositions as $pos) {
			if ($pos['s']== $s){ 
				$distance = sqrt(pow($x - $pos['x'], 2) + pow($y - $pos['y'], 2));
				$requiredDistance = ($diameter + $pos['diameter'])/2;
				
				if (abs($distance - $requiredDistance) <= $q) { 
					$contactPoints++;

					if ($contactPoints == 2) {
						//$this->$echo.= " !".$distance ." ~$q ". ($requiredDistance - $q).'! x'.round($x,2) .' -'.round($pos['x'],2).' y'.round($y,2) .' -'.round($pos['y'],2);
						break;
					}			
					// Дополнительная проверка для верхних рулонов
					if ($diameter > $pos['diameter']) {
						return false; // Верхний рулон не может быть больше нижнего
					}
					
				} elseif ($distance < $requiredDistance - $q) {
					return false; // Перекрытие рулонов
				}
			}	
		}
		
		// Минимум 2 точки контакта
		return $contactPoints >= 2;
	}

	private function createVerticalStacks($rolls) {
		// Сортируем рулоны по убыванию диаметра и веса
		usort($rolls, function($a, $b) {
			if ($a->diameter == $b->diameter) {
				return $b->weight - $a->weight; // Тяжелые вниз
			}
			return $b->diameter - $a->diameter; // Большие диаметры вниз
		});

		$stacks = [];
		$currentStack = [];
		
		foreach ($rolls as $roll) {
			// Проверка условия: верхний рулон не больше нижних
			if (!empty($currentStack)) {
				$bottomRoll = $currentStack[0];
				if ($roll->diameter > $bottomRoll->diameter || $roll->weight > $bottomRoll->weight) {
					$stacks[] = $currentStack;
					$currentStack = [];
				}
			}
			
			// Проверка высоты стопки
			$currentHeight = array_sum(array_map(function($r) { return $r->height; }, $currentStack));
			if ($currentHeight + $roll->height > $this->height) {
				$stacks[] = $currentStack;
				$currentStack = [];
			}
			
			$currentStack[] = $roll;
			
			// Максимум 3 рулона в стопке
			if (count($currentStack) > 0) {
				$stacks[] = $currentStack;
				$currentStack = [];
			}
		}
		
		if (!empty($currentStack)) {
			$stacks[] = $currentStack;
		}
		
		return $stacks;
	}


	private function updateStackPositions() {
		$this->occupiedPositions = [];
		foreach ($this->stacks as $stack) {
			$diameter = $stack[0]->diameter;
			$weight = array_sum(array_map(function($roll) { return $roll->weight; }, $stack));
			
			$this->occupiedPositions[] = [
				'x' => $stack[0]->x,
				'y' => $stack[0]->y,
				's' => 1,
				'diameter' => $diameter,
				'weight' => $weight
			];
		}
	}



	public  function optimizeBalance() {
	$maxIterations = 100;
	$improvementThreshold = 1; // кг

	for ($i = 0; $i < $maxIterations; $i++) {
		$currentDeviation = $this->calculateCurrentDeviation();
		
		// Если отклонение в пределах нормы, прекращаем оптимизацию
		if ($currentDeviation['x'] <= $this->maxCMDeviationLength && 
			$currentDeviation['y'] <= $this->maxCMDeviationWidth) {
			break;
		}
		
		$bestSwap = null;
		$bestImprovement = 0;


		
		// Перебираем возможные перестановки стопок
		for ($j = 0; $j < count($this->stacks); $j++) {
			for ($k = $j + 1; $k < count($this->stacks); $k++) {
				// Пробуем поменять местами стопки
				$this->swapStacks($j, $k);
				$newDeviation = $this->calculateCurrentDeviation();
				$improvement = abs($currentDeviation['x'] - $newDeviation['x']) + abs($currentDeviation['y'] - $newDeviation['y']);
				// Если улучшение значительное, запоминаем
				if ($improvement > $bestImprovement) {
					$bestImprovement = $improvement;
					$bestSwap = ['j' => $j, 'k' => $k];
	//$this->$echo.= "+".$improvement. ">". $bestImprovement;               
				}
				
				// Возвращаем стопки на место
				$this->swapStacks($j, $k);
			}
		}
		
		// Если нашли улучшение, применяем его
		if ($bestImprovement > $improvementThreshold && $bestSwap !== null) {
	$this->$echo.=  "!<".$bestImprovement.">";
			$this->swapStacks($bestSwap['j'], $bestSwap['k']);
		} else {
			break; // Дальнейшая оптимизация не дает улучшений
		}
	}
	}

	private function updateCenterOfMass() {
		$totalWeight = 0;
		$cmX = 0;
		$cmY = 0;
		$cmZ = 0;
		
		foreach ($this->stacks as $stack) {
			foreach ($stack as $roll) {
				$totalWeight += $roll->weight;
				$cmX += $roll->x * $roll->weight;
				$cmY += $roll->y * $roll->weight;
				$cmZ += $roll->z * $roll->weight;
			}
		}
		
		if ($totalWeight > 0) {
			$this->centerOfMass = [
				'x' => $cmX / $totalWeight,
				'y' => $cmY / $totalWeight,
				'z' => $cmZ / $totalWeight
			];
		}
	}
	private function swapStacks($index1, $index2) {
		$temp = $this->stacks[$index1];
		$this->stacks[$index1] = $this->stacks[$index2];
		$this->stacks[$index2] = $temp;
		
		// Обновляем позиции и центр масс
		$this->updateStackPositions();
		$this->updateCenterOfMass();
	}

	private function calculateCurrentDeviation() {
		return [
			'x' => abs($this->centerOfMass['x'] - $this->length / 2),
			'y' => abs($this->centerOfMass['y'] - $this->width / 2)
		];
	}	



	/**
	 * Добавляет рулоны в список неразмещенных
	 */
	private function addUnplacedRolls($stack, $reason) {
		foreach ($stack as $roll) {
			$this->addUnplacedRoll($roll, $reason);
		}
	}
	private function findClosestToFrontPosition($diameter) {
		foreach ($this->Positions as &$position) {
				if ( !$position['used'] && $this->canPlaceStack(
					$position['x'], 
					$position['y'], 
					$diameter, $position['s']
				)) {
					$position['used'] = true;
					$position['z'] = 0;
					return ['x' => $position['x'],
							'y' => $position['y'],
							's' => $position['s'],
							];
				}
		}
		return null;
	}

	/**
	 * Размещает стопку рулонов в указанной позиции
	 */
	private function setplaceStack($stack, $position) {
		$diameter = $stack[0]->diameter;
		$stackWeight = 0;
		$stackHeight = 0;
		
//		if ( count($stack) ) $stackHeight = $stack[0]->height; // начальная высота стека
		
		// Проверка условия: верхние рулоны не больше нижних
		for ($i = 0; $i < count($stack); $i++) {
			if ( $i>0 &&
				(	$stack[$i]->diameter > $stack[0]->diameter 
				||	$stack[$i]->weight > $stack[0]->weight )) {
				return $this->addUnplacedRolls($stack, "Нарушено условие: верхний рулон больше нижнего");
			}
			$stackWeight += $stack[$i]->weight;
			$stackHeight += $stack[$i]->height;
		}
		
		// Проверка ограничений
		if ($stackHeight > $this->height) {
			return $this->addUnplacedRolls($stack, "Превышена высота контейнера");
		}

		if ($this->totalWeight + $stackWeight > $this->maxWeight) {
			return $this->addUnplacedRolls($stack, "Превышен максимальный вес");
		}

		// Размещение рулонов в стопке (вертикально)
		$currentZ = 0;
		
		// поиск высоты ниэжних рулонов
		if ($position['s']>1){
			for ($i = 0; $i < count($this->occupiedPositions); $i++) {
				if (	$this->occupiedPositions[$i]['x'] == $position['x']
					and	$this->occupiedPositions[$i]['y'] == $position['y']
					and	$this->occupiedPositions[$i]['s'] < $position['s']
					) 
				{
					$currentZ += $this->occupiedPositions[$i]['height'];		
				}
			}
		}
		foreach ($stack as $roll) {
			$roll->x = $position['x'];
			$roll->y = $position['y'];
			$roll->z = $currentZ + $roll->height/2;
			$currentZ += $roll->height;
		}

		// Фиксация занятой позиции
		$this->occupiedPositions[] = [
			'x' => $position['x'],
			'y' => $position['y'],
			
			's' => $position['s'],
			
			'diameter' => $diameter,
			'weight' => $stackWeight,
			'height' => $stackHeight
		];

		$this->stacks[] = $stack;
		$this->totalWeight += $stackWeight;
		$this->updateCenterOfMass();

		return true;
	}

	public function optimizedPlacement($rolls) {
		// Группировка по диаметру (сортировка по убыванию)
		$grouped = [];
		foreach ($rolls as $roll) {
			$grouped[(string)$roll->diameter][] = $roll;
		}
		krsort($grouped);

		foreach ($grouped as $diameter => $rollsGroup) {
			$this->precalculatePositions($diameter);
			//print_r(json_encode($this->Positions)); 			
			$stacks = $this->createVerticalStacks($rollsGroup);
			//print_r(json_encode($stacks)); 			
			foreach ($stacks as $stack) {
				// Проверка условия: верхние рулоны не больше нижних
				$pos = $this->findClosestToFrontPosition($diameter);
				if ($pos) {
					($this->setplaceStack($stack, $pos)); // нашли место
				} else {
					$this->addUnplacedRolls($stack, "Нет позиции в слое:".$s);
				}
			}
		}
		$this->totalLoaded = count($this->occupiedPositions);	
		$this->optimizeBalance();
		
	}
	
}


// Пример данных
$id=0;
$rolls = [];
//$id, $height, $diameter, $weight
$rolls[] = new Roll($id++, 88, 120, 804);		 
$rolls[] = new Roll($id++, 88, 120, 804);		 
$rolls[] = new Roll($id++, 88, 120, 804);		 
$rolls[] = new Roll($id++, 88, 120, 804);		 
$rolls[] = new Roll($id++, 88, 120, 804);		 
$rolls[] = new Roll($id++, 88, 120, 804);		 

$rolls[] = new Roll($id++, 88, 120, 820);		 
$rolls[] = new Roll($id++, 88, 120, 820);		 
$rolls[] = new Roll($id++, 88, 120, 810);		 
$rolls[] = new Roll($id++, 88, 120, 810);		 
$rolls[] = new Roll($id++, 88, 120, 790);		 
$rolls[] = new Roll($id++, 88, 120, 780);		 

$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 

$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 
$rolls[] = new Roll($id++, 96, 120, 804);		 


$rolls[] = new Roll($id++, 98, 120, 804);		 
$rolls[] = new Roll($id++, 98, 120, 804);		 
$rolls[] = new Roll($id++, 98, 120, 804);		 
$rolls[] = new Roll($id++, 98, 120, 804);		 
$rolls[] = new Roll($id++, 98, 120, 804);		 
$rolls[] = new Roll($id++, 98, 120, 804);		 

$container = new Container(1203.2, 350, 259, 25500, 30, 10); // $length, $width, $height, $maxWeight, $maxCMDeviationLength, $maxCMDeviationWidth  12032x2350x2590

header('Content-Type: application/json');

//print_r($rolls);
//$result = optimizeRollsPlacement($rolls, $container);
$container->optimizedPlacement($rolls);
$result = $container;
//print_r($result);

// Вывод результата в JSON для JS
echo json_encode($result, JSON_PRETTY_PRINT);
?>