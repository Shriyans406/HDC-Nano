'use client';

import React from 'react';
import { useHDCStream } from '../hooks/useHDCStream';
import { ClassPredictionCard } from '../components/ClassPredictionCard';
import { HammingDistanceGauge } from '../components/HammingDistanceGauge';
import { HypervectorHeatmap } from '../components/HypervectorHeatmap';
import { TelemetryBar } from '../components/TelemetryBar';

export default function HDCDashboard() {
  const { packet, isConnected, fps, totalPackets, latency } = useHDCStream('ws://localhost:8080');

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

          <div className="text-right font-mono text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="text-slate-500">SYSTEM STATUS:</span>{' '}
            <span className={isConnected ? 'text-hdc-green font-bold' : 'text-hdc-red font-bold'}>
              {isConnected ? 'STREAMING' : 'OFFLINE'}
            </span>
          </div>
        </header>

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