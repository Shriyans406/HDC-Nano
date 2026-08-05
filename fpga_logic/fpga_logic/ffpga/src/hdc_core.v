// ============================================================================
// Module: hdc_core
// Description: 128-Bit Hyperdimensional Computing Classifier Top Module
// Target: SLG47910 ForgeFPGA (Vicharak Shrike Lite)
// ============================================================================

module hdc_core (
    input  wire       clk,
    input  wire       rst_n,
    
    // 6-Bit MCU Bridge Interface
    input  wire [5:0] bridge_in,     // Data [5:0] from RP2040
    input  wire       bridge_strobe, // Data Valid / Clock Strobe
    output reg  [5:0] bridge_out     // Output [1:0]=Class ID, [5]=Busy/Done
);

    // ------------------------------------------------------------------------
    // States
    // ------------------------------------------------------------------------
    localparam STATE_IDLE    = 2'b00;
    localparam STATE_LOAD    = 2'b01;
    localparam STATE_COMPUTE = 2'b10;
    localparam STATE_DONE    = 2'b11;

    reg [1:0] state;

    // ------------------------------------------------------------------------
    // Hypervector Storage
    // ------------------------------------------------------------------------
    reg [127:0] query_hv;          // 128-bit incoming vector
    reg [5:0]   load_counter;      // Counter for 6-bit nibble ingestion (22 cycles needed)
    
    // Class Memory Array: 4 classes x 128 bits
    // (Synthesizes into SLG47910 Embedded SRAM / Block RAM)
    reg [127:0] class_memory [0:3];

    // Pre-seed class hypervectors for testing/initialization
    initial begin
        class_memory[0] = 128'hAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; // Class 0
        class_memory[1] = 128'h55555555555555555555555555555555; // Class 1
        class_memory[2] = 128'hFFFFFFFFFFFFFFFF0000000000000000; // Class 2
        class_memory[3] = 128'h0000000000000000FFFFFFFFFFFFFFFF; // Class 3
    end

    // ------------------------------------------------------------------------
    // Execution Registers
    // ------------------------------------------------------------------------
    reg [1:0] class_idx;           // Currently evaluated class (0..3)
    reg [3:0] byte_idx;            // Currently evaluated byte index (0..15)
    reg [7:0] current_popcount;    // Accumulated Hamming distance for class
    
    reg [7:0] min_distance;        // Lowest Hamming distance found
    reg [1:0] best_class;          // Predicted Class ID

    // ------------------------------------------------------------------------
    // Popcount Logic Primitive Sub-slice
    // ------------------------------------------------------------------------
    wire [127:0] xor_vector = query_hv ^ class_memory[class_idx];
    
    // Select current 8-bit slice for hardware-efficient popcount
    reg [7:0] active_byte;
    always @(*) begin
        case (byte_idx)
            4'd0:  active_byte = xor_vector[7:0];
            4'd1:  active_byte = xor_vector[15:8];
            4'd2:  active_byte = xor_vector[23:16];
            4'd3:  active_byte = xor_vector[31:24];
            4'd4:  active_byte = xor_vector[39:32];
            4'd5:  active_byte = xor_vector[47:40];
            4'd6:  active_byte = xor_vector[55:48];
            4'd7:  active_byte = xor_vector[63:56];
            4'd8:  active_byte = xor_vector[71:64];
            4'd9:  active_byte = xor_vector[79:72];
            4'd10: active_byte = xor_vector[87:80];
            4'd11: active_byte = xor_vector[95:88];
            4'd12: active_byte = xor_vector[103:96];
            4'd13: active_byte = xor_vector[111:104];
            4'd14: active_byte = xor_vector[119:112];
            4'd15: active_byte = xor_vector[127:120];
            default: active_byte = 8'h00;
        endcase
    end

    wire [3:0] slice_popcount;
    popcount_8bit u_popcount (
        .data_in(active_byte),
        .count(slice_popcount)
    );

    // ------------------------------------------------------------------------
    // Sequential Control Logic
    // ------------------------------------------------------------------------
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state            <= STATE_IDLE;
            query_hv         <= 128'b0;
            load_counter     <= 6'd0;
            class_idx        <= 2'd0;
            byte_idx         <= 4'd0;
            current_popcount <= 8'd0;
            min_distance     <= 8'hFF; // Initialize to max 255
            best_class       <= 2'd0;
            bridge_out       <= 6'b000000;
        end else begin
            case (state)
                STATE_IDLE: begin
                    bridge_out <= 6'b000000; // Ready flag low
                    min_distance <= 8'hFF;
                    if (bridge_strobe) begin
                        state <= STATE_LOAD;
                        load_counter <= 6'd0;
                        query_hv <= {query_hv[121:0], bridge_in}; // Shift in first 6 bits
                    end
                end

                STATE_LOAD: begin
                    if (bridge_strobe) begin
                        if (load_counter < 6'd21) begin
                            load_counter <= load_counter + 1'b1;
                            query_hv <= {query_hv[121:0], bridge_in};
                        end else begin
                            // Final 2 bits to complete 128-bit vector
                            query_hv <= {query_hv[125:0], bridge_in[1:0]};
                            state <= STATE_COMPUTE;
                            class_idx <= 2'd0;
                            byte_idx <= 4'd0;
                            current_popcount <= 8'd0;
                        end
                    end
                end

                STATE_COMPUTE: begin
                    // Iterate through each 8-bit slice across clock cycles
                    current_popcount <= current_popcount + slice_popcount;

                    if (byte_idx < 4'd15) begin
                        byte_idx <= byte_idx + 1'b1;
                    end else begin
                        // Class Hamming distance fully computed
                        if ((current_popcount + slice_popcount) < min_distance) begin
                            min_distance <= current_popcount + slice_popcount;
                            best_class   <= class_idx;
                        end

                        byte_idx <= 4'd0;
                        current_popcount <= 8'd0;

                        if (class_idx < 2'd3) begin
                            class_idx <= class_idx + 1'b1;
                        end else begin
                            state <= STATE_DONE;
                        end
                    end
                end

                STATE_DONE: begin
                    // Output formatting:
                    // Bit [5]: Done Flag (1 = Valid Prediction)
                    // Bit [1:0]: Predicted Class ID (0..3)
                    bridge_out <= {1'b1, 3'b000, best_class};
                    
                    if (!bridge_strobe) begin
                        state <= STATE_IDLE; // Reset to idle once host clears strobe
                    end
                end
            endcase
        end
    end

endmodule