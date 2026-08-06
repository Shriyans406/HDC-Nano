#include <Arduino.h>
#include <LittleFS.h>
#include <ShrikeFlash.h>

// ----------------------------------------------------------------------------
// Pin Definitions (Matching Go Configure I/O Planner Matrix)
// ----------------------------------------------------------------------------
const int PIN_BUS_DATA[6] = {0, 1, 2,
                             3, 4, 5}; // Outputs to FPGA bridge_in[0:5]
const int PIN_STROBE = 6;              // Output to FPGA bridge_strobe
const int PIN_RST_N = 7;               // Output to FPGA rst_n
const int PIN_FPGA_CLK = 8;            // Output to FPGA clk

const int PIN_FPGA_OUT[6] = {10, 11, 12,
                             13, 14, 15}; // Inputs from FPGA bridge_out[0:5]

// Bitstream parameters
const char *BITSTREAM_PATH = "/hdc_core_bitstream.bin";

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

void sendNibbleToFPGA(uint8_t nibble6bit) {
  for (int i = 0; i < 6; i++) {
    digitalWrite(PIN_BUS_DATA[i], (nibble6bit >> i) & 0x01);
  }
  // Pulse Strobe
  digitalWrite(PIN_STROBE, HIGH);
  delayMicroseconds(2);
  digitalWrite(PIN_STROBE, LOW);
  delayMicroseconds(2);
}

uint8_t readFPGAOutput() {
  uint8_t val = 0;
  for (int i = 0; i < 6; i++) {
    if (digitalRead(PIN_FPGA_OUT[i]) == HIGH) {
      val |= (1 << i);
    }
  }
  return val;
}

// Generates clock pulses if FPGA relies on external RP2040 clock
void pulseClock(int cycles) {
  for (int i = 0; i < cycles; i++) {
    digitalWrite(PIN_FPGA_CLK, HIGH);
    delayMicroseconds(1);
    digitalWrite(PIN_FPGA_CLK, LOW);
    delayMicroseconds(1);
  }
}

// ----------------------------------------------------------------------------
// Setup: Bitstream Flash & Hardware Initialization
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000)
    ; // Wait for Serial console connection

  Serial.println(
      "{\"status\":\"booting\",\"msg\":\"RP2040 Initialization Started\"}");

  // Configure GPIO directions
  for (int i = 0; i < 6; i++) {
    pinMode(PIN_BUS_DATA[i], OUTPUT);
    digitalWrite(PIN_BUS_DATA[i], LOW);
    pinMode(PIN_FPGA_OUT[i], INPUT);
  }
  pinMode(PIN_STROBE, OUTPUT);
  digitalWrite(PIN_STROBE, LOW);

  pinMode(PIN_RST_N, OUTPUT);
  digitalWrite(PIN_RST_N, LOW); // Hold FPGA in reset

  pinMode(PIN_FPGA_CLK, OUTPUT);
  digitalWrite(PIN_FPGA_CLK, LOW);

  // Initialize LittleFS to access bitstream file
  if (!LittleFS.begin()) {
    Serial.println("{\"status\":\"error\",\"msg\":\"LittleFS Mount Failed!\"}");
    return;
  }

  // Program SLG47910 ForgeFPGA using ShrikeFlash
  Serial.println("{\"status\":\"flashing\",\"msg\":\"Flashing Bitstream to "
                 "ForgeFPGA...\"}");

  ShrikeFlash fpgaFlasher;
  bool flashedSuccessfully = fpgaFlasher.flashBitstream(BITSTREAM_PATH);

  if (flashedSuccessfully) {
    Serial.println(
        "{\"status\":\"success\",\"msg\":\"FPGA Configured Successfully!\"}");
  } else {
    Serial.println("{\"status\":\"error\",\"msg\":\"FPGA Flash Failed! Check "
                   "connections.\"}");
  }

  // Release FPGA reset
  delay(10);
  digitalWrite(PIN_RST_N, HIGH);
  delay(10);

  Serial.println(
      "{\"status\":\"ready\",\"msg\":\"Nano-HDC Bridge Ready for Streaming\"}");
}

// ----------------------------------------------------------------------------
// Main Loop: USB Serial Pass-through & Pipeline Execution
// ----------------------------------------------------------------------------
void loop() {
  // Expect 32 Hex Characters (128-bit Hypervector) from Host PC
  if (Serial.available() >= 32) {
    String hexString = Serial.readStringUntil('\n');
    hexString.trim();

    if (hexString.length() != 32) {
      Serial.println("{\"status\":\"error\",\"msg\":\"Invalid vector length. "
                     "Expected 32 hex chars.\"}");
      return;
    }

    // Convert Hex String into 16-byte buffer
    uint8_t bytes[16];
    for (int i = 0; i < 16; i++) {
      String byteHex = hexString.substring(i * 2, (i * 2) + 2);
      bytes[i] = (uint8_t)strtol(byteHex.c_str(), NULL, 16);
    }

    // 1. Stream 128-bit vector to FPGA over 6-bit bus (22 nibble transmissions)
    int totalBits = 128;
    int currentBitIndex = 0;

    while (currentBitIndex < totalBits) {
      uint8_t nibble = 0;
      for (int b = 0; b < 6 && (currentBitIndex + b) < totalBits; b++) {
        int overallBit = currentBitIndex + b;
        int byteIdx = overallBit / 8;
        int bitIdx = 7 - (overallBit % 8);

        if ((bytes[byteIdx] >> bitIdx) & 0x01) {
          nibble |= (1 << b);
        }
      }

      sendNibbleToFPGA(nibble);
      pulseClock(2); // Provide FPGA computation clock cycles
      currentBitIndex += 6;
    }

    // 2. Pulse clocks to let FPGA complete distance calculation across all
    // classes
    pulseClock(100);

    // 3. Read FPGA Prediction from Output Bus
    uint8_t fpgaResult = readFPGAOutput();
    bool doneFlag = (fpgaResult >> 5) & 0x01;
    uint8_t predictedClass = fpgaResult & 0x03;

    // 4. Return result over Serial to Dashboard
    if (doneFlag) {
      Serial.print("{\"status\":\"result\",\"predictedClass\":");
      Serial.print(predictedClass);
      Serial.print(",\"hex\":\"");
      Serial.print(hexString);
      Serial.println("\"}");
    } else {
      Serial.println("{\"status\":\"error\",\"msg\":\"FPGA timed out or "
                     "inference incomplete.\"}");
    }
  }
}