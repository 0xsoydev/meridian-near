"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type ISeriesApi,
} from "lightweight-charts";
import { candlesFromPoints, type CandlePoint, type ChartPoint } from "../../../lib/price";

export const INTERVALS = [
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "900", label: "15m" },
  { value: "3600", label: "1h" },
] as const;

export type Interval = (typeof INTERVALS)[number]["value"];

const UP = "#0B7D4F";
const DOWN = "#D12A3F";
const BAR = "rgba(23, 67, 255, 0.22)";

const ohlc = ({ time, open, high, low, close }: CandlePoint) => ({ time, open, high, low, close });
const bar = (candle: CandlePoint) => ({ time: candle.time, value: candle.volume, color: candle.volume > 0 ? BAR : "transparent" });

export function CandleChart({ points, bucket, empty }: { points: ChartPoint[]; bucket: number; empty: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const drawn = useRef<ChartPoint[]>([]);
  const drawnBucket = useRef(bucket);
  const drawnCandles = useRef<CandlePoint[]>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#757575",
        fontSize: 12,
        fontFamily: getComputedStyle(el).fontFamily,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(30, 30, 30, 0.06)" },
      },
      rightPriceScale: { borderColor: "#CECECE", scaleMargins: { top: 0.1, bottom: 0.24 } },
      timeScale: { borderColor: "#CECECE", timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 10 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#949494", labelBackgroundColor: "#1E1E1E" },
        horzLine: { color: "#949494", labelBackgroundColor: "#1E1E1E" },
      },
    });
    candles.current = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceLineColor: "#1743FF",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    volume.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    drawn.current = [];
    drawnCandles.current = [];
    return () => {
      chart.remove();
      candles.current = null;
      volume.current = null;
    };
  }, []);

  useEffect(() => {
    const series = candles.current;
    const bars = volume.current;
    if (!series || !bars) return;
    const next = candlesFromPoints(points, bucket);
    const reshaped =
      drawn.current.length === 0 ||
      drawnBucket.current !== bucket ||
      points.length < drawn.current.length ||
      drawn.current[0]?.time !== points[0]?.time;
    drawnBucket.current = bucket;

    const previous = drawnCandles.current;
    let same = 0;
    while (same < previous.length && same < next.length) {
      const before = previous[same];
      const after = next[same];
      if (
        !before ||
        !after ||
        before.time !== after.time ||
        before.open !== after.open ||
        before.high !== after.high ||
        before.low !== after.low ||
        before.close !== after.close ||
        before.volume !== after.volume
      ) {
        break;
      }
      same += 1;
    }

    if (reshaped || same < previous.length - 1) {
      series.setData(next.map(ohlc));
      bars.setData(next.map(bar));
    } else {
      for (const candle of next.slice(same)) {
        series.update(ohlc(candle));
        bars.update(bar(candle));
      }
    }
    drawn.current = points;
    drawnCandles.current = next;
  }, [points, bucket]);

  return (
    <div className="relative h-full min-h-[280px] w-full">
      <div ref={host} className="absolute inset-0" />
      {points.length === 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-muted">
          {empty}
        </p>
      ) : null}
    </div>
  );
}
