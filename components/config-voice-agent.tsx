"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui';
import { CONFIG_EDITOR_MUTATION_TOOLS } from '@/lib/config-editor-agent';

interface ConfigVoiceAgentProps {
  onConfigMutated?: () => Promise<void> | void;
  activeConfigName?: string;
  onClose?: () => void;
}

type ToolSpec = {
  type: 'function';
  name: string;
  description: string;
  parameters: any;
  result_schema?: any;
};

const DEFAULT_VOICE = 'verse';
const DEFAULT_TEMPERATURE = 0.4;

export function ConfigVoiceAgent({ onConfigMutated, activeConfigName, onClose }: ConfigVoiceAgentProps) {
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [specLoading, setSpecLoading] = useState<boolean>(true);
  const [specError, setSpecError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionStartingRef = useRef<boolean>(false);

  const pendingToolArgsRef = useRef<Record<string, string>>({});
  const callMetaRef = useRef<Record<string, { name?: string }>>({});
  const aliasRef = useRef<Record<string, string>>({});
  const lastFunctionCallIdRef = useRef<string | null>(null);
  const toolOutputsSentRef = useRef<Set<string>>(new Set());

  const mutationSet = useMemo(() => new Set<string>(CONFIG_EDITOR_MUTATION_TOOLS as readonly string[]), []);

  const resetCallState = useCallback(() => {
    pendingToolArgsRef.current = {};
    callMetaRef.current = {};
    aliasRef.current = {};
    lastFunctionCallIdRef.current = null;
    toolOutputsSentRef.current.clear();
  }, []);

  const fetchSpec = useCallback(async () => {
    setSpecLoading(true);
    setSpecError(null);
    try {
      const res = await fetch('/api/config/voice-tools');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'failed_to_load_voice_tools');
      }
      setInstructions(typeof json.instructions === 'string' ? json.instructions : '');
      setTools(Array.isArray(json.tools) ? json.tools : []);
      setLastEvent('Config editor tools refreshed.');
    } catch (err: any) {
      console.error('[config-voice-agent] spec load failed', err);
      setSpecError(err?.message || 'Unable to load voice agent tools');
    } finally {
      setSpecLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpec();
  }, [fetchSpec]);

  const stopSession = useCallback(() => {
    try {
      dataChannelRef.current?.close();
    } catch {}
    try {
      pcRef.current?.getSenders().forEach(sender => {
        try { sender.track?.stop(); } catch {}
      });
    } catch {}
    try {
      micStreamRef.current?.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    dataChannelRef.current = null;
    micStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    sessionStartingRef.current = false;
    setConnected(false);
    setStarting(false);
    setStreaming(false);
    resetCallState();
  }, [resetCallState]);

  useEffect(() => {
    return () => { stopSession(); };
  }, [stopSession]);

  const sendFunctionCallOutput = useCallback((callId: string, resultData: any) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    let outboundCallId = callId;
    if (outboundCallId.startsWith('item_')) {
      const mapped = aliasRef.current[outboundCallId];
      if (mapped && mapped.startsWith('call_')) {
        outboundCallId = mapped;
      }
    }
    const outputString = (() => {
      try { return JSON.stringify(resultData); } catch { return String(resultData); }
    })();
    try {
      channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: outboundCallId, output: outputString } }));
      channel.send(JSON.stringify({ type: 'response.create', response: { conversation: 'auto', instructions: 'Please continue using the tool results.' } }));
    } catch (err) {
      console.error('[config-voice-agent] sendFunctionCallOutput failed', err);
    }
  }, []);

  const handleMutationSuccess = useCallback(async () => {
    await fetchSpec();
    if (onConfigMutated) {
      await Promise.resolve(onConfigMutated());
    }
    try {
      window.dispatchEvent(new Event('industry-config-changed'));
    } catch {}
  }, [fetchSpec, onConfigMutated]);

  const executeTool = useCallback(async (callId: string, name: string, args: any) => {
    if (toolOutputsSentRef.current.has(callId)) {
      return;
    }
    toolOutputsSentRef.current.add(callId);
    try {
      const res = await fetch('/api/config/voice-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool: name, args })
      });
      const json = await res.json();
      if (!res.ok) {
        const errorMessage = json?.error || 'tool_execution_failed';
        sendFunctionCallOutput(callId, { error: errorMessage });
        setLastEvent(`${name} failed: ${errorMessage}`);
        return;
      }
      sendFunctionCallOutput(callId, json);
      setLastEvent(`${name} executed successfully.`);
      if (mutationSet.has(name)) {
        await handleMutationSuccess();
      }
    } catch (err: any) {
      const message = err?.message || 'tool_execution_error';
      sendFunctionCallOutput(callId, { error: message });
      setLastEvent(`${name} error: ${message}`);
    }
  }, [handleMutationSuccess, mutationSet, sendFunctionCallOutput]);

  const handleRealtimeEvent = useCallback((data: any) => {
    if (!data || typeof data !== 'object') return;
    const type = data.type;

    if (type === 'response.function_call.created') {
      const callId = data.call_id || data.id;
      if (!callId) return;
      callMetaRef.current[callId] = { name: data.name };
      lastFunctionCallIdRef.current = callId;
      return;
    }

    if (type === 'response.output_item.added' && data.item?.type === 'function_call') {
      const callId = data.item.id;
      if (!callId) return;
      callMetaRef.current[callId] = { name: data.item.name };
      lastFunctionCallIdRef.current = callId;
      return;
    }

    if ((type === 'response.function_call.arguments.delta') || (type?.includes('function_call') && type?.includes('arguments.delta'))) {
      let callId = data.call_id || data.response_id;
      if (callId && !callMetaRef.current[callId] && lastFunctionCallIdRef.current) {
        aliasRef.current[callId] = lastFunctionCallIdRef.current;
      }
      const canonical = aliasRef.current[callId] || callId;
      if (!canonical) return;
      const delta = data.delta?.arguments || data.delta || '';
      if (typeof delta === 'string' && delta) {
        pendingToolArgsRef.current[canonical] = (pendingToolArgsRef.current[canonical] || '') + delta;
      }
      return;
    }

    if (type === 'response.output_item.delta' && data.item?.type === 'function_call') {
      const callId = data.item.id;
      if (!callId) return;
      const canonical = aliasRef.current[callId] || callId;
      const frag = data.delta?.arguments || '';
      if (typeof frag === 'string' && frag) {
        pendingToolArgsRef.current[canonical] = (pendingToolArgsRef.current[canonical] || '') + frag;
      }
      return;
    }

    if (type === 'response.function_call.arguments.done' || type === 'response.function_call.arguments.completed' || (type?.includes('function_call') && (type.endsWith('arguments.done') || type.endsWith('arguments.completed')))) {
      let callId = data.call_id || data.response_id;
      const canonical = aliasRef.current[callId] || callId;
      if (!canonical) return;
      const raw = pendingToolArgsRef.current[canonical];
      if (!raw) return;
      delete pendingToolArgsRef.current[canonical];
      let parsed: any;
      let argsCandidate: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { arguments: raw };
      }
      argsCandidate = parsed;
      if (parsed && parsed.arguments !== undefined) {
        if (typeof parsed.arguments === 'string') {
          try { argsCandidate = JSON.parse(parsed.arguments); }
          catch { argsCandidate = parsed.arguments; }
        } else {
          argsCandidate = parsed.arguments;
        }
      }
      const meta = callMetaRef.current[canonical] || (callId ? callMetaRef.current[callId] : undefined);
      const toolName = meta?.name || parsed?.name;
      if (!toolName) {
        sendFunctionCallOutput(canonical, { error: 'missing_tool_name' });
        return;
      }
      executeTool(canonical, toolName, argsCandidate);
      return;
    }

    if (type === 'response.output_item.done' && data.item?.type === 'function_call') {
      const callId = data.item.id;
      const canonical = aliasRef.current[callId] || callId;
      if (canonical && pendingToolArgsRef.current[canonical]) {
        handleRealtimeEvent({ type: 'response.function_call.arguments.done', call_id: canonical });
      }
      return;
    }
  }, [executeTool, sendFunctionCallOutput]);

  const startSession = useCallback(async () => {
    if (sessionStartingRef.current || streaming) {
      return;
    }
    if (!instructions || tools.length === 0) {
      setLastEvent('Voice agent tools not ready yet.');
      return;
    }
    sessionStartingRef.current = true;
    setStarting(true);
    try {
      const tokenResp = await fetch('/api/realtime-token');
      const tokenJson = await tokenResp.json();
      const clientSecret = tokenJson?.client_secret;
      if (!clientSecret) throw new Error('missing_realtime_token');

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setConnected(true);
        setStarting(false);
        sessionStartingRef.current = false;
        setLastEvent('Voice config session connected.');
        try {
          dc.send(JSON.stringify({ type: 'session.update', session: { instructions, tools, voice: DEFAULT_VOICE, temperature: DEFAULT_TEMPERATURE, tool_choice: 'auto' } }));
        } catch (err) {
          console.error('[config-voice-agent] session.update failed', err);
        }
      };

      dc.onclose = () => {
        setConnected(false);
        if (!sessionStartingRef.current) {
          setLastEvent('Voice config session closed.');
          setStreaming(false);
        }
      };

      dc.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          handleRealtimeEvent(payload);
        } catch (err) {
          console.error('[config-voice-agent] failed to parse realtime event', err);
        }
      };

      pc.ontrack = ev => {
        if (audioRef.current) audioRef.current.srcObject = ev.streams[0];
      };

      micStreamRef.current?.getTracks().forEach(track => { try { track.stop(); } catch {} });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      mic.getTracks().forEach(track => pc.addTrack(track, mic));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1'
        }
      });
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      setStreaming(true);
      setLastEvent('Say hello to begin editing your agent.');
    } catch (err: any) {
      console.error('[config-voice-agent] startSession failed', err);
      setLastEvent(err?.message || 'Failed to start voice session');
      stopSession();
    } finally {
      sessionStartingRef.current = false;
      setStarting(false);
    }
  }, [handleRealtimeEvent, instructions, stopSession, streaming, tools]);

  useEffect(() => {
    if (!streaming) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') return;
    try {
      channel.send(JSON.stringify({ type: 'session.update', session: { instructions, tools, voice: DEFAULT_VOICE, temperature: DEFAULT_TEMPERATURE, tool_choice: 'auto' } }));
    } catch (err) {
      console.error('[config-voice-agent] failed to send session update', err);
    }
  }, [instructions, tools, streaming]);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">Voice Config Assistant</span>
          <span className="text-[11px] text-neutral-500">{activeConfigName ? `Active: ${activeConfigName}` : 'Active configuration'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (streaming || starting) {
                stopSession();
              } else {
                startSession();
              }
            }}
            disabled={specLoading || !!specError || starting}
          >
            {streaming ? 'Stop Voice' : starting ? 'Connecting...' : 'Start Voice' }
          </Button>
          {onClose && (
            <Button size="sm" variant="outline" onClick={() => { stopSession(); onClose(); }}>Close</Button>
          )}
        </div>
      </div>
      {specError && <div className="text-[11px] text-red-400">{specError}</div>}
      {!specError && (
        <div className="text-[11px] text-neutral-400 leading-relaxed">
          {specLoading ? 'Loading toolchain…' : 'Speak naturally to inspect or update scenarios, tools, and prompts. The assistant will apply changes directly to the active config.'}
        </div>
      )}
      <div className="text-[10px] text-neutral-500 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-neutral-600'}`} />
        <span>{connected ? (streaming ? 'Session live' : 'Channel ready') : 'Idle'}</span>
        {starting && <span className="text-cyan-400">Connecting…</span>}
      </div>
      {lastEvent && <div className="text-[10px] text-neutral-500">{lastEvent}</div>}
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}

export default ConfigVoiceAgent;
