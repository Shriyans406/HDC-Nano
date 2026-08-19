import React from "react";
import { Cpu, CheckCircle2, AlertCircle } from "lucide-react";

export function ClassPredictionCard({ packet }) {
  if (!packet) {
    return (
      <div className="bg-hdc-card border border-hdc-border rounded-xl p-6 shadow-lg flex flex-col justify-between h-56 animate-pulse">
        <div className="h-4 bg-hdc-border rounded w-1/3"></div>
        <div className="h-10 bg-hdc-border rounded w-2/3 my-4"></div>
        <div className="h-4 bg-hdc-border rounded w-1/2"></div>
      </div>
    );
  }

  const { className, matchScore, classId = 255 } = packet ?? {};
  const safeMatchScore = Number.isFinite(matchScore) ? matchScore : 0;
  const safeClassId = Number.isFinite(classId) ? classId : 255;
  const isHighConfidence = safeMatchScore >= 75.0;

  return (
    <div className="bg-hdc-card border border-hdc-border rounded-xl p-6 shadow-lg flex flex-col justify-between h-56 relative overflow-hidden">
      <div
        className={`absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isHighConfidence ? "bg-hdc-cyan" : "bg-hdc-amber"
        }`}
      />

      <div>
        <div className="flex justify-between items-center text-slate-400 text-xs font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-hdc-cyan" /> Class Prediction Engine
          </span>
          <span className="bg-hdc-border text-slate-300 px-2 py-0.5 rounded text-[10px]">
            ID: 0x
            {Number(safeClassId).toString(16).padStart(2, "0").toUpperCase()}
          </span>
        </div>

        <h2 className="text-3xl font-extrabold text-white mt-4 tracking-tight">
          {className}
        </h2>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-slate-400 font-mono">
            Similarity Match
          </span>
          <span
            className={`text-sm font-bold font-mono ${isHighConfidence ? "text-hdc-cyan" : "text-hdc-amber"}`}
          >
            {safeMatchScore}%
          </span>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
          <div
            className={`h-2.5 rounded-full transition-all duration-150 ${
              isHighConfidence ? "bg-hdc-cyan" : "bg-hdc-amber"
            }`}
            style={{ width: `${safeMatchScore}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 mt-3 text-xs">
          {isHighConfidence ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-hdc-green" />
              <span className="text-hdc-green font-medium">
                Strong Item Memory Lock
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-hdc-amber" />
              <span className="text-hdc-amber font-medium">
                Marginal Confidence
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
