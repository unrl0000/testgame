const WebSocket = require('ws');
const express = require('express'); // Добавили express
const path = require('path');       // Добавили path для работы с путями
const http = require('http');       // Добавили http

const app = express(); // Создаем express приложение
const server = http.createServer(app); // Создаем HTTP сервер на базе express

// Определяем порт: из переменной окружения или 8080 по умолчанию
const PORT = process.env.PORT || 8080;

// Создаем WebSocket сервер, подключая его к HTTP серверу
const wss = new WebSocket.Server({ server }); // Важно: подключаем к 'server', а не просто порту

let players = {};
let nextPlayerId = 0;

// --- Логика WebSocket (остается почти такой же) ---
wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    const playerColor = getRandomColor();
    players[playerId] = {
        id: playerId,
        x: Math.floor(Math.random() * 500) + 50,
        y: Math.floor(Math.random() * 300) + 50,
        color: playerColor,
        ws: ws
    };
    console.log(`Игрок ${playerId} подключился.`);

    // Отправляем новому игроку его ID и текущее состояние всех игроков
    ws.send(JSON.stringify({
        type: 'init',
        payload: {
            id: playerId,
            players: getPlayersState()
        }
    }));

    // Оповещаем всех остальных о новом игроке
    broadcast({
        type: 'player_joined',
        payload: players[playerId]
    }, ws);

    ws.on('message', (message) => {
         try {
            const data = JSON.parse(message);
            if (data.type === 'move' && players[playerId]) {
                players[playerId].x = data.payload.x;
                players[playerId].y = data.payload.y;
                broadcast({
                    type: 'player_moved',
                    payload: { id: playerId, x: players[playerId].x, y: players[playerId].y }
                });
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Игрок ${playerId} отключился.`);
        const disconnectedPlayerId = playerId;
        delete players[playerId];
        broadcast({
            type: 'player_left',
            payload: { id: disconnectedPlayerId }
        });
    });

     ws.on('error', (error) => {
         console.error(`Ошибка WebSocket у игрока ${playerId}:`, error);
    });
});

// --- Настройка Express для отдачи статических файлов ---
// Указываем, что файлы из текущей директории (__dirname) нужно отдавать как статику
app.use(express.static(__dirname));

// Маршрут для корневого URL - отдаем index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Вспомогательные функции (без изменений) ---
function broadcast(data, senderWs = null) {
    const message = JSON.stringify(data);
    for (const id in players) {
        const player = players[id];
        if (player.ws !== senderWs && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        } else if (!senderWs && player.ws.readyState === WebSocket.OPEN) {
             player.ws.send(message);
        }
    }
}
function getPlayersState() {
    const state = {};
    for (const id in players) {
        state[id] = { id: players[id].id, x: players[id].x, y: players[id].y, color: players[id].color };
    }
    return state;
}
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) { color += letters[Math.floor(Math.random() * 16)]; }
    return color;
}

// --- Запуск HTTP сервера (который включает и WebSocket сервер) ---
server.listen(PORT, () => {
    console.log(`HTTP и WebSocket сервер запущены на порту ${PORT}`);
});
