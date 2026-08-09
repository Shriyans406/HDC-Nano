import time
import json
import serial
from hdc_encoder import HDCEncoder128, generate_synthetic_gesture

# --- CONFIGURATION ---
COM_PORT = "COM9"      # Change to your RP2040 COM Port
BAUD_RATE = 115200
STREAM_COUNT = 10       # Number of test samples to transmit per class

def run_serial_pipeline():
    print(f"[PC Encoder] Connecting to RP2040 Bridge on {COM_PORT}...")
    try:
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=2)
        time.sleep(2)  # Wait for serial reset settle
    except Exception as e:
        print(f"[Error] Could not open {COM_PORT}: {e}")
        return

    encoder = HDCEncoder128()
    correct_predictions = 0
    total_tests = 0

    print("[PC Encoder] Serial connection established. Starting live stream...\n")

    for target_class in range(4):
        print(f"--- Testing Class {target_class} Gestures ---")
        for i in range(STREAM_COUNT):
            # 1. Generate 2D features and encode to 128-bit HV hex
            gesture = generate_synthetic_gesture(target_class)
            hex_hv = encoder.encode_features(gesture)

            # 2. Transmit 32-hex string over USB CDC
            payload = hex_hv + "\n"
            ser.write(payload.encode('utf-8'))

            # 3. Read JSON Response from RP2040
            response_raw = ser.readline().decode('utf-8').strip()
            
            if response_raw:
                try:
                    res = json.loads(response_raw)
                    if res.get("status") == "result":
                        pred = res.get("predictedClass")
                        is_correct = (pred == target_class)
                        if is_correct:
                            correct_predictions += 1
                        total_tests += 1

                        status_str = "MATCH" if is_correct else "MISMATCH"
                        print(f"[{status_str}] Sent Class {target_class} -> FPGA Predicted Class: {pred}")
                    else:
                        print(f"[Board Message]: {res}")
                except json.JSONDecodeError:
                    print(f"[Raw Output]: {response_raw}")
            else:
                print("[Timeout] No response received from board.")

            time.sleep(0.1)

    ser.close()
    
    if total_tests > 0:
        accuracy = (correct_predictions / total_tests) * 100
        print(f"\n==========================================")
        print(f"Live FPGA Inference Accuracy: {accuracy:.2f}%")
        print(f"==========================================")

if __name__ == "__main__":
    run_serial_pipeline()