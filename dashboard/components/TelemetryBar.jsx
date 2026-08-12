import React from 'react';
import { Activity, Clock, Layers } from 'lucide-react';

export function TelemetryBar({ isConnected, fps, totalPackets, latency }) {
    return (
        <div className="bg-hdc-card border border-hdc-border rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                    {isConnected && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hdc-green opacity-75"></span>
                    )}
                    <span
                        className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-hdc-green' : 'bg-hdc-red'
                            }`}
                    ></span>
                </span>
                <span className="font-bold">
                    {isConnected ? 'LIVE SERIAL BRIDGE ONLINE' : 'GATEWAY DISCONNECTED'}
                </span>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-hdc-cyan" />
                    <span className="text-slate-400">Stream Rate:</span>
                    <span className="font-bold text-white">{fps} Hz</span>
                </div>

                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-hdc-cyan" />
                    <span className="text-slate-400">Host Latency:</span>
                    <span className="font-bold text-white">{latency} ms</span>
                </div>

                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-hdc-cyan" />
                    <span className="text-slate-400">Total Frames:</span>
                    <span className="font-bold text-white">{totalPackets.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}