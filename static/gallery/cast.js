/* Phase · Field — Google Cast Web Sender integration for the native player. */
(function(){
  const launcher=document.getElementById('castLauncher');
  const statusEl=document.getElementById('castStatus');
  const localHosts=new Set(['localhost','127.0.0.1','::1']);

  const bridge={
    ready:false,context:null,remotePlayer:null,controller:null,current:null,
    wasConnected:false,lastRemoteTime:0,lastRemotePlaying:false,
    get isActive(){return !!this.remotePlayer?.isConnected;},
    get hasSource(){return !!this.remotePlayer?.isMediaLoaded;},
    get isPlaying(){return this.isActive&&this.hasSource&&!this.remotePlayer.isPaused;},
    get currentTime(){return Number(this.remotePlayer?.currentTime||0);},
    get duration(){return Number(this.remotePlayer?.duration||0);},

    setStatus(message){
      if(statusEl)statusEl.textContent=message||'';
      document.body.classList.toggle('casting',this.isActive);
      launcher?.setAttribute('title',message||'Cast');
    },

    mediaUrl(path){
      const url=new URL(path,window.location.origin);
      if(localHosts.has(url.hostname)){
        throw new Error('Open the HTTPS Funnel URL so the Chromecast can reach this stream');
      }
      return url.href;
    },

    setCurrent(track,streamUrl){
      this.current={track:{...track},streamUrl};
      return this.isActive?this.loadCurrent():Promise.resolve(false);
    },

    async loadCurrent({position,autoplay}={}){
      const session=this.context?.getCurrentSession();
      if(!session||!this.current)return false;
      try{
        const track=this.current.track||{};
        const mediaInfo=new chrome.cast.media.MediaInfo(
          this.mediaUrl(this.current.streamUrl),track.content_type||'audio/mp4'
        );
        mediaInfo.streamType=chrome.cast.media.StreamType.BUFFERED;
        const metadata=new chrome.cast.media.MusicTrackMediaMetadata();
        metadata.title=track.title||'Untitled';
        metadata.songName=metadata.title;
        metadata.artist=track.artist||'';
        metadata.albumArtist=track.artist||'';
        metadata.albumName=track.album||'';
        if(track.release_year)metadata.releaseDate=`${track.release_year}-01-01`;
        if(track.thumbnail){
          try{metadata.images=[new chrome.cast.Image(new URL(track.thumbnail,window.location.origin).href)];}
          catch(_error){/* omit malformed artwork */}
        }
        mediaInfo.metadata=metadata;
        if(track.duration)mediaInfo.duration=Number(track.duration);

        const request=new chrome.cast.media.LoadRequest(mediaInfo);
        request.currentTime=Math.max(0,Number(position??player.media.currentTime??0));
        request.autoplay=autoplay??!player.media.paused;
        this.setStatus(`Sending ${metadata.title}…`);
        await session.loadMedia(request);
        player.media.pause();
        this.setStatus(`Casting ${metadata.title}`);
        return true;
      }catch(error){
        this.setStatus(error?.message||'Could not start casting');
        console.warn('cast load',error);
        return false;
      }
    },

    play(){
      if(this.isActive&&this.hasSource&&this.remotePlayer.isPaused)this.controller.playOrPause();
    },
    pause(){
      if(this.isActive&&this.hasSource&&!this.remotePlayer.isPaused)this.controller.playOrPause();
    },
    seekTo(seconds){
      if(!this.isActive||!this.hasSource||!this.remotePlayer.canSeek)return;
      this.remotePlayer.currentTime=Math.max(0,Number(seconds)||0);this.controller.seek();
    },

    syncRemote(){
      const connected=this.isActive;
      if(connected){
        this.lastRemoteTime=this.currentTime;
        this.lastRemotePlaying=this.isPlaying;
        const device=this.context?.getCurrentSession()?.getCastDevice?.();
        this.setStatus(`Casting to ${device?.friendlyName||'Chromecast'}`);
      }else if(this.wasConnected){
        this.setStatus('Cast disconnected');
        if(player.media.src){
          try{player.media.currentTime=this.lastRemoteTime||0;}catch(_error){/* not seekable yet */}
          if(this.lastRemotePlaying)player.media.play().catch(()=>{});
        }
      }
      this.wasConnected=connected;
    },

    initialize(){
      this.context=cast.framework.CastContext.getInstance();
      this.context.setOptions({
        receiverApplicationId:chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      this.remotePlayer=new cast.framework.RemotePlayer();
      this.controller=new cast.framework.RemotePlayerController(this.remotePlayer);
      this.controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE,()=>this.syncRemote());
      this.context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED,event=>{
        if(event.sessionState===cast.framework.SessionState.SESSION_STARTED){
          this.loadCurrent({position:player.media.currentTime,autoplay:!player.media.paused});
        }else if(event.sessionState===cast.framework.SessionState.SESSION_RESUMED){
          if(!this.remotePlayer.isMediaLoaded)this.loadCurrent();
          this.syncRemote();
        }
      });
      this.ready=true;
      if(launcher)launcher.hidden=false;
      if(typeof player!=='undefined')player.setExternalTransport(this);
      this.setStatus('Cast ready');
    },
  };

  window.castBridge=bridge;
  window.__onGCastApiAvailable=function(isAvailable){
    if(isAvailable)bridge.initialize();
    else bridge.setStatus('Google Cast is unavailable in this browser');
  };
})();
