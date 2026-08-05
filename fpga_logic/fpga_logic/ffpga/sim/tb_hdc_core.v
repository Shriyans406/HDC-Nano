`timescale 1ns / 1ps

module tb_hdc_core;

    reg clk;
    reg rst_n;
    reg [5:0] bridge_in;
    reg bridge_strobe;
    wire [5:0] bridge_out;

    // Instantiate Top Module
    hdc_core uut (
        .clk(clk),
        .rst_n(rst_n),
        .bridge_in(bridge_in),
        .bridge_strobe(bridge_strobe),
        .bridge_out(bridge_out)
    );

    // Clock Generation (10MHz)
    always #50 clk = ~clk;

    // Test Sequence
    integer i;
    reg [127:0] test_vector;

    initial begin
        clk = 0;
        rst_n = 0;
        bridge_in = 0;
        bridge_strobe = 0;

        // Reset system
        #200;
        rst_n = 1;
        #100;

        // Vector closely matching Class 1 (0x55555555555555555555555555555555)
        test_vector = 128'h55555555555555555555555555555554;

        $display("[TB] Loading 128-bit hypervector into HDC Core over 6-bit bridge...");

        // Stream 128 bits via 6-bit increments
        for (i = 0; i < 21; i = i + 1) begin
            bridge_in = test_vector[127 - (i*6) -: 6];
            bridge_strobe = 1;
            #100;
        end
        
        // Push remaining 2 bits
        bridge_in = {test_vector[1:0], 4'b0000};
        bridge_strobe = 1;
        #100;
        
        bridge_strobe = 0;

        // Wait for prediction complete (bridge_out[5] == 1)
        wait(bridge_out[5] == 1'b1);
        
        $display("[TB] Inference Complete!");
        $display("[TB] Predicted Class ID: %d (Expected: 1)", bridge_out[1:0]);

        #200;
        $finish;
    end

endmodule