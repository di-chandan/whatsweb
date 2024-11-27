const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class MultiClientWhatsAppLogin {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.clients = {};
        this.clientSessionsDir = path.join(__dirname, 'whatsapp-sessions');
        
        // Sessions directory create karein
        if (!fs.existsSync(this.clientSessionsDir)) {
            fs.mkdirSync(this.clientSessionsDir);
        }

        this.setupRoutes();
        this.setupSocketEvents();
    }

    setupRoutes() {
        this.app.use(express.static('public'));
        this.app.get('/', (req, res) => {
            res.sendFile(__dirname + '/index.html');
        });
    }

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log('New socket client connected');

            socket.on('generate-qr', (clientId) => {
                this.initializeWhatsAppClient(socket, clientId);
            });

            socket.on('disconnect', () => {
                console.log('Socket client disconnected');
            });
        });
    }

    initializeWhatsAppClient(socket, clientId) {
        // Agar pehle se client exist karta hai to usse remove karein
        if (this.clients[clientId]) {
            this.clients[clientId].destroy();
            delete this.clients[clientId];
        }

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: clientId,
                dataPath: path.join(this.clientSessionsDir, clientId)
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox']
            }
        });

        this.clients[clientId] = client;

        client.on('qr', (qr) => {
            qrcode.generate(qr, { small: true });
            socket.emit('qr-generated', { qr, clientId });
            console.log(`QR Generated for Client: ${clientId}`);
        });

        client.on('ready', () => {
            console.log(`Client ${clientId} is ready`);
            socket.emit('login-success', { 
                clientId,
                number: client.info.wid.user 
            });

            this.setupClientMessageHandlers(client, clientId);
        });

        client.on('authenticated', () => {
            console.log(`Authentication successful for ${clientId}`);
        });

        client.on('auth_failure', (msg) => {
            console.log(`Authentication failed for ${clientId}: ${msg}`);
            socket.emit('login-failed', { clientId });
        });

        client.initialize();
    }

    setupClientMessageHandlers(client, clientId) {
        client.on('message', async (message) => {
            // Group messages ignore karein
            if (message.isGroupMsg) return;

            console.log(`Message received on client ${clientId}`);

            if (message.body.toLowerCase().includes('hi')) {
                await client.sendMessage(message.from, `Namaste! Main ${clientId} bot hu.`);
            }
        });
    }

    start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    }
}

const server = new MultiClientWhatsAppLogin();
server.start();