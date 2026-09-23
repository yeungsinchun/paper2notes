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

  /* Drag-to-rotate only where the third dimension carries meaning (depth of a
     film under a hand, an angled target, a nucleon cluster). Flat, diagram-like
     scenes keep a fixed camera so nothing on the page invites fiddling. */
  var ORBIT_SCENES = { gammaknife: 1 };

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

  function hudXY(el) {
    return {
      x: el ? parseFloat(el.style.left) : null,
      y: el ? parseFloat(el.style.top) : null
    };
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

  function dice(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.6, halfH: 3.4 });
    gfx.camera.position.set(0.2, 8.2, 9.4);
    gfx.camera.lookAt(0, 0, 0);
    var hudLive = host.querySelector('[data-hud="live"]');
    var cells = [];
    var i;
    var j;
    for (i = 0; i < 10; i += 1) {
      for (j = 0; j < 10; j += 1) {
        var n = ball(0.22, 0xc47a12);
        n.position.set((j - 4.5) * 0.52, 0.22, (i - 4.5) * 0.52);
        gfx.scene.add(n);
        cells.push({ mesh: n, live: true });
      }
    }
    var tray = box(5.6, 0.12, 5.6, 0x1d4f91);
    tray.position.y = -0.08;
    gfx.scene.add(tray);
    var remaining = 100;
    var throwsDone = 0;
    var t0 = 0;
    var playing = false;

    function reset() {
      remaining = 100;
      throwsDone = 0;
      playing = true;
      t0 = performance.now();
      cells.forEach(function (c) {
        c.live = true;
        c.mesh.visible = true;
        c.mesh.material.color.setHex(0xc47a12);
        c.mesh.position.y = 0.22;
      });
    }

    function throwOnce() {
      if (throwsDone >= 8) {
        playing = false;
        return;
      }
      throwsDone += 1;
      cells.forEach(function (c) {
        if (!c.live) return;
        if (Math.random() < 1 / 6) {
          c.live = false;
          remaining -= 1;
          c.mesh.material.color.setHex(0x8aa39c);
          c.mesh.position.y = 0.08;
        }
      });
    }

    host.addEventListener("notes-replay", reset);
    reset();

    function frame(now) {
      if (playing && now - t0 > 700) {
        t0 = now;
        throwOnce();
      }
      placeHud(hudLive, canvas, gfx.camera, new THREE.Vector3(0, 2.6, -3.2));
      if (hudLive) hudLive.textContent = remaining + " undecayed";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.dice = {
      snapshot: function () {
        return {
          remaining: remaining,
          nTotal: 100,
          throwsDone: throwsDone,
          p: 1 / 6
        };
      },
      replay: reset,
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function halfN(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.5 });
    var hudN = host.querySelector('[data-hud="n"]');
    var hudT = host.querySelector('[data-hud="t"]');
    axes(gfx.scene, -5.2, -2.4, 5.4, 2.8);
    var pts = [];
    var s;
    for (s = 0; s <= 48; s += 1) {
      var t = s / 48 * 24;
      var n = 40 * Math.pow(0.5, t / 8);
      pts.push(new THREE.Vector3(-5.2 + t * (10.2 / 24), -2.4 + n * (4.8 / 40), 0));
    }
    curveLine(gfx.scene, pts, 0x1f7a45);
    var marker = ball(0.14, 0x0e5f56);
    gfx.scene.add(marker);
    var remain = box(0.7, 1, 0.7, 0xc47a12);
    var decayed = box(0.7, 1, 0.7, 0x8aa39c);
    gfx.scene.add(remain, decayed);
    var tDays = 0;
    function place(t) {
      tDays = t;
      var nLive = 40 * Math.pow(0.5, t / 8);
      var nDead = 40 - nLive;
      var x = -5.2 + t * (10.2 / 24);
      var y = -2.4 + nLive * (4.8 / 40);
      marker.position.set(x, y, 0.2);
      var liveH = Math.max(0.12, nLive * (4.4 / 40));
      var deadH = nDead * (4.4 / 40);
      remain.scale.set(1, liveH, 1);
      remain.position.set(x + 0.85, -2.4 + liveH / 2, 0);
      decayed.visible = nDead > 0;
      decayed.scale.set(1, deadH, 1);
      decayed.position.set(x + 0.85, -2.4 + liveH + deadH / 2, 0);
      placeHud(hudN, canvas, gfx.camera, marker.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
      placeHud(hudT, canvas, gfx.camera, new THREE.Vector3(x, -2.7, 0));
      if (hudN) hudN.textContent = "N = " + nLive.toFixed(1) + " billion";
      if (hudT) hudT.textContent = t.toFixed(0) + " d";
    }
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 9000) % 1;
      place(u * 24);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.halfN = {
      setT: function (t) { place(t); },
      snapshot: function () {
        var nLive = 40 * Math.pow(0.5, tDays / 8);
        return {
          tDays: tDays,
          remaining: nLive,
          decayed: 40 - nLive,
          total: 40,
          conserved: Math.abs(nLive + (40 - nLive) - 40) < 1e-9,
          deadVisible: decayed.visible,
          deadHeight: decayed.scale.y
        };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function activityN(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 34, x: 0.2, y: 4.8, z: 11, lookY: 0.2 }
    });
    var hudA = host.querySelector('[data-hud="a"]');
    var hudN = host.querySelector('[data-hud="n"]');
    var nuclei = [];
    var k;
    for (k = 0; k < 32; k += 1) {
      var b = ball(0.16, 0xc47a12);
      gfx.scene.add(b);
      nuclei.push(b);
    }
    var step = 0;
    var t0 = performance.now();
    function layout(live) {
      var i;
      for (i = 0; i < nuclei.length; i += 1) {
        var on = i < live;
        nuclei[i].visible = on;
        var col = i % 6;
        var row = Math.floor(i / 6);
        nuclei[i].position.set((col - 2.5) * 0.48, 0.2, (row - 2) * 0.48);
      }
    }
    function frame(now) {
      var u = ((now - t0) / 2600) % 3;
      step = Math.floor(u);
      var live = [32, 16, 8][step];
      var activity = [4000, 2000, 1000][step];
      layout(live);
      var anchor = new THREE.Vector3(0, 1.1, 0);
      placeHud(hudA, canvas, gfx.camera, anchor);
      placeHud(hudN, canvas, gfx.camera, new THREE.Vector3(0, -0.9, 1.4));
      if (hudA) hudA.textContent = "A = " + activity + " Bq";
      if (hudN) hudN.textContent = live + " undecayed (of 32 shown)";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.activityN = {
      snapshot: function () {
        var live = [32, 16, 8][step];
        var activity = [4000, 2000, 1000][step];
        return {
          nUndecayed: live,
          activityBq: activity,
          halved: activity * (32 / live) === 4000
        };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function activityA(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.5 });
    var hudA = host.querySelector('[data-hud="a"]');
    axes(gfx.scene, -5.2, -2.4, 5.4, 2.8);
    var pts = [];
    var s;
    for (s = 0; s <= 48; s += 1) {
      var t = s / 48 * 24;
      var a = 1000 * Math.pow(0.5, t / 8);
      pts.push(new THREE.Vector3(-5.2 + t * (10.2 / 24), -2.4 + a * (4.8 / 1000), 0));
    }
    curveLine(gfx.scene, pts, 0xc47a12);
    var marker = ball(0.14, 0xc47a12);
    gfx.scene.add(marker);
    var tDays = 0;
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 9000) % 1;
      tDays = u * 24;
      var a = 1000 * Math.pow(0.5, tDays / 8);
      var x = -5.2 + tDays * (10.2 / 24);
      var y = -2.4 + a * (4.8 / 1000);
      marker.position.set(x, y, 0.2);
      placeHud(hudA, canvas, gfx.camera, marker.position.clone().add(new THREE.Vector3(0.2, 0.35, 0)));
      if (hudA) hudA.textContent = "A = " + a.toFixed(0) + " Bq";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.activityA = {
      snapshot: function () {
        var a = 1000 * Math.pow(0.5, tDays / 8);
        return { tDays: tDays, activityBq: a, startBq: 1000 };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function countbg(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.4, halfH: 3.5 });
    var hudR = host.querySelector('[data-hud="rec"]');
    var hudB = host.querySelector('[data-hud="bg"]');
    axes(gfx.scene, -5.2, -2.4, 5.4, 2.8);
    var bgY = -2.4 + 40 * (4.8 / 840);
    var bgLine = box(10.2, 0.03, 0.03, 0x5b6573);
    bgLine.position.set(0.1, bgY, 0);
    gfx.scene.add(bgLine);
    var pts = [];
    var s;
    for (s = 0; s <= 60; s += 1) {
      var t = s / 60 * 80;
      var corr = 800 * Math.pow(0.5, t / 10);
      var rec = corr + 40;
      pts.push(new THREE.Vector3(-5.2 + t * (10.2 / 80), -2.4 + rec * (4.8 / 840), 0));
    }
    curveLine(gfx.scene, pts, 0x1f7a45);
    var marker = ball(0.12, 0x0e5f56);
    gfx.scene.add(marker);
    var tH = 0;
    var playing = false;
    var t0 = 0;
    function reset() {
      playing = true;
      t0 = performance.now();
      tH = 0;
    }
    host.addEventListener("notes-replay", reset);
    reset();
    function frame(now) {
      if (playing) {
        tH = Math.min(80, (now - t0) / 40);
        if (tH >= 80) playing = false;
      }
      var corr = 800 * Math.pow(0.5, tH / 10);
      var rec = corr + 40;
      var x = -5.2 + tH * (10.2 / 80);
      var y = -2.4 + rec * (4.8 / 840);
      marker.position.set(x, y, 0.2);
      placeHud(hudR, canvas, gfx.camera, marker.position.clone().add(new THREE.Vector3(0.15, 0.35, 0)));
      placeHud(hudB, canvas, gfx.camera, new THREE.Vector3(4.2, bgY, 0));
      if (hudR) hudR.textContent = "recorded " + rec.toFixed(0) + " min⁻¹";
      if (hudB) hudB.textContent = "background 40 min⁻¹";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.countbg = {
      snapshot: function () {
        var corr = 800 * Math.pow(0.5, tH / 10);
        return {
          background: 40,
          recorded: corr + 40,
          corrected: corr,
          tH: tH,
          floor: Math.abs((corr + 40) - 40) < 30 || tH > 40
        };
      },
      replay: reset
    };
  }

  function gammaknife(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 0.4, y: 2.4, z: 9.5, lookY: 0.3 }
    });
    var hudG = host.querySelector('[data-hud="gamma"]');
    var hudT = host.querySelector('[data-hud="target"]');
    var helmet = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.18, 12, 48, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2d3038, roughness: 0.4, metalness: 0.35 })
    );
    helmet.rotation.x = Math.PI / 2;
    helmet.position.y = 1.1;
    gfx.scene.add(helmet);
    var head = ball(0.85, 0xe0c09a);
    gfx.scene.add(head);
    var target = ball(0.22, 0xc0392b);
    target.position.set(0, 0.15, 0.1);
    gfx.scene.add(target);
    var rays = [];
    var i;
    for (i = 0; i < 9; i += 1) {
      var ang = lerp(-1.15, 1.15, i / 8);
      var origin = new THREE.Vector3(Math.sin(ang) * 2.0, 1.55, -Math.cos(ang) * 0.35);
      var dir = target.position.clone().sub(origin);
      rays.push(wavyArrow(gfx.scene, {
        origin: origin,
        dir: dir,
        length: dir.length() - 0.25,
        hex: 0xc9a227,
        amp: 0.05,
        waves: 2.2,
        phase: i * 0.4
      }));
    }
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      rays.forEach(function (r) { r.userData.update(t); });
      placeHud(hudG, canvas, gfx.camera, new THREE.Vector3(0, 2.15, 0));
      placeHud(hudT, canvas, gfx.camera, target.position.clone().add(new THREE.Vector3(0.4, 0.2, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.gammaknife = {
      snapshot: function () {
        return { nRays: rays.length, longLived: true, source: "gamma" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function pipeline(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 30, x: 3.4, y: 3.8, z: 9.2, lookX: 0.2, lookY: 0.2 }
    });
    var hudC = host.querySelector('[data-hud="count"]');
    var hudL = host.querySelector('[data-hud="leak"]');
    var soil = box(8.4, 0.18, 3.2, 0x8d6e3f);
    soil.position.y = -0.4;
    var pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 7.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x6b7380, metalness: 0.4, roughness: 0.35 })
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, -0.05, 0);
    var leak = ball(0.22, 0xc9a227);
    leak.position.set(1.1, 0.35, 0.15);
    var det = box(0.5, 0.7, 0.5, 0x0e5f56);
    det.position.set(1.1, 1.55, 0.9);
    gfx.scene.add(soil, pipe, leak, det);
    var ray = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(1.1, 0.5, 0.15),
      dir: new THREE.Vector3(0, 1, 0.4),
      length: 1.1,
      hex: 0xc9a227,
      amp: 0.06
    });
    var leaking = true;
    function setLeak(on) {
      leaking = !!on;
      leak.visible = leaking;
      ray.visible = leaking;
    }
    setLeak(true);
    var t0 = performance.now();
    function frame(now) {
      ray.userData.update((now - t0) / 1000);
      var count = leaking ? 420 : 55;
      placeHud(hudC, canvas, gfx.camera, det.position.clone().add(new THREE.Vector3(0.6, 0.2, 0)));
      placeHud(hudL, canvas, gfx.camera, leak.position.clone().add(new THREE.Vector3(0.45, 0.1, 0)));
      if (hudC) hudC.textContent = count + " min⁻¹";
      if (hudL) hudL.textContent = leaking ? "γ leak" : "no leak";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.pipeline = {
      setLeak: setLeak,
      snapshot: function () {
        return { leak: leaking, count: leaking ? 420 : 55, kind: "gamma" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function thickness(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 30, x: 0.2, y: 2.2, z: 8.8, lookY: 0.4 }
    });
    var hudC = host.querySelector('[data-hud="count"]');
    var source = box(0.55, 0.7, 0.55, 0xc47a12);
    source.position.set(-2.2, 0.6, 0);
    var det = box(0.55, 0.7, 0.55, 0x0e5f56);
    det.position.set(2.2, 0.6, 0);
    var sheet = box(0.18, 1.6, 2.2, 0xc5ccd4);
    sheet.position.set(0, 0.7, 0);
    gfx.scene.add(source, det, sheet);
    var rays = [];
    var i;
    for (i = 0; i < 5; i += 1) {
      rays.push(wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(-1.8, 0.35 + i * 0.18, 0),
        dir: new THREE.Vector3(1, 0, 0),
        length: 3.5,
        hex: 0x1d4f91,
        amp: 0.04,
        waves: 2.4,
        phase: i
      }));
    }
    var thick = 1;
    function setThick(s) {
      thick = s;
      sheet.scale.set(1 + (s - 1) * 1.8, 1, 1);
    }
    setThick(1);
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      rays.forEach(function (r, idx) {
        r.visible = idx < Math.max(1, 6 - Math.round(thick * 2));
        r.userData.update(t);
      });
      var count = Math.round(900 / thick);
      placeHud(hudC, canvas, gfx.camera, det.position.clone().add(new THREE.Vector3(0.55, 0.25, 0)));
      if (hudC) hudC.textContent = count + " min⁻¹";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.thickness = {
      setThick: setThick,
      snapshot: function () {
        return { thick: thick, count: Math.round(900 / thick), kind: "beta" };
      },
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function smoke(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.8, halfH: 3.2 });
    var hudI = host.querySelector('[data-hud="i"]');
    var hudA = host.querySelector('[data-hud="alarm"]');
    var chamber = box(4.6, 2.4, 0.2, 0xd7cbb6);
    chamber.position.z = -0.4;
    var src = ball(0.18, 0xc0392b);
    src.position.set(-0.2, -0.2, 0);
    var plus = box(0.12, 2.0, 0.12, 0x2d3038);
    plus.position.set(-1.7, 0, 0);
    var minus = box(0.12, 2.0, 0.12, 0x2d3038);
    minus.position.set(1.7, 0, 0);
    gfx.scene.add(chamber, src, plus, minus);
    var ion = ball(0.11, 0xd35400);
    var elec = ball(0.09, 0x2a62a8);
    gfx.scene.add(ion, elec);
    var smokes = [];
    var k;
    for (k = 0; k < 8; k += 1) {
      var p = ball(0.13, 0x6b7380);
      p.visible = false;
      gfx.scene.add(p);
      smokes.push(p);
    }
    var fire = false;
    function setFire(on) {
      fire = !!on;
      smokes.forEach(function (p, idx) {
        p.visible = fire;
        p.position.set((idx % 4) * 0.45 - 0.7, (idx < 4 ? 0.55 : -0.55), 0.2);
      });
    }
    setFire(false);
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 900) % 1;
      if (fire) {
        ion.position.set(0.1, 0.05, 0);
        elec.position.set(-0.1, -0.05, 0);
      } else {
        ion.position.set(lerp(-0.2, 1.55, u), lerp(-0.2, 0.4, u), 0);
        elec.position.set(lerp(-0.2, -1.55, u), lerp(-0.2, -0.35, u), 0);
      }
      placeHud(hudI, canvas, gfx.camera, new THREE.Vector3(0, 1.35, 0));
      placeHud(hudA, canvas, gfx.camera, new THREE.Vector3(2.4, 1.15, 0));
      if (hudI) hudI.textContent = fire ? "current drops" : "current flows";
      if (hudA) hudA.textContent = fire ? "alarm on" : "alarm off";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.smoke = {
      setFire: setFire,
      snapshot: function () {
        return { fire: fire, alarm: fire, currentOn: !fire, source: "alpha" };
      }
    };
  }

  function dating(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.6, halfH: 3.2 });
    var hudA = host.querySelector('[data-hud="a"]');
    var samples = [];
    var labels = ["alive", "just dead", "1 half-life", "2 half-lives"];
    var fracs = [1, 1, 0.5, 0.25];
    var i;
    for (i = 0; i < 4; i += 1) {
      var body = box(0.9, 1.6, 0.7, 0xe0c09a);
      body.position.set(-4.2 + i * 2.7, -0.2, 0);
      var live = box(0.7, 1.2, 0.5, 0xc47a12);
      live.position.copy(body.position);
      gfx.scene.add(body, live);
      samples.push({ body: body, live: live, frac: fracs[i], label: labels[i] });
    }
    var sel = 0;
    function setAge(iSel) {
      sel = iSel;
    }
    function frame() {
      samples.forEach(function (s, idx) {
        var h = 0.25 + s.frac * 1.1;
        s.live.scale.set(1, h / 1.2, 1);
        s.live.position.y = -0.2 - 0.55 + h / 2;
        s.live.material.emissive = new THREE.Color(idx === sel ? 0x3a2a10 : 0x000000);
        s.live.material.emissiveIntensity = idx === sel ? 0.25 : 0;
      });
      var a = samples[sel];
      placeHud(hudA, canvas, gfx.camera, a.body.position.clone().add(new THREE.Vector3(0, 1.25, 0)));
      if (hudA) hudA.textContent = a.label + " · A = " + a.frac.toFixed(2) + " A₀";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.dating = {
      setAge: setAge,
      snapshot: function () {
        return {
          sel: sel,
          frac: samples[sel].frac,
          aliveEqualsJustDead: samples[0].frac === samples[1].frac
        };
      }
    };
  }

  function sterile(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 30, x: 2.8, y: 3.2, z: 8.4, lookY: 0.3 }
    });
    var hud = host.querySelector('[data-hud="food"]');
    var belt = box(6.4, 0.12, 1.6, 0x6b7380);
    var box1 = box(1.1, 0.9, 0.9, 0xc47a12);
    box1.position.set(-1.6, 0.55, 0);
    var src = box(0.5, 0.4, 0.5, 0xc9a227);
    src.position.set(-1.6, 2.0, 0);
    gfx.scene.add(belt, box1, src);
    var ray = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(-1.6, 1.75, 0),
      dir: new THREE.Vector3(0, -1, 0),
      length: 0.85,
      hex: 0xc9a227,
      amp: 0.05
    });
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 4000) % 1;
      box1.position.x = lerp(-2.6, 2.4, u);
      src.position.x = -1.6;
      ray.visible = Math.abs(box1.position.x + 1.6) < 0.7;
      ray.userData.update((now - t0) / 1000);
      placeHud(hud, canvas, gfx.camera, box1.position.clone().add(new THREE.Vector3(0, 0.7, 0)));
      if (hud) hud.textContent = "packaged food · not radioactive";
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.sterile = {
      snapshot: function () {
        return { activatesFood: false, kind: "gamma" };
      }
    };
  }

  function dose(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 0.6, y: 2.6, z: 9, lookY: 0.5 }
    });
    var hudA = host.querySelector('[data-hud="act"]');
    var hudD = host.querySelector('[data-hud="dose"]');
    var src = box(0.8, 0.8, 0.8, 0xc47a12);
    src.position.set(-2.6, 0.7, 0);
    var body = box(1.3, 2.4, 0.7, 0xe0c09a);
    body.position.set(1.6, 0.5, 0);
    gfx.scene.add(src, body);
    var rays = [];
    var i;
    for (i = 0; i < 4; i += 1) {
      rays.push(wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(-2.1, 0.4 + i * 0.22, 0),
        dir: new THREE.Vector3(1, 0.05 * (i - 1.5), 0),
        length: 3.0,
        hex: 0xc9a227,
        amp: 0.05,
        phase: i * 0.5
      }));
    }
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      rays.forEach(function (r) { r.userData.update(t); });
      placeHud(hudA, canvas, gfx.camera, src.position.clone().add(new THREE.Vector3(0, 0.7, 0)));
      placeHud(hudD, canvas, gfx.camera, body.position.clone().add(new THREE.Vector3(0.2, 1.4, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.dose = {
      snapshot: function () {
        return {
          activityLabel: hudA ? hudA.textContent : "",
          doseLabel: hudD ? hudD.textContent : ""
        };
      }
    };
  }

  var builders = {
    dice: dice,
    halfN: halfN,
    activityN: activityN,
    activityA: activityA,
    countbg: countbg,
    gammaknife: gammaknife,
    pipeline: pipeline,
    thickness: thickness,
    smoke: smoke,
    dating: dating,
    sterile: sterile,
    dose: dose
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
