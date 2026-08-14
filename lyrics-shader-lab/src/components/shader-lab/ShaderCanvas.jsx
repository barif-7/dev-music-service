/**
 * LYRIC SHADER LAB — Shader Canvas
 * Renders the animated visual background using Canvas2D.
 *
 * The uniforms object is mutated in place by the host bridge and has a stable
 * identity, so this component renders continuously without React re-rendering.
 * Size is tracked with a ResizeObserver rather than measured per frame — the
 * old loop called getBoundingClientRect() on every tick, forcing a synchronous
 * layout 60 times a second.
 */

import React, { useRef, useEffect } from "react";
import { renderShaderFrame } from "@/lib/shader-lab/shaderPresets";

export default function ShaderCanvas({ uniforms, shaderPreset, className = "" }) {
  const canvasRef = useRef(null);
  const uniformsRef = useRef(uniforms);
  const presetRef = useRef(shaderPreset);

  uniformsRef.current = uniforms;
  presetRef.current = shaderPreset;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const ctx = canvas.getContext("2d");
    const startTime = performance.now();
    const size = { width: 0, height: 0 };
    // Reused each frame so the loop allocates nothing, and so the host's own
    // uniforms object is never written to from here.
    const render = {};
    let animId = 0;

    const applySize = (width, height) => {
      if (width === size.width && height === size.height) return;
      size.width = width;
      size.height = height;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) applySize(box.width, box.height);
    });
    observer.observe(parent);
    const rect = parent.getBoundingClientRect();
    applySize(rect.width, rect.height);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!size.width || !size.height) return;

      const dpr = Math.min(window.devicePixelRatio, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Object.assign(render, uniformsRef.current);
      // Animation runs on wall time, as it always has, so the visual keeps
      // drifting while playback is paused.
      render.uTime = (performance.now() - startTime) / 1000;
      renderShaderFrame(ctx, size.width, size.height, render, presetRef.current);
    };
    animId = requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-shader-preset={shaderPreset?.id || "aurora"}
      className={`absolute inset-0 w-full h-full ${className}`}
    />
  );
}
