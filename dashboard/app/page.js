'use client';

import React, { useState } from 'react';
import { useHDCStream } from '../hooks/useHDCStream';
import { ClassPredictionCard } from '../components/ClassPredictionCard';
import { HammingDistanceGauge } from '../components/HammingDistanceGauge';
import { HypervectorHeatmap } from '../components/HypervectorHeatmap';
import { TelemetryBar } from '../components/TelemetryBar';

export default function HDCDashboard() {
  const [isFrozen, setIsFrozen] = useState(false);
  const { packet, isConnected, fps, totalPackets, latency } = useHDCStream('ws://localhost:8080', isFrozen);

  const activeBitCount = packet?.hypervector?.filter((bit) => bit === 1).length ?? 0;

  return (
    <main className="min-h-screen bg-hdc-dark text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-hdc-border gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              SHRIKE LITE <span className="text-hdc-cyan">HDC ACCELERATOR</span> DASHBOARD
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Hardware: Vicharak Shrike Lite (ForgeFPGA SLG47910 + RP2040) | Core: 128-Bit HDC
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFrozen((prev) => !prev)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                isFrozen
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isFrozen ? '▶ Resume Stream' : '⏸ Freeze Frame'}
            </button>

            <div className="text-right font-mono text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500">SYSTEM STATUS:</span>{' '}
              <span className={isConnected ? 'text-hdc-green font-bold' : 'text-hdc-red font-bold'}>
                {isConnected ? (isFrozen ? 'FROZEN' : 'STREAMING') : 'OFFLINE'}
              </span>
            </div>
          </div>
        </header>

        {isFrozen && packet && (
          <div className="mb-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-2 font-mono text-sm text-amber-300">
            <span>
              FROZEN FRAME HEX: <strong className="text-amber-200">{packet.rawBytesHex}</strong>
            </span>
            <span>
              ACTIVE BITS: <strong className="text-amber-200">{activeBitCount}</strong> / 128
            </span>
          </div>
        )}

        <TelemetryBar
          isConnected={isConnected}
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

        <HypervectorHeatmap hypervector={packet?.hypervector ?? []} />
      </div>
    </main>
  );
}