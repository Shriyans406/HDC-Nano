import { WebSocketServer } from 'ws';

const WS_PORT = 8080;
const wss = new WebSocketServer({ port: WS_PORT });

console.log(`[HDC Mock Generator] Running on ws://localhost:${WS_PORT}`);

const CLASSES = [
    { id: 0, name: 'Circle Gesture' },
    { id: 1, name: 'Swipe Left' },
    { id: 2, name: 'Swipe Right' },
    { id: 3, name: 'Wave' }
];

setInterval(() => {
    if (wss.clients.size === 0) return;

    const currentClass = CLASSES[Math.floor(Math.random() * CLASSES.length)];
    const hammingDistance = Math.floor(Math.random() * 25) + 8;
    const matchScore = parseFloat((((128 - hammingDistance) / 128) * 100).toFixed(1));

    const hypervector = Array.from({ length: 128 }, () => (Math.random() > 0.5 ? 1 : 0));

    const packet = {
        timestamp: Date.now(),
        packetType: 1,
        classId: currentClass.id,
        className: currentClass.name,
        hammingDistance,
        matchScore,
        hypervector,
        rawBytesHex: Buffer.from(hypervector.slice(0, 16)).toString('hex')
    };

    const payload = JSON.stringify(packet);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(payload);
    });
}, 33);