import{j as e}from"./index-DJxUCLo7.js";import{R as p,B as u}from"./rotate-ccw-C8OZMzs_.js";import{c as s}from"./client-B2d0kgcx.js";import{B as i}from"./book-open-CVw-jM1Y.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"m12 14 4-4",key:"9kzdfg"}],["path",{d:"M3.34 19a10 10 0 1 1 17.32 0",key:"19p75a"}]],k=s("Gauge",x);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=[["polygon",{points:"19 20 9 12 19 4 19 20",key:"o2sva"}],["line",{x1:"5",x2:"5",y1:"19",y2:"5",key:"1ocqjk"}]],f=s("SkipBack",m);function o({onClick:l,icon:r,label:a,disabled:n=!1}){return e.jsxs("button",{type:"button",onClick:l,disabled:n,className:"reader-control inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 text-xs text-white/75 backdrop-blur-md hover:bg-black/45 hover:text-white disabled:opacity-40","aria-label":a,children:[e.jsx(r,{className:"h-4 w-4","aria-hidden":"true"})," ",a]})}function j({onRepeat:l,onReplayPrevious:r,onSlow:a,onPractice:n,onVocabulary:d,hasOriginal:t,canUseVocabulary:b,onStudy:c}){return e.jsxs("div",{"data-reader-chrome":!0,className:"absolute bottom-14 left-1/2 z-30 flex w-[min(720px,calc(100%-32px))] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 backdrop-blur-md",role:"toolbar","aria-label":"Language learning controls",children:[e.jsx(o,{onClick:l,icon:p,label:"Repeat line",disabled:!t}),e.jsx(o,{onClick:r,icon:f,label:"Previous line",disabled:!t}),e.jsx(o,{onClick:a,icon:k,label:"Slow playback"}),e.jsx(o,{onClick:n,icon:u,label:"Practice",disabled:!t}),c&&e.jsx(o,{onClick:c,icon:i,label:"Study words"}),e.jsx(o,{onClick:d,icon:i,label:"Vocabulary",disabled:!t||!b})]})}const C=Object.freeze(Object.defineProperty({__proto__:null,default:j},Symbol.toStringTag,{value:"Module"}));export{j as L,f as S,C as a};
