// EMA (Exponential Moving Average)
export function calcEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];

  // SMA for the first value
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

// RSI (Relative Strength Index)
export function calcRSI(data, period = 14) {
  if (data.length < period + 1) return [];
  const result = [];

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: data[period].time, value: rsi });

  // Smoothed RSI
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[i].time, value: rsi });
  }
  return result;
}

// MACD (Moving Average Convergence Divergence)
export function calcMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (data.length < slowPeriod + signalPeriod) return { macd: [], signal: [], histogram: [] };

  const fastEMA = calcEMAValues(data.map(d => d.close), fastPeriod);
  const slowEMA = calcEMAValues(data.map(d => d.close), slowPeriod);

  // MACD line = fast EMA - slow EMA (aligned from slowPeriod-1 onward)
  const macdValues = [];
  const macdLine = [];
  const offset = slowPeriod - 1;

  for (let i = offset; i < data.length; i++) {
    const val = fastEMA[i] - slowEMA[i];
    macdValues.push(val);
    macdLine.push({ time: data[i].time, value: val });
  }

  // Signal line = EMA of MACD values
  const signalEMA = calcEMAValues(
    macdValues.map((v, i) => ({ close: v, time: macdLine[i].time })),
    signalPeriod
  );

  const signal = [];
  const histogram = [];
  const sigOffset = signalPeriod - 1;

  for (let i = sigOffset; i < macdValues.length; i++) {
    const t = macdLine[i].time;
    const sig = signalEMA[i];
    signal.push({ time: t, value: sig });
    const hist = macdValues[i] - sig;
    histogram.push({
      time: t,
      value: hist,
      color: hist >= 0 ? 'rgba(0, 200, 83, 0.5)' : 'rgba(255, 23, 68, 0.5)',
    });
  }

  return {
    macd: macdLine.slice(sigOffset),
    signal,
    histogram,
  };
}

// VWAP (Volume Weighted Average Price)
// Resets at the start of each trading day (detects day boundaries from timestamps)
export function calcVWAP(data) {
  if (data.length === 0) return [];
  const result = [];
  let cumVol = 0;
  let cumTP = 0;
  let prevDay = -1;

  for (const d of data) {
    // Detect new trading day — reset accumulators
    const date = new Date(d.time * 1000);
    const day = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
    if (day !== prevDay) {
      cumVol = 0;
      cumTP = 0;
      prevDay = day;
    }

    const tp = (d.high + d.low + d.close) / 3;
    const vol = d.volume || 0;
    cumVol += vol;
    cumTP += tp * vol;
    if (cumVol > 0) {
      result.push({ time: d.time, value: cumTP / cumVol });
    }
  }
  return result;
}

// Helper: compute raw EMA values array (not time-series objects)
function calcEMAValues(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(0);

  // Get close values (supports both number arrays and object arrays)
  const getVal = (v) => typeof v === 'number' ? v : v.close;

  let sum = 0;
  for (let i = 0; i < period && i < values.length; i++) sum += getVal(values[i]);
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    result[i] = getVal(values[i]) * k + result[i - 1] * (1 - k);
  }

  // Fill early values with 0
  for (let i = 0; i < period - 1; i++) result[i] = result[period - 1];

  return result;
}
