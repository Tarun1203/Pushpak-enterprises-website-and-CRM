/*
 * MakWell ScrollCraft integration.
 *
 * Adapted to the existing static MakWell page architecture: no framework
 * migration, no WebGL and no third-party runtime. The section is injected
 * after the existing brand hero and uses the existing MakWell hero product
 * asset. The engine exposes scroll progress as a normalized value and can be
 * upgraded to a real frame sequence later without changing the page markup.
 */
(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  ready(function(){
    if(document.documentElement.dataset.scMakwell === '1') return;
    if(!document.querySelector('.bhero')) return;
    document.documentElement.dataset.scMakwell = '1';

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia && window.matchMedia('(pointer:fine)').matches;

    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '../assets/scrollcraft-makwell.css';
    document.head.appendChild(css);

    var hero = document.querySelector('.bhero');
    var wrap = document.createElement('section');
    wrap.className = 'sc-mw-wrap';
    wrap.setAttribute('aria-label','MakWell product story');
    wrap.innerHTML = [
      '<div class="sc-mw-stage">',
        '<div class="sc-mw-sticky">',
          '<canvas class="sc-mw-canvas" aria-hidden="true"></canvas>',
          '<div class="sc-mw-vignette" aria-hidden="true"></div>',
          '<div class="sc-mw-copy">',
            '<article class="sc-mw-beat on" data-beat="0">',
              '<span class="sc-mw-kicker">MakWell</span>',
              '<h2>Make it happen.<br>Every day.</h2>',
              '<p>Designed for modern Indian homes with a balance of thoughtful technology, clean design and dependable everyday performance.</p>',
              '<span class="sc-mw-pill">Everyday technology</span>',
            '</article>',
            '<article class="sc-mw-beat right" data-beat="1">',
              '<span class="sc-mw-kicker">Experience</span>',
              '<h2>Made to feel<br>effortless.</h2>',
              '<p>Bring the product closer as you scroll. The visual story moves with you instead of waiting for the next section.</p>',
              '<span class="sc-mw-pill">Clean. Connected. Considered.</span>',
            '</article>',
            '<article class="sc-mw-beat" data-beat="2">',
              '<span class="sc-mw-kicker">Confidence</span>',
              '<h2>Built to<br>be backed.</h2>',
              '<p>Every MakWell product is part of a warranty and service ecosystem backed by Pushpak Enterprises.</p>',
              '<span class="sc-mw-pill">Warranty + service network</span>',
            '</article>',
            '<article class="sc-mw-beat right" data-beat="3">',
              '<span class="sc-mw-kicker">The promise</span>',
              '<h2>Make it<br>happen.</h2>',
              '<p>Finish on the brand. Then continue naturally into the MakWell range below.</p>',
              '<span class="sc-mw-pill">Explore the MakWell range ↓</span>',
            '</article>',
          '</div>',
          '<div class="sc-mw-progress" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i></div>',
          '<div class="sc-mw-end" aria-hidden="true">Scroll to explore<span></span></div>',
        '</div>',
      '</div>'
    ].join('');

    hero.parentNode.insertBefore(wrap, hero.nextSibling);

    var canvas = wrap.querySelector('.sc-mw-canvas');
    var ctx = canvas.getContext('2d', {alpha:false});
    var img = new Image();
    img.decoding = 'async';
    img.src = '../assets/products/hero-tv-makwell.webp';
    var logo = new Image();
    logo.decoding = 'async';
    logo.src = '../assets/logos/makwell-logo.jpeg';

    var stage = wrap.querySelector('.sc-mw-stage');
    var sticky = wrap.querySelector('.sc-mw-sticky');
    var beats = Array.prototype.slice.call(wrap.querySelectorAll('.sc-mw-beat'));
    var dots = Array.prototype.slice.call(wrap.querySelectorAll('.sc-mw-progress i'));
    var end = wrap.querySelector('.sc-mw-end');
    var raf = 0, lastP = -1, width = 0, height = 0;

    function resize(){
      var rect = sticky.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width*dpr);
      canvas.height = Math.round(height*dpr);
      canvas.style.width = width+'px';
      canvas.style.height = height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      draw(lastP < 0 ? 0 : lastP);
    }

    function progress(){
      var r = stage.getBoundingClientRect();
      var travel = Math.max(1, stage.offsetHeight - sticky.offsetHeight);
      return Math.max(0, Math.min(1, -r.top / travel));
    }

    function draw(p){
      if(!ctx || !width || !height) return;
      lastP = p;
      ctx.clearRect(0,0,width,height);

      var bg = ctx.createRadialGradient(width*.5,height*.46,20,width*.5,height*.46,Math.max(width,height)*.72);
      bg.addColorStop(0,'#4b1d61');
      bg.addColorStop(.38,'#1d0d2b');
      bg.addColorStop(1,'#06040a');
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,width,height);

      var glow = ctx.createRadialGradient(width*.5,height*.48,0,width*.5,height*.48,width*.38);
      glow.addColorStop(0,'rgba(176,75,188,.30)');
      glow.addColorStop(1,'rgba(176,75,188,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0,0,width,height);

      if(img.complete && img.naturalWidth){
        var iw=img.naturalWidth, ih=img.naturalHeight;
        var base=Math.min(width/(iw*.72),height/(ih*.72));
        var scale=base*(.86 + p*.24);
        var dw=iw*scale, dh=ih*scale;
        var x=width*.50-dw*.5 + Math.sin(p*Math.PI)*width*.035;
        var y=height*.54-dh*.5 - p*height*.015;
        ctx.save();
        ctx.globalAlpha=.97;
        ctx.drawImage(img,x,y,dw,dh);
        ctx.restore();
      }

      // Subtle scroll-scrubbed light sweep, kept behind the copy.
      var sweepX = -width*.3 + p*width*1.6;
      var sweep = ctx.createLinearGradient(sweepX,0,sweepX+width*.24,0);
      sweep.addColorStop(0,'rgba(255,255,255,0)');
      sweep.addColorStop(.5,'rgba(219,174,255,.08)');
      sweep.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sweep;
      ctx.fillRect(0,0,width,height);

      // Final brand beat: reveal the supplied MakWell logo without recreating it.
      if(p>.82 && logo.complete && logo.naturalWidth){
        var lp=(p-.82)/.18;
        var lw=Math.min(width*.38,320), lh=lw*(logo.naturalHeight/logo.naturalWidth);
        ctx.save();
        ctx.globalAlpha=Math.min(1,lp*1.8)*.92;
        ctx.globalCompositeOperation='screen';
        ctx.drawImage(logo,width*.5-lw*.5,height*.5-lh*.5,lw,lh);
        ctx.restore();
      }
    }

    function update(){
      raf=0;
      var p=progress();
      if(Math.abs(p-lastP)<.0008) return;
      draw(p);
      var idx=Math.min(3,Math.floor(p*4));
      beats.forEach(function(b,i){ b.classList.toggle('on',i===idx); });
      dots.forEach(function(d,i){ d.classList.toggle('on',i===idx); });
      end.style.opacity = String(Math.max(0,1-p*7));
    }

    function request(){ if(!raf) raf=requestAnimationFrame(update); }

    window.addEventListener('scroll',request,{passive:true});
    window.addEventListener('resize',function(){ resize(); request(); },{passive:true});

    if(finePointer && !reduce){
      sticky.addEventListener('pointermove',function(e){
        var r=sticky.getBoundingClientRect();
        var nx=(e.clientX-r.left)/Math.max(1,r.width)-.5;
        var ny=(e.clientY-r.top)/Math.max(1,r.height)-.5;
        canvas.style.transform='translate3d('+(-nx*8)+'px,'+(-ny*6)+'px,0) scale(1.01)';
      },{passive:true});
      sticky.addEventListener('pointerleave',function(){ canvas.style.transform=''; },{passive:true});
    }

    img.addEventListener('load',function(){ resize(); request(); },{once:true});
    logo.addEventListener('load',function(){ request(); },{once:true});
    resize();

    if(reduce){
      stage.style.height='100svh';
      beats.forEach(function(b,i){ b.classList.toggle('on',i===0); });
      dots.forEach(function(d,i){ d.classList.toggle('on',i===0); });
      draw(0);
    }
  });
})();
