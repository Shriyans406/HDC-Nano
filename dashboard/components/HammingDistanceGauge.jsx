import React from 'react';
import { Target } from 'lucide-react';

export function HammingDistanceGauge({ distance = 0, threshold = 42 }) {
    const maxDistance = 128;
    const percentage = Math.min(100, (distance / maxDistance) * 100);
    const isMatch = distance <= threshold;

    return (
        <div className="bg-hdc-card border border-hdc-border rounded-xl p-6 shadow-lg flex flex-col justify-between h-56">
            <div className="flex justify-between items-center text-slate-400 text-xs font-mono uppercase tracking-wider">
                <span className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-hdc-cyan" /> Hamming Distance Engine
                </span>
                <span className="text-xs text-slate-400">Max: 128 Bits</span>
            </div>

            <div className="flex items-baseline gap-3 my-2">
                <span className="text-5xl font-black font-mono tracking-tight text-white">
                    {distance}
                </span>
                <span className="text-slate-400 text-sm font-mono">/ 128 bits diff</span>
            </div>

            <div>
                <div className="relative w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-hdc-red z-10"
                        style={{ left: `${(threshold / maxDistance) * 100}%` }}
                    />
                    <div
                        className={`h-full transition-all duration-150 ${isMatch ? 'bg-hdc-green' : 'bg-hdc-red'
                            }`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                <div className="flex justify-between items-center mt-3 text-xs font-mono">
                    <span className="text-slate-400">Threshold: &le; {threshold} bits</span>
                    <span className={isMatch ? 'text-hdc-green font-bold' : 'text-hdc-red font-bold'}>
                        {isMatch ? 'PASS' : 'FAIL'}
                    </span>
                </div>
            </div>
        </div>
    );
}