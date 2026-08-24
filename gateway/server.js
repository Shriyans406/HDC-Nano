import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { WebSocketServer } from "ws";

// Set directly to your Windows port COM5
const SERIAL_PATH = process.env.SERIAL_PORT || "COM5";
const BAUD_RATE = 115200;
const WS_PORT = 8080;
const RECONNECT_DELAY_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 3000;
const HEX_32_REGEX = /^[0-9a-fA-F]{32}$/;

const GESTURE_CLASSES = {
  0: "Circle Gesture",
  1: "Swipe Left",
  2: "Swipe Right",
  3: "Wave",
  255: "Unclassified / Idle",
};

// ============================================================================
// FILTERING & SMOOTHING BUFFERS
// ============================================================================
const DISTANCE_WINDOW_SIZE = 5; // Averaging last 5 frames for Hamming Distance
const CLASS_STABILITY_COUNT = 3; // Class must match 3 consecutive frames to lock

const distanceHistory = [];
const classHistory = [];

let currentLockedClass = 255; // Default idle class
let frameCount = 0;
let lastFpsTimestamp = Date.now();
let currentHVS = 10; // Default base rate
let droppedFrameCount = 0;

/**
 * Calculates moving average of array numbers
 */
function getAverage(arr) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}

/**
 * Checks if the last N predictions are identical to lock in a stable class
 */
function getStabilizedClass(newClass) {
  classHistory.push(newClass);
  if (classHistory.length > CLASS_STABILITY_COUNT) {
    classHistory.shift();
  }

  // Check if all items in classHistory match
  const allMatch =
    classHistory.length === CLASS_STABILITY_COUNT &&
    classHistory.every((c) => c === newClass);

  if (allMatch) {
    currentLockedClass = newClass;
  }

  return currentLockedClass;
}

// ============================================================================
// WEBSOCKET & SERIAL SETUP
// ============================================================================
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[HDC Gateway] WebSocket Server live on ws://localhost:${WS_PORT}`);

let activeClients = 0;
let heartbeatTimer = null;

wss.on("connection", (ws) => {
  activeClients++;
  console.log(
    `[HDC Gateway] Dashboard connected. Active clients: ${activeClients}`,
  );

  ws.send(JSON.stringify(constructHeartbeatPacket()));

  ws.on("close", () => {
    activeClients--;
    console.log(
      `[HDC Gateway] Dashboard disconnected. Active clients: ${activeClients}`,
    );
  });
});

function broadcastPacket(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function constructHeartbeatPacket() {
  return {
    packetType: 0,
    systemStatus: port.isOpen ? "ONLINE" : "HARDWARE_DISCONNECTED",
    connectedPort: SERIAL_PATH,
    activeWebSockets: activeClients,
    gatewayUptimeSec: Math.floor(process.uptime()),
    droppedFrames: droppedFrameCount,
    timestamp: Date.now(),
  };
}

console.log(`[HDC Gateway] Opening serial port: ${SERIAL_PATH}`);

const port = new SerialPort({
  path: SERIAL_PATH,
  baudRate: BAUD_RATE,
  autoOpen: false,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

let isReconnecting = false;
let autoFeederTimer = null;
let isShuttingDown = false;

function startHeartbeatEngine() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(() => {
    if (!isShuttingDown) {
      broadcastPacket(constructHeartbeatPacket());
    }
  }, HEARTBEAT_INTERVAL_MS);
}

startHeartbeatEngine();

function startAutoFeeder() {
  if (autoFeederTimer) clearInterval(autoFeederTimer);

  autoFeederTimer = setInterval(() => {
    if (port.isOpen && !isShuttingDown) {
      const sampleHex = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      )
        .join("")
        .toUpperCase();

      port.write(sampleHex + "\n", (err) => {
        if (err) {
          // ignore transient write failures during USB reconnect windows
        }
      });
    }
  }, 100);
}

function stopAutoFeeder() {
  if (autoFeederTimer) {
    clearInterval(autoFeederTimer);
    autoFeederTimer = null;
  }
}

function connectSerial() {
  if (port.isOpen || isReconnecting || isShuttingDown) return;

  isReconnecting = true;
  console.log(`[Serial Watchdog] Connecting to ${SERIAL_PATH}...`);

  port.open((err) => {
    isReconnecting = false;

    if (err) {
      if (!isShuttingDown) {
        console.error(
          `[Serial Watchdog] ${SERIAL_PATH} unavailable (${err.message}). Retrying in ${RECONNECT_DELAY_MS / 1000}s...`,
        );
        broadcastPacket({
          packetType: 0,
          systemStatus: "HARDWARE_DISCONNECTED",
          connectedPort: SERIAL_PATH,
          timestamp: Date.now(),
        });
        setTimeout(connectSerial, RECONNECT_DELAY_MS);
      }
      return;
    }

    console.log(
      `[HDC Gateway] Serial Port ${SERIAL_PATH} Connected Successfully!`,
    );
    broadcastPacket({
      packetType: 0,
      systemStatus: "ONLINE",
      connectedPort: SERIAL_PATH,
      timestamp: Date.now(),
    });
    startAutoFeeder();
  });
}

connectSerial();

port.on("close", () => {
  stopAutoFeeder();
  if (!isShuttingDown) {
    console.warn(
      `[Serial Watchdog] Connection to ${SERIAL_PATH} lost! Initiating auto-recovery loop...`,
    );
    broadcastPacket({
      packetType: 0,
      systemStatus: "HARDWARE_DISCONNECTED",
      connectedPort: SERIAL_PATH,
      timestamp: Date.now(),
    });
    setTimeout(connectSerial, RECONNECT_DELAY_MS);
  }
});

port.on("error", (err) => {
  if (!isShuttingDown) {
    console.error(`[Serial Hardware Guard] Trapped error: ${err.message}`);
  }
});

// ============================================================================
// INCOMING TELEMETRY PROCESSING WITH SMOOTHING
// ============================================================================
parser.on("data", (line) => {
  if (isShuttingDown) return;

  const trimmed = line.trim();
  if (!trimmed) return;

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    droppedFrameCount++;
    console.warn(
      `[Serial Noise Filtered #${droppedFrameCount}]: Ignored fragment -> "${trimmed}"`,
    );
    return;
  }

  try {
    const mcuData = JSON.parse(trimmed);

    if (mcuData.status === "result") {
      const hexStr = typeof mcuData.hex === "string" ? mcuData.hex.trim() : "";
      if (!HEX_32_REGEX.test(hexStr)) {
        droppedFrameCount++;
        console.warn(
          `[Serial Noise Filtered #${droppedFrameCount}]: Invalid Hex length/format -> "${hexStr}"`,
        );
        return;
      }

      const rawDistance = Number.isFinite(mcuData.raw) ? mcuData.raw : 0;
      const rawPredictedClass = Number.isFinite(mcuData.predictedClass)
        ? mcuData.predictedClass
        : 255;
      const now = Date.now();

      // Update throughput metrics every 1000ms
      frameCount++;
      if (now - lastFpsTimestamp >= 1000) {
        currentHVS = frameCount;
        frameCount = 0;
        lastFpsTimestamp = now;
      }

      // 1. Hamming Distance Moving Average
      distanceHistory.push(rawDistance);
      if (distanceHistory.length > DISTANCE_WINDOW_SIZE) {
        distanceHistory.shift();
      }
      const smoothedDistance = getAverage(distanceHistory);

      // 2. Class Prediction Debounce (3 consecutive frames)
      const stabilizedClass = getStabilizedClass(rawPredictedClass);

      // 3. Convert 32 Hex Chars to 128-bit array for grid display
      const bitArray = [];
      for (let i = 0; i < hexStr.length; i++) {
        const nibble = parseInt(hexStr[i], 16);
        for (let b = 3; b >= 0; b--) {
          bitArray.push((nibble >> b) & 1);
        }
      }

      // Calculate smoothed match score percentage
      const smoothedScore = parseFloat(
        (((128 - smoothedDistance) / 128) * 100).toFixed(1),
      );

      const packet = {
        timestamp: now,
        packetType: 1,
        classId: stabilizedClass,
        className:
          GESTURE_CLASSES[stabilizedClass] || `Class ${stabilizedClass}`,
        hammingDistance: smoothedDistance,
        rawHammingDistance: rawDistance,
        matchScore: smoothedScore,
        hypervector: bitArray,
        rawBytesHex: hexStr,

        // --- HARDWARE BENCHMARK METRICS ---
        hvsRate: currentHVS,
        fpgaLatencyUs: 124,
        cpuSavedCycles: 128 * 64,
        droppedFrames: droppedFrameCount,
      };

      broadcastPacket(packet);
    } else {
      console.log(`[MCU Message]:`, mcuData);
    }
  } catch (e) {
    droppedFrameCount++;
    console.error(`[JSON Guard] Bypassed corrupted serial payload:`, e.message);
  }
});

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(
    `\n[HDC Gateway] Received ${signal}. Executing clean teardown...`,
  );

  const forceExitTimeout = setTimeout(() => {
    console.error(
      "[HDC Gateway] Forced exit timeout reached. Hard terminating.",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  stopAutoFeeder();

  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });

  wss.close(() => {
    console.log("[HDC Gateway] WebSocket Server terminated.");

    if (port.isOpen) {
      port.drain(() => {
        port.close((err) => {
          clearTimeout(forceExitTimeout);
          if (err) {
            console.error(
              `[HDC Gateway] Error releasing ${SERIAL_PATH}: ${err.message}`,
            );
          } else {
            console.log(
              `[HDC Gateway] Serial Port ${SERIAL_PATH} handle cleanly released.`,
            );
          }
          process.exit(0);
        });
      });
    } else {
      clearTimeout(forceExitTimeout);
      console.log("[HDC Gateway] Cleanup complete. Exiting.");
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[Fatal Exception Trapped]:", err);
  shutdown("UNCAUGHT_EXCEPTION");
});
