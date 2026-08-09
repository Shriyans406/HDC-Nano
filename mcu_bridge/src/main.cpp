#include <Arduino.h>
#include <LittleFS.h>
#include <Shrike.h> // Updated from ShrikeFlash.h

// ----------------------------------------------------------------------------
// Pin Definitions (Matched to Phase 2 I/O Planner Matrix)
// ----------------------------------------------------------------------------
const int PIN_BUS_DATA[6] = {0, 1, 2, 3, 4, 5};
const int PIN_STROBE = 6;
const int PIN_RST_N = 7;
const int PIN_FPGA_CLK = 8;

const int PIN_FPGA_OUT[6] = {10, 11, 12, 13, 14, 15};

const char *BITSTREAM_PATH = "/hdc_core_bitstream.bin";

// Instance of Vicharak's Shrike driver
ShrikeFlash fpgaFlasher;

// ----------------------------------------------------------------------------
// Low-level Bus Helpers
// ----------------------------------------------------------------------------
void pulseClock(int cycles) {
  for (int i = 0; i < cycles; i++) {
    digitalWrite(PIN_FPGA_CLK, HIGH);
    delayMicroseconds(1);
    digitalWrite(PIN_FPGA_CLK, LOW);
    delayMicroseconds(1);
  }
}

void sendNibbleToFPGA(uint8_t nibble6bit) {
  for (int i = 0; i < 6; i++) {
    pinMode(PIN_BUS_DATA[i], OUTPUT);
    digitalWrite(PIN_BUS_DATA[i], (nibble6bit >> i) & 0x01);
  }
  digitalWrite(PIN_STROBE, HIGH);
  delayMicroseconds(2);
  pulseClock(1); // Clock posedge while STROBE is HIGH
  delayMicroseconds(2);
  digitalWrite(PIN_STROBE, LOW);
  delayMicroseconds(2);
}

uint8_t readFPGAOutput() {
  uint8_t val = 0;
  for (int i = 0; i < 6; i++) {
    pinMode(PIN_FPGA_OUT[i], INPUT);
    if (digitalRead(PIN_FPGA_OUT[i]) == HIGH) {
      val |= (1 << i);
    }
  }
  return val;
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(2000); // Allow USB CDC to settle

  Serial.println(
      "{\"status\":\"booting\",\"msg\":\"RP2040 Shrike Bridge Initializing\"}");

  // Initialize bus pins
  for (int i = 0; i < 6; i++) {
    pinMode(PIN_BUS_DATA[i], OUTPUT);
    digitalWrite(PIN_BUS_DATA[i], LOW);
  }

  pinMode(PIN_STROBE, OUTPUT);
  digitalWrite(PIN_STROBE, LOW);

  pinMode(PIN_RST_N, OUTPUT);
  digitalWrite(PIN_RST_N, LOW);

  pinMode(PIN_FPGA_CLK, OUTPUT);
  digitalWrite(PIN_FPGA_CLK, LOW);

  for (int i = 0; i < 6; i++) {
    pinMode(PIN_FPGA_OUT[i], INPUT_PULLDOWN);
  }

  // Initialize Earle Philhower LittleFS
  if (!LittleFS.begin()) {
    Serial.println("{\"status\":\"error\",\"msg\":\"LittleFS Mount Failed. Did "
                   "you run uploadfs?\"}");
    return;
  }

  // Verify bitstream exists in LittleFS
  if (!LittleFS.exists(BITSTREAM_PATH)) {
    Serial.println("{\"status\":\"error\",\"msg\":\"hdc_core_bitstream.bin not "
                   "found in LittleFS data directory!\"}");
    return;
  }

  Serial.println("{\"status\":\"flashing\",\"msg\":\"Programming SLG47910 "
                 "ForgeFPGA...\"}");

  // Initialize Shrike Flash driver
  fpgaFlasher.begin();

  // Flash the bitstream file using ShrikeFlash
  bool success = fpgaFlasher.flash(BITSTREAM_PATH);

  // Release SPI peripheral so GP0..GP3 return to normal GPIO mode for 6-bit data bus
  SPI.end();

  if (success) {
    Serial.println(
        "{\"status\":\"success\",\"msg\":\"FPGA Configured Successfully\"}");
  } else {
    Serial.println("{\"status\":\"error\",\"msg\":\"ShrikeFlash bitstream "
                   "upload failed\"}");
  }

  // Pulse FPGA Reset (RST_N) LOW then HIGH after flashing to guarantee clean STATE_IDLE
  digitalWrite(PIN_RST_N, LOW);
  delay(10);
  digitalWrite(PIN_RST_N, HIGH);
  delay(10);
  pulseClock(10);

  Serial.println("{\"status\":\"ready\",\"msg\":\"Nano-HDC Bridge Active\"}");
}

// ----------------------------------------------------------------------------
// Main Communication Loop
// ----------------------------------------------------------------------------
void loop() {
  if (Serial.available() > 0) {
    String hexString = Serial.readStringUntil('\n');
    hexString.trim();

    if (hexString.length() == 0) return;

    if (hexString.equalsIgnoreCase("REFLASH")) {
      setup();
      return;
    }

    if (hexString.equalsIgnoreCase("RESET")) {
      digitalWrite(PIN_RST_N, LOW);
      delay(20);
      digitalWrite(PIN_RST_N, HIGH);
      delay(20);
      Serial.println("{\"status\":\"reset\",\"msg\":\"FPGA Reset Complete\"}");
      return;
    }

    if (hexString.length() != 32) {
      Serial.print("{\"status\":\"error\",\"msg\":\"Expected 32 hex chars (128-bit HV), got ");
      Serial.print(hexString.length());
      Serial.print(" chars: '");
      Serial.print(hexString);
      Serial.println("'\"}");
      return;
    }

    // Pulse RST_N to guarantee clean STATE_IDLE before starting new hypervector
    digitalWrite(PIN_RST_N, LOW);
    delay(10);
    digitalWrite(PIN_RST_N, HIGH);
    delay(10);
    pulseClock(10);

    // Convert 32-char hex string to 16 bytes (128 bits)
    uint8_t bytes[16];
    for (int i = 0; i < 16; i++) {
      String byteHex = hexString.substring(i * 2, i * 2 + 2);
      bytes[i] = (uint8_t)strtol(byteHex.c_str(), NULL, 16);
    }

    // Stream 128-bit hypervector to FPGA across 23 nibbles
    // Nibbles 1..22: send with STROBE pulse
    for (int n = 0; n < 22; n++) {
      uint8_t nibble = 0;
      int startBit = n * 6;
      for (int b = 0; b < 6; b++) {
        int overallBit = startBit + b;
        if (overallBit < 128) {
          int byteIdx = overallBit / 8;
          int bitIdx = 7 - (overallBit % 8);
          if ((bytes[byteIdx] >> bitIdx) & 0x01) {
            nibble |= (1 << b);
          }
        }
      }
      sendNibbleToFPGA(nibble);
    }

    // Send Nibble 23 with STROBE held HIGH to initiate and maintain COMPUTE -> DONE state
    uint8_t finalNibble = 0;
    int startBit23 = 22 * 6;
    for (int b = 0; b < 6; b++) {
      int overallBit = startBit23 + b;
      if (overallBit < 128) {
        int byteIdx = overallBit / 8;
        int bitIdx = 7 - (overallBit % 8);
        if ((bytes[byteIdx] >> bitIdx) & 0x01) {
          finalNibble |= (1 << b);
        }
      }
    }

    for (int i = 0; i < 6; i++) {
      digitalWrite(PIN_BUS_DATA[i], (finalNibble >> i) & 0x01);
    }
    digitalWrite(PIN_STROBE, HIGH);
    delayMicroseconds(2);
    pulseClock(1); // Triggers STATE_LOAD -> STATE_COMPUTE transition in hdc_core.v
    delayMicroseconds(2);
    // STROBE remains HIGH so hdc_core.v holds STATE_DONE after computing!

    // Pulse clock for computation (64 cycles needed for 4 classes x 16 slices)
    pulseClock(80);

    // Read result while STROBE is still HIGH (FPGA is latched in STATE_DONE)
    uint8_t fpgaResult = readFPGAOutput();
    bool doneFlag = (fpgaResult >> 5) & 0x01;
    uint8_t predictedClass = fpgaResult & 0x03;

    // Release STROBE to LOW and clock once so FPGA returns to STATE_IDLE
    digitalWrite(PIN_STROBE, LOW);
    delayMicroseconds(2);
    pulseClock(2);

    if (doneFlag) {
      Serial.print("{\"status\":\"result\",\"predictedClass\":");
      Serial.print(predictedClass);
      Serial.print(",\"raw\":");
      Serial.print(fpgaResult);
      Serial.print(",\"hex\":\"");
      Serial.print(hexString);
      Serial.println("\"}");
    } else {
      Serial.print("{\"status\":\"error\",\"msg\":\"FPGA prediction timeout\",\"lastRaw\":");
      Serial.print(fpgaResult);
      Serial.println("}");
    }
  }
}