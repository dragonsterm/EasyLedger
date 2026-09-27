export type DashboardWidgetKind =
  | 'revenue-kpi'
  | 'units-kpi'
  | 'daily-revenue'
  | 'product-sales'
  | 'complete-days';

export type DashboardWidgetType = 'Line chart' | 'Bar chart' | 'KPI';
export type DashboardWidgetMetric = 'Revenue' | 'Units sold' | 'Day completeness';
export type DashboardWidgetDimension = 'Day' | 'Product' | 'None';

export interface DashboardWidgetDefinition {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  type: DashboardWidgetType;
  metric: DashboardWidgetMetric;
  dimension: DashboardWidgetDimension;
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
  'revenue-kpi': { title: 'Total revenue', type: 'KPI', metric: 'Revenue', dimension: 'None' },
  'units-kpi': { title: 'Units sold', type: 'KPI', metric: 'Units sold', dimension: 'None' },
  'daily-revenue': { title: 'Daily revenue', type: 'Line chart', metric: 'Revenue', dimension: 'Day' },
  'product-sales': { title: 'Sales by product', type: 'Bar chart', metric: 'Units sold', dimension: 'Product' },
  'complete-days': { title: 'Complete days', type: 'KPI', metric: 'Day completeness', dimension: 'Day' },
};

export const dashboardWidgetOptions: ReadonlyArray<{ kind: DashboardWidgetKind; label: string }> = [
  { kind: 'revenue-kpi', label: 'Total revenue KPI' },
  { kind: 'units-kpi', label: 'Units sold KPI' },
  { kind: 'daily-revenue', label: 'Daily revenue line chart' },
  { kind: 'product-sales', label: 'Sales by product bar chart' },
  { kind: 'complete-days', label: 'Complete days KPI' },
];

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

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
