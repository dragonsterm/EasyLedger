import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import CustomSelect from './CustomSelect';
import { formatMoneyMinor } from './analytics';
import { apiFetch } from './api';
import type { LedgerCurrency } from './analytics';
import {
  EASYLEDGER_VOICE_TOOLS,
  applyVoiceTranscriptDelta,
  createVoiceSessionUpdate,
  parseVoiceToolArguments,
  pcmWorkletSource,
  sanitizeVoiceToolResult,
} from './voiceAgent';
import type { EasyLedgerVoiceToolName, VoiceBusinessContext } from './voiceAgent';

export type VoiceConnectionStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'error';

export interface VoiceDashboardDraft {
  id: string;
  name: string;
  version: string;
  widgets: Array<{
    id: string;
    type: 'line' | 'bar' | 'kpi' | 'table';
    title: string;
    metric: 'units' | 'revenue';
    dimension?: 'date' | 'product' | 'none';
    filters?: { date_from?: string | null; date_to?: string | null; product_ids?: string[] };
  }>;
  layout: Array<{ i: string; x: number; y: number; w: number; h: number }>;
  is_draft?: true;
  selected_widget_id?: string | null;
}

interface TranscriptLine {
  role: 'You' | 'EasyLedger';
  text: string;
}

export interface VoiceProposalPreview {
  type: 'sale' | 'correction';
  proposalId: string;
  currency: LedgerCurrency;
  expiresAt: string;
  data: Record<string, unknown>;
  confirming: boolean;
}

export interface VoiceDashboardSaveRequest {
  dashboard_id?: string;
  name: string;
  expected_version?: string;
  saving: boolean;
}

export interface VoiceReceipt {
  kind: 'sale' | 'correction' | 'dashboard' | 'product';
  title: string;
  operationId?: string;
  ledgerRevision?: string;
  dashboardVersion?: string;
}

export interface VoiceAgentController {
  status: VoiceConnectionStatus;
  permissionPending: boolean;
  error: string | null;
  transcripts: TranscriptLine[];
  partialTranscript: TranscriptLine | null;
  proposal: VoiceProposalPreview | null;
  dashboardSave: VoiceDashboardSaveRequest | null;
  dashboardDraft: VoiceDashboardDraft | null;
  receipt: VoiceReceipt | null;
  start: () => void;
  stop: () => void;
  confirmProposal: () => void;
  cancelProposal: () => void;
  confirmDashboardSave: () => void;
  cancelDashboardSave: () => void;
}

interface ApiEnvelope<T> {
  status?: string;
  data?: T;
  code?: string;
  message?: string;
}

interface ProviderSessionBootstrap {
  session_id: string;
  session_token: string;
  provider_token: string;
  provider_token_expires_in_seconds: number;
  websocket_url: string;
}

interface PrivateProposal {
  type: 'sale' | 'correction';
  proposalId: string;
  confirmationToken: string;
  idempotencyKey: string;
}

interface PendingToolResult {
  callId: string;
  value: unknown;
}

interface VoiceRuntime {
  session: ProviderSessionBootstrap;
  socket: WebSocket;
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  silentOutput: GainNode;
  active: boolean;
  ready: boolean;
  closing: boolean;
  playbackTime: number;
  playbackSources: Set<AudioBufferSourceNode>;
  lastEvent: string | null;
  pendingToolResults: PendingToolResult[];
  turnId: number;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  resolveEnded?: () => void;
}

interface VoiceCallbacks {
  activeDashboardId?: string | null;
  activeDashboardName?: string | null;
  onLedgerCommitted?: () => void;
  onCatalogChanged?: (product: unknown) => void;
  onDashboardDraft?: (draft: VoiceDashboardDraft) => void;
  onDashboardSaved?: (dashboard: { id: string; name: string; version: string }) => void;
}

const toolNames = new Set<string>([
  ...EASYLEDGER_VOICE_TOOLS.map((tool) => tool.name),
  'add_product', // Preserve the API's legacy alias for existing provider sessions.
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} was missing from the server response`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function requestJson<T>(url: string, options: {
  sessionToken?: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
} = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers['content-type'] = 'application/json';
  if (options.sessionToken) headers.authorization = `Bearer ${options.sessionToken}`;
  const response = await apiFetch(url, {
    method: options.body ? 'POST' : 'GET',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  let envelope: ApiEnvelope<T>;
  try {
    envelope = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error(response.ok ? 'The EasyLedger API returned an unreadable response' : `EasyLedger API request failed (${response.status})`);
  }
  if (!response.ok) {
    const message = typeof envelope.message === 'string' ? envelope.message : `EasyLedger API request failed (${response.status})`;
    throw new Error(message);
  }
  if (envelope.status !== 'ok' && envelope.status !== 'committed') {
    throw new Error('The EasyLedger API response did not confirm success');
  }
  return envelope.data as T;
}

function createIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `voice-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function audioToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

function readAudioFrame(data: unknown): ArrayBuffer | null {
  if (!isRecord(data) || typeof data.data !== 'string') return null;
  try {
    const binary = atob(data.data);
    if (!binary.length || binary.length % 2 !== 0) return null;
    const samples = new Float32Array(binary.length / 2);
    for (let index = 0; index < samples.length; index += 1) {
      const low = binary.charCodeAt(index * 2);
      const high = binary.charCodeAt(index * 2 + 1);
      const value = (high << 8) | low;
      samples[index] = (value & 0x8000 ? value - 0x10000 : value) / 32768;
    }
    return samples.buffer;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone permission was denied. Allow microphone access and start voice again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone is available. Check the device and try again.';
  }
  if (error instanceof Error && error.name === 'AbortError') return 'Voice connection was stopped.';
  if (error instanceof Error && error.message) return error.message;
  return 'Voice could not connect. Try again.';
}

function readPrivateProposal(data: Record<string, unknown>, type: 'sale' | 'correction'): {
  privateValue: PrivateProposal;
  preview: VoiceProposalPreview;
} {
  const proposalId = requiredText(data.proposal_id, 'Proposal ID');
  const confirmationToken = requiredText(data.confirmation_token, 'Confirmation token');
  const currency = data.currency === 'USD' ? 'USD' : 'IDR';
  return {
    privateValue: {
      type,
      proposalId,
      confirmationToken,
      idempotencyKey: createIdempotencyKey(),
    },
    preview: {
      type,
      proposalId,
      currency,
      expiresAt: typeof data.expires_at === 'string' ? data.expires_at : '',
      data: sanitizeVoiceToolResult(data) as Record<string, unknown>,
      confirming: false,
    },
  };
}

export function useVoiceAgent(callbacks: VoiceCallbacks = {}): VoiceAgentController {
  const [status, setStatus] = useState<VoiceConnectionStatus>('idle');
  const [permissionPending, setPermissionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [partialTranscript, setPartialTranscript] = useState<TranscriptLine | null>(null);
  const [proposal, setProposal] = useState<VoiceProposalPreview | null>(null);
  const [dashboardSave, setDashboardSave] = useState<VoiceDashboardSaveRequest | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState<VoiceDashboardDraft | null>(null);
  const [receipt, setReceipt] = useState<VoiceReceipt | null>(null);
  const runtimeRef = useRef<VoiceRuntime | null>(null);
  const cleanupRuntimeRef = useRef<((runtime: VoiceRuntime, endProviderSession: boolean) => Promise<void>) | null>(null);
  const proposalRef = useRef<PrivateProposal | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const startAbortRef = useRef<AbortController | null>(null);
  const activeCallbacksRef = useRef(callbacks);
  activeCallbacksRef.current = callbacks;
  const activeDashboardIdRef = useRef(callbacks.activeDashboardId);
  activeDashboardIdRef.current = callbacks.activeDashboardId;
  const activeDashboardNameRef = useRef(callbacks.activeDashboardName);
  activeDashboardNameRef.current = callbacks.activeDashboardName;

  const appendTranscript = useCallback((line: TranscriptLine) => {
    setTranscripts((current) => [...current.slice(-7), line]);
  }, []);

  const flushToolResults = useCallback((runtime: VoiceRuntime) => {
    if (!runtime.active || runtime.lastEvent !== 'reply.done' || runtime.socket.readyState !== WebSocket.OPEN) return;
    const pending = runtime.pendingToolResults.splice(0);
    for (const result of pending) {
      runtime.socket.send(JSON.stringify({
        type: 'tool.result',
        call_id: result.callId,
        result: JSON.stringify(sanitizeVoiceToolResult(result.value)),
      }));
    }
  }, []);

  const runToolCall = useCallback(async (runtime: VoiceRuntime, event: Record<string, unknown>) => {
    const callId = optionalText(event.call_id);
    const name = optionalText(event.name);
    if (!callId) return;
    const argumentsValue = parseVoiceToolArguments(event.arguments);
    if (!name || !toolNames.has(name as EasyLedgerVoiceToolName)) {
      runtime.pendingToolResults.push({ callId, value: { error: 'This tool is unavailable. Use one of the tools declared for EasyLedger.' } });
      flushToolResults(runtime);
      return;
    }
    if (!argumentsValue) {
      runtime.pendingToolResults.push({ callId, value: { error: 'Tool arguments must be a JSON object. Ask the user for the missing details.' } });
      flushToolResults(runtime);
      return;
    }

    if ((name === 'propose_sales' || name === 'propose_correction') && proposalRef.current) {
      const oldProposal = proposalRef.current;
      void requestJson('/api/v1/voice/tools/cancel_proposal', {
        sessionToken: runtime.session.session_token,
        body: { proposal_id: oldProposal.proposalId, reason: 'Superseded by new proposal' },
      }).catch(() => undefined);
      proposalRef.current = null;
      setProposal(null);
    }

    setStatus('processing');
    setError(null);
    try {
      const currentDashId = activeDashboardIdRef.current;
      if (currentDashId && (name === 'update_dashboard' || name === 'get_dashboard_draft' || name === 'save_dashboard')) {
        if (!argumentsValue.dashboard_id || argumentsValue.dashboard_id === 'default') {
          argumentsValue.dashboard_id = currentDashId;
        }
      }

      if (name === 'create_product' || name === 'add_product') {
        const rawName = argumentsValue.name || argumentsValue.product_name || argumentsValue.product;
        if (typeof rawName === 'string') {
          argumentsValue.name = rawName.trim();
        }
      }

      if (name === 'save_dashboard') {
        const saveName = typeof argumentsValue.name === 'string' && argumentsValue.name.trim() ? argumentsValue.name.trim() : (activeDashboardNameRef.current || 'Sales dashboard');
        setDashboardSave({
          ...(typeof argumentsValue.dashboard_id === 'string' ? { dashboard_id: argumentsValue.dashboard_id } : currentDashId ? { dashboard_id: currentDashId } : {}),
          name: saveName,
          ...(typeof argumentsValue.expected_version === 'string' ? { expected_version: argumentsValue.expected_version } : {}),
          saving: false,
        });
        runtime.pendingToolResults.push({
          callId,
          value: { status: 'awaiting_user_confirmation', name: saveName, instruction: 'The user must confirm the dashboard save in the visible EasyLedger card.' },
        });
        flushToolResults(runtime);
        return;
      }

      const data = await requestJson<unknown>(`/api/v1/voice/tools/${name}`, {
        sessionToken: runtime.session.session_token,
        body: argumentsValue,
      });
      if (!runtime.active) {
        if ((name === 'propose_sales' || name === 'propose_correction') && isRecord(data)) {
          const created = readPrivateProposal(data, name === 'propose_sales' ? 'sale' : 'correction').privateValue;
          void requestJson(`/api/v1/voice/tools/cancel_proposal`, {
            sessionToken: runtime.session.session_token,
            body: { proposal_id: created.proposalId, reason: 'Voice session stopped before the proposal was shown' },
          }).catch(() => undefined);
        }
        return;
      }

      if ((name === 'propose_sales' || name === 'propose_correction') && isRecord(data)) {
        const result = readPrivateProposal(data, name === 'propose_sales' ? 'sale' : 'correction');
        proposalRef.current = result.privateValue;
        setProposal(result.preview);
      }
      if (name === 'update_dashboard' && isRecord(data)) {
        const nextDraft = data as unknown as VoiceDashboardDraft;
        setDashboardDraft(nextDraft);
        activeCallbacksRef.current.onDashboardDraft?.(nextDraft);
      }
      if (name === 'get_dashboard_draft') {
        const nextDraft = isRecord(data) && data.is_draft === true ? data as unknown as VoiceDashboardDraft : null;
        setDashboardDraft(nextDraft);
      }
      if ((name === 'create_product' || name === 'add_product') && isRecord(data)) {
        const prod = data as { name?: string; id?: string };
        const prodName = typeof prod.name === 'string' ? prod.name : 'New product';
        setReceipt({
          kind: 'product',
          title: `Product “${prodName}” added to catalog`,
          operationId: prod.id,
        });
        appendTranscript({ role: 'EasyLedger', text: `Product “${prodName}” has been added to your catalog.` });
        activeCallbacksRef.current.onCatalogChanged?.(data);
      }
      if (name === 'update_product' && isRecord(data)) {
        const prod = data as { name?: string; id?: string };
        const prodName = typeof prod.name === 'string' ? prod.name : 'Product';
        setReceipt({
          kind: 'product',
          title: `Default price for “${prodName}” updated`,
          operationId: prod.id,
        });
        appendTranscript({ role: 'EasyLedger', text: `The default price for “${prodName}” has been updated.` });
        activeCallbacksRef.current.onCatalogChanged?.(data);
      }
      runtime.pendingToolResults.push({ callId, value: sanitizeVoiceToolResult(data) });
      flushToolResults(runtime);
    } catch (toolError) {
      if (!runtime.active) return;
      const message = describeError(toolError);
      runtime.pendingToolResults.push({ callId, value: { error: message } });
      flushToolResults(runtime);
    } finally {
      if (runtime.active && runtime.lastEvent === 'reply.done') setStatus('listening');
    }
  }, [flushToolResults]);

  const handleProviderMessage = useCallback((runtime: VoiceRuntime, input: unknown) => {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(String(input));
      if (!isRecord(parsed) || typeof parsed.type !== 'string') return;
      event = parsed;
    } catch {
      return;
    }
    const type = event.type as string;

    if (type === 'session.ready') {
      runtime.ready = true;
      setStatus('listening');
      setError(null);
      runtime.resolveReady();
      return;
    }
    if (type === 'session.error' || type === 'error') {
      const message = typeof event.message === 'string' ? event.message : 'AssemblyAI could not start the voice session.';
      const wasReady = runtime.ready;
      if (!wasReady) runtime.rejectReady(new Error(message));
      setError(message);
      setStatus('error');
      if (wasReady) {
        runtime.active = false;
        runtime.ready = false;
        if (runtimeRef.current === runtime) runtimeRef.current = null;
        void cleanupRuntimeRef.current?.(runtime, false);
      }
      return;
    }
    if (type === 'session.ended') {
      runtime.resolveEnded?.();
      return;
    }
    if (type === 'input.speech.started') {
      runtime.lastEvent = type;
      setStatus('listening');
      setPartialTranscript(null);
      return;
    }
    if (type === 'input.speech.stopped') {
      setStatus('processing');
      return;
    }
    if (type === 'reply.started') {
      runtime.lastEvent = type;
      runtime.playbackTime = 0;
      setStatus('processing');
      return;
    }
    if (type === 'reply.done') {
      runtime.lastEvent = type;
      if (event.status === 'interrupted') {
        runtime.turnId += 1;
        runtime.pendingToolResults = [];
        runtime.playbackTime = 0;
        for (const source of runtime.playbackSources) {
          try { source.stop(); } catch { /* Source may already have ended. */ }
        }
        runtime.playbackSources.clear();
      } else {
        flushToolResults(runtime);
      }
      if (runtime.ready && runtime.active) setStatus('listening');
      return;
    }
    if (type === 'tool.call') {
      void runToolCall(runtime, event);
      return;
    }
    if (type === 'transcript.user.delta' || type === 'transcript.agent.delta') {
      setPartialTranscript((current) => applyVoiceTranscriptDelta(
        current,
        type,
        event,
      ));
      return;
    }
    if (type === 'transcript.user' || type === 'transcript.agent') {
      const text = typeof event.text === 'string' ? event.text.trim() : '';
      if (text) {
        appendTranscript({ role: type === 'transcript.user' ? 'You' : 'EasyLedger', text });
        setPartialTranscript(null);
      }
      if (type === 'transcript.user') setStatus('processing');
      return;
    }
    if (type === 'reply.audio') {
      const frame = readAudioFrame(event);
      if (!frame || !runtime.active) return;
      const samples = new Float32Array(frame);
      const buffer = runtime.audioContext.createBuffer(1, samples.length, 24_000);
      buffer.copyToChannel(samples, 0);
      const source = runtime.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(runtime.audioContext.destination);
      const now = runtime.audioContext.currentTime;
      // Absorb network packet jitter with 50ms buffer lead if starting fresh or behind
      const playAt = runtime.playbackTime < now ? now + 0.05 : runtime.playbackTime;
      source.start(playAt);
      runtime.playbackTime = playAt + buffer.duration;
      runtime.playbackSources.add(source);
      source.onended = () => runtime.playbackSources.delete(source);
    }
  }, [appendTranscript, flushToolResults, runToolCall]);

  const cleanupRuntime = useCallback(async (runtime: VoiceRuntime, endProviderSession: boolean) => {
    runtime.active = false;
    runtime.ready = false;
    runtime.closing = true;
    runtime.processor.port.onmessage = null;
    runtime.stream.getTracks().forEach((track) => track.stop());
    try { runtime.source.disconnect(); } catch { /* Already disconnected. */ }
    try { runtime.processor.disconnect(); } catch { /* Already disconnected. */ }
    try { runtime.silentOutput.disconnect(); } catch { /* Already disconnected. */ }
    for (const source of runtime.playbackSources) {
      try { source.stop(); } catch { /* Source may already have ended. */ }
    }
    runtime.playbackSources.clear();
    if (runtime.audioContext.state !== 'closed') {
      try { await runtime.audioContext.close(); } catch { /* Browser may have closed it during navigation. */ }
    }
    if (runtime.socket.readyState === WebSocket.OPEN && endProviderSession) {
      let ended = false;
      const endedSignal = new Promise<void>((resolve) => {
        runtime.resolveEnded = () => { ended = true; resolve(); };
      });
      try { runtime.socket.send(JSON.stringify({ type: 'session.end' })); } catch { /* Socket may be closing. */ }
      await Promise.race([endedSignal, new Promise<void>((resolve) => window.setTimeout(resolve, 500))]);
      if (!ended && runtime.socket.readyState === WebSocket.OPEN) runtime.socket.close();
    } else if (runtime.socket.readyState < WebSocket.CLOSING) {
      runtime.socket.close();
    }
  }, []);
  cleanupRuntimeRef.current = cleanupRuntime;

  const stop = useCallback(() => {
    generationRef.current += 1;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    const privateProposal = proposalRef.current;
    const sessionToken = runtime?.session.session_token ?? sessionTokenRef.current;
    if (privateProposal && sessionToken) {
      void requestJson('/api/v1/voice/tools/cancel_proposal', {
        sessionToken,
        body: { proposal_id: privateProposal.proposalId, reason: 'User stopped the voice session' },
      }).catch(() => undefined);
    }
    proposalRef.current = null;
    sessionTokenRef.current = null;
    setProposal(null);
    setDashboardSave(null);
    setPartialTranscript(null);
    setError(null);
    setStatus('idle');
    setPermissionPending(false);
    if (runtime) {
      runtime.rejectReady(new DOMException('Voice session stopped', 'AbortError'));
      void cleanupRuntime(runtime, true);
    }
  }, [cleanupRuntime]);

  const start = useCallback(() => {
    if (status !== 'idle' && status !== 'error') return;
    if (proposalRef.current || dashboardSave) {
      setError('Review and confirm or cancel the pending EasyLedger action before starting another voice session.');
      return;
    }
    const generation = ++generationRef.current;
    const abortController = new AbortController();
    startAbortRef.current = abortController;
    setStatus('connecting');
    setError(null);
    setReceipt(null);
    setTranscripts([]);
    setPartialTranscript(null);

    const assertCurrent = () => {
      if (generationRef.current !== generation || abortController.signal.aborted) {
        throw new DOMException('Voice session stopped', 'AbortError');
      }
    };

    void (async () => {
      let runtime: VoiceRuntime | null = null;
      let stream: MediaStream | null = null;
      let audioContext: AudioContext | null = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone capture.');
        // Request microphone access and resume playback directly from the user gesture.
        // Network waits can consume transient activation in Safari and mobile browsers.
        audioContext = new AudioContext();
        const audioResume = audioContext.resume().catch(() => undefined);
        setPermissionPending(true);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, channelCount: 1 },
          video: false,
        });
        setPermissionPending(false);
        assertCurrent();
        await audioResume;
        if (audioContext.state !== 'running') throw new Error('The browser could not start audio playback. Try starting voice again.');
        assertCurrent();
        const currentDashId = activeDashboardIdRef.current;
        const session = await requestJson<ProviderSessionBootstrap>('/api/v1/voice/sessions', {
          body: {
            ttl_seconds: 600,
            ...(currentDashId ? { selected_dashboard_id: currentDashId } : {}),
          },
          signal: abortController.signal,
        });
        assertCurrent();
        sessionTokenRef.current = session.session_token;
        const context = await requestJson<VoiceBusinessContext>('/api/v1/voice/tools/get_context', {
          sessionToken: session.session_token,
          body: {
            ...(currentDashId ? { dashboard_id: currentDashId } : {}),
          },
          signal: abortController.signal,
        });
        assertCurrent();
        const workletUrl = URL.createObjectURL(new Blob([pcmWorkletSource()], { type: 'text/javascript' }));
        try {
          await audioContext.audioWorklet.addModule(workletUrl);
        } finally {
          URL.revokeObjectURL(workletUrl);
        }
        assertCurrent();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = new AudioWorkletNode(audioContext, 'easyledger-pcm16', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { targetSampleRate: 24_000 },
        });
        const silentOutput = audioContext.createGain();
        silentOutput.gain.value = 0;
        source.connect(processor);
        processor.connect(silentOutput).connect(audioContext.destination);

        const socketUrl = new URL(session.websocket_url);
        socketUrl.searchParams.set('token', session.provider_token);
        const socket = new WebSocket(socketUrl);
        let resolveReady = () => {};
        let rejectReady = (_reason: Error) => {};
        const ready = new Promise<void>((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        });
        runtime = {
          session,
          socket,
          stream,
          audioContext,
          source,
          processor,
          silentOutput,
          active: true,
          ready: false,
          closing: false,
          playbackTime: audioContext.currentTime,
          playbackSources: new Set(),
          lastEvent: null,
          pendingToolResults: [],
          turnId: 0,
          resolveReady,
          rejectReady,
        };
        runtimeRef.current = runtime;

        processor.port.onmessage = (message: MessageEvent<ArrayBuffer>) => {
          if (!runtime?.active || !runtime.ready || socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: 'input.audio', audio: audioToBase64(message.data) }));
        };
        socket.onopen = () => {
          try { socket.send(JSON.stringify(createVoiceSessionUpdate(context))); }
          catch { rejectReady(new Error('Could not configure the AssemblyAI voice session.')); }
        };
        socket.onmessage = (message) => handleProviderMessage(runtime as VoiceRuntime, message.data);
        socket.onerror = () => {
          if (!runtime?.ready) rejectReady(new Error('The AssemblyAI voice connection failed. Check the network and provider token.'));
        };
        socket.onclose = (event) => {
          if (!runtime) return;
          if (!runtime.ready && !runtime.closing) rejectReady(new Error(event.reason || 'The AssemblyAI voice connection closed before it was ready.'));
          if (runtime.active && !runtime.closing) {
            runtime.active = false;
            runtime.ready = false;
            setStatus('error');
            setError(event.reason || 'Voice disconnected. Your pending proposal remains available for review.');
            void cleanupRuntime(runtime, false);
          }
        };

        await Promise.race([
          ready,
          new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error('Timed out waiting for AssemblyAI session.ready.')), 15_000)),
          new Promise<void>((_, reject) => abortController.signal.addEventListener('abort', () => reject(new DOMException('Voice session stopped', 'AbortError')), { once: true })),
        ]);
        assertCurrent();
        startAbortRef.current = null;
      } catch (startError) {
        setPermissionPending(false);
        if (stream) stream.getTracks().forEach((track) => track.stop());
        if (runtime) {
          if (runtimeRef.current === runtime) runtimeRef.current = null;
          void cleanupRuntime(runtime, true);
        } else if (audioContext && audioContext.state !== 'closed') {
          try { await audioContext.close(); } catch { /* Context never connected. */ }
        }
        sessionTokenRef.current = null;
        if (generationRef.current === generation) {
          setError(describeError(startError));
          setStatus(startError instanceof DOMException && startError.name === 'AbortError' ? 'idle' : 'error');
        }
      }
    })();
  }, [handleProviderMessage, status, cleanupRuntime, dashboardSave]);

  const confirmProposal = useCallback(() => {
    const pending = proposalRef.current;
    const sessionToken = sessionTokenRef.current;
    if (!pending || !sessionToken) return;
    setProposal((current) => current ? { ...current, confirming: true } : current);
    setError(null);
    void requestJson<Record<string, unknown>>(`/api/v1/voice/tools/commit_${pending.type === 'sale' ? 'sales' : 'correction'}`, {
      sessionToken,
      body: {
        proposal_id: pending.proposalId,
        confirmation_token: pending.confirmationToken,
        idempotency_key: pending.idempotencyKey,
      },
    }).then((data) => {
      proposalRef.current = null;
      setProposal(null);
      const operationId = optionalText(data.operation_id);
      const ledgerRevision = optionalText(data.ledger_revision);
      const kind = pending.type;
      setReceipt({
        kind,
        title: kind === 'sale' ? 'Sale recorded' : 'Sale correction recorded',
        operationId,
        ledgerRevision,
      });
      appendTranscript({
        role: 'EasyLedger',
        text: kind === 'sale'
          ? `Sale recorded${ledgerRevision ? ` at ledger revision ${ledgerRevision}` : ''}.`
          : `Correction recorded${ledgerRevision ? ` at ledger revision ${ledgerRevision}` : ''}.`,
      });
      activeCallbacksRef.current.onLedgerCommitted?.();
    }).catch((commitError: unknown) => {
      setProposal((current) => current ? { ...current, confirming: false } : current);
      setError(describeError(commitError));
    });
  }, [appendTranscript]);

  const cancelProposal = useCallback(() => {
    const pending = proposalRef.current;
    const sessionToken = sessionTokenRef.current;
    if (!pending || !sessionToken) return;
    setError(null);
    void requestJson(`/api/v1/voice/tools/cancel_proposal`, {
      sessionToken,
      body: { proposal_id: pending.proposalId, reason: 'User cancelled from the visible proposal card' },
    }).then(() => {
      proposalRef.current = null;
      setProposal(null);
      appendTranscript({ role: 'EasyLedger', text: 'Proposal cancelled. No ledger change was made.' });
    }).catch((cancelError: unknown) => setError(describeError(cancelError)));
  }, [appendTranscript]);

  const confirmDashboardSave = useCallback(() => {
    const pending = dashboardSave;
    const draft = dashboardDraft;
    if ((!pending && !draft) || pending?.saving) return;

    const currentDashId = activeDashboardIdRef.current;
    const currentDashName = activeDashboardNameRef.current;
    const saveId = pending?.dashboard_id || (draft && draft.id !== 'default' ? draft.id : (currentDashId || undefined));
    const saveName = pending?.name || (saveId && saveId === currentDashId && currentDashName ? currentDashName : (draft?.name || currentDashName || 'Sales dashboard'));
    const saveVersion = pending?.expected_version || draft?.version;

    setDashboardSave({ name: saveName, dashboard_id: saveId, expected_version: saveVersion, saving: true });
    setError(null);

    const sessionToken = sessionTokenRef.current;
    if (sessionToken) {
      void requestJson<Record<string, unknown>>('/api/v1/voice/tools/save_dashboard', {
        sessionToken,
        body: {
          ...(saveId ? { dashboard_id: saveId } : {}),
          name: saveName,
          ...(saveVersion ? { expected_version: saveVersion } : {}),
        },
      }).then((data) => {
        const saved = {
          id: requiredText(data.id, 'Dashboard ID'),
          name: requiredText(data.name, 'Dashboard name'),
          version: requiredText(data.version, 'Dashboard version'),
        };
        setDashboardSave(null);
        setDashboardDraft(null);
        setReceipt({ kind: 'dashboard', title: `Dashboard “${saved.name}” saved`, dashboardVersion: saved.version });
        appendTranscript({ role: 'EasyLedger', text: `Dashboard “${saved.name}” saved as version ${saved.version}.` });
        activeCallbacksRef.current.onDashboardSaved?.(saved);
      }).catch((saveError: unknown) => {
        setDashboardSave((current) => current ? { ...current, saving: false } : current);
        setError(describeError(saveError));
      });
    } else {
      void apiFetch(saveId ? `/api/v1/dashboards/${saveId}` : '/api/v1/dashboards', {
        method: saveId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: saveName,
          ...(saveVersion ? { expected_version: saveVersion } : {}),
          widgets: draft?.widgets ?? [],
          layout: draft?.layout ?? [],
          schema_version: 1,
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => null) as { data?: { id?: string; name?: string; version?: string }; message?: string } | null;
        if (!response.ok || !payload?.data?.id) {
          throw new Error(payload?.message ?? 'Dashboard could not be saved.');
        }
        const saved = {
          id: payload.data.id,
          name: payload.data.name ?? saveName,
          version: String(payload.data.version ?? '1'),
        };
        setDashboardSave(null);
        setDashboardDraft(null);
        setReceipt({ kind: 'dashboard', title: `Dashboard “${saved.name}” saved`, dashboardVersion: saved.version });
        appendTranscript({ role: 'EasyLedger', text: `Dashboard “${saved.name}” saved as version ${saved.version}.` });
        activeCallbacksRef.current.onDashboardSaved?.(saved);
      }).catch((saveError: unknown) => {
        setDashboardSave((current) => current ? { ...current, saving: false } : current);
        setError(describeError(saveError));
      });
    }
  }, [appendTranscript, dashboardSave, dashboardDraft]);

  const cancelDashboardSave = useCallback(() => {
    setDashboardSave(null);
    setDashboardDraft(null);
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    startAbortRef.current?.abort();
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    if (runtime) void cleanupRuntime(runtime, true);
  }, [cleanupRuntime]);

  return {
    status,
    permissionPending,
    error,
    transcripts,
    partialTranscript,
    proposal,
    dashboardSave,
    dashboardDraft,
    receipt,
    start,
    stop,
    confirmProposal,
    cancelProposal,
    confirmDashboardSave,
    cancelDashboardSave,
  };
}

function statusLabel(status: VoiceConnectionStatus): string {
  switch (status) {
    case 'connecting': return 'Connecting';
    case 'listening': return 'Listening';
    case 'processing': return 'Processing';
    case 'error': return 'Voice error';
    default: return 'Ready';
  }
}

function proposalLines(proposal: VoiceProposalPreview): Array<Record<string, unknown>> {
  const lines = proposal.data.lines;
  return Array.isArray(lines) ? lines.filter(isRecord) : [];
}

function proposalSummary(proposal: VoiceProposalPreview): string[] {
  if (proposal.type === 'sale') {
    const lines = proposalLines(proposal).map((line) => {
      const quantity = typeof line.quantity === 'string' ? line.quantity : '—';
      const name = typeof line.product_name === 'string' ? line.product_name : 'Catalog item';
      const date = typeof line.sale_date === 'string' ? line.sale_date : 'date pending';
      const price = typeof line.unit_price === 'string'
        ? formatMoneyMinor(line.unit_price, proposal.currency)
        : 'Price unknown';
      return `${quantity} × ${name} · ${price} · ${date}`;
    });
    const revenue = typeof proposal.data.known_total_revenue === 'string'
      ? formatMoneyMinor(proposal.data.known_total_revenue, proposal.currency)
      : null;
    return [
      ...lines,
      `Known-price total: ${revenue ?? 'Unavailable'}${proposal.data.has_unknown_prices === true ? ' · revenue incomplete' : ''}`,
    ];
  }
  const before = isRecord(proposal.data.before_values) ? proposal.data.before_values : {};
  const after = isRecord(proposal.data.after_values) ? proposal.data.after_values : {};
  const fields = ['product_name', 'quantity', 'unit_price', 'sale_date'];
  return [
    ...fields.filter((key) => before[key] !== after[key]).map((key) => {
      const oldValue = before[key] === null ? 'Unknown' : String(before[key] ?? '—');
      const newValue = after[key] === null ? 'Unknown' : String(after[key] ?? '—');
      return `${key.replaceAll('_', ' ')}: ${oldValue} → ${newValue}`;
    }),
    ...(typeof proposal.data.reason === 'string' ? [`Reason: ${proposal.data.reason}`] : []),
  ];
}

export function VoiceControl({
  controller,
  headingId,
  description,
  catalog = false,
  dashboards,
  activeDashboardId,
  onSelectDashboard,
}: {
  controller: VoiceAgentController;
  headingId: string;
  description: string;
  catalog?: boolean;
  dashboards?: Array<{ id: string; name: string }>;
  activeDashboardId?: string | null;
  onSelectDashboard?: (dashboardId: string | null) => void;
}) {
  const active = controller.status === 'connecting'
    || controller.status === 'listening'
    || controller.status === 'processing';
  const latestTranscript = controller.partialTranscript
    ?? controller.transcripts.at(-1)
    ?? null;
  const summary = controller.proposal ? proposalSummary(controller.proposal) : [];
  const needsReview = !active && Boolean(controller.proposal || controller.dashboardSave);
  const expanded = active || controller.proposal || controller.dashboardSave || controller.dashboardDraft || controller.receipt || controller.error || controller.transcripts.length > 0;

  return (
    <section className={`voice-card${expanded ? ' voice-card-expanded' : ''}${catalog ? ' catalog-voice-card' : ''}`} aria-labelledby={headingId}>
      <Icon name="voice" size={catalog ? 24 : 32} />
      <div className="voice-copy">
        <h2 id={headingId}>Ask EasyLedger</h2>
        <p>{latestTranscript ? `${latestTranscript.role}: ${latestTranscript.text}` : description}</p>
        <span className={`voice-state voice-state-${controller.status}`} role="status">
          <span className="voice-state-indicator" aria-hidden="true" />{statusLabel(controller.status)}
        </span>
        {controller.permissionPending && <span className="voice-connection-hint">Allow microphone access in the browser prompt to continue.</span>}
      </div>
      <div className="voice-header-actions">
        {dashboards && dashboards.length > 0 && (
          <div className="voice-dashboard-picker">
            <CustomSelect
              value={activeDashboardId || ''}
              onChange={(val) => onSelectDashboard?.(val || null)}
              variant="pill"
              ariaLabel="Select target dashboard for voice modifications"
              options={[
                ...dashboards.map((d) => ({ value: d.id, label: `Dashboard: ${d.name}` })),
                { value: '', label: '+ New draft dashboard' },
              ]}
              disabled={active}
            />
          </div>
        )}
        <button
          className={`voice-shortcut${active ? ' voice-stop-button' : ''}`}
          type="button"
          aria-label={active ? 'Stop microphone and voice session' : 'Start microphone and voice session'}
          onClick={active ? controller.stop : controller.start}
          disabled={needsReview}
        >
          {active ? 'Stop voice' : needsReview ? 'Review pending action' : controller.status === 'error' ? 'Try again' : 'Start voice'}
        </button>
      </div>

      {(controller.error || controller.proposal || controller.dashboardSave || controller.dashboardDraft || controller.receipt || controller.transcripts.length > 0) && (
        <div className="voice-details">
          {controller.error && <p className="voice-error" role="alert">{controller.error}</p>}

          {controller.proposal && (
            <section className="voice-review-card" aria-label={controller.proposal.type === 'sale' ? 'Sale proposal awaiting confirmation' : 'Correction proposal awaiting confirmation'}>
              <div className="voice-review-heading">
                <div>
                  <strong>{controller.proposal.type === 'sale' ? 'Review sale' : 'Review correction'}</strong>
                  <span>{controller.proposal.type === 'sale' ? 'No sale is recorded until you confirm.' : 'No correction is applied until you confirm.'}</span>
                </div>
                <span className="voice-review-currency">{controller.proposal.currency}</span>
              </div>
              <ul>{summary.map((line) => <li key={line}>{line}</li>)}</ul>
              <div className="voice-review-actions">
                <button className="button button-primary" type="button" onClick={controller.confirmProposal} disabled={controller.proposal.confirming}>
                  {controller.proposal.confirming ? 'Saving…' : controller.proposal.type === 'sale' ? 'Confirm sale' : 'Confirm correction'}
                </button>
                <button className="button button-secondary" type="button" onClick={controller.cancelProposal} disabled={controller.proposal.confirming}>Cancel proposal</button>
              </div>
            </section>
          )}

          {controller.dashboardSave && !controller.dashboardDraft && (
            <section className="voice-review-card" aria-label="Dashboard save awaiting confirmation">
              <div className="voice-review-heading">
                <div>
                  <strong>Save dashboard?</strong>
                  <span>Confirm to save “{controller.dashboardSave.name}” with the current server draft.</span>
                </div>
              </div>
              <div className="voice-review-actions">
                <button className="button button-primary" type="button" onClick={controller.confirmDashboardSave} disabled={controller.dashboardSave.saving}>
                  {controller.dashboardSave.saving ? 'Saving…' : 'Save dashboard'}
                </button>
                <button className="button button-secondary" type="button" onClick={controller.cancelDashboardSave} disabled={controller.dashboardSave.saving}>Cancel</button>
              </div>
            </section>
          )}

          {controller.dashboardDraft && (
            <section className="voice-draft-state" aria-label="Dashboard draft state">
              <strong>Current server dashboard draft</strong>
              <span>{controller.dashboardDraft.name} · {controller.dashboardDraft.widgets.length} widgets · version {controller.dashboardDraft.version}</span>
              <ul className="voice-draft-widgets">
                {controller.dashboardDraft.widgets.map((widget) => {
                  const position = controller.dashboardDraft?.layout.find((item) => item.i === widget.id);
                  const dimensions = widget.dimension && widget.dimension !== 'none' ? ` by ${widget.dimension}` : '';
                  const filters = [
                    widget.filters?.date_from ? `from ${widget.filters.date_from}` : '',
                    widget.filters?.date_to ? `to ${widget.filters.date_to}` : '',
                    widget.filters?.product_ids?.length ? `${widget.filters.product_ids.length} product filter${widget.filters.product_ids.length === 1 ? '' : 's'}` : '',
                  ].filter(Boolean).join(', ');
                  return (
                    <li key={widget.id}>
                      <strong>{widget.title}</strong>
                      <span>{widget.type} · {widget.metric}{dimensions}{filters ? ` · filters ${filters}` : ''}{position ? ` · position ${position.x}, ${position.y} · ${position.w} × ${position.h}` : ''}</span>
                    </li>
                  );
                })}
                {controller.dashboardDraft.widgets.length === 0 && <li><span>No widgets in this draft.</span></li>}
              </ul>
              <div className="voice-review-actions" style={{ marginTop: '14px' }}>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={controller.confirmDashboardSave}
                  disabled={controller.dashboardSave?.saving}
                >
                  {controller.dashboardSave?.saving ? 'Saving…' : 'Save dashboard'}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={controller.cancelDashboardSave}
                  disabled={controller.dashboardSave?.saving}
                >
                  Discard draft
                </button>
              </div>
            </section>
          )}

          {controller.receipt && (
            <section className="voice-receipt" aria-label="Latest EasyLedger receipt">
              <strong>{controller.receipt.title}</strong>
              <span>
                {controller.receipt.operationId ? `Receipt ${controller.receipt.operationId}` : ''}
                {controller.receipt.ledgerRevision ? ` · Ledger revision ${controller.receipt.ledgerRevision}` : ''}
                {controller.receipt.dashboardVersion ? ` · Dashboard version ${controller.receipt.dashboardVersion}` : ''}
              </span>
            </section>
          )}

          {controller.transcripts.length > 1 && (
            <details className="voice-transcript-history">
              <summary>Recent transcript</summary>
              <ol>{controller.transcripts.map((line, index) => <li key={`${line.role}-${index}`}><strong>{line.role}:</strong> {line.text}</li>)}</ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
