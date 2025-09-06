// Simple metrics worker for large datasets to keep UI thread responsive

self.onmessage = (e) => {
  const { cmd, payload } = e.data || {};
  if (cmd === 'computeMetrics') {
    try {
      const data = Array.isArray(payload?.data) ? payload.data : [];
      // Extract numeric redox values
      let count = 0;
      let valid = 0;
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        count++;
        const d = data[i];
        const vRaw = d?.processed_eh != null ? d.processed_eh : d?.redox_value_mv;
        const v = vRaw == null ? NaN : Number(vRaw);
        if (Number.isFinite(v)) {
          valid++;
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
        }
      }
      const avg = valid > 0 ? sum / valid : 0;
      const result = {
        totalMeasurements: count,
        redoxRange: Number.isFinite(min) && Number.isFinite(max)
          ? `${min.toFixed(0)} to ${max.toFixed(0)} mV` : 'No Valid Data',
        avgRedox: avg,
        zonesDetected: 0, // optional: compute zones here if needed
        validMeasurements: valid,
        dataCompleteness: count > 0 ? Math.round((valid / count) * 100) : 0
      };
      self.postMessage({ ok: true, result });
    } catch (err) {
      self.postMessage({ ok: false, error: String(err?.message || err) });
    }
  }
};

