import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EASYLEDGER_VOICE_TOOLS,
  applyVoiceTranscriptDelta,
  buildVoiceSystemPrompt,
  createVoiceSessionUpdate,
  parseVoiceToolArguments,
  pcmWorkletSource,
  sanitizeVoiceToolResult,
} from '../../apps/web/src/voiceAgent.ts';

const context = {
  business_id: 'tenant-id-must-not-be-prompted',
  business_name: 'Juice Stall Demo',
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
  today: '2026-09-28',
  catalog: [{ id: 'product-1', name: 'Orange Juice', default_unit_price: '15000' }],
};

test('voice tools expose the authorized proposal, query, and dashboard surface only', () => {
  const names = EASYLEDGER_VOICE_TOOLS.map((tool) => tool.name);
  assert.deepEqual(names, [
    'get_context',
    'list_sales',
    'create_product',
    'propose_sales',
    'propose_correction',
    'query_sales',
    'get_dashboard_draft',
    'update_dashboard',
    'save_dashboard',
  ]);
  assert.equal(names.includes('commit_sales'), false);
  assert.equal(names.includes('commit_correction'), false);
  assert.ok(EASYLEDGER_VOICE_TOOLS.every((tool) => tool.type === 'function' && tool.parameters.additionalProperties === false));
  assert.ok(EASYLEDGER_VOICE_TOOLS.find((tool) => tool.name === 'propose_sales').parameters.properties.lines);
  assert.ok(EASYLEDGER_VOICE_TOOLS.find((tool) => tool.name === 'update_dashboard').parameters.properties.operations);
});

test('inline session configuration keeps the authenticated tenant out of the prompt', () => {
  const configuration = createVoiceSessionUpdate(context);
  const prompt = buildVoiceSystemPrompt(context);
  assert.equal(configuration.type, 'session.update');
  assert.equal(configuration.session.output.voice, 'alba');
  assert.equal(configuration.session.input.format.encoding, 'audio/pcm');
  assert.equal(configuration.session.tools, EASYLEDGER_VOICE_TOOLS);
  assert.match(prompt, /Juice Stall Demo/);
  assert.match(prompt, /visible Confirm button/);
  assert.doesNotMatch(prompt, /tenant-id-must-not-be-prompted/);
  assert.doesNotMatch(prompt, /business_id:/);
});

test('tool arguments accept JSON objects and reject malformed or non-object inputs', () => {
  assert.deepEqual(parseVoiceToolArguments('{"metric":"revenue"}'), { metric: 'revenue' });
  assert.deepEqual(parseVoiceToolArguments({ metric: 'units' }), { metric: 'units' });
  assert.equal(parseVoiceToolArguments('{not json'), null);
  assert.equal(parseVoiceToolArguments('[]'), null);
  assert.equal(parseVoiceToolArguments(null), null);
});

test('tool result sanitizing recursively removes proposal and session secrets without changing source data', () => {
  const result = {
    business_id: 'tenant-secret',
    proposal_id: 'proposal-1',
    confirmation_token: 'do-not-send',
    nested: {
      session_token: 'session-secret',
      provider_token: 'provider-secret',
      confirmation_token_hash: 'hash-secret',
      actor_user_id: 'actor-secret',
      units: '2',
    },
    rows: [{ id: 'sale-1', confirmation_token: 'nested-secret' }],
  };
  const clean = sanitizeVoiceToolResult(result);
  assert.deepEqual(clean, {
    proposal_id: 'proposal-1',
    nested: { units: '2' },
    rows: [{ id: 'sale-1' }],
  });
  assert.equal(JSON.stringify(clean).includes('secret'), false);
  assert.equal(result.confirmation_token, 'do-not-send');
});

test('user transcript deltas replace snapshots and agent deltas append fragments', () => {
  const userPartial = applyVoiceTranscriptDelta(null, 'transcript.user.delta', { text: 'record ten' });
  assert.deepEqual(userPartial, { role: 'You', text: 'record ten' });
  assert.deepEqual(applyVoiceTranscriptDelta(userPartial, 'transcript.user.delta', { text: 'record ten mangoes' }), {
    role: 'You', text: 'record ten mangoes',
  });

  const agentPartial = applyVoiceTranscriptDelta(null, 'transcript.agent.delta', { delta: 'I found ' });
  assert.deepEqual(applyVoiceTranscriptDelta(agentPartial, 'transcript.agent.delta', { delta: 'two matches.' }), {
    role: 'EasyLedger', text: 'I found two matches.',
  });

  // Word-level streaming tokens without whitespace delimiters
  let streamingTokens = applyVoiceTranscriptDelta(null, 'transcript.agent.delta', { delta: 'Mango' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'Juice' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'at' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: '18,000' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'IDR' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'per' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'unit.' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'Orange' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: 'Juice' });
  streamingTokens = applyVoiceTranscriptDelta(streamingTokens, 'transcript.agent.delta', { delta: '?' });
  assert.equal(streamingTokens?.text, 'Mango Juice at 18,000 IDR per unit. Orange Juice?');
});

function runAudioWorklet(sampleRate, frames) {
  let Processor;
  const outputs = [];
  class AudioWorkletBase {
    constructor() {
      this.port = {
        postMessage(buffer) {
          outputs.push(Array.from(new Int16Array(buffer)));
        },
      };
    }
  }
  const registerProcessor = (name, constructor) => {
    assert.equal(name, 'easyledger-pcm16');
    Processor = constructor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', pcmWorkletSource())(
    AudioWorkletBase,
    registerProcessor,
    sampleRate,
  );
  const processor = new Processor({ processorOptions: { targetSampleRate: 24_000 } });
  for (const frame of frames) processor.process([[Float32Array.from(frame)]]);
  return outputs;
}

test('PCM resampling carries interpolation state across 24 kHz and 44.1 kHz frame boundaries', () => {
  for (const sampleRate of [24_000, 44_100]) {
    const firstFrame = Array(128).fill(0.25);
    const secondFrame = Array(128).fill(0.75);
    const outputs = runAudioWorklet(sampleRate, [firstFrame, firstFrame, secondFrame, secondFrame]);
    assert.ok(outputs.length >= 2);
    assert.ok(outputs.flat().every(Number.isFinite));
    assert.ok(outputs.flat().every((sample) => sample !== 0));
    assert.ok(outputs[2][0] > 0 && outputs[2][0] < Math.round(0.75 * 32768));
  }
});
