const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ server });

let players = {}; // { id: { id, x, y, color, ws, maxX } }
let nextPlayerId = 0;
const LEADERBOARD_UPDATE_INTERVAL = 3000; // Update leaderboard every 3 seconds

// --- WebSocket Logic ---
wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    const playerColor = getRandomColor();
    const startX = Math.floor(Math.random() * 100) + 50; // Start near left edge
    const startY = Math.floor(Math.random() * 300) + 50;
    players[playerId] = {
        id: playerId,
        x: startX,
        y: startY,
        color: playerColor,
        ws: ws,
        maxX: startX // Initial max score is starting X
    };
    console.log(`Игрок ${playerId} подключился.`);

    // Send initial state to the new player
    ws.send(JSON.stringify({
        type: 'init',
        payload: {
            id: playerId,
            players: getPlayersState() // Send current state of all players
        }
    }));

    // Notify others about the new player
    broadcast({
        type: 'player_joined',
        // Send all relevant info including maxX
        payload: {
             id: players[playerId].id,
             x: players[playerId].x,
             y: players[playerId].y,
             color: players[playerId].color,
             maxX: players[playerId].maxX
        }
    }, ws); // Exclude the sender

    // Send current leaderboard to the new player shortly after connection
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'leaderboard_update',
                payload: getLeaderboard()
            }));
        }
    }, 500);


    ws.on('message', (message) => {
         try {
            const data = JSON.parse(message);
            const player = players[playerId]; // Get ref to player object

            if (!player) return; // Ignore messages if player disconnected somehow

            if (data.type === 'move') {
                // Basic validation/sanitization (optional but good practice)
                const newX = Math.max(0, Math.min(600 - 20, Number(data.payload.x) || player.x)); // Assuming canvas 600x400, player size 20
                const newY = Math.max(0, Math.min(400 - 20, Number(data.payload.y) || player.y));

                player.x = newX;
                player.y = newY;

                // Update max score (furthest right position)
                const oldMaxX = player.maxX;
                player.maxX = Math.max(player.maxX, newX);
                const maxScoreChanged = player.maxX > oldMaxX;

                // Broadcast movement to others
                broadcast({
                    type: 'player_moved',
                    payload: { id: playerId, x: player.x, y: player.y }
                }, ws); // Send to everyone except the sender

                // If the max score changed, potentially trigger a leaderboard update
                // (We also have interval updates, but this makes it slightly more responsive)
                // if (maxScoreChanged) {
                //    broadcastLeaderboard(); // Optional: update leaderboard immediately on score change
                // }
            }
        } catch (error) {
            console.error(`Ошибка обработки сообщения от игрока ${playerId}:`, error);
        }
    });

    ws.on('close', () => {
        console.log(`Игрок ${playerId} отключился.`);
        const disconnectedPlayerId = playerId;
        delete players[playerId];
        broadcast({ // Notify everyone
            type: 'player_left',
            payload: { id: disconnectedPlayerId }
        });
        // Trigger leaderboard update as the leaving player might have been on it
        broadcastLeaderboard();
    });

     ws.on('error', (error) => {
         console.error(`Ошибка WebSocket у игрока ${playerId}:`, error);
         // Attempt to close cleanly if possible
         if (players[playerId]) {
             const disconnectedPlayerId = playerId;
             delete players[playerId];
              broadcast({
                type: 'player_left',
                payload: { id: disconnectedPlayerId }
             });
             broadcastLeaderboard();
         }
    });
});

// --- Express Setup ---
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Helper Functions ---
function broadcast(data, senderWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        // Send to clients that are OPEN and not the sender (if specified)
        if (client.readyState === WebSocket.OPEN && client !== senderWs) {
             try {
                client.send(message);
            } catch (error) {
                console.error('Ошибка отправки сообщения клиенту:', error);
            }
        }
    });
}


// Function to get the current state of all players (excluding ws object)
function getPlayersState() {
    const state = {};
    for (const id in players) {
        const p = players[id];
        state[id] = { id: p.id, x: p.x, y: p.y, color: p.color, maxX: p.maxX };
    }
    return state;
}

// Function to calculate the top 5 leaders based on maxX
function getLeaderboard() {
    return Object.values(players) // Get array of player objects
        .sort((a, b) => b.maxX - a.maxX) // Sort descending by maxX
        .slice(0, 5) // Take top 5
        .map(p => ({ id: p.id, score: Math.round(p.maxX), color: p.color })); // Format for client
}

// Function to broadcast the leaderboard to all connected clients
function broadcastLeaderboard() {
    const leaderboardData = getLeaderboard();
    // console.log("Broadcasting leaderboard:", leaderboardData); // For debugging
    broadcast({ // Use the main broadcast function, sending to everyone
        type: 'leaderboard_update',
        payload: leaderboardData
    });
}


function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) { color += letters[Math.floor(Math.random() * 16)]; }
    // Avoid very light colors that might be hard to see
    const brightness = parseInt(color.substring(1), 16);
    if ((brightness >> 16 & 0xFF) > 200 && (brightness >> 8 & 0xFF) > 200 && (brightness & 0xFF) > 200) {
        return getRandomColor(); // Regenerate if too light
    }
    return color;
}

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`HTTP и WebSocket сервер запущены на порту ${PORT}`);
    // Start periodic leaderboard updates
    setInterval(broadcastLeaderboard, LEADERBOARD_UPDATE_INTERVAL);
});
