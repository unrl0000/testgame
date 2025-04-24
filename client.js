const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const leaderboardList = document.getElementById('leaderboard-list'); // Get leaderboard element

// --- WebSocket Setup ---
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + window.location.host;
console.log(`Подключаемся к WebSocket по адресу: ${wsUrl}`);
const ws = new WebSocket(wsUrl);

// --- Game State ---
let myPlayerId = null;
let players = {}; // Local cache of player states { id: { x, y, color, maxX } }
const playerSize = 20;
const moveSpeed = 4; // Slightly adjusted speed

// --- Movement Input State ---
const keysPressed = {};
let lastSentPosition = { x: -1, y: -1 }; // Track last sent position
const MOVE_SEND_INTERVAL = 50; // Send updates roughly every 50ms if moving
let lastMoveSendTime = 0;

// --- WebSocket Event Handlers ---
ws.onopen = () => {
    console.log('WebSocket соединение установлено.');
};

ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        // console.log("Message from server:", message); // Debugging

        switch (message.type) {
            case 'init':
                myPlayerId = message.payload.id;
                players = message.payload.players; // Initialize with full state
                console.log(`Вы игрок ${myPlayerId}`);
                console.log('Текущие игроки:', players);
                // Start the game loop ONLY after initialization
                requestAnimationFrame(gameLoop);
                break;

            case 'player_joined':
                // Add new player only if it's not us and doesn't exist
                if (message.payload.id !== myPlayerId && !players[message.payload.id]) {
                     console.log(`Игрок ${message.payload.id} присоединился.`);
                     players[message.payload.id] = message.payload; // Add the new player data
                 }
                break;

            case 'player_moved':
                // Update position of OTHER players directly from server
                if (message.payload.id !== myPlayerId && players[message.payload.id]) {
                    players[message.payload.id].x = message.payload.x;
                    players[message.payload.id].y = message.payload.y;
                    // We could update maxX here too if needed for local display, but leaderboard handles scores
                }
                // We *don't* update our own position based on server 'move' messages
                // to avoid the jitter. Our local prediction handles our movement.
                break;

            case 'player_left':
                 if (players[message.payload.id]) {
                    console.log(`Игрок ${message.payload.id} покинул игру.`);
                    delete players[message.payload.id];
                 }
                break;

            case 'leaderboard_update':
                // console.log("Leaderboard update:", message.payload); // Debugging
                updateLeaderboard(message.payload);
                break;

            default:
                console.log('Неизвестный тип сообщения:', message.type);
        }
    } catch (error) {
        console.error('Ошибка обработки сообщения от сервера:', error);
        console.error('Полученные данные:', event.data);
    }
};

ws.onerror = (error) => {
    console.error('WebSocket ошибка:', error);
    updateStatus('Ошибка подключения к серверу. Обновите страницу.');
};

ws.onclose = () => {
    console.log('WebSocket соединение закрыто.');
    updateStatus('Соединение потеряно. Обновите страницу.');
    players = {}; // Clear players
    myPlayerId = null;
    // Stop the game loop if it's running (optional, prevents errors)
    // (Need a way to cancel requestAnimationFrame if we were storing its ID)
};

// --- Input Handling ---
document.addEventListener('keydown', (event) => {
    keysPressed[event.key.toLowerCase()] = true; // Use lower case for consistency
});

document.addEventListener('keyup', (event) => {
    delete keysPressed[event.key.toLowerCase()];
});

// --- Game Loop ---
function gameLoop(timestamp) {
    if (!myPlayerId || !players[myPlayerId]) {
        // If we lost connection or haven't initialized, stop the loop
        // We might need a more robust way to handle stopping/restarting
         requestAnimationFrame(gameLoop); // Keep trying if not initialized yet
        return;
    }

    handleMovement(); // Calculate new position based on input
    sendMovementIfNeeded(); // Send position update to server if needed
    drawGame(); // Draw the current state

    requestAnimationFrame(gameLoop); // Schedule the next frame
}

// --- Movement Logic ---
function handleMovement() {
    const player = players[myPlayerId];
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (keysPressed['arrowup'] || keysPressed['w']) dy -= moveSpeed;
    if (keysPressed['arrowdown'] || keysPressed['s']) dy += moveSpeed;
    if (keysPressed['arrowleft'] || keysPressed['a']) dx -= moveSpeed;
    if (keysPressed['arrowright'] || keysPressed['d']) dx += moveSpeed;

    if (dx !== 0 || dy !== 0) {
        let newX = player.x + dx;
        let newY = player.y + dy;

        // Boundary checks
        newX = Math.max(0, Math.min(canvas.width - playerSize, newX));
        newY = Math.max(0, Math.min(canvas.height - playerSize, newY));

        // Update local position immediately for responsiveness
        player.x = newX;
        player.y = newY;
        // Update local max score (used for leaderboard calculation on server)
        player.maxX = Math.max(player.maxX || 0, newX);
    }
}

// --- Send Movement Updates (Performance Improvement) ---
function sendMovementIfNeeded() {
    const player = players[myPlayerId];
    if (!player) return;

    const now = Date.now();
    // Check if position changed AND enough time has passed since last send
    if ((player.x !== lastSentPosition.x || player.y !== lastSentPosition.y) &&
        (now - lastMoveSendTime > MOVE_SEND_INTERVAL))
    {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'move',
                payload: { x: player.x, y: player.y }
            }));
            lastSentPosition.x = player.x;
            lastSentPosition.y = player.y;
            lastMoveSendTime = now;
            // console.log("Sent move:", {x: player.x, y: player.y}); // Debugging
        }
    }
}

// --- Drawing ---
function drawGame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all players
    for (const id in players) {
        const player = players[id];
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, playerSize, playerSize);

        // Optional: Draw player ID
        ctx.fillStyle = 'black';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.id, player.x + playerSize / 2, player.y - 5);
    }
}

// --- UI Updates ---
function updateLeaderboard(leaderboardData) {
    leaderboardList.innerHTML = ''; // Clear previous list

    if (!leaderboardData || leaderboardData.length === 0) {
        leaderboardList.innerHTML = '<li>Пока нет лидеров...</li>';
        return;
    }

    leaderboardData.forEach(leader => {
        const li = document.createElement('li');
        // Use a span for the colored ID part
        li.innerHTML = `
            <span class="player-id" style="color: ${leader.color}; text-shadow: 1px 1px 1px #aaa;">Игрок ${leader.id}</span>
            <span class="player-score">${leader.score}</span>
        `;
        leaderboardList.appendChild(li);
    });
}

function updateStatus(message) {
    // Could display this message somewhere on the page, e.g., below the canvas
    const statusElement = document.querySelector('p'); // Reuse existing paragraph for simplicity
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = 'red';
        statusElement.style.fontWeight = 'bold';
    }
     // Also show an alert for critical errors/disconnections
     alert(message);
}

// Note: requestAnimationFrame(gameLoop) is now called inside the 'init' message handler
