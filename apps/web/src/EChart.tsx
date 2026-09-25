import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import type { EChartsType } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { chartDataIndexFromEvent } from './analytics';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, SVGRenderer]);

interface EChartProps {
  option: EChartsOption;
  label: string;
  dataPointCount: number;
  onDataPointClick?: (dataIndex: number) => void;
}

export default function EChart({ option, label, dataPointCount, onDataPointClick }: EChartProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const onDataPointClickRef = useRef(onDataPointClick);
  const dataPointCountRef = useRef(dataPointCount);
  onDataPointClickRef.current = onDataPointClick;
  dataPointCountRef.current = dataPointCount;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    chart.setOption(option, { notMerge: true });
    const handleChartClick = (event: unknown) => {
      const dataIndex = chartDataIndexFromEvent(event, dataPointCountRef.current);
      if (dataIndex !== null) onDataPointClickRef.current?.(dataIndex);
    };
    chart.on('click', handleChartClick);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => chart.resize());
    const handleWindowResize = () => chart.resize();
    if (resizeObserver) {
      resizeObserver.observe(element);
    } else {
      window.addEventListener('resize', handleWindowResize);
    }

    return () => {
      chart.off('click', handleChartClick);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', handleWindowResize);
      chart.dispose();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div className="echart-view" ref={elementRef} role="img" aria-label={label} />;
}
