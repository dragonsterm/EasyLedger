export type DashboardWidgetKind =
  | 'revenue-kpi'
  | 'units-kpi'
  | 'daily-revenue'
  | 'product-sales'
  | 'complete-days';

export type DashboardWidgetType = 'Line chart' | 'Bar chart' | 'KPI';
export type DashboardWidgetMetric = 'Revenue' | 'Units sold' | 'Day completeness';
export type DashboardWidgetDimension = 'Day' | 'Product' | 'None';
export type DashboardWidgetStyle = 'sage' | 'warm';

export interface DashboardWidgetDefinition {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  type: DashboardWidgetType;
  metric: DashboardWidgetMetric;
  dimension: DashboardWidgetDimension;
  style: DashboardWidgetStyle;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
}

const widgetTemplates: Record<DashboardWidgetKind, Omit<DashboardWidgetDefinition, 'id' | 'kind'>> = {
  'revenue-kpi': { title: 'Total revenue', type: 'KPI', metric: 'Revenue', dimension: 'None', style: 'sage' },
  'units-kpi': { title: 'Units sold', type: 'KPI', metric: 'Units sold', dimension: 'None', style: 'sage' },
  'daily-revenue': { title: 'Daily revenue', type: 'Line chart', metric: 'Revenue', dimension: 'Day', style: 'sage' },
  'product-sales': { title: 'Sales by product', type: 'Bar chart', metric: 'Units sold', dimension: 'Product', style: 'sage' },
  'complete-days': { title: 'Complete days', type: 'KPI', metric: 'Day completeness', dimension: 'Day', style: 'sage' },
};

const editableWidgetKinds: ReadonlyArray<DashboardWidgetKind> = [
  'daily-revenue',
  'product-sales',
  'revenue-kpi',
  'units-kpi',
  'complete-days',
];

export const dashboardWidgetOptions: ReadonlyArray<{ kind: DashboardWidgetKind; label: string }> = [
  { kind: 'revenue-kpi', label: 'Total revenue KPI' },
  { kind: 'units-kpi', label: 'Units sold KPI' },
  { kind: 'daily-revenue', label: 'Daily revenue line chart' },
  { kind: 'product-sales', label: 'Sales by product bar chart' },
  { kind: 'complete-days', label: 'Complete days KPI' },
];

export function dashboardWidgetKindsForType(type: DashboardWidgetType): DashboardWidgetKind[] {
  return editableWidgetKinds.filter((kind) => widgetTemplates[kind].type === type);
}

export function dashboardWidgetKindForType(
  type: DashboardWidgetType,
  preferredMetric?: DashboardWidgetMetric,
): DashboardWidgetKind {
  const candidates = dashboardWidgetKindsForType(type);
  const preferred = candidates.find((kind) => widgetTemplates[kind].metric === preferredMetric);
  const kind = preferred ?? candidates[0];
  if (!kind) throw new Error('No supported dashboard widget configuration for this type');
  return kind;
}

export function reconfigureDashboardWidget(
  widget: DashboardWidgetDefinition,
  kind: DashboardWidgetKind,
): DashboardWidgetDefinition {
  const template = widgetTemplates[kind];
  if (!template) throw new Error('Unknown dashboard widget type');
  const ordinal = defaultTitleOrdinal(widget.title, widgetTemplates[widget.kind].title);
  const title = ordinal === null
    ? widget.title
    : createDashboardWidget(kind, widget.id, ordinal).title;
  return { ...widget, ...template, id: widget.id, kind, title, style: widget.style };
}

function defaultTitleOrdinal(title: string, baseTitle: string): number | null {
  if (title === baseTitle) return 1;
  const prefix = `${baseTitle} (`;
  if (!title.startsWith(prefix) || !title.endsWith(')')) return null;
  const ordinalText = title.slice(prefix.length, -1);
  if (!/^\d+$/.test(ordinalText)) return null;
  const ordinal = Number(ordinalText);
  return Number.isSafeInteger(ordinal) && ordinal > 1 ? ordinal : null;
}

export function sanitizeDashboardWidgetTitle(title: string, fallback: string): string {
  return title.trim().slice(0, 80) || fallback;
}

export function createDashboardWidget(
  kind: DashboardWidgetKind,
  id: string,
  ordinal = 1,
): DashboardWidgetDefinition {
  if (!id.trim()) throw new Error('Dashboard widget ID must not be empty');
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new RangeError('Dashboard widget ordinal must be a positive integer');
  const template = widgetTemplates[kind];
  if (!template) throw new Error('Unknown dashboard widget type');
  return {
    id,
    kind,
    ...template,
    title: ordinal === 1 ? template.title : `${template.title} (${ordinal})`,
  };
}

export function createUniqueDashboardWidgetId(
  usedIds: Iterable<string>,
  firstSequence = 1,
): { id: string; nextSequence: number } {
  if (!Number.isSafeInteger(firstSequence) || firstSequence < 1) {
    throw new RangeError('Widget ID sequence must be a positive integer');
  }
  const used = new Set(usedIds);
  let sequence = firstSequence;
  let id = `added-widget-${sequence}`;
  while (used.has(id)) {
    sequence += 1;
    if (!Number.isSafeInteger(sequence)) throw new RangeError('Dashboard widget ID sequence is exhausted');
    id = `added-widget-${sequence}`;
  }
  const nextSequence = sequence + 1;
  if (!Number.isSafeInteger(nextSequence)) throw new RangeError('Dashboard widget ID sequence is exhausted');
  return { id, nextSequence };
}

export function createInitialDashboardWidgets(): DashboardWidgetDefinition[] {
  return [
    createDashboardWidget('revenue-kpi', 'total-revenue'),
    createDashboardWidget('units-kpi', 'total-units'),
    createDashboardWidget('complete-days', 'complete-days'),
    createDashboardWidget('daily-revenue', 'daily-revenue'),
    createDashboardWidget('product-sales', 'sales-by-product'),
  ];
}

export function createInitialDashboardLayout(): DashboardLayoutItem[] {
  return [
    { i: 'total-revenue', x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'total-units', x: 4, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'complete-days', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 5 },
    { i: 'daily-revenue', x: 0, y: 5, w: 6, h: 10, minW: 5, minH: 10 },
    { i: 'sales-by-product', x: 6, y: 5, w: 6, h: 10, minW: 5, minH: 10 },
  ];
}

export function createAppendedDashboardLayoutItem(
  layout: ReadonlyArray<DashboardLayoutItem>,
  widget: DashboardWidgetDefinition,
): DashboardLayoutItem {
  const isChart = widget.kind === 'daily-revenue' || widget.kind === 'product-sales';
  const bottom = layout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0);
  return isChart
    ? { i: widget.id, x: 0, y: bottom, w: 6, h: 10, minW: 5, minH: 10 }
    : { i: widget.id, x: 0, y: bottom, w: 4, h: 5, minW: 3, minH: 5 };
}

export function removeDashboardLayoutItem(
  layout: ReadonlyArray<DashboardLayoutItem>,
  id: string,
): DashboardLayoutItem[] {
  return layout.filter((item) => item.i !== id).map((item) => ({ ...item }));
}

export function moveDashboardLayoutItem(
  layout: ReadonlyArray<DashboardLayoutItem>,
  id: string,
  direction: 'left' | 'right',
): DashboardLayoutItem[] {
  const selected = layout.find((item) => item.i === id);
  if (!selected) return layout.map((item) => ({ ...item }));
  const candidates = layout.filter((item) => item.i !== id
    && item.y === selected.y
    && item.w === selected.w
    && item.h === selected.h
    && (direction === 'left'
      ? item.x + item.w === selected.x
      : selected.x + selected.w === item.x));
  const neighbor = direction === 'left'
    ? candidates.sort((left, right) => right.x - left.x)[0]
    : candidates.sort((left, right) => left.x - right.x)[0];
  if (!neighbor) return layout.map((item) => ({ ...item }));

  return layout.map((item) => {
    if (item.i === selected.i) return { ...item, x: neighbor.x };
    if (item.i === neighbor.i) return { ...item, x: selected.x };
    return { ...item };
  });
}

export function canMoveDashboardLayoutItem(
  layout: ReadonlyArray<DashboardLayoutItem>,
  id: string,
  direction: 'left' | 'right',
): boolean {
  const moved = moveDashboardLayoutItem(layout, id, direction);
  const selected = layout.find((item) => item.i === id);
  const updated = moved.find((item) => item.i === id);
  return selected !== undefined && updated !== undefined && selected.x !== updated.x;
}

export function updateDashboardLayoutForWidgetKind(
  layout: ReadonlyArray<DashboardLayoutItem>,
  id: string,
  previousKind: DashboardWidgetKind,
  nextKind: DashboardWidgetKind,
  cols = 12,
): DashboardLayoutItem[] {
  if (!Number.isSafeInteger(cols) || cols < 5) throw new RangeError('Grid columns must be at least five for chart widgets');
  const normalized = normalizeDashboardLayout(layout, layout.map((item) => item.i), cols);
  const current = normalized.find((item) => item.i === id);
  if (!current) return normalized;

  const nextIsChart = isChartWidgetKind(nextKind);
  const previousWasChart = isChartWidgetKind(previousKind);
  const minW = nextIsChart ? 5 : 3;
  const minH = nextIsChart ? 10 : 5;
  const width = nextIsChart
    ? Math.max(current.w, Math.min(6, cols))
    : previousWasChart ? Math.min(4, cols) : current.w;
  const height = nextIsChart ? Math.max(current.h, 10) : previousWasChart ? 5 : current.h;
  const resized: DashboardLayoutItem = {
    ...current,
    w: Math.min(cols, Math.max(minW, width)),
    h: Math.max(minH, height),
    minW,
    maxW: cols,
    minH,
    maxH: Number.MAX_SAFE_INTEGER,
  };
  resized.x = Math.min(cols - resized.w, Math.max(0, current.x));

  const originalOrder = new Map(normalized.map((item, index) => [item.i, index]));
  const remaining = normalized
    .filter((item) => item.i !== id)
    .sort((left, right) => left.y - right.y || left.x - right.x || (originalOrder.get(left.i) ?? 0) - (originalOrder.get(right.i) ?? 0));
  const placed: DashboardLayoutItem[] = [resized];

  for (const item of remaining) {
    placed.push(findNonOverlappingPosition(item, placed, cols, normalized.length));
  }

  const positions = new Map(placed.map((item) => [item.i, item]));
  return normalized.map((item) => ({ ...positions.get(item.i)! }));
}

function isChartWidgetKind(kind: DashboardWidgetKind): boolean {
  return kind === 'daily-revenue' || kind === 'product-sales';
}

function findNonOverlappingPosition(
  item: DashboardLayoutItem,
  placed: ReadonlyArray<DashboardLayoutItem>,
  cols: number,
  widgetCount: number,
): DashboardLayoutItem {
  const maxX = cols - item.w;
  const xCandidates = Array.from({ length: maxX + 1 }, (_, x) => x)
    .sort((left, right) => Math.abs(left - item.x) - Math.abs(right - item.x) || left - right);
  const maxPlacedBottom = placed.reduce((bottom, candidate) => Math.max(bottom, candidate.y + candidate.h), 0);
  const lastSearchY = Math.max(item.y, maxPlacedBottom) + item.h * (widgetCount + 1);

  for (let y = item.y; y <= lastSearchY; y += 1) {
    for (const x of xCandidates) {
      const candidate = { ...item, x, y };
      if (!placed.some((existing) => dashboardLayoutItemsOverlap(existing, candidate))) return candidate;
    }
  }
  throw new Error('Unable to place dashboard widget without overlap');
}

function dashboardLayoutItemsOverlap(left: DashboardLayoutItem, right: DashboardLayoutItem): boolean {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

/** Prunes stale or duplicate entries and keeps items within the desktop grid bounds. */
export function normalizeDashboardLayout(
  layout: ReadonlyArray<DashboardLayoutItem>,
  widgetIds: ReadonlyArray<string>,
  cols = 12,
): DashboardLayoutItem[] {
  if (!Number.isSafeInteger(cols) || cols < 1) throw new RangeError('Grid columns must be a positive integer');
  const knownIds = new Set(widgetIds);
  const seenIds = new Set<string>();
  const result: DashboardLayoutItem[] = [];

  for (const item of layout) {
    if (!knownIds.has(item.i) || seenIds.has(item.i)) continue;
    seenIds.add(item.i);
    const minW = clampInteger(item.minW, 1, cols, 1);
    const maxW = clampInteger(item.maxW, minW, cols, cols);
    const minH = clampInteger(item.minH, 1, Number.MAX_SAFE_INTEGER, 1);
    const maxH = clampInteger(item.maxH, minH, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const w = clampInteger(item.w, minW, maxW, minW);
    const h = clampInteger(item.h, minH, maxH, minH);
    const x = clampInteger(item.x, 0, cols - w, 0);
    const y = clampInteger(item.y, 0, Number.MAX_SAFE_INTEGER, 0);
    result.push({ ...item, x, y, w, h, minW, maxW, minH, maxH });
  }

  return result;
}

/**
 * Adapts an editing layout for preview mode by removing the height reserved
 * for the editing tools header (drag handle, type label, remove button) and compacting
 * the grid items vertically so widgets do not appear oversized with large empty gaps.
 */
export function computePreviewLayout(
  layout: ReadonlyArray<DashboardLayoutItem>,
  widgets: ReadonlyArray<DashboardWidgetDefinition>,
  cols = 12,
): DashboardLayoutItem[] {
  if (!Number.isSafeInteger(cols) || cols < 1) throw new RangeError('Grid columns must be a positive integer');
  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  const sorted = [...layout].sort((left, right) => left.y - right.y || left.x - right.x);
  const placed: DashboardLayoutItem[] = [];

  for (const item of sorted) {
    const widget = widgetMap.get(item.i);
    const isChart = widget ? isChartWidgetKind(widget.kind) : (item.minW ?? 0) >= 5 || item.h >= 8;
    const previewMinH = isChart ? 8 : 4;
    const previewH = Math.max(previewMinH, item.h - 1);

    let targetY = 0;
    while (placed.some((existing) => dashboardLayoutItemsOverlap(existing, { ...item, y: targetY, h: previewH }))) {
      targetY += 1;
    }

    placed.push({
      ...item,
      y: targetY,
      h: previewH,
      minH: previewMinH,
    });
  }

  const placedMap = new Map(placed.map((item) => [item.i, item]));
  return layout.map((item) => placedMap.get(item.i) ?? item);
}

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
