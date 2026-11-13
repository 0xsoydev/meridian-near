"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type AutoscaleInfoProvider,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { FOCUS } from "../../../components/kit";
import { candlesFromPoints, type CandlePoint, type ChartPoint } from "../../../lib/price";

export const INTERVALS = [
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "900", label: "15m" },
  { value: "3600", label: "1h" },
] as const;

export type Interval = (typeof INTERVALS)[number]["value"];

const BAR = "rgba(23, 67, 255, 0.22)";

const ohlc = ({ time, open, high, low, close }: CandlePoint) => ({ time, open, high, low, close });

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function ChartCredit() {
  return (
    <a
      href="https://www.tradingview.com/"
      target="_blank"
      rel="noreferrer"
      className={`hidden whitespace-nowrap text-[12px] text-muted underline decoration-transparent underline-offset-[4px] transition-[color,text-decoration-color] duration-200 ease-brand hover:text-ink hover:decoration-ink sm:inline ${FOCUS}`}
    >
      Charts by TradingView
    </a>
  );
}

type Drawn = { chart: IChartApi; candles: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram"> };

export function CandleChart({ points, bucket, empty }: { points: ChartPoint[]; bucket: number; empty: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const drawn = useRef<Drawn | null>(null);
  const signature = useRef("");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const up = token("--color-up");
    const down = token("--color-down");
    const ink = token("--color-ink");
    const accent = token("--color-accent");
    const line = token("--color-line");
    const control = token("--color-control");
    const priceFormat = { type: "price" as const, precision: 4, minMove: 0.0001 };
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: token("--color-muted"),
        fontSize: 12,
        fontFamily: getComputedStyle(el).fontFamily,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(30, 30, 30, 0.06)" } },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.12, bottom: 0.24 } },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 10 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: control, labelBackgroundColor: ink },
        horzLine: { color: control, labelBackgroundColor: ink },
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
      priceLineColor: accent,
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      priceFormat,
      autoscaleInfoProvider: ((base) => {
        const info = base();
        if (!info?.priceRange) return info;
        const { minValue, maxValue } = info.priceRange;
        const mid = (minValue + maxValue) / 2;
        const half = Math.max((maxValue - minValue) / 2, mid * 0.02);
        return { ...info, priceRange: { minValue: mid - half, maxValue: mid + half } };
      }) satisfies AutoscaleInfoProvider,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    drawn.current = { chart, candles, volume };
    signature.current = "";
    return () => {
      chart.remove();
      drawn.current = null;
    };
  }, []);

  useEffect(() => {
    const current = drawn.current;
    if (!current) return;
    const last = points.at(-1);
    const key = `${bucket}:${points.length}:${points[0]?.time ?? 0}:${last?.time ?? 0}:${last?.value ?? 0}`;
    if (key === signature.current) return;
    signature.current = key;
    const candles = candlesFromPoints(points, bucket);
    current.chart.applyOptions({ rightPriceScale: { visible: points.length > 0 }, timeScale: { visible: points.length > 0 } });
    current.candles.setData(candles.map(ohlc));
    current.volume.setData(candles.map((candle) => ({ time: candle.time, value: candle.volume, color: candle.volume > 0 ? BAR : "transparent" })));
  }, [points, bucket]);

  return (
    <div className="relative h-full min-h-[280px] w-full">
      <div ref={host} className="absolute inset-0" />
      {points.length === 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-muted">{empty}</p>
      ) : null}
    </div>
  );
}
