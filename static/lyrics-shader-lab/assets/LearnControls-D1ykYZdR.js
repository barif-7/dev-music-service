import{j as e}from"./index-iAj_DOhM.js";import{R as d}from"./rotate-ccw-sbWqDh91.js";import{c}from"./captionLocalizerProvider-C30gYyyk.js";import{B as b}from"./bookmark-YUiiYXxo.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],k=c("BookOpen",p);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["path",{d:"m12 14 4-4",key:"9kzdfg"}],["path",{d:"M3.34 19a10 10 0 1 1 17.32 0",key:"19p75a"}]],x=c("Gauge",u);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=[["polygon",{points:"19 20 9 12 19 4 19 20",key:"o2sva"}],["line",{x1:"5",x2:"5",y1:"19",y2:"5",key:"1ocqjk"}]],y=c("SkipBack",m);function o({onClick:r,icon:l,label:a,disabled:n=!1}){return e.jsxs("button",{type:"button",onClick:r,disabled:n,className:"reader-control inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 text-xs text-white/75 backdrop-blur-md hover:bg-black/45 hover:text-white disabled:opacity-40","aria-label":a,children:[e.jsx(l,{className:"h-4 w-4","aria-hidden":"true"})," ",a]})}function f({onRepeat:r,onReplayPrevious:l,onSlow:a,onPractice:n,onVocabulary:i,hasOriginal:t,canUseVocabulary:s}){return e.jsxs("div",{"data-reader-chrome":!0,className:"absolute bottom-14 left-1/2 z-30 flex w-[min(720px,calc(100%-32px))] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 backdrop-blur-md",role:"toolbar","aria-label":"Language learning controls",children:[e.jsx(o,{onClick:r,icon:d,label:"Repeat line",disabled:!t}),e.jsx(o,{onClick:l,icon:y,label:"Previous line",disabled:!t}),e.jsx(o,{onClick:a,icon:x,label:"Slow playback"}),e.jsx(o,{onClick:n,icon:b,label:"Practice",disabled:!t}),e.jsx(o,{onClick:i,icon:k,label:"Vocabulary",disabled:!t||!s})]})}const w=Object.freeze(Object.defineProperty({__proto__:null,default:f},Symbol.toStringTag,{value:"Module"}));export{f as L,y as S,w as a};
