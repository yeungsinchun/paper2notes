(function (global) {
  "use strict";

  var THREE = global.THREE;
  var scenes = {};

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    var u = clamp01(t);
    return u * u * (3 - 2 * u);
  }

  function ball(radius, hex) {
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.45,
        metalness: 0.08,
        transparent: true,
        opacity: 1
      })
    );
    return mesh;
  }

  function ring(radius, hex) {
    var mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.035, 10, 64),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, transparent: true, opacity: 0.85 })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  function stage(canvas, fit) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfffaf1);
    var camera = new THREE.OrthographicCamera(-7.2, 7.2, 3.6, -3.6, 0.1, 40);
    camera.position.set(0.4, 1.6, 12);
    camera.lookAt(0, 0, 0);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var key = new THREE.DirectionalLight(0xfff4e0, 0.9);
    key.position.set(-4, 6, 8);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x9bb6c4, 0.35);
    fill.position.set(6, -2, 4);
    scene.add(fill);
    var contentHalfH = (fit && fit.halfH != null) ? fit.halfH : 3.6;
    var contentHalfW = (fit && fit.halfW != null) ? fit.halfW : null;
    function resize() {
      var w = canvas.clientWidth || canvas.width;
      var h = canvas.clientHeight || canvas.height;
      renderer.setSize(w, h, false);
      var aspect = w / Math.max(h, 1);
      var halfH;
      var halfW;
      if (contentHalfW != null) {
        var boxAspect = contentHalfW / Math.max(contentHalfH, 0.01);
        if (aspect >= boxAspect) {
          halfH = contentHalfH;
          halfW = halfH * aspect;
        } else {
          halfW = contentHalfW;
          halfH = halfW / aspect;
        }
      } else {
        halfH = contentHalfH;
        halfW = halfH * aspect;
      }
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);
    return { scene: scene, camera: camera, renderer: renderer, resize: resize };
  }

  function placeHud(el, canvas, camera, world) {
    if (!el) return;
    var v = world.clone().project(camera);
    var x = (v.x * 0.5 + 0.5) * canvas.clientWidth;
    var y = (-v.y * 0.5 + 0.5) * canvas.clientHeight;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function hostReplay(host, restart) {
    host.addEventListener("notes-replay", restart);
    if (host.hasAttribute("data-autoplay") || host.classList.contains("play")) {
      restart();
    }
  }

  function metal(hex, extra) {
    extra = extra || {};
    return new THREE.MeshStandardMaterial({
      color: hex,
      metalness: extra.metalness != null ? extra.metalness : 0.78,
      roughness: extra.roughness != null ? extra.roughness : 0.26
    });
  }

  function signDecal(sign, hex) {
    var c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = hex;
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sign, 32, 36);
    var tex = new THREE.CanvasTexture(c);
    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    return mesh;
  }

  function fit2d(canvas) {
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(320, Math.floor(rect.width || canvas.width || 640));
    var h = Math.max(200, Math.floor(rect.height || canvas.height || 280));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: w, h: h, ctx: canvas.getContext("2d") };
  }

  function knockout2d(host) {
    var canvas = host.querySelector("canvas");
    var hudAtom = host.querySelector('[data-hud="atom"]');
    var hudElectron = host.querySelector('[data-hud="electron"]');
    var SHELL_R = 52;
    var HIT_T = 0.85;
    var FLY_T = 1.15;
    var state = { x: 0, y: 0, nx: 0, ny: 0, opacity: 1, hex: "#e0a04a", label: "atom" };
    var t0 = performance.now();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function layout() {
      var box = fit2d(canvas);
      return {
        ctx: box.ctx,
        w: box.w,
        h: box.h,
        nx: box.w * 0.38,
        ny: box.h * 0.48,
        startX: box.w * 0.38 - SHELL_R,
        startY: box.h * 0.48,
        endX: box.w * 0.78,
        endY: box.h * 0.78
      };
    }

    function apply(t) {
      var L = layout();
      var fly = smoothstep((t - HIT_T) / FLY_T);
      var hit = clamp01(t / HIT_T);
      state.nx = L.nx;
      state.ny = L.ny;
      state.x = lerp(L.startX, L.endX, fly);
      state.y = lerp(L.startY, L.endY, fly);
      state.opacity = 1;
      var ionized = fly > 0.02;
      state.hex = ionized ? "#c0392b" : "#e0a04a";
      state.label = ionized ? "positive ion" : "atom";
      if (hudAtom) hudAtom.textContent = state.label;
      if (hudElectron) hudElectron.textContent = "electron";
      if (hudAtom) {
        hudAtom.style.left = L.nx + "px";
        hudAtom.style.top = L.ny + 72 + "px";
      }
      if (hudElectron) {
        hudElectron.style.left = state.x + "px";
        hudElectron.style.top = state.y + 22 + "px";
      }
      var ctx = L.ctx;
      ctx.clearRect(0, 0, L.w, L.h);
      ctx.fillStyle = "#fffaf1";
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(24, L.ny);
      ctx.lineTo(lerp(24, L.startX - 10, smoothstep(hit)), L.ny);
      ctx.stroke();
      ctx.strokeStyle = "#9bb6c4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(L.nx, L.ny, SHELL_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = state.hex;
      ctx.beginPath();
      ctx.arc(L.nx, L.ny, 18, 0, Math.PI * 2);
      ctx.fill();
      if (ionized) {
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+", L.nx, L.ny + 6);
      }
      ctx.globalAlpha = state.opacity;
      ctx.fillStyle = "#2a62a8";
      ctx.beginPath();
      ctx.arc(state.x, state.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText("−", state.x, state.y + 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1c2430";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ionizing radiation", 24, 28);
    }

    function snapshot() {
      return {
        electronOpacity: state.opacity,
        distToNucleus: Math.hypot(state.x - state.nx, state.y - state.ny),
        shellRadius: SHELL_R,
        nucleusHex: state.hex,
        atomLabel: state.label,
        electronLabel: "electron"
      };
    }

    function restart() {
      t0 = performance.now();
      apply(0);
    }

    function frame(now) {
      apply(reduced ? HIT_T + FLY_T : (now - t0) / 1000);
      requestAnimationFrame(frame);
    }

    hostReplay(host, restart);
    apply(0);
    requestAnimationFrame(frame);
    scenes.knockout = { snapshot: snapshot, replay: restart };
  }

  function ionpair2d(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var hudA = host.querySelector('[data-hud="a"]');
    var hudB = host.querySelector('[data-hud="b"]');
    var gfx = stage(canvas, { halfW: 4.2, halfH: 2.3 });
    gfx.camera.position.set(0.2, 0.4, 12);
    gfx.camera.lookAt(0, 0, 0);
    var SHELL_R = 0.62;
    var HIT_T = 0.7;
    var FLY_T = 1.05;
    var aPos = new THREE.Vector3(-1.7, 0.45, 0);
    var bPos = new THREE.Vector3(1.65, -0.35, 0);
    var start = aPos.clone().add(new THREE.Vector3(-SHELL_R, 0, 0));
    var end = bPos.clone().add(new THREE.Vector3(-SHELL_R, 0, 0));

    function atomGroup(hex) {
      var g = new THREE.Group();
      var core = ball(0.22, hex);
      var shell = ring(SHELL_R, 0x9bb6c4);
      g.add(core, shell);
      g.userData.core = core;
      return g;
    }
    var atomA = atomGroup(0xe0a04a);
    var atomB = atomGroup(0xe0a04a);
    atomA.position.copy(aPos);
    atomB.position.copy(bPos);
    var electron = ball(0.11, 0x2a62a8);
    var ray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0xc9a227 })
    );
    ray.rotation.z = Math.PI / 2;
    gfx.scene.add(atomA, atomB, electron, ray);
    var plusMark = signDecal("+", "#ffffff");
    plusMark.visible = false;
    atomA.add(plusMark);
    plusMark.position.set(0, 0, 0.24);
    var minusMark = signDecal("−", "#ffffff");
    minusMark.visible = false;
    atomB.add(minusMark);
    minusMark.position.set(0, 0, 0.24);

    var state = {
      x: start.x, y: start.y, ax: aPos.x, ay: aPos.y, bx: bPos.x, by: bPos.y,
      opacity: 1, plusHex: "#e0a04a", minusHex: "#e0a04a",
      labelA: "atom", labelB: "atom"
    };
    var t0 = performance.now();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function apply(t) {
      var fly = smoothstep((t - HIT_T) / FLY_T);
      var hit = smoothstep(t / HIT_T);
      electron.position.lerpVectors(start, end, fly);
      state.x = electron.position.x;
      state.y = electron.position.y;
      var plus = fly > 0.02;
      var minus = fly > 0.92;
      state.plusHex = plus ? "#c0392b" : "#e0a04a";
      state.minusHex = minus ? "#2a62a8" : "#e0a04a";
      state.labelA = plus ? "+ ion" : "atom";
      state.labelB = minus ? "− ion" : "atom";
      atomA.userData.core.material.color.set(state.plusHex);
      atomB.userData.core.material.color.set(state.minusHex);
      plusMark.visible = plus;
      minusMark.visible = minus;
      var rayLen = lerp(0.2, start.x + 4.6, hit);
      ray.scale.set(1, Math.max(rayLen, 0.05), 1);
      ray.position.set(-4.6 + rayLen / 2, aPos.y, 0);
      if (hudA) {
        hudA.textContent = state.labelA;
        placeHud(hudA, canvas, gfx.camera, aPos.clone().add(new THREE.Vector3(0, -0.95, 0)));
      }
      if (hudB) {
        hudB.textContent = state.labelB;
        placeHud(hudB, canvas, gfx.camera, bPos.clone().add(new THREE.Vector3(0, -0.95, 0)));
      }
    }

    function snapshot() {
      return {
        electronOpacity: state.opacity,
        distToA: Math.hypot(state.x - state.ax, state.y - state.ay),
        distToB: Math.hypot(state.x - state.bx, state.y - state.by),
        shellRadius: SHELL_R,
        plusHex: state.plusHex,
        minusHex: state.minusHex,
        labelA: state.labelA,
        labelB: state.labelB
      };
    }

    function restart() {
      t0 = performance.now();
      apply(0);
    }
    function frame(now) {
      apply(reduced ? HIT_T + FLY_T : (now - t0) / 1000);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    apply(0);
    requestAnimationFrame(frame);
    scenes.ionpair = { snapshot: snapshot, replay: restart };
  }

  function beams(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.6, halfH: 2.35 });
    gfx.camera.position.set(0, 0.15, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudWave = host.querySelector('[data-hud="wave"]');
    var hudElectrons = host.querySelector('[data-hud="electrons"]');
    var waveAnchor = new THREE.Vector3(-2.7, 1.2, 0);
    var eAnchor = new THREE.Vector3(2.55, 1.2, 0);
    var goldMat = new THREE.LineBasicMaterial({ color: 0xd4a017 });
    var WAVE_N = 80;
    var WAVE_X0 = -5.25;
    var WAVE_X1 = -0.35;
    var PACKET_SIGMA = 0.38;
    var PACKET_K = 9.5;
    var PACKET_C = 2.8;
    var wavePositions = new Float32Array((WAVE_N + 1) * 3);
    var waveGeom = new THREE.BufferGeometry();
    waveGeom.setAttribute("position", new THREE.BufferAttribute(wavePositions, 3));
    var waveMesh = new THREE.Line(waveGeom, goldMat);
    gfx.scene.add(waveMesh);
    function rebuildWave(t) {
      var travel = WAVE_X1 - WAVE_X0 + 6 * PACKET_SIGMA;
      var center = WAVE_X0 - 2.5 * PACKET_SIGMA + ((t * PACKET_C) % travel);
      var peakX = center;
      var peakA = 0;
      var i;
      for (i = 0; i <= WAVE_N; i += 1) {
        var x = WAVE_X0 + (i / WAVE_N) * (WAVE_X1 - WAVE_X0);
        var dx = x - center;
        var env = Math.exp(-(dx * dx) / (2 * PACKET_SIGMA * PACKET_SIGMA));
        var y = 0.62 * env * Math.sin(PACKET_K * x - PACKET_K * PACKET_C * t);
        wavePositions[i * 3] = x;
        wavePositions[i * 3 + 1] = y;
        wavePositions[i * 3 + 2] = 0;
        var a = Math.abs(y);
        if (a > peakA) {
          peakA = a;
          peakX = x;
        }
      }
      waveAnchor.set(peakX, 0.92, 0);
      waveGeom.attributes.position.needsUpdate = true;
      waveGeom.computeBoundingSphere();
    }
    var electrons = [];
    var i;
    for (i = 0; i < 8; i += 1) {
      var e = ball(0.12, 0x2a62a8);
      electrons.push(e);
      gfx.scene.add(e);
    }
    var divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 3.6, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xd7d0c2 })
    );
    divider.position.x = 0.15;
    gfx.scene.add(divider);
    var t0 = performance.now();
    function restart() { t0 = performance.now(); }
    function frame(now) {
      var t = (now - t0) / 1000;
      rebuildWave(t);
      electrons.forEach(function (mesh, idx) {
        var u = (t * 0.58 + idx * 0.125) % 1;
        mesh.position.set(lerp(0.55, 5.15, u), 0, 0);
      });
      placeHud(hudWave, canvas, gfx.camera, waveAnchor);
      placeHud(hudElectrons, canvas, gfx.camera, eAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      var minX = Infinity;
      var maxX = -Infinity;
      var sumX = 0;
      var wsum = 0;
      var peakA = 0;
      var peakX = 0;
      var i;
      for (i = 0; i <= WAVE_N; i += 1) {
        var x = wavePositions[i * 3];
        var y = Math.abs(wavePositions[i * 3 + 1]);
        if (y > peakA) {
          peakA = y;
          peakX = x;
        }
        if (y > 0.08) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          sumX += x * y;
          wsum += y;
        }
      }
      var v = waveAnchor.clone().project(gfx.camera);
      return {
        peakA: peakA,
        peakX: peakX,
        centroidX: wsum ? sumX / wsum : 0,
        span: maxX > minX ? maxX - minX : 0,
        track: WAVE_X1 - WAVE_X0,
        waveHud: hudWave ? parseFloat(hudWave.style.left) : null,
        waveProj: (v.x * 0.5 + 0.5) * (canvas.clientWidth || 1)
      };
    }
    hostReplay(host, restart);
    rebuildWave(0);
    requestAnimationFrame(frame);
    scenes.beams = { replay: restart, snapshot: snapshot };
  }

  function atom(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 2.6, halfH: 2.6 });
    gfx.camera.position.set(2.2, 2.4, 10);
    gfx.camera.lookAt(0, 0, 0);
    var nucleus = new THREE.Group();
    [[-0.16, 0.08, 0, 0xc0392b], [0.16, 0.08, 0, 0x2f7a4a], [-0.08, -0.14, 0.1, 0x2f7a4a], [0.1, -0.12, -0.1, 0xc0392b]].forEach(function (p) {
      var n = ball(0.14, p[3]);
      n.position.set(p[0], p[1], p[2]);
      nucleus.add(n);
    });
    var e1 = ball(0.11, 0x2a62a8);
    var e2 = ball(0.11, 0x2a62a8);
    var e3 = ball(0.11, 0x2a62a8);
    var inner = ring(1.15, 0x9bb6c4);
    var outer = ring(2.05, 0x9bb6c4);
    outer.rotation.y = 0.5;
    gfx.scene.add(nucleus, inner, outer, e1, e2, e3);
    var slider = document.getElementById("atom-zoom-slider");
    var hudAtom = host.querySelector('[data-hud="atom-scale"]');
    var hudNucleus = host.querySelector('[data-hud="nucleus-scale"]');
    var atomAnchor = new THREE.Vector3(-1.55, 2.15, 0);
    var nucleusAnchor = new THREE.Vector3(0.16, 0.08, 0);
    var angle = 0;
    function frame() {
      angle += 0.01;
      e1.position.set(Math.cos(angle) * 1.15, Math.sin(angle) * 1.15, 0);
      e2.position.set(Math.cos(angle + 2.1) * 2.05, 0.2, Math.sin(angle + 2.1) * 2.05);
      e3.position.set(Math.cos(-angle + 4) * 2.05, -0.15, Math.sin(-angle + 4) * 2.05);
      var z = slider ? Number(slider.value) : 1;
      gfx.camera.zoom = Math.max(z, 0.01);
      gfx.camera.updateProjectionMatrix();
      placeHud(hudAtom, canvas, gfx.camera, atomAnchor);
      placeHud(hudNucleus, canvas, gfx.camera, nucleusAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      var origin = new THREE.Vector3(0, 0, 0).project(gfx.camera);
      var rim = new THREE.Vector3(0.14, 0, 0).project(gfx.camera);
      var nuc = nucleusAnchor.clone().project(gfx.camera);
      var w = canvas.clientWidth || 1;
      var h = canvas.clientHeight || 1;
      return {
        zoom: gfx.camera.zoom,
        nucleusPx: Math.abs(rim.x - origin.x) * 0.5 * w,
        nucleusHud: hudNucleus ? parseFloat(hudNucleus.style.left) : null,
        nucleusHudTop: hudNucleus ? parseFloat(hudNucleus.style.top) : null,
        nucleusProjX: (nuc.x * 0.5 + 0.5) * w,
        nucleusNdcY: nuc.y,
        canvasH: h
      };
    }
    requestAnimationFrame(frame);
    scenes.atom = { snapshot: snapshot };
  }

  function tube(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 4.6, halfH: 2.55 });
    gfx.camera.position.set(0, 0.2, 12);
    gfx.camera.lookAt(0, 0.05, 0);
    var hudGun = host.querySelector('[data-hud="gun"]');
    var hudElectrons = host.querySelector('[data-hud="electrons"]');
    var hudTarget = host.querySelector('[data-hud="target"]');
    var hudXrays = host.querySelector('[data-hud="xrays"]');
    var gunAnchor = new THREE.Vector3(-2.85, 0.58, 0);
    var electronAnchor = new THREE.Vector3(-1.05, 0.48, 0);
    var targetAnchor = new THREE.Vector3(0.35, 1.05, 0);
    var xrayAnchor = new THREE.Vector3(0, 1, 0);

    var glassMat = new THREE.MeshStandardMaterial({
      color: 0xd5e3ea,
      transparent: true,
      opacity: 0.11,
      roughness: 0.18,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(1.55, 36, 24), glassMat);
    var leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.4, 24), glassMat);
    leftArm.rotation.z = Math.PI / 2;
    leftArm.position.x = -2.55;
    var rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 24), glassMat);
    rightArm.rotation.z = Math.PI / 2;
    rightArm.position.x = 2.65;
    var capL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.22, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a5560, metalness: 0.4, roughness: 0.4 })
    );
    capL.rotation.z = Math.PI / 2;
    capL.position.x = -3.75;
    var capR = capL.clone();
    capR.position.x = 3.95;

    var gun = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.35 })
    );
    gun.rotation.z = Math.PI / 2;
    gun.position.set(-2.85, 0, 0);
    var filament = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.025, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xf4c542, emissive: 0xbb8800, emissiveIntensity: 0.8 })
    );
    filament.position.set(-2.45, 0, 0);

    var target = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.2, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.65, roughness: 0.28 })
    );
    target.rotation.z = -Math.PI / 4;
    target.position.set(0.82, 0.02, 0);
    var stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.15, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b7380, metalness: 0.55, roughness: 0.3 })
    );
    stem.rotation.z = Math.PI / 2;
    stem.position.set(2.05, -0.04, 0);

    gfx.scene.add(bulb, leftArm, rightArm, capL, capR, gun, filament, target, stem);
    var equator = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.02, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x8aa3ad, transparent: true, opacity: 0.4 })
    );
    gfx.scene.add(equator);
    target.updateMatrixWorld(true);
    var hit = new THREE.Vector3(-0.14, 0, 0).applyMatrix4(target.matrixWorld);
    var face = new THREE.Vector3(-1, 0, 0).transformDirection(target.matrixWorld).normalize();
    var targetTop = new THREE.Vector3(0.04, 0.68, 0).applyMatrix4(target.matrixWorld);
    targetAnchor.copy(targetTop);
    xrayAnchor.copy(hit).addScaledVector(face, 0.42).add(new THREE.Vector3(0, 0.32, 0));
    electronAnchor.set((filament.position.x + hit.x) / 2, 0.48, 0);
    gunAnchor.set(gun.position.x, 0.55, 0);

    var insert = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 22),
      new THREE.MeshStandardMaterial({
        color: 0xc4b49a,
        metalness: 0.75,
        roughness: 0.22,
        side: THREE.DoubleSide
      })
    );
    insert.position.copy(hit);
    insert.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face);
    insert.scale.setScalar(0.55);
    gfx.scene.add(insert);
    var spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xf6e08a,
        transparent: true,
        opacity: 0.95
      })
    );
    spark.position.copy(hit);
    spark.scale.setScalar(1.15);
    gfx.scene.add(spark);

    var electrons = [];
    var i;
    for (i = 0; i < 12; i += 1) {
      var e = ball(0.08, 0x2a62a8);
      electrons.push({ mesh: e, delay: i * 0.08 });
      gfx.scene.add(e);
    }
    function makeWavyRay(from, dir, length) {
      var nrm = dir.clone().normalize();
      var side = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0, 0, 1));
      if (side.lengthSq() < 1e-6) side.set(0, 1, 0);
      side.normalize();
      var pts = [];
      var k;
      for (k = 0; k <= 24; k += 1) {
        var t = k / 24;
        var p = from.clone().addScaledVector(nrm, t * length);
        p.addScaledVector(side, 0.055 * Math.sin(t * Math.PI * 5));
        pts.push(p);
      }
      return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.045, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0xd4a017,
          transparent: true,
          opacity: 0.95
        })
      );
    }
    var xrays = [];
    var zAxis = new THREE.Vector3(0, 0, 1);
    var spreads = [0, 0.17, -0.17, 0.08];
    var rayLen = 0.95;
    var goldMat = new THREE.MeshBasicMaterial({
      color: 0xd4a017,
      transparent: true,
      opacity: 0.95
    });
    for (i = 0; i < spreads.length; i += 1) {
      var dir = face.clone().applyAxisAngle(zAxis, spreads[i]);
      var ray = makeWavyRay(hit, dir, rayLen);
      xrays.push(ray);
      gfx.scene.add(ray);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), goldMat.clone());
      tip.position.copy(hit).addScaledVector(dir, rayLen);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      gfx.scene.add(tip);
      xrays.push(tip);
    }

    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      filament.material.emissiveIntensity = 0.55 + 0.35 * Math.abs(Math.sin(t * 8));
      electrons.forEach(function (item) {
        var u = (t * 0.7 + item.delay) % 1;
        item.mesh.position.set(lerp(filament.position.x + 0.12, hit.x, u), lerp(0, hit.y, u), 0);
        item.mesh.material.opacity = 1;
        item.mesh.visible = u < 0.9;
      });
      spark.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 6));
      spark.scale.setScalar(0.9 + 0.2 * Math.abs(Math.sin(t * 6)));
      xrays.forEach(function (ray, idx) {
        ray.material.opacity = 0.35 + 0.55 * Math.abs(Math.sin(t * 3.2 + idx));
      });
      placeHud(hudGun, canvas, gfx.camera, gunAnchor);
      placeHud(hudElectrons, canvas, gfx.camera, electronAnchor);
      placeHud(hudTarget, canvas, gfx.camera, targetAnchor);
      placeHud(hudXrays, canvas, gfx.camera, xrayAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function projectX(world) {
      var v = world.clone().project(gfx.camera);
      return (v.x * 0.5 + 0.5) * (canvas.clientWidth || 1);
    }
    function snapshot() {
      var leave = xrayAnchor.clone().sub(hit);
      return {
        gunHud: hudGun ? parseFloat(hudGun.style.left) : null,
        gunProj: projectX(gunAnchor),
        electronsHud: hudElectrons ? parseFloat(hudElectrons.style.left) : null,
        electronsProj: projectX(electronAnchor),
        targetHud: hudTarget ? parseFloat(hudTarget.style.left) : null,
        targetProj: projectX(targetAnchor),
        xraysHud: hudXrays ? parseFloat(hudXrays.style.left) : null,
        xraysProj: projectX(xrayAnchor),
        faceNx: face.x,
        faceNy: face.y,
        hitX: hit.x,
        hitY: hit.y,
        rayDot: leave.lengthSq() ? face.dot(leave.normalize()) : 0
      };
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.tube = { replay: restart, snapshot: snapshot };
  }

  function nucleonCluster(protons, neutrons, spacing) {
    var group = new THREE.Group();
    var colors = [];
    var i;
    for (i = 0; i < protons; i += 1) colors.push(0xc0392b);
    for (i = 0; i < neutrons; i += 1) colors.push(0x2f7a4a);
    colors.forEach(function (hex, idx) {
      var q = (idx % 3) - 1;
      var r = Math.floor(idx / 3) - 1;
      var n = ball(0.16, hex);
      n.position.set(q * spacing, r * spacing * 0.86, ((idx * 17) % 5 - 2) * 0.08);
      group.add(n);
    });
    return group;
  }

  function decayHud(host, canvas, camera) {
    var parentHud = host.querySelector('[data-hud="parent"]');
    var ejectileHud = host.querySelector('[data-hud="ejectile"]');
    function projectXY(world) {
      var v = world.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * (canvas.clientWidth || 1),
        y: (-v.y * 0.5 + 0.5) * (canvas.clientHeight || 1)
      };
    }
    return {
      place: function (parentWorld, ejectileWorld) {
        placeHud(parentHud, canvas, camera, parentWorld);
        placeHud(ejectileHud, canvas, camera, ejectileWorld);
      },
      snapshot: function (parentWorld, ejectileWorld) {
        var p = projectXY(parentWorld);
        var e = projectXY(ejectileWorld);
        return {
          parentHud: parentHud ? parseFloat(parentHud.style.left) : null,
          ejectileHud: ejectileHud ? parseFloat(ejectileHud.style.left) : null,
          parentHudTop: parentHud ? parseFloat(parentHud.style.top) : null,
          ejectileHudTop: ejectileHud ? parseFloat(ejectileHud.style.top) : null,
          parentProj: p.x,
          ejectileProj: e.x,
          parentProjY: p.y,
          ejectileProjY: e.y
        };
      }
    };
  }

  function decayAlpha(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas);
    var parent = nucleonCluster(6, 6, 0.34);
    parent.position.set(-2.4, 0.1, 0);
    var alpha = nucleonCluster(2, 2, 0.32);
    var alphaHome = new THREE.Vector3(-2.4, 0.15, 0.2);
    var alphaAway = new THREE.Vector3(2.6, 0.9, 0);
    alpha.position.copy(alphaHome);
    gfx.scene.add(parent, alpha);
    var hud = decayHud(host, canvas, gfx.camera);
    var parentAnchor = parent.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    var t0 = performance.now();
    function ejectileAnchor() {
      return alpha.position.clone().add(new THREE.Vector3(0.45, 0.45, 0));
    }
    function restart() {
      t0 = performance.now();
      gfx.resize();
    }
    function frame(now) {
      var fly = smoothstep(((now - t0) / 1000 - 0.15) / 1.05);
      alpha.position.lerpVectors(alphaHome, alphaAway, fly);
      alpha.children.forEach(function (ch) {
        ch.material.opacity = 1;
      });
      hud.place(parentAnchor, ejectileAnchor());
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-a"] = {
      replay: restart,
      snapshot: function () {
        return hud.snapshot(parentAnchor, ejectileAnchor());
      }
    };
  }

  function decayBeta(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas);
    var parent = nucleonCluster(5, 6, 0.34);
    parent.position.set(-2.4, 0.1, 0);
    var electron = ball(0.18, 0x2a62a8);
    var home = new THREE.Vector3(-2.4, 0.1, 0);
    var away = new THREE.Vector3(3.1, 0.35, 0);
    electron.position.copy(home);
    gfx.scene.add(parent, electron);
    var hud = decayHud(host, canvas, gfx.camera);
    var parentAnchor = parent.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    var t0 = performance.now();
    function ejectileAnchor() {
      return electron.position.clone().add(new THREE.Vector3(0.45, 0.45, 0));
    }
    function restart() {
      t0 = performance.now();
      gfx.resize();
    }
    function frame(now) {
      var fly = smoothstep(((now - t0) / 1000 - 0.12) / 0.95);
      electron.material.opacity = 1;
      electron.position.lerpVectors(home, away, fly);
      hud.place(parentAnchor, ejectileAnchor());
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-b"] = {
      replay: restart,
      snapshot: function () {
        return hud.snapshot(parentAnchor, ejectileAnchor());
      }
    };
  }

  function decayGamma(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas);
    var parent = nucleonCluster(5, 6, 0.34);
    parent.position.set(-2.4, 0.1, 0);
    var wave = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.05, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, transparent: true, opacity: 0.9 })
    );
    gfx.scene.add(parent, wave);
    var hud = decayHud(host, canvas, gfx.camera);
    var parentAnchor = parent.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    var t0 = performance.now();
    function ejectileAnchor() {
      return wave.position.clone().add(new THREE.Vector3(0.45, 0.45, 0));
    }
    function restart() {
      t0 = performance.now();
      gfx.resize();
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      var u = smoothstep(t / 1.2);
      wave.position.set(lerp(-2.0, 3.2, u), 0.2, 0);
      wave.scale.setScalar(lerp(0.6, 2.2, u));
      wave.material.opacity = lerp(0.95, 0.25, u);
      hud.place(parentAnchor, ejectileAnchor());
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-g"] = {
      replay: restart,
      snapshot: function () {
        return hud.snapshot(parentAnchor, ejectileAnchor());
      }
    };
  }

  function current(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas);
    var top = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.18, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 })
    );
    var bot = top.clone();
    top.position.set(0.4, 1.7, 0);
    bot.position.set(0.4, -1.7, 0);
    var source = ball(0.28, 0xc0392b);
    source.position.set(-4.2, 0, 0);
    var gas = ball(0.26, 0xe0a04a);
    var gasHome = new THREE.Vector3(-0.6, 0.1, 0);
    gas.position.copy(gasHome);
    var electron = ball(0.16, 0x2a62a8);
    electron.position.copy(gasHome);
    var ionEnd = new THREE.Vector3(0.5, 1.55, 0);
    var electronEnd = new THREE.Vector3(0.9, -1.55, 0);
    var face = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 28),
      new THREE.MeshStandardMaterial({ color: 0xf7f1e4, roughness: 0.55, side: THREE.DoubleSide })
    );
    var rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.04, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0x4a5560 })
    );
    var needle = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.78, 8),
      new THREE.MeshStandardMaterial({ color: 0xc0392b })
    );
    needle.position.y = 0.22;
    var needlePivot = new THREE.Group();
    needlePivot.add(needle);
    var meter = new THREE.Group();
    meter.add(face, rim, needlePivot);
    meter.position.set(3.45, 0.1, 0.15);
    gfx.scene.add(top, bot, source, gas, electron, meter);
    var kind = "alpha";
    var sourceHud = host.querySelector('[data-hud="source"]');
    var minusHud = host.querySelector('[data-hud="minus"]');
    var plusHud = host.querySelector('[data-hud="plus"]');
    var minusAnchor = top.position.clone().add(new THREE.Vector3(2.2, 0.28, 0));
    var plusAnchor = bot.position.clone().add(new THREE.Vector3(2.2, -0.28, 0));
    var t0 = performance.now();
    function needleRad() {
      return (kind === "alpha" ? -38 : -14) * Math.PI / 180;
    }
    function restart() {
      t0 = performance.now();
    }
    function setKind(next) {
      kind = next === "beta" ? "beta" : "alpha";
      if (sourceHud) sourceHud.textContent = kind === "beta" ? "β source" : "α source";
      restart();
    }
    function projectXY(world) {
      var v = world.clone().project(gfx.camera);
      return {
        x: (v.x * 0.5 + 0.5) * (canvas.clientWidth || 1),
        y: (-v.y * 0.5 + 0.5) * (canvas.clientHeight || 1)
      };
    }
    function frame(now) {
      var t = ((now - t0) / 1000) % 2.4;
      var knock = smoothstep((t - 0.45) / 0.95);
      electron.material.opacity = 1;
      electron.position.lerpVectors(gasHome, electronEnd, knock);
      gas.position.lerpVectors(gasHome, ionEnd, knock);
      gas.material.color.setHex(knock > 0.04 ? 0xc0392b : 0xe0a04a);
      needlePivot.rotation.z = needleRad();
      placeHud(sourceHud, canvas, gfx.camera, source.position.clone().add(new THREE.Vector3(0, -0.55, 0)));
      placeHud(minusHud, canvas, gfx.camera, minusAnchor);
      placeHud(plusHud, canvas, gfx.camera, plusAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      var minusP = projectXY(minusAnchor);
      var plusP = projectXY(plusAnchor);
      return {
        kind: kind,
        sourceLabel: sourceHud ? sourceHud.textContent : "",
        ionY: gas.position.y,
        electronY: electron.position.y,
        ionEndY: ionEnd.y,
        electronEndY: electronEnd.y,
        needleDeg: needlePivot.rotation.z * 180 / Math.PI,
        minusHud: minusHud ? parseFloat(minusHud.style.left) : null,
        plusHud: plusHud ? parseFloat(plusHud.style.left) : null,
        minusHudTop: minusHud ? parseFloat(minusHud.style.top) : null,
        plusHudTop: plusHud ? parseFloat(plusHud.style.top) : null,
        minusProj: minusP.x,
        plusProj: plusP.x,
        minusProjY: minusP.y,
        plusProjY: plusP.y
      };
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.current = { replay: restart, setKind: setKind, snapshot: snapshot };
  }

  function gm(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 4.8, halfH: 2.4 });
    gfx.camera.position.set(0.6, 0.5, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudWin = host.querySelector('[data-hud="window"]');
    var hudWire = host.querySelector('[data-hud="wire"]');
    var hudCase = host.querySelector('[data-hud="case"]');
    var wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 6.4, 48, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xd7e4ea,
        transparent: true,
        opacity: 0.22,
        metalness: 0.15,
        roughness: 0.2,
        side: THREE.DoubleSide
      })
    );
    wall.rotation.z = Math.PI / 2;
    var wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 5.2, 16),
      metal(0xc0392b, { metalness: 0.85, roughness: 0.2 })
    );
    wire.rotation.z = Math.PI / 2;
    var windowDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshStandardMaterial({
        color: 0xc5d0d4,
        transparent: true,
        opacity: 0.35,
        metalness: 0.2,
        roughness: 0.15,
        side: THREE.DoubleSide
      })
    );
    windowDisk.position.set(-3.2, 0, 0);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 8, 28), metal(0x6b7380));
    rim.position.set(-3.2, 0, 0);
    var argon = ball(0.22, 0xe0a04a);
    var argonHome = new THREE.Vector3(-1.6, 0.72, 0);
    argon.position.copy(argonHome);
    var electron = ball(0.12, 0x2a62a8);
    electron.position.copy(argonHome);
    gfx.scene.add(wall, wire, windowDisk, rim, argon, electron);
    var winAnchor = new THREE.Vector3(-3.2, 1.35, 0);
    var wireAnchor = new THREE.Vector3(0.4, 0.42, 0);
    var caseAnchor = new THREE.Vector3(2.1, -1.25, 0);
    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var t = ((now - t0) / 1000) % 1.4;
      var fly = smoothstep(t / 1.05);
      electron.material.opacity = 1;
      electron.position.set(argonHome.x, lerp(argonHome.y, 0.08, fly), 0);
      argon.position.set(argonHome.x, lerp(argonHome.y, 0.98, fly), 0);
      argon.material.color.setHex(fly > 0.08 ? 0xd35400 : 0xe0a04a);
      placeHud(hudWin, canvas, gfx.camera, winAnchor);
      placeHud(hudWire, canvas, gfx.camera, wireAnchor);
      placeHud(hudCase, canvas, gfx.camera, caseAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      return {
        electronX: electron.position.x,
        electronY: electron.position.y,
        argonX: argon.position.x,
        argonY: argon.position.y,
        homeX: argonHome.x
      };
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.gm = { replay: restart, snapshot: snapshot };
  }

  function efield(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.2, halfH: 2.55 });
    gfx.camera.position.set(0.3, 0.2, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudCol = host.querySelector('[data-hud="collimator"]');
    var hudMinus = host.querySelector('[data-hud="minus"]');
    var hudPlus = host.querySelector('[data-hud="plus"]');
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    var plateN = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.14, 1.7), metal(0x9aa3ab, { metalness: 0.7, roughness: 0.32 }));
    var plateP = plateN.clone();
    plateN.position.set(0.55, 1.9, 0);
    plateP.position.set(0.55, -1.9, 0);
    var n;
    for (n = -2; n <= 2; n += 1) {
      var m = signDecal("−", "#1c2430");
      m.position.set(n * 0.9, 1.84, 0.88);
      gfx.scene.add(m);
      var p = signDecal("+", "#1c2430");
      p.position.set(n * 0.9, -1.84, 0.88);
      gfx.scene.add(p);
    }
    var colTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 1.3), metal(0x2c3036, { metalness: 0.55, roughness: 0.4 }));
    var colBot = colTop.clone();
    colTop.position.set(-4.35, 0.72, 0);
    colBot.position.set(-4.35, -0.72, 0);
    gfx.scene.add(plateN, plateP, colTop, colBot);
    var alpha = nucleonCluster(2, 2, 0.22);
    alpha.scale.setScalar(0.55);
    var beta = ball(0.12, 0x1d4f91);
    var gamma = ball(0.1, 0xc9a227);
    gfx.scene.add(alpha, beta, gamma);
    var t0 = performance.now();
    function restart() { t0 = performance.now(); }
    function frame(now) {
      var u = ((now - t0) / 1000 * 0.35) % 1;
      var aPos = new THREE.Vector3(lerp(-3.9, 3.2, u), lerp(0, 1.45, u * u), 0);
      var bPos = new THREE.Vector3(lerp(-3.9, 2.6, u), lerp(0, -1.7, Math.pow(u, 1.35)), 0);
      var gPos = new THREE.Vector3(lerp(-3.9, 4.2, u), 0, 0);
      alpha.position.copy(aPos);
      beta.position.copy(bPos);
      gamma.position.copy(gPos);
      placeHud(hudCol, canvas, gfx.camera, new THREE.Vector3(-4.35, -1.45, 0));
      placeHud(hudMinus, canvas, gfx.camera, plateN.position.clone().add(new THREE.Vector3(2.4, 0.28, 0)));
      placeHud(hudPlus, canvas, gfx.camera, plateP.position.clone().add(new THREE.Vector3(2.4, -0.28, 0)));
      placeHud(hudA, canvas, gfx.camera, aPos.clone().add(new THREE.Vector3(0.2, 0.45, 0)));
      placeHud(hudG, canvas, gfx.camera, gPos.clone().add(new THREE.Vector3(0.2, 0.35, 0)));
      placeHud(hudB, canvas, gfx.camera, bPos.clone().add(new THREE.Vector3(0.2, -0.4, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.efield = { replay: restart };
  }

  function bfield(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.2, halfH: 2.5 });
    gfx.camera.position.set(0.2, 0.15, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudSrc = host.querySelector('[data-hud="source"]');
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    var hudMark = host.querySelector("[data-b-mark]");
    var region = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 3.4, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xe8edf4, transparent: true, opacity: 0.35 })
    );
    region.position.set(0.6, 0, 0);
    gfx.scene.add(region);
    var marks = [];
    var ix;
    var iy;
    for (ix = -2; ix <= 2; ix += 1) {
      for (iy = -1; iy <= 1; iy += 1) {
        var group = new THREE.Group();
        var bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), metal(0x334155, { metalness: 0.2, roughness: 0.5 }));
        var bar2 = bar1.clone();
        bar1.rotation.z = Math.PI / 4;
        bar2.rotation.z = -Math.PI / 4;
        var dot = ball(0.06, 0x334155);
        group.add(bar1, bar2, dot);
        group.position.set(ix * 0.85 + 0.55, iy * 0.95, 0.12);
        group.userData.cross = [bar1, bar2];
        group.userData.dot = dot;
        marks.push(group);
        gfx.scene.add(group);
      }
    }
    var src = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 20), metal(0x8a9098));
    src.rotation.z = Math.PI / 2;
    src.position.set(-4.4, 0, 0);
    var colT = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, 1.1), metal(0x2c3036, { metalness: 0.5, roughness: 0.4 }));
    var colB = colT.clone();
    colT.position.set(-3.7, 0.62, 0);
    colB.position.set(-3.7, -0.62, 0);
    gfx.scene.add(src, colT, colB);
    var alpha = nucleonCluster(2, 2, 0.22);
    alpha.scale.setScalar(0.5);
    var beta = ball(0.12, 0x1d4f91);
    var gamma = ball(0.09, 0xc9a227);
    gfx.scene.add(alpha, beta, gamma);
    var into = true;
    var t0 = performance.now();
    function applyMarks() {
      marks.forEach(function (g) {
        g.userData.cross[0].visible = into;
        g.userData.cross[1].visible = into;
        g.userData.dot.visible = !into;
      });
      if (hudMark) hudMark.textContent = into ? "×  B into the page" : "·  B out of the page";
    }
    function setInto(next) {
      into = !!next;
      applyMarks();
    }
    function restart() { t0 = performance.now(); }
    function frame(now) {
      var u = ((now - t0) / 1000 * 0.32) % 1;
      var sign = into ? 1 : -1;
      var aPos = new THREE.Vector3(lerp(-3.3, 3.1, u), lerp(0, 1.35 * sign, u * u), 0);
      var bPos = new THREE.Vector3(lerp(-3.3, 2.2, u), lerp(0, -1.7 * sign, Math.pow(u, 1.3)), 0);
      var gPos = new THREE.Vector3(lerp(-3.3, 4.0, u), 0, 0);
      alpha.position.copy(aPos);
      beta.position.copy(bPos);
      gamma.position.copy(gPos);
      placeHud(hudSrc, canvas, gfx.camera, src.position.clone().add(new THREE.Vector3(0, -0.7, 0)));
      placeHud(hudA, canvas, gfx.camera, aPos.clone().add(new THREE.Vector3(0.15, 0.4 * sign, 0)));
      placeHud(hudB, canvas, gfx.camera, bPos.clone().add(new THREE.Vector3(0.15, -0.4 * sign, 0)));
      placeHud(hudG, canvas, gfx.camera, gPos.clone().add(new THREE.Vector3(0.2, 0.32, 0)));
      placeHud(hudMark, canvas, gfx.camera, new THREE.Vector3(2.4, 1.7, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    applyMarks();
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.bfield = {
      replay: restart,
      setInto: setInto,
      snapshot: function () { return { into: into }; }
    };
  }

  function absorbers(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.6, halfH: 2.35 });
    gfx.camera.position.set(0.2, 0.25, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudSrc = host.querySelector('[data-hud="source"]');
    var hudPaper = host.querySelector('[data-hud="paper"]');
    var hudAl = host.querySelector('[data-hud="al"]');
    var hudPb = host.querySelector('[data-hud="pb"]');
    var hudGm = host.querySelector('[data-hud="gm"]');
    var source = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 20), metal(0x8a9098));
    source.position.set(-4.5, 0, 0);
    var paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 2.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.9, transparent: true, opacity: 0.22 })
    );
    paper.position.set(-1.5, 0, 0);
    var al = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 2.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xc5ccd4, metalness: 0.65, roughness: 0.3, transparent: true, opacity: 0.22 })
    );
    al.position.set(0.15, 0, 0);
    var pb = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 2.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x2d3038, metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0.22 })
    );
    pb.position.set(1.85, 0, 0);
    var gmTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 1.4, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd7e4ea, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    gmTube.rotation.z = Math.PI / 2;
    gmTube.position.set(4.15, 0, 0);
    gfx.scene.add(source, paper, al, pb, gmTube);
    function rayLine(y, hex, width) {
      var mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(width, width, 1, 8),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 1 })
      );
      mesh.rotation.z = Math.PI / 2;
      mesh.position.y = y;
      gfx.scene.add(mesh);
      return mesh;
    }
    var rayA = rayLine(0.7, 0xc0392b, 0.045);
    var rayB = rayLine(0, 0x1d4f91, 0.032);
    var rayG = rayLine(-0.7, 0xc9a227, 0.025);
    var xs = { src: -3.95, paper: -1.5, al: 0.15, pb: 1.85, gm: 3.55 };
    function stopWorld(kind, cfg) {
      if (kind === "a") {
        if (!cfg.hasA) return xs.src + 0.2;
        if (cfg.paper) return xs.paper;
        if (cfg.al) return xs.al;
        if (cfg.pb) return xs.pb;
        return xs.gm;
      }
      if (kind === "b") {
        if (!cfg.hasB) return xs.src + 0.2;
        if (cfg.al) return xs.al;
        if (cfg.pb) return xs.pb;
        return xs.gm;
      }
      if (!cfg.hasG) return xs.src + 0.2;
      return xs.gm;
    }
    function setRay(mesh, x2, faded) {
      var x1 = xs.src;
      var len = Math.max(0.08, x2 - x1);
      mesh.scale.set(1, len, 1);
      mesh.position.x = x1 + len / 2;
      mesh.material.opacity = faded ? 0.28 : 1;
    }
    var cfg = { hasA: false, hasB: true, hasG: true, paper: false, al: false, pb: false };
    function render(next) {
      cfg = next || cfg;
      paper.material.opacity = cfg.paper ? 0.95 : 0.18;
      al.material.opacity = cfg.al ? 0.95 : 0.2;
      pb.material.opacity = cfg.pb ? 0.95 : 0.18;
      setRay(rayA, stopWorld("a", cfg), !cfg.hasA);
      setRay(rayB, stopWorld("b", cfg), !cfg.hasB);
      setRay(rayG, stopWorld("g", cfg), !cfg.hasG || cfg.pb);
    }
    function frame() {
      placeHud(hudSrc, canvas, gfx.camera, source.position.clone().add(new THREE.Vector3(0, -1.15, 0)));
      placeHud(hudPaper, canvas, gfx.camera, paper.position.clone().add(new THREE.Vector3(0, -1.35, 0)));
      placeHud(hudAl, canvas, gfx.camera, al.position.clone().add(new THREE.Vector3(0, -1.35, 0)));
      placeHud(hudPb, canvas, gfx.camera, pb.position.clone().add(new THREE.Vector3(0, -1.35, 0)));
      placeHud(hudGm, canvas, gfx.camera, gmTube.position.clone().add(new THREE.Vector3(0, -1.15, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    render(cfg);
    requestAnimationFrame(frame);
    scenes.absorbers = { set: render };
  }

  function sealed(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 3.4, halfH: 2.2 });
    gfx.camera.position.set(2.6, 1.7, 10);
    gfx.camera.lookAt(0, 0.1, 0);
    var hudCase = host.querySelector('[data-hud="case"]');
    var hudMat = host.querySelector('[data-hud="material"]');
    var hudMesh = host.querySelector('[data-hud="mesh"]');
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.85, 36), metal(0xc5ccd4, { metalness: 0.88, roughness: 0.18 }));
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal(0xb8c0c8, { metalness: 0.88, roughness: 0.16 }));
    cap.position.y = 0.92;
    var ridge1 = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.045, 8, 28), metal(0x9aa3ab));
    ridge1.rotation.x = Math.PI / 2;
    ridge1.position.y = -0.35;
    var ridge2 = ridge1.clone();
    ridge2.position.y = -0.55;
    var inner = ball(0.28, 0xc47a12);
    inner.material.emissive = new THREE.Color(0x7a3b08);
    inner.material.emissiveIntensity = 0.45;
    inner.position.y = 0.15;
    var meshGroup = new THREE.Group();
    var i;
    for (i = -3; i <= 3; i += 1) {
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), metal(0x4a5560, { metalness: 0.6, roughness: 0.35 }));
      bar.position.set(i * 0.12, 0.15, 0.68);
      meshGroup.add(bar);
      var barH = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), metal(0x4a5560, { metalness: 0.6, roughness: 0.35 }));
      barH.rotation.z = Math.PI / 2;
      barH.position.set(0, 0.15 + i * 0.12, 0.68);
      meshGroup.add(barH);
    }
    gfx.scene.add(body, cap, ridge1, ridge2, inner, meshGroup);
    var floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.35, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.95;
    gfx.scene.add(floor);
    function frame() {
      meshGroup.rotation.y += 0.004;
      placeHud(hudCase, canvas, gfx.camera, new THREE.Vector3(-1.15, -0.15, 0));
      placeHud(hudMat, canvas, gfx.camera, inner.position.clone().add(new THREE.Vector3(0.9, 0.35, 0)));
      placeHud(hudMesh, canvas, gfx.camera, new THREE.Vector3(0.2, 1.15, 0.7));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.sealed = {};
  }

  function badge(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 4.8, halfH: 2.1 });
    gfx.camera.position.set(0, 1.4, 11);
    gfx.camera.lookAt(0, 0, 0);
    var hudOpen = host.querySelector('[data-hud="open"]');
    var hudAl = host.querySelector('[data-hud="al"]');
    var hudPb = host.querySelector('[data-hud="pb"]');
    var holder = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 2.2), metal(0x8a9098, { metalness: 0.45, roughness: 0.4 }));
    holder.position.y = -0.85;
    gfx.scene.add(holder);
    function windowBlock(x, coverHex) {
      var film = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.15, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf2ead2, roughness: 0.85 })
      );
      film.position.set(x, 0.15, 0);
      var cover = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 1.18, 0.05),
        new THREE.MeshStandardMaterial({ color: coverHex, metalness: 0.4, roughness: 0.35, transparent: true, opacity: 0.55 })
      );
      cover.position.set(x, 0.15, 0.08);
      gfx.scene.add(film, cover);
      return { film: film, cover: cover };
    }
    var openW = windowBlock(-2.15, 0xf4efe0);
    openW.cover.material.opacity = 0.08;
    var alW = windowBlock(0, 0xc5ccd4);
    var pbW = windowBlock(2.15, 0x2d3038);
    function paint(block, hex, coverOp) {
      block.film.material.color.setHex(hex);
      if (coverOp != null) block.cover.material.opacity = coverOp;
    }
    function setKind(kind) {
      if (kind === "alpha") {
        paint(openW, 0xe7d9b3, 0.08);
        paint(alW, 0xf2ead2);
        paint(pbW, 0xf2ead2);
        if (hudOpen) hudOpen.textContent = "open · α stopped by wrap";
        if (hudAl) hudAl.textContent = "thin Al";
        if (hudPb) hudPb.textContent = "lead";
      } else if (kind === "beta") {
        paint(openW, 0x3a3428, 0.08);
        paint(alW, 0xe7d9b3);
        paint(pbW, 0xf2ead2);
        if (hudOpen) hudOpen.textContent = "open window blackens";
        if (hudAl) hudAl.textContent = "Al stops β";
        if (hudPb) hudPb.textContent = "lead";
      } else {
        paint(openW, 0x8a7b5d, 0.08);
        paint(alW, 0x8a7b5d);
        paint(pbW, 0x8a7b5d);
        if (hudOpen) hudOpen.textContent = "γ";
        if (hudAl) hudAl.textContent = "γ";
        if (hudPb) hudPb.textContent = "γ";
      }
    }
    function frame() {
      placeHud(hudOpen, canvas, gfx.camera, openW.film.position.clone().add(new THREE.Vector3(0, -0.85, 0)));
      placeHud(hudAl, canvas, gfx.camera, alW.film.position.clone().add(new THREE.Vector3(0, -0.85, 0)));
      placeHud(hudPb, canvas, gfx.camera, pbW.film.position.clone().add(new THREE.Vector3(0, -0.85, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    setKind("beta");
    requestAnimationFrame(frame);
    scenes.badge = { setKind: setKind };
  }

  var builders = {
    knockout: knockout2d,
    ionpair: ionpair2d,
    beams: beams,
    atom: atom,
    tube: tube,
    "decay-a": decayAlpha,
    "decay-b": decayBeta,
    "decay-g": decayGamma,
    current: current,
    gm: gm,
    efield: efield,
    bfield: bfield,
    absorbers: absorbers,
    sealed: sealed,
    badge: badge
  };

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-scene]"), function (host) {
      var name = host.getAttribute("data-scene");
      try {
        if (builders[name]) builders[name](host);
      } catch (err) {
        console.error("NotesScenes failed:", name, err);
      }
    });
  }

  global.NotesScenes = scenes;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);

