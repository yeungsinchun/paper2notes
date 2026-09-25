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

  function ball(radius, hex) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.45,
        metalness: 0.08,
        transparent: true,
        opacity: 1
      })
    );
  }

  function box(w, h, d, hex) {
    return new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.08 })
    );
  }

  function stage(canvas, fit) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    var persp = fit && fit.persp;
    var look = persp
      ? new THREE.Vector3(persp.lookX || 0, persp.lookY || 0, persp.lookZ || 0)
      : new THREE.Vector3(0, 0, 0);
    var camera;
    if (persp) {
      camera = new THREE.PerspectiveCamera(persp.fov || 32, 2, 0.1, 80);
      camera.position.set(persp.x, persp.y, persp.z);
      camera.lookAt(look);
    } else {
      camera = new THREE.OrthographicCamera(-7.2, 7.2, 3.6, -3.6, 0.1, 40);
      camera.position.set(0.4, 1.6, 12);
      camera.lookAt(look);
    }
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    var key = new THREE.DirectionalLight(0xfff4e0, 0.95);
    key.position.set(-4, 6, 8);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x9bb6c4, 0.38);
    fill.position.set(6, -2, 4);
    scene.add(fill);
    var contentHalfH = (fit && fit.halfH != null) ? fit.halfH : 3.6;
    var contentHalfW = (fit && fit.halfW != null) ? fit.halfW : null;
    function resize() {
      var w = canvas.clientWidth || canvas.width;
      var h = canvas.clientHeight || canvas.height;
      renderer.setSize(w, h, false);
      var aspect = w / Math.max(h, 1);
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        return;
      }
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
    var orbit = attachOrbit(canvas, camera, look);
    return { scene: scene, camera: camera, renderer: renderer, resize: resize, look: look, orbit: orbit };
  }

  /* Drag-to-rotate only where the third dimension carries meaning (the reactor
     vessel with its rods). Flat, diagram-like scenes keep a fixed camera. */
  var ORBIT_SCENES = { reactor: 1 };

  function attachOrbit(canvas, camera, target) {
    var host = canvas.closest ? canvas.closest("[data-scene]") : null;
    var name = host ? host.getAttribute("data-scene") : "";
    if (!ORBIT_SCENES[name]) {
      return { target: target, enabled: false, nudge: function () { /* fixed camera */ } };
    }
    if (host) host.setAttribute("data-orbit", "");
    var sph = new THREE.Spherical();
    var dragging = false;
    var lastX = 0;
    var lastY = 0;
    var synced = false;
    function sync() {
      sph.setFromVector3(camera.position.clone().sub(target));
      synced = true;
    }
    function apply() {
      camera.position.copy(new THREE.Vector3().setFromSpherical(sph).add(target));
      camera.lookAt(target);
      camera.updateMatrixWorld();
    }
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (!synced) sync();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      sph.theta -= (e.clientX - lastX) * 0.008;
      sph.phi -= (e.clientY - lastY) * 0.008;
      sph.phi = Math.max(0.18, Math.min(Math.PI - 0.18, sph.phi));
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    });
    function endDrag() { dragging = false; }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return {
      target: target,
      enabled: true,
      nudge: function (dx, dy) {
        if (!synced) sync();
        sph.theta -= dx * 0.008;
        sph.phi = Math.max(0.18, Math.min(Math.PI - 0.18, sph.phi - dy * 0.008));
        apply();
      }
    };
  }

  function projectXY(camera, canvas, world) {
    var v = world.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * (canvas.clientWidth || 1) + (canvas.offsetLeft || 0),
      y: (-v.y * 0.5 + 0.5) * (canvas.clientHeight || 1) + (canvas.offsetTop || 0)
    };
  }

  function placeHud(el, canvas, camera, world) {
    if (!el) return;
    var p = projectXY(camera, canvas, world);
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
  }

  function wavyArrow(scene, opts) {
    var origin = opts.origin;
    var dir = opts.dir.clone().normalize();
    var length = opts.length || 1.35;
    var amp = opts.amp != null ? opts.amp : 0.12;
    var waves = opts.waves || 3.1;
    var radius = opts.radius || 0.032;
    var n = opts.n || 28;
    var hex = opts.hex || 0xd4a017;
    var binormal = opts.side ? opts.side.clone() : new THREE.Vector3(0, 0, 1);
    if (Math.abs(dir.dot(binormal)) > 0.92) binormal = new THREE.Vector3(0, 1, 0);
    var side = new THREE.Vector3().crossVectors(dir, binormal).normalize();
    var pts = [];
    var i;
    for (i = 0; i <= n; i += 1) {
      var s = i / n;
      var p = origin.clone().addScaledVector(dir, s * length);
      p.addScaledVector(side, amp * Math.sin(s * waves * Math.PI * 2 + (opts.phase || 0)));
      pts.push(p);
    }
    var mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.92 });
    var tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, radius, 6, false),
      mat
    );
    var tipDir = pts[n].clone().sub(pts[n - 1]).normalize();
    var cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.4, 0.16, 8), mat);
    cone.position.copy(pts[n]);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir);
    var group = new THREE.Group();
    group.add(tube, cone);
    scene.add(group);
    group.userData.tip = pts[n].clone();
    group.userData.mid = pts[Math.floor(n / 2)].clone();
    group.userData.update = function (t) {
      mat.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 4 + (opts.phase || 0)));
    };
    return group;
  }

  function axes(scene, x0, y0, x1, y1) {
    var xBar = box(x1 - x0, 0.04, 0.04, 0x5b6573);
    xBar.position.set((x0 + x1) / 2, y0, 0);
    var yBar = box(0.04, y1 - y0, 0.04, 0x5b6573);
    yBar.position.set(x0, (y0 + y1) / 2, 0);
    scene.add(xBar, yBar);
  }

  function curveLine(scene, pts, hex) {
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: hex, linewidth: 2 }));
    scene.add(line);
    return line;
  }

  /* A small nucleon cluster: red protons and grey neutrons packed in a disc. */
  function cluster(np, nn, r) {
    var group = new THREE.Group();
    var rr = r || 0.16;
    var total = np + nn;
    var i;
    for (i = 0; i < total; i += 1) {
      var b = ball(rr, i < np ? 0xc0392b : 0x8a94a0);
      var ring = Math.ceil((Math.sqrt(i + 1) - 1));
      var ang = i * 2.4;
      var rad = ring * rr * 1.15;
      b.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, ((i % 2) - 0.5) * rr * 0.7);
      group.add(b);
    }
    return group;
  }

  function flashSprite(hex) {
    var m = ball(0.3, hex == null ? 0xf2c230 : hex);
    m.material.emissive = new THREE.Color(0x7a5a00);
    m.material.emissiveIntensity = 0.7;
    return m;
  }

  /* Fig. 27.1: a slow neutron splits U-235 into Ba-141 and Kr-92 plus 3 neutrons. */
  function fission(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.4 });
    var hudN = host.querySelector('[data-hud="neutron"]');
    var hudU = host.querySelector('[data-hud="u235"]');
    var hudE = host.querySelector('[data-hud="energy"]');
    var uranium = cluster(12, 14, 0.17);
    uranium.position.set(-1.6, 0, 0);
    gfx.scene.add(uranium);
    var neutron = ball(0.2, 0x2a62a8);
    gfx.scene.add(neutron);
    var ba = cluster(8, 9, 0.16);
    var kr = cluster(7, 7, 0.16);
    ba.visible = false;
    kr.visible = false;
    gfx.scene.add(ba, kr);
    var out = [];
    var k;
    for (k = 0; k < 3; k += 1) {
      var nb = ball(0.16, 0x2a62a8);
      nb.visible = false;
      gfx.scene.add(nb);
      out.push(nb);
    }
    var burst = flashSprite();
    burst.visible = false;
    gfx.scene.add(burst);
    var rays = [];
    var r;
    for (r = 0; r < 3; r += 1) {
      var g = wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(1.2, -0.4 + r * 0.4, 0),
        dir: new THREE.Vector3(1, 0.25 * (r - 1), 0),
        length: 1.6,
        hex: 0xd4a017,
        amp: 0.07,
        waves: 2.4,
        phase: r * 0.7
      });
      g.visible = false;
      rays.push(g);
    }
    var DUR = 5200;
    var t0 = 0;
    var playing = false;
    var impacted = false;
    var dirs = [
      new THREE.Vector3(1, 0.55, 0.2),
      new THREE.Vector3(0.9, -0.6, -0.25),
      new THREE.Vector3(1, 0.05, 0.5)
    ];
    function reset() {
      playing = true;
      impacted = false;
      t0 = performance.now();
      uranium.visible = true;
      ba.visible = false;
      kr.visible = false;
      burst.visible = false;
      out.forEach(function (b) { b.visible = false; });
      rays.forEach(function (g) { g.visible = false; });
    }
    host.addEventListener("notes-replay", reset);
    reset();
    function frame(now) {
      var t = playing ? (now - t0) / DUR : 1;
      if (t >= 1) {
        t = 1;
        playing = false;
      }
      if (t < 0.28) {
        var u = t / 0.28;
        neutron.visible = true;
        neutron.position.set(lerp(-5.6, -1.7, u), 0.35 * (1 - u), 0);
        uranium.position.set(-1.6, 0, 0);
      } else {
        impacted = true;
        uranium.visible = false;
        neutron.visible = false;
        var v = clamp01((t - 0.28) / 0.35);
        ba.visible = true;
        kr.visible = true;
        ba.position.set(lerp(-1.5, -4.4, v), lerp(0, 1.1, v), 0);
        kr.position.set(lerp(-1.5, 1.6, v), lerp(0, -1.2, v), 0);
        out.forEach(function (b, idx) {
          b.visible = true;
          b.position.set(
            lerp(-1.5, -1.5 + dirs[idx].x * 4.6, v),
            lerp(0, dirs[idx].y * 3.2, v),
            lerp(0, dirs[idx].z * 3.2, v)
          );
        });
        burst.visible = true;
        burst.position.set(-1.5, 0, 0.3);
        var bs = 1 + 2.2 * Math.sin(Math.min(1, (t - 0.28) * 4) * Math.PI);
        burst.scale.set(bs, bs, bs);
        rays.forEach(function (g, idx) {
          g.visible = v > 0.25;
          g.userData.update((now - t0) / 1000 + idx);
        });
      }
      placeHud(hudN, canvas, gfx.camera, neutron.visible
        ? neutron.position.clone()
        : new THREE.Vector3(2.6, 1.6, 0));
      placeHud(hudU, canvas, gfx.camera, uranium.visible
        ? uranium.position.clone().add(new THREE.Vector3(0, 1.15, 0))
        : ba.position.clone().add(new THREE.Vector3(-0.4, 0.75, 0)));
      placeHud(hudE, canvas, gfx.camera, new THREE.Vector3(2.9, 0.9, 0));
      if (hudN) hudN.textContent = impacted ? "3 neutrons" : "slow neutron";
      if (hudU) hudU.textContent = impacted ? "Ba-141 + Kr-92" : "U-235";
      if (hudE) hudE.textContent = impacted ? "energy out" : "";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.fission = {
      replay: reset,
      snapshot: function () {
        return { impacted: impacted, neutrons: 3, fragments: 2, kind: "fission" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  /* Fig. 27.2: the chain reaction. Each fission releases neutrons; the mode
     chooses how many of them trigger a further fission: 0 (dies out),
     1 (steady) or 2 (grows). Buttons on the page switch mode. */
  var CHAIN_MODES = { sub: 0, crit: 1, super: 2 };

  function chain(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.6, halfH: 3.4 });
    var hudG = host.querySelector('[data-hud="gen"]');
    var hudL = host.querySelector('[data-hud="live"]');
    var cells = [];
    var i;
    var j;
    for (i = 0; i < 3; i += 1) {
      for (j = 0; j < 4; j += 1) {
        var c = cluster(6, 7, 0.15);
        c.position.set((j - 1.5) * 2.5, (i - 1) * 1.9, 0);
        gfx.scene.add(c);
        cells.push({ group: c, live: true, flash: 0 });
      }
    }
    var sparks = [];
    var s;
    for (s = 0; s < 10; s += 1) {
      var sp = flashSprite();
      sp.visible = false;
      gfx.scene.add(sp);
      sparks.push(sp);
    }
    var mode = "crit";
    var gen = 0;
    var thisGen = 0;
    var total = 0;
    var released = 0;
    var live = cells.length;
    var queue = [];
    var t0 = 0;
    var holding = 0;

    function reset() {
      gen = 0;
      thisGen = 0;
      total = 0;
      released = 0;
      live = cells.length;
      queue = [];
      holding = 0;
      t0 = performance.now();
      cells.forEach(function (c) {
        c.live = true;
        c.flash = 0;
        c.group.visible = true;
        c.group.scale.set(1, 1, 1);
      });
      var first = cells[Math.floor(cells.length / 2)];
      queue.push(first);
    }

    function setMode(m) {
      if (CHAIN_MODES[m] == null) return;
      mode = m;
      reset();
    }

    function next() {
      if (!queue.length) return false;
      var branch = CHAIN_MODES[mode];
      var firing = queue;
      queue = [];
      thisGen = firing.length;
      gen += 1;
      firing.forEach(function (c) {
        if (!c.live) return;
        c.live = false;
        c.flash = 1;
        live -= 1;
        total += 1;
        released += 3;
      });
      var want = firing.length * branch;
      cells.forEach(function (c) {
        if (want <= 0) return;
        if (!c.live) return;
        if (queue.indexOf(c) !== -1) return;
        if (Math.random() < 0.75) {
          queue.push(c);
          want -= 1;
        }
      });
      /* Supercritical keeps every spare neutron working: fill up to the branch. */
      if (mode === "super") {
        cells.forEach(function (c) {
          if (want <= 0) return;
          if (!c.live || queue.indexOf(c) !== -1) return;
          queue.push(c);
          want -= 1;
        });
      }
      return true;
    }

    host.addEventListener("notes-replay", reset);
    reset();

    function frame(now) {
      if (now - t0 > 1250) {
        t0 = now;
        if (queue.length) {
          next();
          holding = 0;
        } else {
          holding += 1;
          if (holding >= 3) reset();
        }
      }
      var si = 0;
      cells.forEach(function (c) {
        if (!c.live && c.flash > 0) {
          c.flash = Math.max(0, c.flash - 0.03);
          c.group.scale.set(1 + c.flash * 0.5, 1 + c.flash * 0.5, 1);
          if (si < sparks.length) {
            sparks[si].visible = c.flash > 0.1;
            sparks[si].position.copy(c.group.position);
            var sc = 0.8 + c.flash;
            sparks[si].scale.set(sc, sc, sc);
            si += 1;
          }
        } else if (!c.live) {
          c.group.scale.set(0.55, 0.55, 0.55);
        }
      });
      for (var k = si; k < sparks.length; k += 1) sparks[k].visible = false;
      placeHud(hudG, canvas, gfx.camera, new THREE.Vector3(0, 2.9, 0));
      placeHud(hudL, canvas, gfx.camera, new THREE.Vector3(0, -2.9, 0));
      var modeWord = mode === "sub" ? "dies out" : mode === "crit" ? "steady" : "grows";
      if (hudG) hudG.textContent = "generation " + gen + " · " + thisGen + " fission" + (thisGen === 1 ? "" : "s") + " · " + modeWord;
      if (hudL) hudL.textContent = live + " U-235 left · " + released + " neutrons released";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.chain = {
      setMode: setMode,
      next: next,
      replay: reset,
      snapshot: function () {
        return {
          mode: mode,
          branch: CHAIN_MODES[mode],
          gen: gen,
          fissionsThisGen: thisGen,
          totalFissions: total,
          live: live,
          neutronsReleased: released,
          queued: queue.length
        };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  /* Fig. 27.5 + 27.6: H-2 and H-3 push apart until they touch, then fuse. */
  function fusion(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.4 });
    var hudL = host.querySelector('[data-hud="left"]');
    var hudR = host.querySelector('[data-hud="right"]');
    var hudE = host.querySelector('[data-hud="energy"]');
    var h2 = cluster(1, 1, 0.2);
    var h3 = cluster(1, 2, 0.2);
    gfx.scene.add(h2, h3);
    var he4 = cluster(2, 2, 0.2);
    he4.visible = false;
    gfx.scene.add(he4);
    var neutron = ball(0.18, 0x2a62a8);
    neutron.visible = false;
    gfx.scene.add(neutron);
    var burst = flashSprite();
    burst.visible = false;
    gfx.scene.add(burst);
    var repelL = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(-0.5, 0.9, 0),
      dir: new THREE.Vector3(-1, 0, 0),
      length: 1.1,
      hex: 0xc0392b,
      amp: 0.05,
      waves: 2.2
    });
    var repelR = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(0.5, 0.9, 0),
      dir: new THREE.Vector3(1, 0, 0),
      length: 1.1,
      hex: 0xc0392b,
      amp: 0.05,
      waves: 2.2,
      phase: 1
    });
    var rays = [];
    var r;
    for (r = 0; r < 3; r += 1) {
      var g = wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(0.4, -0.5 + r * 0.5, 0),
        dir: new THREE.Vector3(1, 0.2 * (r - 1), 0),
        length: 1.8,
        hex: 0xd4a017,
        amp: 0.07,
        waves: 2.4,
        phase: r * 0.8
      });
      g.visible = false;
      rays.push(g);
    }
    var DUR = 5600;
    var t0 = 0;
    var playing = false;
    var fused = false;
    function reset() {
      playing = true;
      fused = false;
      t0 = performance.now();
      h2.visible = true;
      h3.visible = true;
      he4.visible = false;
      neutron.visible = false;
      burst.visible = false;
      rays.forEach(function (x) { x.visible = false; });
    }
    host.addEventListener("notes-replay", reset);
    reset();
    function frame(now) {
      var t = playing ? (now - t0) / DUR : 1;
      if (t >= 1) {
        t = 1;
        playing = false;
      }
      if (t < 0.45) {
        var u = t / 0.45;
        h2.position.set(lerp(-5.4, -0.7, u), 0, 0);
        h3.position.set(lerp(5.4, 0.7, u), 0, 0);
        repelL.visible = true;
        repelR.visible = true;
        repelL.userData.update((now - t0) / 1000);
        repelR.userData.update((now - t0) / 1000);
      } else {
        fused = true;
        h2.visible = false;
        h3.visible = false;
        repelL.visible = false;
        repelR.visible = false;
        var v = clamp01((t - 0.45) / 0.3);
        he4.visible = true;
        neutron.visible = true;
        he4.position.set(lerp(0, -2.6, v), lerp(0, 0.8, v), 0);
        neutron.position.set(lerp(0, 2.8, v), lerp(0, -0.9, v), 0);
        burst.visible = true;
        burst.position.set(0, 0, 0.3);
        var bs = 1 + 2.4 * Math.sin(Math.min(1, (t - 0.45) * 3.2) * Math.PI);
        burst.scale.set(bs, bs, bs);
        rays.forEach(function (x, idx) {
          x.visible = v > 0.2;
          x.userData.update((now - t0) / 1000 + idx);
        });
      }
      placeHud(hudL, canvas, gfx.camera, h2.visible
        ? h2.position.clone().add(new THREE.Vector3(0, 0.85, 0))
        : he4.position.clone().add(new THREE.Vector3(-0.3, 0.7, 0)));
      placeHud(hudR, canvas, gfx.camera, h3.visible
        ? h3.position.clone().add(new THREE.Vector3(0, 0.85, 0))
        : neutron.position.clone().add(new THREE.Vector3(0.3, 0.7, 0)));
      placeHud(hudE, canvas, gfx.camera, new THREE.Vector3(2.9, 1.15, 0));
      if (hudL) hudL.textContent = fused ? "He-4" : "H-2";
      if (hudR) hudR.textContent = fused ? "neutron" : "H-3";
      if (hudE) hudE.textContent = fused ? "energy out" : "repulsion pushes apart";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.fusion = {
      replay: reset,
      snapshot: function () {
        return { fused: fused, he4: fused ? 1 : 0, neutrons: fused ? 1 : 0, kind: "fusion" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  /* Enrichment p.97: a pressurized water reactor. Control rods in absorb
     neutrons and the fission rate falls; rods out and it climbs. */
  function reactor(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 1.2, y: 3.0, z: 10.5, lookY: 0.4 }
    });
    var hudR = host.querySelector('[data-hud="rods"]');
    var hudP = host.querySelector('[data-hud="power"]');
    var vessel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 2.6, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9fb2c4, roughness: 0.35, metalness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    vessel.position.set(-1.4, 0.4, 0);
    gfx.scene.add(vessel);
    var fuel = [];
    var f;
    for (f = 0; f < 3; f += 1) {
      var rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 2.2, 16),
        new THREE.MeshStandardMaterial({ color: 0xc47a12, roughness: 0.5, metalness: 0.1 })
      );
      rod.position.set(-2.1 + f * 0.7, 0.4, 0);
      gfx.scene.add(rod);
      fuel.push(rod);
    }
    var rods = [];
    var c;
    for (c = 0; c < 2; c += 1) {
      var cr = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 2.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2d3038, roughness: 0.4, metalness: 0.5 })
      );
      cr.position.set(-1.75 + c * 0.7, 1.6, 0.35);
      gfx.scene.add(cr);
      rods.push(cr);
    }
    var boiler = box(1.5, 1.6, 1.2, 0x7d8b9b);
    boiler.position.set(2.4, 0.2, -0.6);
    gfx.scene.add(boiler);
    var pipe1 = box(2.6, 0.18, 0.18, 0x5b6573);
    pipe1.position.set(0.6, 1.5, -0.3);
    pipe1.rotation.z = 0.1;
    var pipe2 = box(2.6, 0.18, 0.18, 0x5b6573);
    pipe2.position.set(0.6, -0.7, -0.3);
    pipe2.rotation.z = -0.1;
    gfx.scene.add(pipe1, pipe2);
    var flashes = [];
    var k;
    for (k = 0; k < 6; k += 1) {
      var fl = flashSprite();
      fl.visible = false;
      gfx.scene.add(fl);
      flashes.push({ mesh: fl, life: 0 });
    }
    var rodsIn = true;
    var t0 = performance.now();
    function setRods(on) {
      rodsIn = !!on;
    }
    setRods(true);
    function frame(now) {
      var y = rodsIn ? 0.4 : 2.1;
      rods.forEach(function (cr) {
        cr.position.y += (y - cr.position.y) * 0.06;
      });
      var interval = rodsIn ? 1500 : 380;
      if (now - t0 > interval) {
        t0 = now;
        for (var i = 0; i < flashes.length; i += 1) {
          if (flashes[i].life <= 0) {
            flashes[i].life = 1;
            var fr = fuel[Math.floor(Math.random() * fuel.length)];
            flashes[i].mesh.position.set(
              fr.position.x + (Math.random() - 0.5) * 0.5,
              fr.position.y + (Math.random() - 0.5) * 1.8,
              0.25
            );
            break;
          }
        }
      }
      flashes.forEach(function (fl) {
        if (fl.life > 0) {
          fl.life = Math.max(0, fl.life - 0.04);
          fl.mesh.visible = fl.life > 0;
          var sc = 0.5 + fl.life * 0.9;
          fl.mesh.scale.set(sc, sc, sc);
        } else {
          fl.mesh.visible = false;
        }
      });
      placeHud(hudR, canvas, gfx.camera, new THREE.Vector3(-1.4, 2.6, 0.35));
      placeHud(hudP, canvas, gfx.camera, new THREE.Vector3(2.4, 1.4, -0.6));
      if (hudR) hudR.textContent = rodsIn ? "control rods in" : "control rods out";
      if (hudP) hudP.textContent = rodsIn ? "fission rate low" : "fission rate high";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.reactor = {
      setRods: setRods,
      snapshot: function () {
        return { rodsIn: rodsIn, rate: rodsIn ? "low" : "high", fuel: "U-235" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  /* Fig. 27.14: the balance. Reactants outweigh products; the gap is energy. */
  function balance(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.6, halfH: 3.4 });
    var hudB = host.querySelector('[data-hud="before"]');
    var hudA = host.querySelector('[data-hud="after"]');
    var hudE = host.querySelector('[data-hud="energy"]');
    var stand = box(0.18, 3.0, 0.18, 0x5b6573);
    stand.position.set(0, -1.2, 0);
    var beam = box(7.6, 0.14, 0.14, 0xc9a227);
    gfx.scene.add(stand, beam);
    var leftPan = new THREE.Group();
    var rightPan = new THREE.Group();
    var u = cluster(9, 10, 0.15);
    var n0 = ball(0.16, 0x2a62a8);
    n0.position.set(1.3, 0, 0);
    leftPan.add(u, n0);
    var f1 = cluster(6, 6, 0.14);
    f1.position.set(-0.9, 0, 0);
    var f2 = cluster(5, 5, 0.14);
    f2.position.set(0.9, 0, 0);
    rightPan.add(f1, f2);
    gfx.scene.add(leftPan, rightPan);
    var star = flashSprite();
    star.position.set(3.4, 1.5, 0.3);
    gfx.scene.add(star);
    var ray = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(2.2, 0.9, 0.2),
      dir: new THREE.Vector3(1, 0.5, 0),
      length: 1.0,
      hex: 0xd4a017,
      amp: 0.07
    });
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      var tilt = -0.1 + 0.02 * Math.sin(t * 1.2);
      beam.rotation.z = tilt;
      leftPan.position.set(-3.4, -0.75 - Math.sin(tilt) * 3.4, 0);
      rightPan.position.set(3.4, -0.75 + Math.sin(tilt) * 3.4, 0);
      var bs = 1 + 0.35 * Math.sin(t * 3);
      star.scale.set(bs, bs, bs);
      ray.userData.update(t);
      placeHud(hudB, canvas, gfx.camera, leftPan.position.clone().add(new THREE.Vector3(0, 1.15, 0)));
      placeHud(hudA, canvas, gfx.camera, rightPan.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
      placeHud(hudE, canvas, gfx.camera, star.position.clone().add(new THREE.Vector3(0.5, 0.4, 0)));
      if (hudB) hudB.textContent = "before: heavier";
      if (hudA) hudA.textContent = "after: lighter";
      if (hudE) hudE.textContent = "missing mass → energy";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.balance = {
      snapshot: function () {
        return { beforeHeavier: true, afterLighter: true, missingBecomes: "energy" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  /* Example 27.5: an RTG. Output power follows the activity, so it falls
     exponentially with the 87.74-year half-life of Pu-238. */
  function rtg(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.5 });
    var hudP = host.querySelector('[data-hud="p"]');
    var hudT = host.querySelector('[data-hud="t"]');
    axes(gfx.scene, -5.2, -2.4, 5.4, 2.8);
    var HL = 87.74;
    var pts = [];
    var s;
    for (s = 0; s <= 60; s += 1) {
      var ty = s / 60 * 200;
      var pw = 300 * Math.pow(0.5, ty / HL);
      pts.push(new THREE.Vector3(-5.2 + ty * (10.2 / 200), -2.4 + pw * (4.8 / 320), 0));
    }
    curveLine(gfx.scene, pts, 0xc47a12);
    var marker = ball(0.14, 0xc47a12);
    gfx.scene.add(marker);
    var tYears = 0;
    function place(t) {
      tYears = t;
      var p = 300 * Math.pow(0.5, t / HL);
      var x = -5.2 + t * (10.2 / 200);
      var y = -2.4 + p * (4.8 / 320);
      marker.position.set(x, y, 0.2);
      placeHud(hudP, canvas, gfx.camera, marker.position.clone().add(new THREE.Vector3(0.2, 0.4, 0)));
      placeHud(hudT, canvas, gfx.camera, new THREE.Vector3(x, -2.7, 0));
      if (hudP) hudP.textContent = "P = " + p.toFixed(0) + " W";
      if (hudT) hudT.textContent = t.toFixed(0) + " y";
    }
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 12000) % 1;
      place(u * 200);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.rtg = {
      setT: function (t) { place(t); },
      snapshot: function () {
        var p = 300 * Math.pow(0.5, tYears / HL);
        return {
          tYears: tYears,
          powerW: p,
          startW: 300,
          halfLifeY: HL,
          fallsWithActivity: Math.abs(p - 300 * Math.pow(0.5, tYears / HL)) < 1e-9
        };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  var builders = {
    fission: fission,
    chain: chain,
    fusion: fusion,
    reactor: reactor,
    balance: balance,
    rtg: rtg
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
