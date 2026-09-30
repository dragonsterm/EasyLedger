export interface VoiceBusinessContext {
  business_name: string;
  currency: 'IDR' | 'USD';
  timezone: string;
  today: string;
  catalog: Array<{ id: string; name: string; default_unit_price: string | null }>;
  dashboard_id?: string | null;
  ledger_revision?: string;
}

const uuid = { type: 'string', format: 'uuid' } as const;
const integerString = { type: 'string', pattern: '^(0|[1-9][0-9]*)$' } as const;
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export const EASYLEDGER_VOICE_TOOLS = [
  {
    type: 'function',
    name: 'get_context',
    description: 'Read the authenticated business name, currency, timezone, today, and active catalog. Use before proposing a sale or interpreting dates.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'list_sales',
    description: 'Find recent matching ledger rows and their exact sale IDs and current versions. Use this before proposing a correction; ask the user to choose if more than one row could match.',
    parameters: {
      type: 'object',
      properties: {
        date_from: date,
        date_to: date,
        product_id: uuid,
        cursor: { type: 'string', minLength: 1, maxLength: 500 },
        page_size: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'propose_sales',
    description: 'Prepare a sale proposal for visible user review. This does not commit a sale. Use a product ID from the active catalog, whole quantity, and explicit business date. Leave unit_price out to use the listed default; do not guess a price.',
    parameters: {
      type: 'object',
      required: ['lines'],
      properties: {
        lines: {
          type: 'array', minItems: 1, maxItems: 20,
          items: {
            type: 'object',
            required: ['product_id', 'quantity', 'sale_date'],
            properties: {
              product_id: uuid,
              quantity: { type: 'string', pattern: '^[1-9][0-9]*$' },
              unit_price: { type: ['string', 'null'], pattern: '^(0|[1-9][0-9]*)$' },
              sale_date: date,
            },
            additionalProperties: false,
          },
        },
        intent: { type: 'string', enum: ['additional', 'total', 'unknown'] },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'propose_correction',
    description: 'Prepare a correction for one explicitly selected sale ID and current version from list_sales. The browser asks the user to confirm before committing.',
    parameters: {
      type: 'object',
      required: ['sale_id', 'expected_version', 'changes', 'reason'],
      properties: {
        sale_id: uuid,
        expected_version: integerString,
        changes: {
          type: 'object', minProperties: 1,
          properties: {
            product_id: uuid,
            quantity: { type: 'string', pattern: '^[1-9][0-9]*$' },
            unit_price: { type: ['string', 'null'], pattern: '^(0|[1-9][0-9]*)$' },
            sale_date: date,
          },
          additionalProperties: false,
        },
        reason: { type: 'string', minLength: 1, maxLength: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'query_sales',
    description: 'Query exact authorized ledger totals and grouped rows. Revenue is known-price revenue and can be incomplete when prices are unknown.',
    parameters: {
      type: 'object',
      required: ['metric'],
      properties: {
        metric: { type: 'string', enum: ['units', 'revenue'] },
        dimension: { type: 'string', enum: ['date', 'product', 'none'] },
        date_from: date,
        date_to: date,
        product_ids: { type: 'array', maxItems: 50, items: uuid },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_dashboard_draft',
    description: 'Read the current dashboard draft and its widgets/layout before editing or saving it.',
    parameters: {
      type: 'object',
      properties: { dashboard_id: uuid },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_dashboard',
    description: 'Apply typed add, edit, move, resize, remove, or select operations to the dashboard draft. This does not change ledger records or save the dashboard.',
    parameters: {
      type: 'object',
      required: ['operations'],
      properties: {
        dashboard_id: uuid,
        expected_version: integerString,
        selected_widget_id: { type: ['string', 'null'], maxLength: 100 },
        operations: {
          type: 'array', minItems: 1, maxItems: 20,
          items: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['add', 'edit', 'move', 'resize', 'remove', 'select'] },
              widget_id: { type: 'string', minLength: 1, maxLength: 100 },
              target: { type: 'string', minLength: 1, maxLength: 100 },
              widget: {
                type: 'object',
                properties: {
                  id: { type: 'string', minLength: 1, maxLength: 100 },
                  type: { type: 'string', enum: ['line', 'bar', 'kpi'] },
                  title: { type: 'string', minLength: 1, maxLength: 200 },
                  metric: { type: 'string', enum: ['units', 'revenue'] },
                  dimension: { type: 'string', enum: ['date', 'product', 'none'] },
                  filters: {
                    type: 'object',
                    properties: {
                      date_from: date,
                      date_to: date,
                      product_ids: { type: 'array', maxItems: 50, items: uuid },
                    },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
              changes: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 200 },
                  type: { type: 'string', enum: ['line', 'bar', 'kpi'] },
                  metric: { type: 'string', enum: ['units', 'revenue'] },
                  dimension: { type: 'string', enum: ['date', 'product', 'none'] },
                },
                additionalProperties: false,
              },
              position: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              x: { type: 'number', minimum: 0 },
              y: { type: 'number', minimum: 0 },
              w: { type: 'number', minimum: 1 },
              h: { type: 'number', minimum: 1 },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'save_dashboard',
    description: 'Request saving the current dashboard draft. The browser will show a separate confirmation button before anything is saved.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        dashboard_id: uuid,
        name: { type: 'string', minLength: 1, maxLength: 200 },
        expected_version: integerString,
      },
      additionalProperties: false,
    },
  },
] as const;

export type EasyLedgerVoiceToolName = typeof EASYLEDGER_VOICE_TOOLS[number]['name'];

export function buildVoiceSystemPrompt(context: VoiceBusinessContext): string {
  const catalog = context.catalog.map((product) => ({
    id: product.id,
    name: product.name,
    default_unit_price: product.default_unit_price,
  }));
  return [
    'You are EasyLedger, a concise voice assistant for one authenticated merchant.',
    `Business: ${context.business_name}. Currency: ${context.currency}. Timezone: ${context.timezone}. Today: ${context.today}.`,
    `Active catalog: ${JSON.stringify(catalog)}. Match product names carefully and use exact catalog IDs. Ask if the product is unknown or ambiguous.`,
    'Never ask for, invent, or include business_id or actor_user_id in tool arguments. The server binds identity and authorization.',
    'Use get_context for current business details. Use list_sales to find a unique sale ID and current version before proposing a correction. Ask the user to identify the target when multiple sales could match.',
    'CRITICAL: For sales and corrections, you MUST call the propose_sales or propose_correction tool. Never claim or speak that you have prepared a proposal unless you actually called the propose_sales tool. Never claim a ledger change has happened before the user presses the visible Confirm button. The browser does not provide commit tools to you.',
    'When a proposal is ready, tell the user to review it in the EasyLedger card and confirm there. Do not ask the user to speak a secret or confirmation token.',
    'For unknown default prices, do not guess. Explain that the proposal will be marked as having unknown revenue, or ask the merchant for a price.',
    'Query totals come from the server. State the currency, date range, ledger revision when useful, and say when revenue is incomplete.',
    'For dashboard edits, read the draft first when the target is unclear, then use typed operations. The dashboard canvas supports: 1) Total revenue KPI: type "kpi", metric "revenue", dimension "none"; 2) Units sold KPI: type "kpi", metric "units", dimension "none"; 3) Daily revenue line chart: type "line", metric "revenue", dimension "date" (line charts only support metric "revenue"); 4) Sales by product bar chart: type "bar", metric "units", dimension "product". For product-focused cards, set a descriptive title (e.g. "Orange Juice Revenue", "Orange Juice Sales"). When the user asks to save or confirms saving the dashboard, call save_dashboard with the dashboard name so the user can confirm the save in the EasyLedger card.',
    'Keep replies short, speak plainly, and ask one clarification at a time.',
  ].join('\n');
}

export function createVoiceSessionUpdate(context: VoiceBusinessContext) {
  return {
    type: 'session.update',
    session: {
      system_prompt: buildVoiceSystemPrompt(context),
      greeting: 'Hello. What would you like to do with your ledger?',
      tools: EASYLEDGER_VOICE_TOOLS,
      input: {
        format: { encoding: 'audio/pcm' },
        transcription_mode: 'balanced',
        voice_focus: 'near-field',
        turn_detection: { vad_threshold: 0.5, min_silence: 500, max_silence: 1800, interrupt_response: true },
      },
      output: { voice: 'alba', format: { encoding: 'audio/pcm' }, volume: 100 },
    },
  };
}

export function parseVoiceToolArguments(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) as unknown; } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

const PRIVATE_TOOL_RESULT_KEYS = new Set([
  'confirmation_token',
  'confirmation_token_hash',
  'provider_token',
  'session_token',
  'business_id',
  'actor_user_id',
]);

export function sanitizeVoiceToolResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeVoiceToolResult);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !PRIVATE_TOOL_RESULT_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, sanitizeVoiceToolResult(child)]));
  }
  return value;
}

export interface VoiceTranscriptPartial {
  role: 'You' | 'EasyLedger';
  text: string;
}

/** Append streaming word tokens with natural boundary spacing and punctuation handling. */
export function appendWordDelta(currentText: string, delta: string): string {
  if (!currentText) return delta;
  if (!delta) return currentText;
  const isPunctuationStart = /^[,.:;!?')\]}%’”]/.test(delta);
  const endsWithSpace = /\s$/.test(currentText);
  const endsWithOpenQuoteOrBracket = /[([{‘“]$/.test(currentText);
  if (isPunctuationStart || endsWithSpace || endsWithOpenQuoteOrBracket || delta.startsWith(' ')) {
    return currentText + delta;
  }
  return `${currentText} ${delta}`;
}

/** The user delta is a replacement snapshot; the agent delta is an append-only fragment. */
export function applyVoiceTranscriptDelta(
  current: VoiceTranscriptPartial | null,
  type: 'transcript.user.delta' | 'transcript.agent.delta',
  event: Record<string, unknown>,
): VoiceTranscriptPartial | null {
  if (type === 'transcript.user.delta') {
    const text = typeof event.text === 'string' ? event.text : null;
    return text === null ? current : { role: 'You', text };
  }
  const delta = typeof event.delta === 'string' ? event.delta : null;
  if (delta === null) return current;
  return {
    role: 'EasyLedger',
    text: current?.role === 'EasyLedger' ? appendWordDelta(current.text, delta) : delta,
  };
}

/** AudioWorklet source that carries one prior sample across render-quantum boundaries. */
export function pcmWorkletSource(): string {
  return `
    class EasyLedgerPcm16Processor extends AudioWorkletProcessor {
      constructor(options) {
        super();
        const target = options.processorOptions.targetSampleRate || 24000;
        this.ratio = sampleRate / target;
        this.phase = 0;
        this.previousSample = 0;
      }
      process(inputs) {
        const input = inputs[0] && inputs[0][0];
        if (!input || input.length < 2) return true;
        const samples = [];
        let position = this.phase;
        while (position + 1 < input.length) {
          const index = Math.floor(position);
          const fraction = position - index;
          const left = index < 0 ? this.previousSample : input[index];
          const right = index + 1 < 0 ? this.previousSample : input[index + 1];
          const value = left + (right - left) * fraction;
          samples.push(Math.max(-32768, Math.min(32767, Math.round(value * 32768))));
          position += this.ratio;
        }
        this.phase = Math.max(-1, position - input.length);
        this.previousSample = input[input.length - 1];
        if (samples.length) {
          const pcm = new Int16Array(samples);
          this.port.postMessage(pcm.buffer, [pcm.buffer]);
        }
        return true;
      }
    }
    registerProcessor('easyledger-pcm16', EasyLedgerPcm16Processor);
  `;
}
