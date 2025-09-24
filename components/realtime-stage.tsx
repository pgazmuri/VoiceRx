"use client";
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui';
import { Mic, Square, Activity, Send } from 'lucide-react';
import { useSettings } from './settings-context';
import { toolSpecs } from '@/lib/tools';
import { REALTIME_PROMPT } from '@/lib/realtime-prompt';
import { SCENARIO_PRESETS } from '@/lib/scenarios';
import ToolLog, { ToolCallRecord } from './tool-log';
import { useFitText } from './use-fit-text';

interface TranscriptItem { id: string; text: string; role: 'user' | 'assistant' | 'system' | 'tool'; meta?: any }

export default function RealtimeStage() {
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const socketRef = useRef<WebSocket | null>(null); // fallback if WebRTC unsupported
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingToolArgsRef = useRef<Record<string,string>>({});
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const callMetaRef = useRef<Record<string, { name?: string; args?: string }>>({});
  const aliasRef = useRef<Record<string,string>>({}); // event call id -> canonical call id
  const lastFunctionCallIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<number>(0);
  // Keep a direct handle to the active microphone stream so we can hard-stop it when ending a session
  const micStreamRef = useRef<MediaStream | null>(null);
  // Prevent concurrent session creations (race from rapid clicks / double invokes)
  const sessionStartingRef = useRef<boolean>(false);
  const [starting, setStarting] = useState(false);
  // Unique UUID per session start (helps distinguish overlapping sessions if any)
  const sessionUUIDRef = useRef<string | null>(null);
  // Track executed tool calls to prevent duplicate executions (some realtime event combos can fire twice: arguments.done + output_item.done)
  // Duplicate guard removed per request: allowing multiple completion events to attempt execution.
  // NOTE: If double executions become an issue, consider reintroducing with a more nuanced state machine (e.g., only guard after successful tool_outputs send).
  // Reintroduced refined guard: only block AFTER we've executed the local tool & sent tool output upstream once.
  const toolOutputsSentRef = useRef<Set<string>>(new Set());
  // While a tool call is in-flight we suppress assistant text deltas so the model doesn't speak before seeing tool output
  const toolCallPendingRef = useRef<boolean>(false);
  // Track last time we received assistant text (helps watchdog decide if model progressed after tool output)
  const lastAssistantTextAtRef = useRef<number>(0);
  // Track per-call watchdog timers so we can cancel if session stops
  const toolOutputWatchdogsRef = useRef<Record<string, number>>({});
  // Debug flag: set true to emit detailed lifecycle logs for realtime tool calls
  const VERBOSE_TOOL_LOGS = true;

  // user text input removed; voice only
  // Live audio transcript overlay state (for flashing spoken text mid-screen)
  const [liveAudio, setLiveAudio] = useState<{ id: string | null; text: string; done: boolean } | null>(null);
  const [stageHeight, setStageHeight] = useState<number>(55);
  // Track audio timing per response id (first & last transcript delta timestamps)
  const audioTimingRef = useRef<Record<string, { start: number; last: number }>>({});
  // Dynamic font sizing refs
  const stageCenterRef = useRef<HTMLDivElement | null>(null);
  const liveTextRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayFontSize, setOverlayFontSize] = useState<number>(40); // legacy state (updated via hook)
  // Pull settings early so we can safely derive initial preset id
  const { scenario, temperature, voice, update } = useSettings();
  // Track selected preset id locally so dropdown reflects user choice even if string comparison fails
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const match = SCENARIO_PRESETS.find(p => p.text === scenario);
    return match ? match.id : 'custom';
  });

  // Resize / fit text to available space (heuristic loop shrink)
  // Fit text with binary search whenever text, stage height, or overlay container changes.
  const fittedSize = useFitText(liveTextRef, stageCenterRef, overlayRef, [liveAudio?.text, stageHeight], { min: 14, max: 84, heightRatio: 0.88, widthRatio: 0.9, debounceMs: 30 });
  useEffect(()=> { if (fittedSize) setOverlayFontSize(fittedSize); }, [fittedSize]);

  // We now connect only when user starts streaming
  useEffect(() => {
    return () => { pcRef.current?.close(); };
  }, []);

  // (moved useSettings() above for correct initialization order)
  // NOTE: scenario is intentionally NOT injected into realtime model instructions anymore to avoid leaking seeded context.

  const handleRealtimeEvent = (data: any) => {
    try {
      if (!data || typeof data !== 'object') {
        if (VERBOSE_TOOL_LOGS) console.warn('[RT_EVT_IGNORED_NONOBJECT]', data);
        return;
      }
      if (VERBOSE_TOOL_LOGS) {
        console.log('[RT_EVT]', {
          event: data.type,
          call_id: (data.call_id || data.item?.id || data.id),
          response_id: data.response_id,
          has_args_delta: !!(data.delta?.arguments || data.delta),
          sessionCounter: sessionIdRef.current,
          sessionUUID: sessionUUIDRef.current
        });
      }
      // Ignore late events from prior sessions
      if (data.session_id && data.session_id !== sessionIdRef.current) {
        if (VERBOSE_TOOL_LOGS) console.log('[RT_EVT_DROPPED_WRONG_SESSION]', { event: data.type, eventSession: data.session_id, activeSession: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
        return;
      }
     // Function call created (capture name early)
     if (data.type === 'response.function_call.created') {
       const callId = data.call_id || data.id;
       callMetaRef.current[callId] = { name: data.name };
       lastFunctionCallIdRef.current = callId;
       toolCallPendingRef.current = true;
       const rec: ToolCallRecord = { id: callId, tool: data.name || 'unknown', status: 'pending', startedAt: Date.now() };
      setToolCalls(c => [...c, rec]);
      if (VERBOSE_TOOL_LOGS) console.log('[TOOL_CALL_CREATED]', { callId, name: data.name });
       // removed transcript entry for tool call (display only in side panel)
     }

     // Newer Realtime pattern: output_item.added with function_call item
     if (data.type === 'response.output_item.added' && data.item?.type === 'function_call') {
       const callId = data.item.id;
       const name = data.item.name;
       callMetaRef.current[callId] = { name };
       lastFunctionCallIdRef.current = callId;
       toolCallPendingRef.current = true;
       const rec: ToolCallRecord = { id: callId, tool: name || 'unknown', status: 'pending', startedAt: Date.now() };
       setToolCalls(c => [...c, rec]);
      if (VERBOSE_TOOL_LOGS) console.log('[TOOL_CALL_ADDED_ITEM]', { callId, name });
       // removed transcript entry for tool call
     }
     if (data.type === 'response.output_text.delta') {
       // Still store textual form internally (not rendered directly anymore)
       setTranscript(t => {
         const copy = [...t];
         const existing = copy.find(x => x.role==='assistant' && x.id===data.response_id);
         if (existing) { existing.text += data.delta; return [...copy]; }
         return [...copy, { id: data.response_id, role: 'assistant', text: data.delta }];
       });
       // Also surface into overlay (treat as spoken style if no audio transcript events arrive)
       setLiveAudio(prev => {
         if (!prev || prev.id !== data.response_id || prev.done) return { id: data.response_id || null, text: data.delta, done: false };
         return { ...prev, text: prev.text + data.delta };
       });
       lastAssistantTextAtRef.current = Date.now();
     }
       // Audio transcript deltas (model produced audio + transcript but no output_text events)
       if (data.type === 'response.audio_transcript.delta') {
         const frag = data.delta || '';
         if (frag) {
           // Record timing (first + last arrival times)
           const rid = data.response_id || 'unknown';
           const now = performance.now();
           if (!audioTimingRef.current[rid]) {
             audioTimingRef.current[rid] = { start: now, last: now };
           } else {
             audioTimingRef.current[rid].last = now;
           }
           // Update center overlay
           setLiveAudio(prev => {
             if (!prev || prev.id !== data.response_id || prev.done) {
               return { id: data.response_id || null, text: frag, done: false };
             }
             return { ...prev, text: prev.text + frag };
           });
           setTranscript(t => {
             const copy = [...t];
             const existing = copy.find(x => x.role==='assistant' && x.id === data.response_id);
             if (existing) {
               existing.text += frag;
               return [...copy];
             }
             return [...copy, { id: data.response_id, role: 'assistant', text: frag }];
           });
           lastAssistantTextAtRef.current = Date.now();
         }
       }
       if (data.type === 'response.audio_transcript.done') {
         const rid = data.response_id || 'unknown';
         const timing = audioTimingRef.current[rid];
         const now = performance.now();
         if (VERBOSE_TOOL_LOGS) console.log('[AUDIO_TRANSCRIPT_FINALIZED]', { response_id: rid, timing });
         let durationMs = 0;
         if (timing) {
           durationMs = Math.max(0, (timing.last || now) - timing.start);
         }
         // Mark overlay done
         setLiveAudio(prev => prev && prev.id === rid ? { ...prev, done: true } : prev);
         // Removed auto-hide; persist until next user query.
         delete audioTimingRef.current[rid];
       }
     // Support alternative realtime formats that deliver a whole message item (no per-char delta)
     if (data.type === 'response.output_item.added' && data.item?.type === 'message') {
       try {
         const segments = (data.item.content || []).filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join('');
         if (segments) {
           setTranscript(t => {
             // Avoid duplicate if we already started accumulating with same id
             if (t.some(x => x.id === data.item.id)) return t.map(x => x.id===data.item.id ? { ...x, text: segments } : x);
             return [...t, { id: data.item.id, role: 'assistant', text: segments }];
           });
         }
       } catch {}
     }
     // Support incremental deltas for message items (some variants emit partial text inside item delta)
     if (data.type === 'response.output_item.delta' && data.item?.type === 'message') {
       const frag = (data.delta?.text) || (typeof data.delta === 'string' ? data.delta : '') || (data.delta?.output_text) || '';
       if (frag) {
         setTranscript(t => {
           const copy = [...t];
           const existing = copy.find(x => x.id === data.item.id && x.role === 'assistant');
           if (existing) {
             existing.text += frag;
             return [...copy];
           }
           return [...copy, { id: data.item.id, role: 'assistant', text: frag }];
         });
         lastAssistantTextAtRef.current = Date.now();
       }
     }
       // Audio transcript sometimes appears inside output_item forms too
       if (data.type === 'response.output_item.delta' && data.item?.type === 'audio_transcript') {
         const frag = data.delta?.transcript || data.delta?.text || '';
         if (frag) {
           setTranscript(t => {
             const copy = [...t];
             const existing = copy.find(x => x.id === data.item.id && x.role==='assistant');
             if (existing) { existing.text += frag; return [...copy]; }
             return [...copy, { id: data.item.id, role: 'assistant', text: frag }];
           });
          // Mirror into overlay if matching / new
          setLiveAudio(prev => {
            if (!prev || prev.id !== data.item.id || prev.done) return { id: data.item.id, text: frag, done: false };
            return { ...prev, text: prev.text + frag };
          });
         }
       }
     // Generic fallback: any event whose type mentions output_text and carries a string delta
     if (!data.type?.endsWith('.delta') && data.type?.includes('output_text') && typeof data.delta === 'string') {
       const id = data.response_id || crypto.randomUUID();
       setTranscript(t => [...t, { id, role: 'assistant', text: data.delta }]);
       setLiveAudio(prev => (!prev || prev.id !== id || prev.done) ? { id, text: data.delta, done: false } : { ...prev, text: prev.text + data.delta });
       lastAssistantTextAtRef.current = Date.now();
     }
     if (data.type === 'response.completed') {
       // could finalize UI here
     }
    if (data.type === 'error') {
      // Surface full error payload for debugging tool output submission issues
      if (VERBOSE_TOOL_LOGS) console.error('[RT_ERROR_EVENT]', { raw: data });
    }
     // Argument delta events (support multiple possible naming patterns)
     if (data.type === 'response.function_call.arguments.delta' || (data.type?.includes('function_call') && data.type?.includes('arguments.delta'))) {
       let callId = data.call_id || data.response_id;
       if (callId && !callMetaRef.current[callId] && lastFunctionCallIdRef.current) {
         aliasRef.current[callId] = lastFunctionCallIdRef.current;
          // If this delta provides a distinct call_id (likely canonical 'call_' prefixed) and we previously only had an item id, clone meta so we can emit outputs with the canonical id.
          if (callId.startsWith('call_') && callMetaRef.current[lastFunctionCallIdRef.current]) {
            callMetaRef.current[callId] = { ...callMetaRef.current[lastFunctionCallIdRef.current] };
            // Map the item id to canonical call id for later rewrite.
            aliasRef.current[lastFunctionCallIdRef.current] = callId;
            if (VERBOSE_TOOL_LOGS) console.log('[CALL_ID_CANONICALIZED]', { itemId: lastFunctionCallIdRef.current, callId });
          }
       }
       const canonical = aliasRef.current[callId] || callId;
       pendingToolArgsRef.current[canonical] = (pendingToolArgsRef.current[canonical] || '') + (data.delta || '');
      if (VERBOSE_TOOL_LOGS) console.log('[ARGS_DELTA]', { canonical, addedLen: (data.delta || '').length, totalLen: pendingToolArgsRef.current[canonical].length });
     }

     // Newer delta format: output_item.delta with function_call
     if (data.type === 'response.output_item.delta' && data.item?.type === 'function_call') {
       const callId = data.item.id;
       if (callId && !callMetaRef.current[callId] && lastFunctionCallIdRef.current) {
         aliasRef.current[callId] = lastFunctionCallIdRef.current;
       }
       const canonical = aliasRef.current[callId] || callId;
       const frag = data.delta?.arguments || '';
       if (frag) pendingToolArgsRef.current[canonical] = (pendingToolArgsRef.current[canonical] || '') + frag;
      if (VERBOSE_TOOL_LOGS && frag) console.log('[ARGS_DELTA_NEW_FORMAT]', { canonical, addedLen: frag.length, totalLen: pendingToolArgsRef.current[canonical].length });
     }
     if (data.type === 'response.function_call.arguments.done' || data.type === 'response.function_call.arguments.completed' || (data.type?.includes('function_call') && (data.type?.endsWith('arguments.done') || data.type?.endsWith('arguments.completed')))) {
       let callId = data.call_id || data.response_id;
       const canonical = aliasRef.current[callId] || callId;
       const raw = pendingToolArgsRef.current[canonical];
       if (!raw) return;
       try {
         // raw may be partly JSON containing an object with arguments property or plain argument object
         let parsed: any;
         try { parsed = JSON.parse(raw); } catch { parsed = { arguments: raw }; }
         const name = callMetaRef.current[canonical]?.name || parsed.name || 'unknown';
         let argsCandidate: any = parsed;
         if (parsed.arguments !== undefined) {
           if (typeof parsed.arguments === 'string') {
             try { argsCandidate = JSON.parse(parsed.arguments); } catch { argsCandidate = { raw: parsed.arguments }; }
           } else {
             argsCandidate = parsed.arguments;
           }
         }
         // If parsed result itself looks like direct args (no arguments wrapper and not containing a name property only), accept
         if (!parsed.arguments && Object.keys(parsed).length && (parsed.name === undefined || (Object.keys(parsed).length > 1))) {
           argsCandidate = parsed;
         }
        if (VERBOSE_TOOL_LOGS) console.log('[ARGS_DONE]', { canonical, name, rawLen: raw.length, parsedKeys: Object.keys(argsCandidate) });
         // Update existing record if present else push new
         setToolCalls(c => c.some(x => x.id===canonical) ? c.map(x => x.id===canonical ? { ...x, tool: name, args: argsCandidate } : x) : [...c, { id: canonical, tool: name, args: argsCandidate, status: 'pending', startedAt: Date.now() }]);
         // removed transcript args echo
         if (name === 'unknown') {
           setToolCalls(c => c.map(x => x.id===canonical ? { ...x, status: 'error', error: 'missing_tool_name' } : x));
           // no transcript error line
           if (VERBOSE_TOOL_LOGS) console.warn('[ARGS_DONE_NO_NAME]', { canonical });
           return;
         }
        if (toolOutputsSentRef.current.has(canonical)) {
          if (VERBOSE_TOOL_LOGS) console.log('[TOOL_ALREADY_EXECUTED_SKIP]', { canonical });
          return;
        }
        toolOutputsSentRef.current.add(canonical);
  if (VERBOSE_TOOL_LOGS) console.log('[EXEC_TOOL]', { canonical, name, argsCandidate, scenarioSlice: scenario.slice(0,60) });
   fetch('/api/tool', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: name, args: argsCandidate, scenario }) })
           .then(r=> r.json())
           .then(result => {
             const resultData = (result && result.result !== undefined) ? result.result : result;
             let preview: string;
             try { preview = JSON.stringify(resultData).slice(0,400); } catch { preview = '[unserializable result]'; }
             setToolCalls(c => c.map(x => x.id===canonical ? { ...x, status: 'completed', result: resultData, finishedAt: Date.now() } : x));
             // removed tool result transcript line
             // Send tool output via helper (with fallback / watchdog)
             try {
               // If canonical id is an item_ id but we have a mapped call_ id, rewrite to canonical call id expected by API.
               let outboundCallId = canonical;
               if (outboundCallId.startsWith('item_')) {
                 const mapped = aliasRef.current[outboundCallId];
                 if (mapped && mapped.startsWith('call_')) {
                   if (VERBOSE_TOOL_LOGS) console.log('[CALL_ID_REWRITE_ITEM_TO_CALL]', { from: outboundCallId, to: mapped });
                   outboundCallId = mapped;
                 } else {
                   // Attempt heuristic: find a call_ meta with same tool name.
                   const alt = Object.keys(callMetaRef.current).find(k => k.startsWith('call_') && callMetaRef.current[k].name === name);
                   if (alt) {
                     if (VERBOSE_TOOL_LOGS) console.log('[CALL_ID_HEURISTIC_MATCH]', { from: outboundCallId, to: alt, name });
                     outboundCallId = alt;
                     aliasRef.current[outboundCallId] = alt; // ensure stable
                   }
                 }
               }
               sendFunctionCallOutput(outboundCallId, resultData);
             } catch (sendErr) { if (VERBOSE_TOOL_LOGS) console.error('[TOOL_OUTPUT_HELPER_ERROR]', { canonical, error: String(sendErr) }); }
             delete pendingToolArgsRef.current[canonical];
            if (VERBOSE_TOOL_LOGS) console.log('[EXEC_TOOL_RESULT]', { canonical, preview });
           })
           .catch(err => {
             setToolCalls(c => c.map(x => x.id===canonical ? { ...x, status: 'error', error: String(err) } : x));
             toolCallPendingRef.current = false; // unblock in error condition
            if (VERBOSE_TOOL_LOGS) console.error('[EXEC_TOOL_ERROR]', { canonical, error: String(err) });
           });
       } catch { }
     }

     // Newer done format: output_item.done for function_call
     if (data.type === 'response.output_item.done' && data.item?.type === 'function_call') {
       const callId = data.item.id;
  // If a later delta provided a canonical call_ id, aliasRef will map item_ -> call_
  const canonical = aliasRef.current[callId] || callId;
  if (callId !== canonical && VERBOSE_TOOL_LOGS) console.log('[OUTPUT_ITEM_DONE_CANONICALIZED]', { itemId: callId, canonical });
       if (pendingToolArgsRef.current[canonical]) {
        if (VERBOSE_TOOL_LOGS) console.log('[BRIDGE_OUTPUT_ITEM_DONE_TRIGGER_ARGS_DONE]', { canonical });
         handleRealtimeEvent({ type: 'response.function_call.arguments.done', call_id: canonical });
       }
     }
    } catch (err: any) {
      // Catch any unexpected errors so a single bad event doesn't kill subsequent handling
      if (VERBOSE_TOOL_LOGS) console.error('[RT_EVT_HANDLER_ERROR]', { error: String(err), stack: err?.stack, raw: data });
    }
  };

  const startSession = async () => {
    if (pcRef.current || sessionStartingRef.current) {
      if (VERBOSE_TOOL_LOGS) console.log('[SESSION_START_SKIP_ALREADY_ACTIVE_OR_STARTING]', { hasPc: !!pcRef.current, starting: sessionStartingRef.current, sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
      return; // already started or in-progress
    }
    sessionStartingRef.current = true;
    setStarting(true);
    try {
      const resp = await fetch('/api/realtime-token');
      const { client_secret } = await resp.json();
      const baseUrl = 'https://api.openai.com/v1/realtime?model=gpt-realtime';
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      sessionIdRef.current += 1;
      sessionUUIDRef.current = crypto.randomUUID();
      if (VERBOSE_TOOL_LOGS) console.log('[SESSION_START]', { sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
    dc.onopen = () => {
        setConnected(true);
    if (VERBOSE_TOOL_LOGS) console.log('[SESSION_DATA_CHANNEL_OPEN]', { sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
    // Sanitize tool specs for realtime (remove non-standard fields like result_schema/sample_result)
  const rtTools = toolSpecs.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }));
  // Scenario intentionally NOT inserted into model instructions; it's only used by tool execution layer.
  dc.send(JSON.stringify({ type: 'session.update', session: { instructions: REALTIME_PROMPT, tools: rtTools, temperature, voice, tool_choice: 'auto' } }));
        // mark starting complete
        sessionStartingRef.current = false; setStarting(false);
      };
  dc.onclose = () => { if (VERBOSE_TOOL_LOGS) console.log('[SESSION_DATA_CHANNEL_CLOSED]', { sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current }); setConnected(false); };
      dc.onmessage = (e) => { try { handleRealtimeEvent(JSON.parse(e.data)); } catch (err) { if (VERBOSE_TOOL_LOGS) console.error('[RT_EVT_PARSE_ERROR]', err); } };
      pc.ontrack = (ev) => { if (audioRef.current) audioRef.current.srcObject = ev.streams[0]; };
  // Acquire microphone. If a prior (zombie) stream exists, stop it first.
  try { micStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micStreamRef.current = micStream;
  micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResp = await fetch(baseUrl, { method: 'POST', body: offer.sdp, headers: { 'Authorization': `Bearer ${client_secret}`, 'Content-Type': 'application/sdp', 'OpenAI-Beta': 'realtime=v1' } });
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      console.error('startSession error', e);
      if (VERBOSE_TOOL_LOGS) console.error('[SESSION_START_ERROR]', { error: String(e), sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
  sessionStartingRef.current = false; setStarting(false);
    }
  };

  const stopSession = () => {
    try {
      dataChannelRef.current?.close();
      // Stop any sender tracks on the peer connection
      pcRef.current?.getSenders().forEach(s => { try { s.track?.stop(); } catch {} });
      // Also hard-stop the original mic stream tracks (belt & suspenders: some browsers keep LED on if only sender tracks are stopped)
      try { micStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    dataChannelRef.current = null;
    micStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setConnected(false);
  sessionStartingRef.current = false; setStarting(false);
    if (VERBOSE_TOOL_LOGS) console.log('[SESSION_STOP]', { sessionCounter: sessionIdRef.current, sessionUUID: sessionUUIDRef.current });
    // Clear refs so late events ignored
    aliasRef.current = {};
    lastFunctionCallIdRef.current = null;
    pendingToolArgsRef.current = {};
    toolCallPendingRef.current = false;
    sessionUUIDRef.current = null;
  toolOutputsSentRef.current.clear();
    // Clear watchdog timers
    Object.values(toolOutputWatchdogsRef.current).forEach(id => { try { clearTimeout(id); } catch {} });
    toolOutputWatchdogsRef.current = {};
  };

  // Helper to send function call output to Realtime API with fallback strategies.
  const sendFunctionCallOutput = (callId: string, resultData: any) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      if (VERBOSE_TOOL_LOGS) console.warn('[TOOL_OUTPUT_ABORT_NO_CHANNEL]', { callId });
      toolCallPendingRef.current = false;
      return;
    }
    const outputString = (()=>{ try { return JSON.stringify(resultData); } catch { return String(resultData); } })();
    // Spec-aligned pattern: create a conversation item for the tool output, then request a new model response.
    const toolOutputItem = { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: outputString } } as any;
    const continuation = { type: 'response.create', response: { conversation: 'auto', instructions: 'Please continue using the tool result.' } } as any;
    try {
      channel.send(JSON.stringify(toolOutputItem));
      channel.send(JSON.stringify(continuation));
      if (VERBOSE_TOOL_LOGS) console.log('[TOOL_OUTPUT_SENT]', { callId, bytes: outputString.length });
    } catch (err) {
      if (VERBOSE_TOOL_LOGS) console.error('[TOOL_OUTPUT_SEND_ERROR]', { callId, error: String(err) });
    }
    lastFunctionCallIdRef.current = null;
    toolCallPendingRef.current = false;
    // Remove prior watchdog complexity; rely on standardized event flow.
    if (toolOutputWatchdogsRef.current[callId]) {
      try { clearTimeout(toolOutputWatchdogsRef.current[callId]); } catch {}
      delete toolOutputWatchdogsRef.current[callId];
    }
  };

  const handleUserUtterance = async () => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') return;
  // no-op (voice capture only)
  };

  // Reset session state (optionally restarts if streaming)
  const resetSession = () => {
    setTranscript([]);
    setToolCalls([]);
    setLiveAudio(null);
    toolOutputsSentRef.current.clear();
    audioTimingRef.current = {};
    pendingToolArgsRef.current = {} as any;
    if (streaming) {
      stopSession();
      setTimeout(()=> { startSession(); }, 100);
    }
  };

  // Drag bottom handle to resize stage height (30-80vh)
  const onStageHandlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = stageHeight;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const vhPerPx = 100 / window.innerHeight;
      let next = startHeight + dy * vhPerPx;
      if (next < 30) next = 30;
      if (next > 80) next = 80;
      setStageHeight(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Scenario presets for dropdown
  // Determine active preset id (if any) by comparing text pointer or content
  // Sync local selectedPresetId whenever scenario changes externally
  useEffect(() => {
    const match = SCENARIO_PRESETS.find(p => p.text === scenario);
    if (match) {
      if (selectedPresetId !== match.id) setSelectedPresetId(match.id);
    } else if (selectedPresetId !== 'custom') {
      setSelectedPresetId('custom');
    }
  }, [scenario, selectedPresetId]);

  // Live session updates when parameters change while connected (scenario intentionally excluded from instructions)
  useEffect(()=> {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open' && streaming) {
      const rtTools = toolSpecs.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }));
      dataChannelRef.current.send(JSON.stringify({ type: 'session.update', session: { instructions: REALTIME_PROMPT, temperature, voice, tools: rtTools, tool_choice: 'auto' } }));
    }
  }, [scenario, temperature, voice, streaming]);

  return (
    <div className="w-full mx-auto flex flex-col gap-4 px-4">
      <div
        className="relative w-full overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-4 flex"
        style={{ height: `${stageHeight}vh`, transition: 'height 120ms ease' }}
      >
        <div className="absolute top-2 left-2 z-20 flex items-center gap-2 text-[11px] px-2 py-1 rounded-md bg-black/50 border border-neutral-700/60 backdrop-blur-sm shadow">
          <Activity size={12} className={connected? 'text-green-400':'text-neutral-500'} />
          <span className="text-neutral-300">{streaming ? (connected? 'Connected':'Connecting...') : 'Idle'}</span>
          <span className="text-neutral-500">#{sessionIdRef.current}</span>
        </div>
  <div ref={stageCenterRef} className="flex-1 h-full relative flex items-center justify-center select-none">
          <AnimatePresence>
            {liveAudio && (
              <motion.div
                key={liveAudio.id || 'live-audio-overlay'}
    ref={overlayRef}
    className="pointer-events-none text-center px-8 py-6 rounded-2xl bg-black/40 backdrop-blur-md border border-cyan-400/30 shadow-[0_0_40px_-10px_rgba(34,211,238,0.45)] max-w-5xl w-full"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.45, ease: 'easeInOut' } }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs tracking-widest uppercase text-cyan-300/70">
                    {liveAudio.done ? 'Response' : 'Speaking'}
                  </div>
                  <div className="text-[10px] text-neutral-400">Session {sessionIdRef.current}</div>
                </div>
                <div
                  ref={liveTextRef}
                  className="font-extrabold leading-snug text-cyan-50 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)] whitespace-pre-wrap"
                  style={{ fontSize: overlayFontSize }}
                >
                  {liveAudio.text || '\u00A0'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Resize handle */}
          <div
            onPointerDown={onStageHandlePointerDown}
            className="absolute bottom-0 left-0 w-full h-3 cursor-row-resize flex items-center justify-center group"
          >
            <div className="w-24 h-1 rounded-full bg-cyan-400/40 group-hover:bg-cyan-300 transition-colors" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 -mt-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant={streaming? 'outline':'default'}
            size="sm"
            disabled={starting}
            onClick={()=> {
              setStreaming(s => {
                if (!s) { startSession(); } else { stopSession(); }
                return !s;
              });
            }}
          >
            {streaming ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            {starting ? 'Starting...' : (streaming? 'Stop Voice':'Start Voice')}
          </Button>
          <Button size="sm" variant="outline" disabled={starting} onClick={resetSession}>Reset Session</Button>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <label className="uppercase tracking-wide text-neutral-400">Voice</label>
          <select
            value={voice}
            onChange={e=> update({ voice: e.target.value })}
            className="bg-neutral-800 text-neutral-100 text-xs rounded px-2 py-1 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            {['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <label className="uppercase tracking-wide text-neutral-400">Temp</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temperature}
            onChange={e=> update({ temperature: Number(e.target.value) })}
            className="accent-cyan-400"
          />
          <span className="text-neutral-500 w-10 tabular-nums">{temperature.toFixed(2)}</span>
        </div>
        <div className="text-[11px] text-neutral-500">Height: {stageHeight.toFixed(0)}vh (drag handle)</div>
      </div>
      <div className="w-full grid md:grid-cols-2 gap-4 items-start">
        <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/60">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Active Scenario</div>
            <select
              value={selectedPresetId}
              onChange={e=> {
                const id = e.target.value;
                setSelectedPresetId(id);
                if (id === 'custom') return; // retain custom text
                const preset = SCENARIO_PRESETS.find(p => p.id === id);
                if (preset) update({ scenario: preset.text });
              }}
              className="bg-neutral-800 text-neutral-100 text-[11px] rounded px-2 py-1 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {SCENARIO_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="custom">Custom</option>
            </select>
          </div>
          <pre className="whitespace-pre-wrap text-xs overflow-auto leading-relaxed text-neutral-200">{scenario}</pre>
        </div>
        <div className="border border-neutral-800 rounded-md p-3 bg-neutral-900/60 flex flex-col min-h-0 h-full">
          <div className="text-xs font-semibold tracking-wide text-neutral-400 mb-2 uppercase">Tool Calls (Live)</div>
          <div className="flex-1 overflow-auto text-[11px] min-h-0">
            <ToolLog calls={toolCalls} />
          </div>
        </div>
      </div>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}
