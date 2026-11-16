/* Сцена, управление и анимация. 3D-модели создаются программно. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const isAR=new URLSearchParams(location.search).get('mode')==='ar';
  document.body.classList.toggle('ar',isAR);
  const fail=message=>{$('fatal').hidden=false;$('fatal').textContent=message;};
  if(!window.AFRAME||!window.Network){fail('Не загрузились файлы проекта. Проверьте, что папка vendor находится рядом с index.html.');return;}
  const T=AFRAME.THREE,N=Network,viewport=$('viewport');
  const palette={pc:0x68adff,switch:0xa58bfa,router:0x70e5c0,server:0xffc778};
  const model=new T.Group(),devices={},cables=[],pickable=[];
  let renderer,camera,scene,marker,arScene,ready=false,tracked=!isAR,fallback=false;
  let running=false,paused=false,elapsed=0,last=0,path=[],segment=-1,completed=false,pickMode='source';
  let yaw=.15,pitch=.85,distance=8.5,down=null,dragged=false;
  const point=id=>new T.Vector3(N.byId[id].pos[0],.24,N.byId[id].pos[2]);
  const material=(color,extras={})=>new T.MeshStandardMaterial({color,roughness:.45,metalness:.2,...extras});
  function box(parent,size,pos,color){const mesh=new T.Mesh(new T.BoxGeometry(...size),material(color));mesh.position.set(...pos);parent.add(mesh);return mesh;}
  function textSprite(text,color='#dceafa',width=1.1){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.font='600 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(9,20,37,0.9)';ctx.fillRect(0,6,512,116);ctx.fillStyle=color;ctx.fillText(text,256,64);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(width,width/4,1);sprite.renderOrder=5;return sprite;
  }
  // Основание и подписи подсетей.
  box(model,[6.6,.07,3.6],[0,-.10,0],0x11253b);
  for(const x of [-1.9,1.9]){const zone=box(model,[2.65,.015,2.9],[x,-.052,0],x<0?0x193751:0x193d3b);zone.material.metalness=0;}
  const grid=new T.GridHelper(6.4,16,0x2c4964,0x20354c);grid.position.y=-.035;model.add(grid);
  for(const [x,label] of [[-1.9,'192.168.1.0/24'],[1.9,'192.168.2.0/24']]){const s=textSprite(label,'#9eb5ce',1.7);s.position.set(x,.05,1.55);model.add(s);}
  for(const node of N.nodes){
    const g=new T.Group();g.position.set(...node.pos);model.add(g);
    const color=palette[node.type];
    if(node.type==='pc'){
      box(g,[.55,.38,.10],[0,.48,0],0x243c58);
      box(g,[.46,.28,.016],[0,.48,.06],color);
      box(g,[.07,.17,.08],[0,.22,0],0x59708b);
      box(g,[.34,.04,.22],[0,.12,.04],0x59708b);
      box(g,[.42,.035,.15],[0,.06,.26],0x354c67);
    }else if(node.type==='server'){
      box(g,[.43,.78,.37],[0,.41,0],0x32435a);
      for(let i=0;i<4;i++){box(g,[.34,.115,.025],[0,.16+i*.16,.20],0x16283e);box(g,[.045,.04,.025],[.11,.16+i*.16,.22],color);}
    }else if(node.type==='switch'){
      box(g,[.68,.21,.40],[0,.16,0],0x42516b);
      for(let i=0;i<6;i++)box(g,[.065,.045,.025],[-.25+i*.10,.17,.215],color);
    }else{
      const body=new T.Mesh(new T.CylinderGeometry(.34,.34,.22,32),material(0x28665d));body.position.y=.18;g.add(body);
      box(g,[.36,.016,.04],[0,.30,0],color);box(g,[.04,.016,.36],[0,.30,0],color);
    }
    const ring=new T.Mesh(new T.TorusGeometry(.43,.018,8,48),material(color,{emissive:color,emissiveIntensity:.2}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.015;g.add(ring);
    const name=textSprite(node.name,`#${new T.Color(color).getHexString()}`,node.type==='switch'?1.25:1.05);
    name.position.set(0,node.type==='server'?.98:.89,0);g.add(name);
    // Прозрачная область делает небольшие модели удобными для нажатия.
    const hit=new T.Mesh(new T.BoxGeometry(.8,.95,.7),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
    hit.position.y=.45;hit.userData.nodeId=node.id;g.add(hit);pickable.push(hit);
    devices[node.id]={group:g,ring};
  }
  function cableBetween(a,b){
    const start=point(a),end=point(b);start.y=end.y=.035;
    const mesh=new T.Mesh(new T.CylinderGeometry(.018,.018,start.distanceTo(end),10),material(0x466782));
    mesh.position.copy(start.clone().add(end).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());
    model.add(mesh);cables.push({a,b,mesh});
  }
  N.links.forEach(([a,b])=>cableBetween(a,b));
  const packet=new T.Group();
  const orb=new T.Mesh(new T.SphereGeometry(.105,20,16),material(0xffd978,{emissive:0xffb520,emissiveIntensity:.8}));packet.add(orb);
  const halo=new T.Mesh(new T.TorusGeometry(.15,.012,8,32),material(0xffe8a3));halo.rotation.x=Math.PI/2;packet.add(halo);
  model.add(packet);packet.visible=false;
  const ambient=new T.AmbientLight(0xffffff,1.7),light=new T.DirectionalLight(0xe9f5ff,2.5);light.position.set(2,7,4);model.add(ambient,light);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();
  function selectAt(event){
    if(!ready||(isAR&&!tracked))return;
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    model.updateWorldMatrix(true,true);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickable,false)[0];if(!hit)return;
    const node=N.byId[hit.object.userData.nodeId];showInfo(node.id);
    if(node.ip&&!running){$(pickMode).value=node.id;reset();}
  }
  function bindCanvas(){
    const canvas=renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!down||isAR)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;
      if(Math.abs(dx)+Math.abs(dy)>3)dragged=true;
      if(dragged){yaw-=dx*.006;pitch=Math.max(.25,Math.min(1.35,pitch+dy*.005));down={x:e.clientX,y:e.clientY};updateCamera();}
    });
    canvas.addEventListener('pointerup',e=>{if(down&&!dragged)selectAt(e);down=null;});
    canvas.addEventListener('pointercancel',()=>{down=null;});
    canvas.addEventListener('wheel',e=>{if(isAR)return;e.preventDefault();distance=Math.max(5.8,Math.min(14,distance+e.deltaY*.006));updateCamera();},{passive:false});
  }
  function updateCamera(){if(isAR||!camera)return;camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(0,0,0);}
  function resize(){if(isAR||!renderer)return;const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();updateCamera();}
  function initDemo(){
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch(e){initFallback();return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
    viewport.appendChild(renderer.domElement);scene=new T.Scene();scene.add(model);camera=new T.PerspectiveCamera(43,1,.1,100);
    resize();new ResizeObserver(resize).observe(viewport);bindCanvas();ready=true;
    renderer.setAnimationLoop(t=>{tick(t);renderer.render(scene,camera);});
  }
  function initAR(){
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){$('camera-message').textContent='Камере нужен HTTPS-адрес или localhost на этом устройстве. Обычный HTTP-адрес компьютера в Wi-Fi не подойдёт.';return;}
    if(!AFRAME.systems.arjs){$('camera-message').textContent='Не загрузилась библиотека AR.js. Проверьте папку vendor.';return;}
    try{const canvas=document.createElement('canvas');if(!canvas.getContext('webgl2'))throw new Error('WebGL2');}catch(e){$('camera-message').textContent='AR требует WebGL 2. Включите аппаратное ускорение браузера или откройте сайт на другом устройстве.';return;}
    $('start-ar').disabled=true;$('camera-message').textContent='Ожидание разрешения камеры…';
    arScene=document.createElement('a-scene');
    arScene.setAttribute('embedded','');arScene.setAttribute('vr-mode-ui','enabled: false');arScene.setAttribute('device-orientation-permission-ui','enabled: false');
    arScene.setAttribute('renderer','alpha: true; antialias: true; precision: medium');
    const calibration=new URL('assets/camera_para.dat',location.href).href;
    arScene.setAttribute('arjs',`sourceType: webcam; debugUIEnabled: false; trackingMethod: best; detectionMode: mono; cameraParametersUrl: ${calibration}; patternRatio: 0.5;`);
    marker=document.createElement('a-marker');marker.setAttribute('type','pattern');marker.setAttribute('url',new URL('assets/hiro.patt',location.href).href);
    marker.setAttribute('emitevents','true');
    const anchor=document.createElement('a-entity');anchor.setAttribute('scale','.38 .38 .38');anchor.object3D.add(model);marker.appendChild(anchor);arScene.appendChild(marker);
    const cam=document.createElement('a-entity');cam.setAttribute('camera','');arScene.appendChild(cam);
    marker.addEventListener('markerFound',()=>{tracked=true;$('tracking').textContent='Маркер найден';$('tracking').classList.add('found');updateStatus();});
    marker.addEventListener('markerLost',()=>{tracked=false;$('tracking').textContent='Наведите на маркер';$('tracking').classList.remove('found');updateStatus();});
    arScene.addEventListener('loaded',()=>{
      renderer=arScene.renderer;camera=arScene.camera;ready=true;bindCanvas();
      arScene.setAttribute('packet-clock','');updateControls();
    });
    // События библиотеки приходят на window и всплывают от сцены.
    window.addEventListener('camera-init',()=>{$('welcome').hidden=true;$('camera-message').textContent='';});
    window.addEventListener('camera-error',event=>{
      const error=event.detail?.error||event.detail;
      $('welcome').hidden=false;$('camera-message').textContent='Не удалось открыть камеру. Разрешите доступ в настройках сайта и перезагрузите страницу. '+(error?.name||'');
      $('start-ar').textContent='Перезагрузить страницу';$('start-ar').disabled=false;$('start-ar').onclick=()=>location.reload();
    });
    viewport.appendChild(arScene);
    setTimeout(()=>{if(!$('welcome').hidden)$('camera-message').textContent='Если камера ещё не открылась, проверьте разрешение в адресной строке. При ошибке перезагрузите страницу.';},12000);
  }
  AFRAME.registerComponent('packet-clock',{tick(time){tick(time);}});
  function showInfo(id){const n=N.byId[id];$('device-name').textContent=n.name;$('device-description').textContent=n.info;}
  // Если браузер не поддерживает WebGL, оставляем доступной плоскую схему.
  // Этот режим не заменяет маркерную дополненную реальность.
  function initFallback(){
    fallback=true;ready=true;
    $('mode-badge').textContent='2D • НЕТ WEBGL';
    $('scene-hint').textContent='Браузер не поддерживает WebGL 2. AR и 3D доступны на совместимом устройстве.';
    $('reset-view').hidden=true;
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 800 560');svg.setAttribute('aria-label','Плоская схема компьютерной сети');svg.style.cssText='width:100%;height:100%';
    const el=(tag,attrs,parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))e.setAttribute(key,value);parent.appendChild(e);return e;};
    const xy=id=>{const p=N.byId[id].pos;return [400+p[0]*122,260+p[2]*120];};
    el('rect',{x:35,y:70,width:275,height:380,rx:24,fill:'#16314a'});el('rect',{x:490,y:70,width:275,height:380,rx:24,fill:'#163b38'});
    for(const [x,text]of [[175,'192.168.1.0/24'],[625,'192.168.2.0/24']]){const label=el('text',{x,y:425,fill:'#9eb5ce','text-anchor':'middle','font-size':16});label.textContent=text;}
    for(const cable of cables){const a=xy(cable.a),b=xy(cable.b);cable.svg=el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#466782','stroke-width':5});}
    for(const n of N.nodes){const [x,y]=xy(n.id);const group=el('g',{role:'button',tabindex:0,'aria-label':n.name,style:'cursor:pointer'});
      const shape=el('rect',{x:x-38,y:y-28,width:76,height:56,rx:n.type==='router'?28:10,fill:'#203750',stroke:'#'+new T.Color(palette[n.type]).getHexString(),'stroke-width':3},group);
      const label=el('text',{x,y:y+5,fill:'#e9f1fb','text-anchor':'middle','font-size':13},group);label.textContent=n.label;
      const name=el('text',{x,y:y-42,fill:'#bcd0e8','text-anchor':'middle','font-size':14},group);name.textContent=n.name;
      const choose=()=>{showInfo(n.id);if(n.ip&&!running){$(pickMode).value=n.id;reset();}};
      group.onclick=choose;group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};devices[n.id].svg=shape;
    }
    packet.svg=el('circle',{r:10,fill:'#ffda78',stroke:'#fff2c2','stroke-width':3,visibility:'hidden'});
    viewport.appendChild(svg);
    function frame(time){tick(time);if(packet.svg){packet.svg.setAttribute('cx',400+packet.position.x*122);packet.svg.setAttribute('cy',260+packet.position.z*120);packet.svg.setAttribute('visibility',packet.visible?'visible':'hidden');}requestAnimationFrame(frame);}
    requestAnimationFrame(frame);paint();
  }
  function paint(){
    const from=$('source').value,to=$('target').value;
    for(const node of N.nodes){const ring=devices[node.id].ring;const selected=node.id===from||node.id===to;
      ring.material.color.set(selected?(node.id===from?0x70e5c0:0xffc778):palette[node.type]);ring.material.emissive.copy(ring.material.color);ring.material.emissiveIntensity=selected?.7:.1;ring.scale.setScalar(selected?1.15:1);
      if(fallback&&devices[node.id].svg){devices[node.id].svg.setAttribute('stroke','#'+ring.material.color.getHexString());devices[node.id].svg.setAttribute('stroke-width',selected?5:2);}
    }
    for(const cable of cables){const index=path.findIndex((id,i)=>i<path.length-1&&((id===cable.a&&path[i+1]===cable.b)||(id===cable.b&&path[i+1]===cable.a)));
      const passed=index>=0&&(completed||index<segment),active=index===segment&&!completed&&packet.visible;
      cable.mesh.material.color.set(passed?0x70e5c0:active?0xffd978:0x466782);cable.mesh.material.emissive.set(active?0x8b631d:passed?0x174338:0x000000);
      if(fallback&&cable.svg)cable.svg.setAttribute('stroke','#'+cable.mesh.material.color.getHexString());
    }
    Array.from($('route').children).forEach((li,i)=>{li.classList.toggle('done',completed||i<segment);li.classList.toggle('current',!completed&&i===Math.max(0,segment));});
  }
  function listRoute(){$('route').replaceChildren(...path.map(id=>{const li=document.createElement('li');li.textContent=N.byId[id].name;return li;}));}
  function reset(){running=false;paused=false;completed=false;elapsed=0;segment=-1;packet.visible=false;path=N.route($('source').value,$('target').value);
    $('progress').value=0;$('step-counter').textContent=`0 / ${Math.max(0,path.length-1)}`;listRoute();updateStatus();updateControls();paint();}
  function updateControls(){
    $('send').disabled=!ready||running||$('source').value===$('target').value||path.length<2;
    $('send').textContent=completed?'Повторить передачу →':'Отправить пакет →';
    $('pause').disabled=!running;$('pause').textContent=paused?'Продолжить':'Пауза';
    for(const id of ['source','target','swap'])$(id).disabled=running;
  }
  function updateStatus(){
    if(running){
      if(paused){$('state').textContent='Пауза';$('explanation').textContent='Передача приостановлена. Нажмите «Продолжить».';return;}
      if(isAR&&!tracked){$('state').textContent='Ожидание маркера';$('explanation').textContent='Наведите камеру на маркер. Передача продолжится с того же места.';return;}
      $('state').textContent='Пакет в пути';
      const a=N.byId[path[Math.max(0,segment)]],b=N.byId[path[Math.max(0,segment)+1]];
      if(b){let detail=b.type==='switch'?'Коммутатор направит кадр к следующему устройству.':b.type==='router'?'Маршрутизатор передаст IP-пакет в другую подсеть.':b.ip?'Доставка на конечное устройство.':'';
        $('explanation').textContent=`${a.name} → ${b.name}. ${detail}`;}
    }else if(completed){$('state').textContent='Пакет доставлен';$('explanation').textContent=`${N.byId[path[0]].ip} → ${N.byId[path[path.length-1]].ip}. Пройдено соединений: ${path.length-1}.`;}
    else if($('source').value===$('target').value){$('state').textContent='Выберите другое устройство';$('explanation').textContent='Отправитель и получатель должны быть разными.';}
    else{$('state').textContent='Готово к отправке';$('explanation').textContent=isAR&&!tracked?'После запуска наведите камеру на маркер.':'Нажмите «Отправить пакет», чтобы начать.';}
  }
  function send(){if(!ready||running||path.length<2)return;completed=false;paused=false;running=true;elapsed=0;segment=0;packet.visible=true;packet.position.copy(point(path[0]));$('progress').value=0;updateStatus();updateControls();paint();}
  function tick(time){
    const dt=last?Math.min((time-last)/1000,.1):0;last=time;
    if(!running||paused||(isAR&&!tracked)||document.hidden)return;
    elapsed+=dt*Number($('speed').value);
    const duration=1.6,total=(path.length-1)*duration;
    if(elapsed>=total){running=false;completed=true;segment=path.length-1;packet.position.copy(point(path[path.length-1]));$('progress').value=1;$('step-counter').textContent=`${path.length-1} / ${path.length-1}`;updateStatus();updateControls();paint();return;}
    const nextSegment=Math.floor(elapsed/duration);
    if(nextSegment!==segment){segment=nextSegment;updateStatus();paint();}
    const fraction=(elapsed%duration)/duration;
    packet.position.lerpVectors(point(path[segment]),point(path[segment+1]),fraction);halo.rotation.z+=dt*2;
    $('progress').value=elapsed/total;$('step-counter').textContent=`${segment+1} / ${path.length-1}`;
  }
  for(const id of ['source','target'])for(const node of N.endpoints){const option=document.createElement('option');option.value=node.id;option.textContent=node.name;$(id).appendChild(option);}
  $('source').value='pc1';$('target').value='server';
  for(const id of ['source','target'])$(id).addEventListener('change',()=>{reset();showInfo($(id).value);});
  $('send').onclick=send;$('pause').onclick=()=>{paused=!paused;updateStatus();updateControls();};$('reset').onclick=reset;
  $('swap').onclick=()=>{const source=$('source').value;$('source').value=$('target').value;$('target').value=source;reset();};
  for(const mode of ['source','target'])$('pick-'+mode).onclick=()=>{pickMode=mode;for(const m of ['source','target']){$('pick-'+m).classList.toggle('active',m===mode);$('pick-'+m).setAttribute('aria-pressed',String(m===mode));}};
  $('speed').oninput=()=>{$('speed-value').textContent=$('speed').value+'×';};
  $('reset-view').onclick=()=>{yaw=.15;pitch=.85;distance=8.5;updateCamera();};
  $('collapse').onclick=()=>{const collapsed=document.querySelector('.panel').classList.toggle('collapsed');$('collapse').textContent=collapsed?'+':'−';$('collapse').setAttribute('aria-expanded',String(!collapsed));};
  if(isAR){$('mode-badge').textContent='AR • КАМЕРА';$('tracking').textContent='Ожидание камеры';$('mode-link').textContent='3D без камеры ↗';$('mode-link').href='index.html';$('welcome').hidden=false;$('scene-hint').textContent='Держите весь маркер в кадре';$('start-ar').onclick=initAR;}
  reset();if(!isAR){initDemo();updateControls();}
})();
