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
    var canvas = host.querySelector("canvas");
    var hudA = host.querySelector('[data-hud="a"]');
    var hudB = host.querySelector('[data-hud="b"]');
    var SHELL_R = 36;
    var HIT_T = 0.7;
    var FLY_T = 1.05;
    var state = {
      x: 0, y: 0, ax: 0, ay: 0, bx: 0, by: 0,
      opacity: 1, plusHex: "#e0a04a", minusHex: "#e0a04a",
      labelA: "atom", labelB: "atom"
    };
    var t0 = performance.now();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function layout() {
      var box = fit2d(canvas);
      return {
        ctx: box.ctx,
        w: box.w,
        h: box.h,
        ax: box.w * 0.32,
        ay: box.h * 0.36,
        bx: box.w * 0.68,
        by: box.h * 0.68
      };
    }

    function apply(t) {
      var L = layout();
      var fly = smoothstep((t - HIT_T) / FLY_T);
      var hit = smoothstep(t / HIT_T);
      var startX = L.ax - SHELL_R;
      var startY = L.ay;
      state.ax = L.ax;
      state.ay = L.ay;
      state.bx = L.bx;
      state.by = L.by;
      state.x = lerp(startX, L.bx, fly);
      state.y = lerp(startY, L.by, fly);
      state.opacity = 1;
      var plus = fly > 0.02;
      var minus = fly > 0.92;
      state.plusHex = plus ? "#c0392b" : "#e0a04a";
      state.minusHex = minus ? "#2a62a8" : "#e0a04a";
      state.labelA = plus ? "+ ion" : "atom";
      state.labelB = minus ? "− ion" : "atom";
      if (hudA) {
        hudA.textContent = state.labelA;
        hudA.style.left = L.ax + "px";
        hudA.style.top = L.ay + 52 + "px";
      }
      if (hudB) {
        hudB.textContent = state.labelB;
        hudB.style.left = L.bx + "px";
        hudB.style.top = L.by + 52 + "px";
      }
      var ctx = L.ctx;
      ctx.clearRect(0, 0, L.w, L.h);
      ctx.fillStyle = "#fffaf1";
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(20, L.ay);
      ctx.lineTo(lerp(20, startX, hit), L.ay);
      ctx.stroke();
      function atom(cx, cy, fill, mark) {
        ctx.strokeStyle = "#9bb6c4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, SHELL_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        if (mark) {
          ctx.fillStyle = "#fff";
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(mark, cx, cy + 5);
        }
      }
      atom(L.ax, L.ay, state.plusHex, plus ? "+" : "");
      atom(L.bx, L.by, state.minusHex, minus ? "−" : "");
      ctx.globalAlpha = state.opacity;
      ctx.fillStyle = "#2a62a8";
      ctx.beginPath();
      ctx.arc(state.x, state.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
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
      requestAnimationFrame(frame);
    }

    hostReplay(host, restart);
    apply(0);
    requestAnimationFrame(frame);
    scenes.ionpair = { snapshot: snapshot, replay: restart };
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
    var nucleusAnchor = new THREE.Vector3(0.28, 0.42, 0);
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
      return {
        zoom: gfx.camera.zoom,
        nucleusPx: Math.abs(rim.x - origin.x) * 0.5 * w,
        nucleusHud: hudNucleus ? parseFloat(hudNucleus.style.left) : null,
        nucleusProjX: (nuc.x * 0.5 + 0.5) * w
      };
    }
    requestAnimationFrame(frame);
    scenes.atom = { snapshot: snapshot };
  }

  function tube(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 4.4, halfH: 2.5 });
    gfx.camera.position.set(0.2, 1.8, 11);
    gfx.camera.lookAt(0, 0, 0);
    var hudGun = host.querySelector('[data-hud="gun"]');
    var hudElectrons = host.querySelector('[data-hud="electrons"]');
    var hudTarget = host.querySelector('[data-hud="target"]');
    var hudXrays = host.querySelector('[data-hud="xrays"]');
    var gunAnchor = new THREE.Vector3(-2.85, 0.55, 0);
    var electronAnchor = new THREE.Vector3(-1.05, 0.55, 0);
    var targetAnchor = new THREE.Vector3(0.35, 1.05, 0);
    var xrayAnchor = new THREE.Vector3(1.7, -1.15, 0);

    var glassMat = new THREE.MeshStandardMaterial({
      color: 0xd5e3ea,
      transparent: true,
      opacity: 0.22,
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
      new THREE.BoxGeometry(0.18, 1.15, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.65, roughness: 0.28 })
    );
    target.rotation.z = -0.55;
    target.position.set(0.35, 0.05, 0);
    var stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b7380, metalness: 0.55, roughness: 0.3 })
    );
    stem.rotation.z = Math.PI / 2;
    stem.position.set(1.7, 0.08, 0);

    gfx.scene.add(bulb, leftArm, rightArm, capL, capR, gun, filament, target, stem);

    var electrons = [];
    var i;
    for (i = 0; i < 12; i += 1) {
      var e = ball(0.08, 0x2a62a8);
      electrons.push({ mesh: e, delay: i * 0.08 });
      gfx.scene.add(e);
    }
    var xrays = [];
    for (i = 0; i < 4; i += 1) {
      var ray = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xc9a227, transparent: true, opacity: 0.9 })
      );
      var tilt = 0.55 + i * 0.14;
      ray.position.set(1.35 + i * 0.15, -0.85 - i * 0.18, 0.05 * i);
      ray.rotation.z = Math.PI / 2 + tilt;
      xrays.push(ray);
      gfx.scene.add(ray);
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
        item.mesh.position.set(lerp(-2.35, 0.22, u), Math.sin(t * 9 + item.delay) * 0.04, 0);
        item.mesh.material.opacity = 1;
        item.mesh.visible = u < 0.97;
      });
      xrays.forEach(function (ray, idx) {
        ray.material.opacity = 0.3 + 0.55 * Math.abs(Math.sin(t * 3.2 + idx));
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
      return {
        gunHud: hudGun ? parseFloat(hudGun.style.left) : null,
        gunProj: projectX(gunAnchor),
        electronsHud: hudElectrons ? parseFloat(hudElectrons.style.left) : null,
        electronsProj: projectX(electronAnchor),
        targetHud: hudTarget ? parseFloat(hudTarget.style.left) : null,
        targetProj: projectX(targetAnchor),
        xraysHud: hudXrays ? parseFloat(hudXrays.style.left) : null,
        xraysProj: projectX(xrayAnchor)
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
    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var fly = smoothstep(((now - t0) / 1000 - 0.15) / 1.05);
      alpha.position.lerpVectors(alphaHome, alphaAway, fly);
      alpha.children.forEach(function (ch) {
        ch.material.opacity = 1;
      });
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-a"] = { replay: restart };
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
    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var fly = smoothstep(((now - t0) / 1000 - 0.12) / 0.95);
      electron.material.opacity = 1;
      electron.position.lerpVectors(home, away, fly);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-b"] = { replay: restart };
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
    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      var u = smoothstep(t / 1.2);
      wave.position.set(lerp(-2.0, 3.2, u), 0.2, 0);
      wave.scale.setScalar(lerp(0.6, 2.2, u));
      wave.material.opacity = lerp(0.95, 0.25, u);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["decay-g"] = { replay: restart };
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
    var t0 = performance.now();
    function needleRad() {
      return (kind === "alpha" ? -38 : -14) * Math.PI / 180;
    }
    function restart() {
      t0 = performance.now();
    }
    function setKind(next) {
      kind = next === "beta" ? "beta" : "alpha";
      restart();
    }
    function frame(now) {
      var t = ((now - t0) / 1000) % 2.4;
      var knock = smoothstep((t - 0.45) / 0.95);
      electron.material.opacity = 1;
      electron.position.lerpVectors(gasHome, electronEnd, knock);
      gas.position.lerpVectors(gasHome, ionEnd, knock);
      gas.material.color.setHex(knock > 0.04 ? 0xc0392b : 0xe0a04a);
      needlePivot.rotation.z = needleRad();
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      return {
        kind: kind,
        ionY: gas.position.y,
        electronY: electron.position.y,
        ionEndY: ionEnd.y,
        electronEndY: electronEnd.y,
        needleDeg: needlePivot.rotation.z * 180 / Math.PI
      };
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.current = { replay: restart, setKind: setKind, snapshot: snapshot };
  }

  function gm(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas);
    var wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 6.4, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xeef4f8, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    wall.rotation.z = Math.PI / 2;
    var wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 5.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xc0392b })
    );
    wire.rotation.z = Math.PI / 2;
    var argon = ball(0.22, 0xe0a04a);
    var argonHome = new THREE.Vector3(-1.6, 0.15, 0);
    argon.position.copy(argonHome);
    var electron = ball(0.12, 0x2a62a8);
    electron.position.copy(argonHome);
    gfx.scene.add(wall, wire, argon, electron);
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
    var gfx = stage(canvas);
    var plateN = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.16, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    var plateP = plateN.clone();
    plateN.position.set(0.6, 1.85, 0);
    plateP.position.set(0.6, -1.85, 0);
    var collim = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    collim.position.set(-4.4, 0, 0);
    gfx.scene.add(plateN, plateP, collim);
    var alpha = ball(0.16, 0xc0392b);
    var beta = ball(0.12, 0x1d4f91);
    var gamma = ball(0.08, 0xc9a227);
    gfx.scene.add(alpha, beta, gamma);
    var t0 = performance.now();
    function restart() {
      t0 = performance.now();
    }
    function frame(now) {
      var u = ((now - t0) / 1000 * 0.35) % 1;
      alpha.position.set(lerp(-4, 3.2, u), lerp(0, 1.45, u * u), 0);
      beta.position.set(lerp(-4, 2.6, u), lerp(0, -1.7, Math.pow(u, 1.35)), 0);
      gamma.position.set(lerp(-4, 4.2, u), 0, 0);
      alpha.material.opacity = 1;
      beta.material.opacity = 1;
      gamma.material.opacity = 1;
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes.efield = { replay: restart };
  }

  var builders = {
    knockout: knockout2d,
    ionpair: ionpair2d,
    atom: atom,
    tube: tube,
    "decay-a": decayAlpha,
    "decay-b": decayBeta,
    "decay-g": decayGamma,
    current: current,
    gm: gm,
    efield: efield
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

