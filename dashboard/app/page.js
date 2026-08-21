"use client";

import React, { useState } from "react";
import { useHDCStream } from "../hooks/useHDCStream";
import { ClassPredictionCard } from "../components/ClassPredictionCard";
import { HammingDistanceGauge } from "../components/HammingDistanceGauge";
import { HypervectorHeatmap } from "../components/HypervectorHeatmap";
import { TelemetryBar } from "../components/TelemetryBar";

export default function HDCDashboard() {
  const [isFrozen, setIsFrozen] = useState(false);
  const { packet, isConnected, hardwareStatus, fps, totalPackets, latency } =
    useHDCStream("ws://localhost:8080", isFrozen);

  const activeBitCount =
    packet?.hypervector?.filter((bit) => bit === 1).length ?? 0;
  const isHardwareOnline = isConnected && hardwareStatus === "ONLINE";

  return (
    <main className="min-h-screen bg-hdc-dark text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-hdc-border gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              SHRIKE LITE <span className="text-hdc-cyan">HDC ACCELERATOR</span>{" "}
              DASHBOARD
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Hardware: Vicharak Shrike Lite (ForgeFPGA SLG47910 + RP2040) |
              Core: 128-Bit HDC
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFrozen((prev) => !prev)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                isFrozen
                  ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {isFrozen ? "▶ Resume Stream" : "⏸ Freeze Frame"}
            </button>

            <div className="text-right font-mono text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500">SYSTEM STATUS:</span>{" "}
              <span
                className={
                  isHardwareOnline
                    ? "text-hdc-green font-bold"
                    : "text-hdc-red font-bold"
                }
              >
                {isHardwareOnline
                  ? isFrozen
                    ? "FROZEN"
                    : "STREAMING"
                  : "OFFLINE"}
              </span>
            </div>
          </div>
        </header>

        {isFrozen && packet && (
          <div className="mb-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-2 font-mono text-sm text-amber-300">
            <span>
              FROZEN FRAME HEX:{" "}
              <strong className="text-amber-200">{packet.rawBytesHex}</strong>
            </span>
            <span>
              ACTIVE BITS:{" "}
              <strong className="text-amber-200">{activeBitCount}</strong> / 128
            </span>
          </div>
        )}

        <TelemetryBar
          isConnected={isHardwareOnline}
          fps={fps}
          totalPackets={totalPackets}
          latency={latency}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ClassPredictionCard packet={packet} />
          <HammingDistanceGauge
            distance={packet?.hammingDistance ?? 0}
            threshold={42}
          />
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                FPGA ACCELERATOR BENCHMARK
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
              SLG47910 Core
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wide">
                Throughput
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-bold font-mono text-cyan-400">
                  {packet?.hvsRate ?? 0}
                </span>
                <span className="text-xs font-mono text-slate-400">HVS</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                Hypervectors / sec
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wide">
                Hardware Latency
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {packet?.fpgaLatencyUs ?? 124}
                </span>
                <span className="text-xs font-mono text-slate-400">μs</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                Parallel XOR compute
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400">Offload Efficiency Gain:</span>
            <span className="text-emerald-400 font-bold">
              ~{((1 - (packet?.fpgaLatencyUs ?? 124) / 10000) * 100).toFixed(1)}
              % MCU Cycle Reduction
            </span>
          </div>
        </div>

        <HypervectorHeatmap hypervector={packet?.hypervector ?? []} />
      </div>
    </main>
  );
}
