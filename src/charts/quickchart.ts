import type { MarketInstrument, ScannerSignal } from '../market/types';

const QUICKCHART_URL = 'https://quickchart.io/chart';

export interface PortfolioChartInput {
  balance: number;
  freeCash: number;
  dayPnl: number;
  totalPnl: number;
  positions: Array<{ ticker: string; valueRub: number; pnlPercent: number }>;
}

export interface EquityPoint {
  label: string;
  value: number;
}

export function buildPortfolioDashboardChartUrl(input: PortfolioChartInput): string {
  const labels = ['Баланс', 'Свободно', 'Сегодня', 'P&L'];
  const data = [input.balance, input.freeCash, input.dayPnl, input.totalPnl].map(value => Number(value.toFixed(2)));
  return quickChartUrl({
    type: 'bar',
    data: { labels, datasets: [{ label: '₽', data, backgroundColor: data.map(colorForValue) }] },
    options: baseOptions('BCS Assistant · Portfolio Card'),
  });
}

export function buildEquityCurveChartUrl(points: EquityPoint[]): string {
  const safePoints = points.length ? points : [{ label: 'Start', value: 0 }];
  return quickChartUrl({
    type: 'line',
    data: {
      labels: safePoints.map(point => point.label),
      datasets: [{ label: 'Equity', data: safePoints.map(point => point.value), borderColor: '#00C853', backgroundColor: 'rgba(0,200,83,0.15)', fill: true, tension: 0.35 }],
    },
    options: baseOptions('Equity Curve'),
  });
}

export function buildMarketHeatmapChartUrl(instruments: MarketInstrument[]): string {
  const top = instruments.slice(0, 10);
  return quickChartUrl({
    type: 'horizontalBar',
    data: {
      labels: top.map(item => item.ticker),
      datasets: [{ label: 'Change %', data: top.map(item => Number((item.changePercent ?? 0).toFixed(2))), backgroundColor: top.map(item => colorForValue(item.changePercent ?? 0)) }],
    },
    options: baseOptions('MOEX Heatmap'),
  });
}

export function buildMiniCandlesChartUrl(instruments: MarketInstrument[]): string {
  const top = instruments.slice(0, 7);
  return quickChartUrl({
    type: 'line',
    data: {
      labels: top.map(item => item.ticker),
      datasets: [
        { label: 'Price', data: top.map(item => item.lastPrice ?? 0), borderColor: '#00B0FF', fill: false, tension: 0.25 },
        { label: 'Momentum %', data: top.map(item => item.changePercent ?? 0), borderColor: '#FFD54F', fill: false, tension: 0.25 },
      ],
    },
    options: baseOptions('Mini Candles · Momentum'),
  });
}

export function buildAiDashboardChartUrl(signals: ScannerSignal[]): string {
  const top = signals.slice(0, 5);
  return quickChartUrl({
    type: 'radar',
    data: {
      labels: top.map(signal => signal.ticker),
      datasets: [
        { label: 'Confidence', data: top.map(signal => signal.confidence), borderColor: '#00C853', backgroundColor: 'rgba(0,200,83,0.18)' },
        { label: 'Liquidity', data: top.map(signal => signal.liquidityScore), borderColor: '#40C4FF', backgroundColor: 'rgba(64,196,255,0.16)' },
      ],
    },
    options: baseOptions('AI Scanner Dashboard'),
  });
}

function quickChartUrl(chart: Record<string, unknown>): string {
  const encoded = encodeURIComponent(JSON.stringify(chart));
  return `${QUICKCHART_URL}?width=900&height=520&backgroundColor=%23101418&format=png&c=${encoded}`;
}

function baseOptions(title: string): Record<string, unknown> {
  return {
    title: { display: true, text: title, fontColor: '#F8FAFC', fontSize: 22 },
    legend: { labels: { fontColor: '#E8EAED' } },
    scales: {
      xAxes: [{ ticks: { fontColor: '#E8EAED' }, gridLines: { color: 'rgba(255,255,255,0.08)' } }],
      yAxes: [{ ticks: { fontColor: '#E8EAED' }, gridLines: { color: 'rgba(255,255,255,0.08)' } }],
    },
  };
}

function colorForValue(value: number): string {
  if (value > 0) return '#00C853';
  if (value < 0) return '#FF5252';
  return '#B0BEC5';
}
