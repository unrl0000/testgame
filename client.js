// client.js (начало файла)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Определяем адрес WebSocket сервера
// window.location.host содержит имя хоста и порт (если он не стандартный 80/443)
// window.location.protocol === 'https:' проверяет, используется ли HTTPS
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + window.location.host; // Собираем полный адрес

console.log(`Подключаемся к WebSocket по адресу: ${wsUrl}`);
const ws = new WebSocket(wsUrl); // Используем вычисленный адрес

let myPlayerId = null;
let players = {}; // Локальное хранилище состояния игроков { id: { x, y, color } }
const playerSize = 20; // Размер квадратика игрока
const moveSpeed = 5;   // Скорость перемещения

// --- Обработка соединения ---
ws.onopen = () => {
    console.log('WebSocket соединение установлено.');
};

// --- Обработка сообщений от сервера ---
ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        // console.log("Message from server:", message); // Для отладки

        switch (message.type) {
            case 'init':
                myPlayerId = message.payload.id;
                players = message.payload.players;
                console.log(`Вы игрок ${myPlayerId}`);
                console.log('Текущие игроки:', players);
                requestAnimationFrame(drawGame); // Начать отрисовку после инициализации
                break;
            case 'player_joined':
                if (message.payload.id !== myPlayerId) {
                    players[message.payload.id] = { // Добавляем нового игрока
                        id: message.payload.id,
                        x: message.payload.x,
                        y: message.payload.y,
                        color: message.payload.color
                    };
                    console.log(`Игрок ${message.payload.id} присоединился.`);
                }
                break;
            case 'player_moved':
                if (players[message.payload.id]) { // Обновляем позицию существующего игрока
                    players[message.payload.id].x = message.payload.x;
                    players[message.payload.id].y = message.payload.y;
                }
                break;
            case 'player_left':
                 if (players[message.payload.id]) {
                    console.log(`Игрок ${message.payload.id} покинул игру.`);
                    delete players[message.payload.id]; // Удаляем игрока
                 }
                break;
            default:
                console.log('Неизвестный тип сообщения:', message.type);
        }
    } catch (error) {
        console.error('Ошибка обработки сообщения от сервера:', error);
        console.error('Полученные данные:', event.data);
    }
};

// --- Обработка ошибок и закрытия ---
ws.onerror = (error) => {
    console.error('WebSocket ошибка:', error);
    alert('Ошибка подключения к серверу. Обновите страницу.');
};

ws.onclose = () => {
    console.log('WebSocket соединение закрыто.');
     alert('Соединение с сервером потеряно. Обновите страницу для переподключения.');
     // Можно добавить логику авто-переподключения здесь, но для простоты опустим
     players = {}; // Очищаем игроков при разрыве
     myPlayerId = null;
};

// --- Отрисовка игры ---
function drawGame() {
    // Очистка канваса
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем всех игроков
    for (const id in players) {
        const player = players[id];
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, playerSize, playerSize);

        // Можно добавить ID над игроком для наглядности
        ctx.fillStyle = 'black';
        ctx.font = '10px sans-serif';
        ctx.fillText(player.id, player.x, player.y - 5);
    }

    // Запрашиваем следующий кадр анимации
    requestAnimationFrame(drawGame);
}

// --- Обработка ввода пользователя ---
const keysPressed = {}; // Отслеживаем зажатые клавиши

document.addEventListener('keydown', (event) => {
    keysPressed[event.key] = true;
    handleMovement(); // Обрабатываем движение сразу при нажатии
});

document.addEventListener('keyup', (event) => {
    delete keysPressed[event.key];
    // Можно было бы добавить handleMovement() и здесь, если нужно движение только при зажатии,
    // но текущая реализация проще - шлем апдейт при каждом нажатии.
});

function handleMovement() {
    if (!myPlayerId || !players[myPlayerId]) {
        return; // Не двигаемся, если наш игрок еще не инициализирован
    }

    let moved = false;
    const player = players[myPlayerId];
    let newX = player.x;
    let newY = player.y;

    if (keysPressed['ArrowUp'] || keysPressed['w']) {
        newY -= moveSpeed;
        moved = true;
    }
    if (keysPressed['ArrowDown'] || keysPressed['s']) {
        newY += moveSpeed;
        moved = true;
    }
    if (keysPressed['ArrowLeft'] || keysPressed['a']) {
        newX -= moveSpeed;
        moved = true;
    }
    if (keysPressed['ArrowRight'] || keysPressed['d']) {
        newX += moveSpeed;
        moved = true;
    }

    // Ограничение по границам канваса
    newX = Math.max(0, Math.min(canvas.width - playerSize, newX));
    newY = Math.max(0, Math.min(canvas.height - playerSize, newY));

    // Отправляем новую позицию на сервер, только если она изменилась
    if (moved && (player.x !== newX || player.y !== newY)) {
         // Сначала локально обновляем для отзывчивости (опционально, но улучшает ощущение)
         player.x = newX;
         player.y = newY;

        // Отправляем сообщение серверу
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'move',
                payload: { x: newX, y: newY }
            }));
        }
    }
}

// Важно: Начинаем отрисовку только после получения 'init' сообщения
// requestAnimationFrame(drawGame); // Перенесено в обработчик 'init'
