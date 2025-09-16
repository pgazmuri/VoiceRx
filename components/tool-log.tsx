"use client";
import { motion, AnimatePresence } from 'framer-motion';

export interface ToolCallRecord {
  id: string;
  tool: string;
  args?: any;
  result?: any;
  status: 'pending' | 'completed' | 'error';
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export default function ToolLog({ calls }: { calls: ToolCallRecord[] }) {
  return (
    <div className="h-full flex flex-col text-xs">
      <div className="font-semibold mb-2 text-neutral-300 tracking-wide">Tool Calls</div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <AnimatePresence initial={false}>
          {calls.slice(-50).map(c => (
            <motion.div key={c.id} layout initial={{opacity:0, y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="rounded-md border border-neutral-800 bg-neutral-900/70 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] text-blue-300">{c.tool}</span>
                <span className={`text-[10px] uppercase ${c.status==='completed'?'text-emerald-400': c.status==='error'?'text-red-400':'text-amber-300'}`}>{c.status}</span>
              </div>
              {c.args && (
                <pre className="text-[10px] whitespace-pre-wrap max-h-24 overflow-y-auto text-neutral-400">{JSON.stringify(c.args, null, 0)}</pre>
              )}
              {c.result && (
                <pre className="mt-1 text-[10px] whitespace-pre-wrap max-h-32 overflow-y-auto text-emerald-300">{JSON.stringify(c.result, null, 0)}</pre>
              )}
              {c.error && <div className="text-[10px] text-red-400">{c.error}</div>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
