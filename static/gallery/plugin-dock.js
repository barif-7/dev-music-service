/* PluginDock — one geometry for every floating dock panel.

   Before this, each toggle invented its own placement: the notes editor was a
   full-height right dock, the solar clock was centred on the viewport, and
   nothing agreed on width, height or origin. Two panels open at once meant one
   covering the other.

   Panels now share a single origin and size from the --dock-* tokens, and open
   ones are laid out in a horizontal stack: contiguous slots running right to
   left from the dock origin. Slot assignment follows registration order rather
   than open order, so an existing panel never jumps sideways because another
   one opened somewhere else in the row.

   Width is shared rather than fixed. The row divides the space it has between
   the panels that are open, so each one narrows as more join, down to
   --dock-w-min. Only when even that minimum will not fit does the row drop the
   least recently opened — a stack that silently overflowed would put a panel
   off-screen with no way to reach it.

   Panels declare themselves in the markup with class="dock-panel" and a
   data-dock-id. Placement is therefore pure CSS and holds whether or not a
   script has registered them; registering only adds behaviour. A panel behind
   a feature flag that never registers still sits where it should. */
const PluginDock = {
  panels: new Map(),        // id -> spec
  order: [],                // registration order — drives slot assignment
  recency: [],              // open order, most recent last — drives eviction

  /* Measure --dock-w and --dock-gap as they actually compute, rather than
     re-deriving min(520px, 42vw) in JS and drifting from the stylesheet. */
  _probe: null,
  _metrics(){
    if(!this._probe){
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;'
        + 'width:var(--dock-w-min);height:var(--dock-gap);margin-left:var(--dock-x)';
      document.body.appendChild(probe);
      this._probe = probe;
    }
    const style = getComputedStyle(this._probe);
    return {
      min:parseFloat(style.width) || 320,
      gap:parseFloat(style.height) || 14,
      inset:parseFloat(style.marginLeft) || 24,
    };
  },

  /* How many panels the row can hold once they have shrunk as far as they
     will go. Panels share the width down to --dock-w-min; only past that does
     the row genuinely run out and have to drop one. */
  capacity(){
    const { min, gap, inset } = this._metrics();
    const usable = window.innerWidth - (inset * 2) + gap;   // last panel needs no gap
    return Math.max(1, Math.floor(usable / (min + gap)));
  },

  /* spec: { id, el, toggle, host, showClass, focusFirst, onOpen, onClose }

     host      a full-viewport wrapper the panel used to live inside as a modal.
               It is neutralised so the card itself can dock, and its scrim —
               a click-outside affordance that only makes sense for something
               modal — is hidden.
     showClass a legacy visibility class the panel's existing CSS still keys
               off, toggled alongside .open so styling keeps working. */
  register(spec){
    if(!spec?.id || !spec.el) return null;
    this.panels.set(spec.id, spec);
    if(!this.order.includes(spec.id)) this.order.push(spec.id);
    spec.el.classList.add('dock-panel');
    spec.el.dataset.dockId = spec.id;
    if(spec.host){
      spec.host.classList.add('dock-host');
      /* A docked panel is not modal, so it must not claim to be. */
      spec.host.removeAttribute('aria-modal');
      spec.host.removeAttribute('inert');
      spec.host.setAttribute('aria-hidden', 'false');
    }
    this._reflect(spec.id);
    return {
      open:()=>this.open(spec.id),
      close:()=>this.close(spec.id),
      toggle:()=>this.toggle(spec.id),
      isOpen:()=>this.isOpen(spec.id),
    };
  },

  isOpen(id){ return this.recency.includes(id); },

  open(id){
    const spec = this.panels.get(id);
    if(!spec || this.isOpen(id)) return;
    this.recency.push(id);
    while(this.recency.length > this.capacity()){
      this.close(this.recency[0]);                      // evict least recent
    }
    this._reflect(id);
    this._layout();
    spec.onOpen?.();
  },

  close(id){
    const spec = this.panels.get(id);
    if(!spec || !this.isOpen(id)) return;
    this.recency = this.recency.filter(open => open !== id);
    this._reflect(id);
    this._layout();
    spec.onClose?.();
  },

  toggle(id){ this.isOpen(id) ? this.close(id) : this.open(id); },
  closeAll(){ [...this.recency].forEach(id => this.close(id)); },

  /* Reflect a single panel's open state into the DOM. */
  _reflect(id){
    const spec = this.panels.get(id);
    if(!spec) return;
    const open = this.isOpen(id);
    spec.el.classList.toggle('open', open);
    if(spec.showClass) spec.el.classList.toggle(spec.showClass, open);
    spec.el.setAttribute('aria-hidden', open ? 'false' : 'true');
    /* Keep a closed panel out of the tab order without display:none, which
       would defeat the open/close transition. */
    if(open) spec.el.removeAttribute('inert'); else spec.el.setAttribute('inert', '');
    if(open && spec.focusFirst){
      requestAnimationFrame(()=>{
        spec.el.querySelector(spec.focusFirst)?.focus({ preventScroll:true });
      });
    }
    if(spec.toggle){
      spec.toggle.classList.toggle('on', open);
      spec.toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
      spec.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    document.body.classList.toggle(`dock-${id}-open`, open);
  },

  /* Assign contiguous slots to the open panels, in registration order. */
  _layout(){
    const open = this.order.filter(id => this.isOpen(id));
    /* Publish the count so the stylesheet can divide the row between them. */
    document.documentElement.style.setProperty('--dock-count', String(Math.max(1, open.length)));
    open.forEach((id, slot)=>{
      this.panels.get(id).el.style.setProperty('--dock-slot', String(slot));
    });
    document.body.classList.toggle('dock-any-open', open.length > 0);
    document.body.dataset.dockOpen = String(open.length);
  },

  /* A narrower viewport fits fewer panels; drop the excess rather than let
     them slide off the edge. */
  _onResize(){
    while(this.recency.length > this.capacity()) this.close(this.recency[0]);
    this._layout();
  },
};

window.addEventListener('resize', ()=>PluginDock._onResize());
document.addEventListener('keydown', event=>{
  if(event.key !== 'Escape' || !PluginDock.recency.length) return;
  /* Escape closes the most recent panel, unless focus is inside a surface —
     there it belongs to that surface's own dismissables. */
  if(document.activeElement?.tagName === 'IFRAME') return;
  PluginDock.close(PluginDock.recency[PluginDock.recency.length - 1]);
});
