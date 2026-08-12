import React from 'react';
import { Binary } from 'lucide-react';

export function HypervectorHeatmap({ hypervector = [] }) {
    const bits = hypervector.length === 128 ? hypervector : Array(128).fill(0);
    const activeBitCount = bits.reduce((acc, bit) => acc + bit, 0);

    return (
        <div className="bg-hdc-card border border-hdc-border rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <span className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-wider">
                    <Binary className="w-4 h-4 text-hdc-cyan" /> 128-Bit Candidate Hypervector Space
                </span>
                <span className="text-xs font-mono text-slate-400">
                    Active Bits: <strong className="text-hdc-cyan">{activeBitCount}</strong> / 128
                </span>
            </div>

            <div className="grid grid-cols-16 gap-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                {bits.map((bit, idx) => (
                    <div
                        key={idx}
                        className={`aspect-square rounded-[2px] transition-colors duration-100 flex items-center justify-center text-[9px] font-mono select-none ${bit === 1
                                ? 'bg-hdc-cyan text-slate-950 font-bold shadow-[0_0_6px_rgba(6,182,212,0.6)]'
                                : 'bg-slate-800/60 text-slate-600 border border-slate-800'
                            }`}
                    >
                        {bit}
                    </div>
                ))}
            </div>

            <div className="flex justify-between items-center mt-3 text-[11px] font-mono text-slate-500">
                <span>MSB [127]</span>
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[1px] bg-hdc-cyan inline-block"></span> Bit = 1
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[1px] bg-slate-800 inline-block border border-slate-700"></span> Bit = 0
                    </span>
                </div>
                <span>LSB [0]</span>
            </div>
        </div>
    );
}