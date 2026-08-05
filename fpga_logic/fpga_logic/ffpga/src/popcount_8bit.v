// ============================================================================
// Module: popcount_8bit
// Description: Returns the number of '1's in an 8-bit vector using
//              an optimized adder network to fit small FPGA LUT structures.
// ============================================================================
module popcount_8bit (
    input  wire [7:0] data_in,
    output wire [3:0] count
);

    // Split into 2x 4-bit nibbles for LUT efficiency
    wire [2:0] sum_low  = data_in[0] + data_in[1] + data_in[2] + data_in[3];
    wire [2:0] sum_high = data_in[4] + data_in[5] + data_in[6] + data_in[7];

    assign count = sum_low + sum_high;

endmodule