import { SerialPort } from 'serialport';

const SERIAL_PATH = process.env.SERIAL_PORT || 'COM5'; // Change to your port
const port = new SerialPort({ path: SERIAL_PATH, baudRate: 115200 });

// 32 hex chars = 128-bit hypervector
const testHex = '1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D\n';

port.on('open', () => {
    console.log(`Sending test hypervector to ${SERIAL_PATH}...`);
    port.write(testHex, (err) => {
        if (err) return console.error('Write error:', err.message);
        console.log('Sent successfully!');
        setTimeout(() => port.close(), 1000);
    });
});