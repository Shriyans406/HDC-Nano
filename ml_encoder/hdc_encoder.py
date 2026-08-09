import numpy as np

class HDCEncoder128:
    def __init__(self, input_dim=8, hv_dim=128, seed=42):
        """
        128-Bit Hyperdimensional Computing Encoder using Binarized Random Projection.
        :param input_dim: Number of raw feature inputs (e.g., 8 sampled points per gesture)
        :param hv_dim: Hypervector dimensionality (128 bits)
        """
        self.input_dim = input_dim
        self.hv_dim = hv_dim
        np.random.seed(seed)
        
        # Gaussian Projection Matrix for continuous-to-hypervector encoding
        self.projection_matrix = np.random.randn(input_dim, hv_dim)

    def encode_features(self, features: list) -> str:
        """
        Encodes a list of numerical features into a 128-bit binary hypervector,
        returning it as a 32-character hex string.
        """
        feat_array = np.array(features, dtype=float)
        if len(feat_array) != self.input_dim:
            raise ValueError(f"Expected {self.input_dim} features, got {len(feat_array)}")

        # Matrix Projection: continuous features -> continuous 128D space
        projected = np.dot(feat_array, self.projection_matrix)

        # Binarization: threshold at 0 to produce 128 binary bits (0 or 1)
        binary_bits = (projected > 0).astype(int)

        # Pack 128 binary bits into 16 bytes (32 hex characters)
        byte_array = np.packbits(binary_bits)
        hex_string = byte_array.tobytes().hex().upper()

        return hex_string

def generate_synthetic_gesture(class_id: int) -> list:
    """
    Generates synthetic 2D feature coordinates corresponding to 4 gesture classes:
    Class 0: Horizontal Sweep
    Class 1: Vertical Line
    Class 2: Diagonal Up-Right
    Class 3: Box / Circle Loop
    """
    noise = np.random.normal(0, 0.05, 8)
    
    if class_id == 0:
        # Class 0: Horizontal pattern
        base = np.array([-1.0, 0.0, -0.5, 0.0, 0.5, 0.0, 1.0, 0.0])
    elif class_id == 1:
        # Class 1: Vertical pattern
        base = np.array([0.0, -1.0, 0.0, -0.5, 0.0, 0.5, 0.0, 1.0])
    elif class_id == 2:
        # Class 2: Diagonal Slash pattern
        base = np.array([-1.0, -1.0, -0.5, -0.5, 0.5, 0.5, 1.0, 1.0])
    elif class_id == 3:
        # Class 3: Circular / Box pattern
        base = np.array([-1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0])
    else:
        raise ValueError("Invalid Class ID. Must be 0, 1, 2, or 3.")

    return (base + noise).tolist()

if __name__ == "__main__":
    encoder = HDCEncoder128()
    print("--- Nano-HDC 128-Bit Encoder Unit Test ---")
    
    for c in range(4):
        sample_gesture = generate_synthetic_gesture(c)
        hex_hv = encoder.encode_features(sample_gesture)
        print(f"Class {c} Gesture Features: {[round(x, 2) for x in sample_gesture[:4]]}...")
        print(f"Class {c} Encoded 128-Bit Hex: {hex_hv} (Length: {len(hex_hv)})\n")