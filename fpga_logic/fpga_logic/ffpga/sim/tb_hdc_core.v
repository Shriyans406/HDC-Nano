// Custom testbench

`timescale 1ns / 1ps

module tb_hdc_core;

  initial begin

    $dumpfile ("tb_hdc_core.vcd");
    $dumpvars (0, tb_hdc_core);

    $finish;
  end

endmodule
