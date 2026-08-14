import { useCallback, useEffect, useRef } from "react";

const EMPTY_FRAME = {
  available: false,
  rms: 0,
  peak: 0,
  spectralCentroid: 0,
  spectralFlux: 0,
  zeroCrossingRate: 0,
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0,
  onsetStrength: 0,
  beatConfidence: 0,
};

function meanRange(values, start, end) {
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index < end; index += 1) total += values[index];
  return total / (end - start) / 255;
}

export function useAudioAnalyser(audioRef) {
  const frameRef = useRef({ ...EMPTY_FRAME });
  const graphRef = useRef(null);
  const rafRef = useRef(null);

  const connect = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!graphRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      graphRef.current = {
        context,
        analyser,
        frequency: new Uint8Array(analyser.frequencyBinCount),
        time: new Uint8Array(analyser.fftSize),
        previous: new Uint8Array(analyser.frequencyBinCount),
      };
    }

    const graph = graphRef.current;
    if (graph.context.state === "suspended") await graph.context.resume();

    if (!rafRef.current) {
      const sample = () => {
        graph.analyser.getByteFrequencyData(graph.frequency);
        graph.analyser.getByteTimeDomainData(graph.time);

        let squareSum = 0;
        let peak = 0;
        let crossings = 0;
        for (let index = 0; index < graph.time.length; index += 1) {
          const sampleValue = (graph.time[index] - 128) / 128;
          squareSum += sampleValue * sampleValue;
          peak = Math.max(peak, Math.abs(sampleValue));
          if (index && (graph.time[index - 1] < 128) !== (graph.time[index] < 128)) crossings += 1;
        }

        let weighted = 0;
        let magnitude = 0;
        let flux = 0;
        for (let index = 0; index < graph.frequency.length; index += 1) {
          const value = graph.frequency[index] / 255;
          magnitude += value;
          weighted += value * index;
          flux += Math.max(0, graph.frequency[index] - graph.previous[index]) / 255;
          graph.previous[index] = graph.frequency[index];
        }

        const nyquist = graph.context.sampleRate / 2;
        const binHz = nyquist / graph.frequency.length;
        const bassEnd = Math.max(1, Math.floor(200 / binHz));
        const midEnd = Math.max(bassEnd + 1, Math.floor(4000 / binHz));
        const normalizedFlux = Math.min(1, flux / graph.frequency.length * 8);
        frameRef.current = {
          available: !audio.paused,
          rms: Math.min(1, Math.sqrt(squareSum / graph.time.length) * 2.4),
          peak,
          spectralCentroid: magnitude ? weighted / magnitude / graph.frequency.length : 0,
          spectralFlux: normalizedFlux,
          zeroCrossingRate: crossings / graph.time.length,
          bassEnergy: meanRange(graph.frequency, 0, bassEnd),
          midEnergy: meanRange(graph.frequency, bassEnd, Math.min(midEnd, graph.frequency.length)),
          trebleEnergy: meanRange(graph.frequency, Math.min(midEnd, graph.frequency.length), graph.frequency.length),
          onsetStrength: normalizedFlux,
          beatConfidence: Math.min(1, normalizedFlux * 0.65 + peak * 0.35),
        };
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);
    }
  }, [audioRef]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (graphRef.current) graphRef.current.context.close();
  }, []);

  return { frameRef, connect };
}
