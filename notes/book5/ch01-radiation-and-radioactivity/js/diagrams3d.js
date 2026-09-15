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
  var ORBIT_SCENES = { imaging: 1, tube: 1, atom: 1, nuclide: 1, hydrogen: 1, "decay-a": 1, "decay-b": 1, "decay-g": 1, sealed: 1, bfield: 1 };

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

  function pointInPoly(x, y, pts) {
    var inside = false;
    var i;
    var j;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      var xi = pts[i].x;
      var yi = pts[i].y;
      var xj = pts[j].x;
      var yj = pts[j].y;
      var crosses = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function arrowMesh(hex) {
    var group = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.32,
      metalness: 0.12,
      emissive: hex,
      emissiveIntensity: 0.16
    });
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1, 10), mat);
    var head = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.18, 10), mat.clone());
    group.add(shaft, head);
    group.userData.shaft = shaft;
    group.userData.head = head;
    return group;
  }

  function setArrowVec(group, origin, vec) {
    var len = vec.length();
    if (len < 0.045) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
    var shaftLen = Math.max(0.05, len - 0.16);
    group.userData.shaft.scale.set(1, shaftLen, 1);
    group.userData.shaft.position.y = shaftLen / 2;
    group.userData.head.position.y = shaftLen + 0.09;
  }

  function wavyArrow(scene, opts) {
    var origin = opts.origin;
    var dir = opts.dir.clone().normalize();
    var length = opts.length || 1.35;
    var amp = opts.amp != null ? opts.amp : 0.12;
    var waves = opts.waves || 3.1;
    var radius = opts.radius || 0.032;
    var n = opts.n || 36;
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
    var mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.92
    });
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
    group.userData.dir = dir;
    group.userData.origin = origin.clone();
    group.userData.tip = pts[n].clone();
    group.userData.axisEnd = origin.clone().addScaledVector(dir, length);
    group.userData.length = length;
    group.userData.mid = pts[Math.floor(n / 2)].clone();
    group.userData.update = function (t) {
      mat.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 4 + (opts.phase || 0)));
    };
    return group;
  }

  function maxSpreadDeg(dirs) {
    var max = 0;
    var i;
    var j;
    for (i = 0; i < dirs.length; i += 1) {
      for (j = i + 1; j < dirs.length; j += 1) {
        var a = dirs[i].clone().normalize().angleTo(dirs[j].clone().normalize()) * 180 / Math.PI;
        if (a > max) max = a;
      }
    }
    return max;
  }

  function emTrain(scene, opts) {
    var n = opts.n || 18;
    var origin = opts.origin;
    var dir = opts.dir.clone().normalize();
    var eHat = opts.eHat.clone().normalize();
    var bHat = opts.bHat.clone().normalize();
    var length = opts.length;
    var eArrows = [];
    var bArrows = [];
    var i;
    for (i = 0; i < n; i += 1) {
      var eA = arrowMesh(0xc0392b);
      var bA = arrowMesh(0x1d4f91);
      scene.add(eA, bA);
      eArrows.push(eA);
      bArrows.push(bA);
    }
    var eLinePos = new Float32Array(n * 3);
    var bLinePos = new Float32Array(n * 3);
    var eLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(eLinePos, 3)),
      new THREE.LineBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.5 })
    );
    var bLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(bLinePos, 3)),
      new THREE.LineBasicMaterial({ color: 0x1d4f91, transparent: true, opacity: 0.5 })
    );
    scene.add(eLine, bLine);
    var axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, length, 8),
      new THREE.MeshBasicMaterial({ color: 0x4a5560 })
    );
    axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    axis.position.copy(origin).addScaledVector(dir, length / 2);
    scene.add(axis);
    var kHat = dir.clone();

    function sample(s, t) {
      var phase = opts.k * s - opts.omega * t;
      var env = opts.envelope ? opts.envelope(s, t) : 1;
      var e = opts.eAmp * env * Math.sin(phase);
      var b = opts.bAmp * env * Math.sin(phase);
      var p = origin.clone().addScaledVector(dir, s);
      return {
        p: p,
        eVec: eHat.clone().multiplyScalar(e),
        bVec: bHat.clone().multiplyScalar(b),
        e: e,
        b: b,
        phase: phase
      };
    }

    function update(t) {
      for (i = 0; i < n; i += 1) {
        var s = (i / Math.max(n - 1, 1)) * length;
        var sm = sample(s, t);
        setArrowVec(eArrows[i], sm.p, sm.eVec);
        setArrowVec(bArrows[i], sm.p, sm.bVec);
        var eTip = sm.p.clone().add(sm.eVec);
        var bTip = sm.p.clone().add(sm.bVec);
        eLinePos[i * 3] = eTip.x;
        eLinePos[i * 3 + 1] = eTip.y;
        eLinePos[i * 3 + 2] = eTip.z;
        bLinePos[i * 3] = bTip.x;
        bLinePos[i * 3 + 1] = bTip.y;
        bLinePos[i * 3 + 2] = bTip.z;
      }
      eLine.geometry.attributes.position.needsUpdate = true;
      bLine.geometry.attributes.position.needsUpdate = true;
    }

    return {
      update: update,
      sample: sample,
      n: n,
      length: length,
      dir: kHat,
      eHat: eHat,
      bHat: bHat,
      k: opts.k,
      omega: opts.omega,
      origin: origin
    };
  }

  function sceneHasEmTrain(scene) {
    var lineCount = 0;
    var arrowCount = 0;
    scene.traverse(function (obj) {
      if (obj.isLine) {
        lineCount += 1;
        return;
      }
      if (!obj.isGroup) return;
      var hasCyl = false;
      var hasCone = false;
      var hasTube = false;
      var i;
      for (i = 0; i < obj.children.length; i += 1) {
        var geo = obj.children[i].geometry;
        if (!geo) continue;
        var t = geo.type;
        if (t === "CylinderGeometry" || t === "CylinderBufferGeometry") hasCyl = true;
        if (t === "ConeGeometry" || t === "ConeBufferGeometry") hasCone = true;
        if (t === "TubeGeometry" || t === "TubeBufferGeometry") hasTube = true;
      }
      if (hasCyl && hasCone && !hasTube) arrowCount += 1;
    });
    return lineCount >= 2 || arrowCount >= 6;
  }

  function geoKind(obj, kind) {
    if (!obj || !obj.geometry) return false;
    var t = obj.geometry.type;
    return t === kind + "Geometry" || t === kind + "BufferGeometry";
  }

  function meshWorldBox(mesh) {
    mesh.updateWorldMatrix(true, false);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  }

  function pointInMesh(mesh, point) {
    var local = mesh.worldToLocal(point.clone());
    var geo = mesh.geometry;
    var p = geo.parameters || {};
    if (geoKind(mesh, "Sphere")) {
      return local.length() <= (p.radius || 1) * 1.02;
    }
    if (geoKind(mesh, "Cylinder")) {
      var h = p.height || 1;
      if (local.y < -h / 2 || local.y > h / 2) return false;
      var u = (local.y + h / 2) / h;
      var r = (p.radiusBottom || 1) + ((p.radiusTop || 1) - (p.radiusBottom || 1)) * u;
      return Math.hypot(local.x, local.z) <= r * 1.02;
    }
    if (!geo.boundingBox) geo.computeBoundingBox();
    return geo.boundingBox.containsPoint(local);
  }

  function imagingFromScene(scene, filmY) {
    var flesh = [];
    var bone = [];
    var slabs = 0;
    var glyphs = [];
    var hands = 0;
    var films = 0;
    scene.traverse(function (obj) {
      if (obj.isGroup && obj.userData && obj.userData.dir && obj.userData.tip) {
        glyphs.push(obj);
      }
      if (!obj.isMesh) return;
      if (geoKind(obj, "Plane")) {
        var y = obj.getWorldPosition(new THREE.Vector3()).y;
        if (Math.abs(y - filmY) < 0.35) films += 1;
      }
      if (geoKind(obj, "Box")) {
        var hy = obj.geometry.parameters
          ? obj.geometry.parameters.height * Math.abs(obj.scale.y)
          : 0;
        if (hy > 0.35) slabs += 1;
      }
      var mat = obj.material;
      if (!mat) return;
      if (mat.transparent && mat.opacity < 0.85 && (geoKind(obj, "Cylinder") || geoKind(obj, "Sphere"))) {
        flesh.push(obj);
      } else if (!mat.transparent && geoKind(obj, "Cylinder")) {
        bone.push(obj);
      }
    });
    scene.children.forEach(function (obj) {
      if (!obj.isGroup || (obj.userData && obj.userData.dir)) return;
      var hasFlesh = false;
      var hasBone = false;
      obj.traverse(function (child) {
        if (flesh.indexOf(child) !== -1) hasFlesh = true;
        if (bone.indexOf(child) !== -1) hasBone = true;
      });
      if (hasFlesh && hasBone) hands += 1;
    });
    var down = glyphs.length > 0;
    var stopInFlesh = 0;
    var stopInBone = 0;
    var throughFlesh = 0;
    glyphs.forEach(function (g) {
      var dir = g.userData.dir;
      var origin = g.userData.origin;
      var end = g.userData.axisEnd || g.userData.tip;
      if (!dir || dir.y > -0.7) down = false;
      if (!end || !origin) return;
      if (end.y < filmY + 0.25) {
        var s;
        for (s = 0.08; s <= 0.72; s += 0.04) {
          var p = origin.clone().lerp(end, s);
          if (bone.some(function (m) { return pointInMesh(m, p); })) break;
          if (flesh.some(function (m) { return pointInMesh(m, p); })) {
            throughFlesh += 1;
            break;
          }
        }
        return;
      }
      var inBone = bone.some(function (m) { return pointInMesh(m, end); });
      if (inBone) {
        stopInBone += 1;
        return;
      }
      var i;
      for (i = 0; i < flesh.length; i += 1) {
        if (!pointInMesh(flesh[i], end)) continue;
        if (end.y <= meshWorldBox(flesh[i]).max.y - 0.1) {
          stopInFlesh += 1;
          break;
        }
      }
    });
    return {
      oneHand: hands === 1,
      twoSlabs: slabs >= 2,
      filmCount: films,
      raysDown: down,
      stopInFlesh: stopInFlesh,
      stopInBone: stopInBone,
      throughFlesh: throughFlesh
    };
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

  function knockout(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var hudAtom = host.querySelector('[data-hud="atom"]');
    var hudElectron = host.querySelector('[data-hud="electron"]');
    var hudRay = host.querySelector('[data-hud="ray"]');
    var gfx = stage(canvas, { halfW: 4.4, halfH: 2.35 });
    gfx.camera.position.set(0.35, 0.55, 12);
    gfx.camera.lookAt(0, 0, 0);
    var SHELL_R = 0.72;
    var HIT_T = 0.85;
    var FLY_T = 1.15;
    var aPos = new THREE.Vector3(-0.35, 0.15, 0);
    var start = aPos.clone().add(new THREE.Vector3(-SHELL_R, 0, 0));
    var end = new THREE.Vector3(3.15, -1.15, 0.15);
    var core = ball(0.24, 0xe0a04a);
    var shell = ring(SHELL_R, 0x9bb6c4);
    var atom = new THREE.Group();
    atom.add(core, shell);
    atom.position.copy(aPos);
    var electron = ball(0.12, 0x2a62a8);
    var minusMark = signDecal("−", "#ffffff");
    minusMark.position.set(0, 0, 0.14);
    electron.add(minusMark);
    var plusMark = signDecal("+", "#ffffff");
    plusMark.visible = false;
    plusMark.position.set(0, 0, 0.26);
    atom.add(plusMark);
    var ray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1, 10),
      new THREE.MeshBasicMaterial({ color: 0xc9a227 })
    );
    ray.rotation.z = Math.PI / 2;
    gfx.scene.add(atom, electron, ray);
    var state = {
      x: start.x, y: start.y, nx: aPos.x, ny: aPos.y,
      opacity: 1, hex: "#e0a04a", label: "atom"
    };
    var t0 = performance.now();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function apply(t) {
      var fly = smoothstep((t - HIT_T) / FLY_T);
      var hit = smoothstep(t / HIT_T);
      electron.position.lerpVectors(start, end, fly);
      electron.material.opacity = 1;
      state.x = electron.position.x;
      state.y = electron.position.y;
      var ionized = fly > 0.02;
      state.hex = ionized ? "#c0392b" : "#e0a04a";
      state.label = ionized ? "positive ion" : "atom";
      core.material.color.set(state.hex);
      plusMark.visible = ionized;
      var rayLen = lerp(0.25, start.x + 4.9, hit);
      ray.scale.set(1, Math.max(rayLen, 0.05), 1);
      ray.position.set(-4.9 + rayLen / 2, aPos.y, 0);
      if (hudAtom) hudAtom.textContent = state.label;
      if (hudElectron) hudElectron.textContent = "electron";
      placeHud(hudAtom, canvas, gfx.camera, aPos.clone().add(new THREE.Vector3(0, -1.05, 0)));
      placeHud(hudElectron, canvas, gfx.camera, electron.position.clone().add(new THREE.Vector3(0.15, -0.35, 0)));
      placeHud(hudRay, canvas, gfx.camera, new THREE.Vector3(-2.55, aPos.y + 0.55, 0));
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
      gfx.renderer.render(gfx.scene, gfx.camera);
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

  function beamsEm(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 0.15, y: 2.55, z: 8.2, lookX: 0, lookY: 0.1, lookZ: 0 }
    });
    var hudWave = host.querySelector('[data-hud="wave"]');
    var hudE = host.querySelector('[data-hud="e"]');
    var hudB = host.querySelector('[data-hud="b"]');
    var origin = new THREE.Vector3(-2.2, 0, 0);
    var dir = new THREE.Vector3(1, 0, 0);
    var eHat = new THREE.Vector3(0, 1, 0);
    var bHat = new THREE.Vector3(0, 0, 1);
    var length = 4.4;
    var train = emTrain(gfx.scene, {
      origin: origin,
      dir: dir,
      eHat: eHat,
      bHat: bHat,
      length: length,
      n: 20,
      eAmp: 1.22,
      bAmp: 0.92,
      k: 2.55,
      omega: 3.1
    });
    var waveAnchor = new THREE.Vector3(0, 1.55, 0);
    var eFieldAnchor = new THREE.Vector3(-0.4, 1.35, 0);
    var bFieldAnchor = new THREE.Vector3(-0.4, 0.12, 1.05);
    var t0 = performance.now();
    var lastT = 0;
    function restart() { t0 = performance.now(); }
    function frame(now) {
      var t = (now - t0) / 1000;
      lastT = t;
      train.update(t);
      var mid = train.sample(length * 0.42, t);
      eFieldAnchor.copy(mid.p).add(mid.eVec).add(new THREE.Vector3(0.12, 0.18, 0));
      bFieldAnchor.copy(mid.p).add(mid.bVec).add(new THREE.Vector3(0.12, 0.08, 0.12));
      waveAnchor.copy(origin).addScaledVector(dir, length * 0.5).add(new THREE.Vector3(0, 1.55, 0));
      placeHud(hudWave, canvas, gfx.camera, waveAnchor);
      placeHud(hudE, canvas, gfx.camera, eFieldAnchor);
      placeHud(hudB, canvas, gfx.camera, bFieldAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      gfx.camera.updateMatrixWorld();
      placeHud(hudWave, canvas, gfx.camera, waveAnchor);
      placeHud(hudE, canvas, gfx.camera, eFieldAnchor);
      placeHud(hudB, canvas, gfx.camera, bFieldAnchor);
      var probeS = length * 0.4;
      var sm = train.sample(probeS, lastT);
      var eVec = sm.eVec;
      var bVec = sm.bVec;
      var kVec = train.dir;
      var cross = new THREE.Vector3().crossVectors(eVec, bVec);
      var crestPhase = Math.PI / 2;
      var crestX = origin.x + (crestPhase + train.omega * lastT) / train.k;
      var span = length;
      var wrapped = origin.x + ((crestX - origin.x) % span + span) % span;
      var eHud = hudXY(hudE);
      var bHud = hudXY(hudB);
      var waveHud = hudXY(hudWave);
      var eProj = projectXY(gfx.camera, canvas, eFieldAnchor);
      var bProj = projectXY(gfx.camera, canvas, bFieldAnchor);
      var waveProj = projectXY(gfx.camera, canvas, waveAnchor);
      return {
        eY: eVec.y,
        eX: eVec.x,
        eZ: eVec.z,
        bZ: bVec.z,
        bX: bVec.x,
        bY: bVec.y,
        eLen: eVec.length(),
        bLen: bVec.length(),
        dotEB: eVec.dot(bVec),
        eDotK: eVec.dot(kVec),
        bDotK: bVec.dot(kVec),
        poyntingX: cross.x,
        eAtProbe: sm.e,
        crestX: wrapped,
        probeX: sm.p.x,
        t: lastT,
        waveHud: waveHud.x,
        waveProj: waveProj.x,
        eHud: eHud.x,
        eProj: eProj.x,
        bHud: bHud.x,
        bProj: bProj.x,
        camX: gfx.camera.position.x,
        camY: gfx.camera.position.y,
        camZ: gfx.camera.position.z,
        camZoom: gfx.camera.zoom,
        camR: gfx.camera.position.distanceTo(gfx.look),
        waveLabel: hudWave ? hudWave.textContent.trim() : "",
        paneCount: document.querySelectorAll("#radiation canvas").length
      };
    }
    hostReplay(host, restart);
    train.update(0);
    requestAnimationFrame(frame);
    scenes["beams-em"] = {
      replay: restart,
      snapshot: snapshot,
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
  }

  function beamsE(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 0.2, y: 1.6, z: 7.4, lookX: 0, lookY: 0, lookZ: 0 }
    });
    var hudElectrons = host.querySelector('[data-hud="electrons"]');
    var electrons = [];
    var i;
    for (i = 0; i < 8; i += 1) {
      var e = ball(0.13, 0x2a62a8);
      electrons.push(e);
      gfx.scene.add(e);
    }
    var eTrack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 4.6, 8),
      new THREE.MeshBasicMaterial({ color: 0x8aa3ad })
    );
    eTrack.rotation.z = Math.PI / 2;
    eTrack.position.set(0, 0, 0);
    gfx.scene.add(eTrack);
    var eBeamAnchor = new THREE.Vector3(0, 0.7, 0);
    var t0 = performance.now();
    var lastT = 0;
    function restart() { t0 = performance.now(); }
    function frame(now) {
      var t = (now - t0) / 1000;
      lastT = t;
      electrons.forEach(function (mesh, idx) {
        var u = (t * 0.55 + idx * 0.125) % 1;
        mesh.position.set(lerp(-2.2, 2.2, u), 0, 0);
      });
      eBeamAnchor.set(0, 0.7, 0);
      placeHud(hudElectrons, canvas, gfx.camera, eBeamAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      gfx.camera.updateMatrixWorld();
      placeHud(hudElectrons, canvas, gfx.camera, eBeamAnchor);
      var hud = hudXY(hudElectrons);
      var proj = projectXY(gfx.camera, canvas, eBeamAnchor);
      return {
        n: electrons.length,
        xs: electrons.map(function (m) { return m.position.x; }),
        hudX: hud.x,
        projX: proj.x,
        camX: gfx.camera.position.x,
        camZ: gfx.camera.position.z,
        label: hudElectrons ? hudElectrons.textContent.trim() : "",
        t: lastT
      };
    }
    hostReplay(host, restart);
    requestAnimationFrame(frame);
    scenes["beams-e"] = {
      replay: restart,
      snapshot: snapshot,
      orbitBy: function (dx, dy) { gfx.orbit.nudge(dx, dy); }
    };
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
      var nucHud = projectXY(gfx.camera, canvas, nucleusAnchor);
      return {
        zoom: gfx.camera.zoom,
        nucleusPx: Math.abs(rim.x - origin.x) * 0.5 * w,
        nucleusHud: hudNucleus ? parseFloat(hudNucleus.style.left) : null,
        nucleusHudTop: hudNucleus ? parseFloat(hudNucleus.style.top) : null,
        nucleusProjX: nucHud.x,
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
    var targetAnchor = new THREE.Vector3(1.75, -0.25, 0);
    var xrayAnchor = new THREE.Vector3(-0.25, 1.85, 0);

    var glassMat = new THREE.MeshStandardMaterial({
      color: 0xc8dbe6,
      transparent: true,
      opacity: 0.13,
      roughness: 0.12,
      metalness: 0.08,
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
      new THREE.MeshStandardMaterial({ color: 0xcbb892, metalness: 0.72, roughness: 0.22 })
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
      new THREE.MeshBasicMaterial({ color: 0x8aa3ad, transparent: true, opacity: 0.22 })
    );
    gfx.scene.add(equator);
    target.updateMatrixWorld(true);
    var hit = new THREE.Vector3(-0.14, 0, 0).applyMatrix4(target.matrixWorld);
    var face = new THREE.Vector3(-1, 0, 0).transformDirection(target.matrixWorld).normalize();
    // Label the target from below-right, clear of the X-ray fan that leaves its face upward.
    targetAnchor.set(hit.x + 0.7, hit.y - 0.62, 0);
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
    var fanAxis = new THREE.Vector3(0, 0, 1);
    var fanDirs = [
      face.clone().applyAxisAngle(fanAxis, -0.72).add(new THREE.Vector3(0, 0, 0.18)).normalize(),
      face.clone().normalize(),
      face.clone().applyAxisAngle(fanAxis, 0.78).add(new THREE.Vector3(0, 0, -0.18)).normalize()
    ];
    var xrayGlyphs = fanDirs.map(function (raw, idx) {
      return wavyArrow(gfx.scene, {
        origin: hit.clone(),
        dir: raw,
        length: 1.82 - idx * 0.08,
        amp: 0.09,
        waves: 3.2,
        radius: 0.026,
        phase: idx * 0.85,
        hex: 0xd4a017
      });
    });
    // The fan spans from up-left to straight up, so the label sits in the free space up-right of it.
    xrayAnchor.set(hit.x + 0.7, hit.y + 1.05, 0);

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
      xrayGlyphs.forEach(function (g) { g.userData.update(t); });
      placeHud(hudGun, canvas, gfx.camera, gunAnchor);
      placeHud(hudElectrons, canvas, gfx.camera, electronAnchor);
      placeHud(hudTarget, canvas, gfx.camera, targetAnchor);
      placeHud(hudXrays, canvas, gfx.camera, xrayAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function projectX(world) {
      return projectXY(gfx.camera, canvas, world).x;
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
        rayDot: leave.lengthSq() ? face.dot(leave.clone().normalize()) : 0,
        nRays: xrayGlyphs.length,
        fanSpreadDeg: maxSpreadDeg(fanDirs),
        xrayAboveHit: xrayAnchor.y > hit.y + 0.15,
        originAtHit: xrayGlyphs.every(function (g) {
          return g.userData.origin.distanceTo(hit) < 0.04;
        }),
        hasEmTrain: sceneHasEmTrain(gfx.scene)
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
    return {
      place: function (parentWorld, ejectileWorld) {
        placeHud(parentHud, canvas, camera, parentWorld);
        placeHud(ejectileHud, canvas, camera, ejectileWorld);
      },
      snapshot: function (parentWorld, ejectileWorld) {
        var p = projectXY(camera, canvas, parentWorld);
        var e = projectXY(camera, canvas, ejectileWorld);
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
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 2.8, y: 2.2, z: 10.5, lookX: 0.2, lookY: 0.15, lookZ: 0 }
    });
    var parent = nucleonCluster(5, 6, 0.34);
    parent.position.set(-2.4, 0.1, 0);
    gfx.scene.add(parent);
    var glyph = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(-1.7, 0.2, 0),
      dir: new THREE.Vector3(1, 0.08, 0),
      length: 1.55,
      amp: 0.14,
      waves: 3.2,
      hex: 0xd4a017
    });
    var hud = decayHud(host, canvas, gfx.camera);
    var parentAnchor = parent.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    var t0 = performance.now();
    function ejectileAnchor() {
      return glyph.userData.mid.clone().add(glyph.position);
    }
    function restart() {
      t0 = performance.now();
      gfx.resize();
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      var u = smoothstep(t / 1.2);
      glyph.position.set(lerp(0, 3.6, u), 0, 0);
      glyph.userData.update(t);
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
      var minusP = projectXY(gfx.camera, canvas, minusAnchor);
      var plusP = projectXY(gfx.camera, canvas, plusAnchor);
      var minusNdc = minusAnchor.clone().project(gfx.camera);
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
        plusProjY: plusP.y,
        minusNdcX: minusNdc.x,
        minusNdcY: minusNdc.y
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
      apply(0);
    }
    function apply(t) {
      var fly = smoothstep(t / 1.05);
      electron.material.opacity = 1;
      electron.position.set(argonHome.x, lerp(argonHome.y, 0.08, fly), 0);
      argon.position.set(argonHome.x, lerp(argonHome.y, 0.98, fly), 0);
      argon.material.color.setHex(fly > 0.08 ? 0xd35400 : 0xe0a04a);
      placeHud(hudWin, canvas, gfx.camera, winAnchor);
      placeHud(hudWire, canvas, gfx.camera, wireAnchor);
      placeHud(hudCase, canvas, gfx.camera, caseAnchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
    }
    function frame(now) {
      var t = ((now - t0) / 1000) % 1.4;
      apply(t);
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

  function imaging(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    /* Landscape framing for the 2:1 canvas: camera on the wrist side, so the fingers
       point screen-right and the film's long edge runs across the canvas. */
    var gfx = stage(canvas, {
      persp: { fov: 34, x: -6.6, y: 4.78, z: 1.66, lookX: 0.1, lookY: -0.22, lookZ: 0.3 }
    });
    var hudX = host.querySelector('[data-hud="xrays"]');
    var hudBone = host.querySelector('[data-hud="bone"]');
    var hudFlesh = host.querySelector('[data-hud="flesh"]');
    var hudFilm = host.querySelector('[data-hud="film"]');
    gfx.scene.add(new THREE.HemisphereLight(0xfff3e6, 0x43362e, 0.4));
    var lift = new THREE.DirectionalLight(0xffffff, 0.42);
    lift.position.set(2.2, 8, 3.5);
    gfx.scene.add(lift);

    var filmW = 3.45;
    var filmD = 3.95;
    var filmY = -1.02;
    var filmX = 0.04;
    var filmZ = 0.12;
    /* The hand floats well above the film so its radiograph shows beside it from the
       3/4 camera instead of hiding directly underneath. */
    var handLift = 0.36;
    var startY = 1.7 + handLift;
    var yAxis = new THREE.Vector3(0, 1, 0);
    /* Transmitting rays cross metacarpal or finger flesh beside a bone, never an air gap. */
    var specs = [
      { x: 0.13, z: -0.32, absorb: false },
      { x: -0.38, z: -0.2, absorb: false },
      { x: 0.57, z: -0.34, absorb: false },
      { x: 0.14, z: 1.0, absorb: false },
      { x: -0.53, z: 0.82, absorb: false },
      { x: 0.03, z: -0.05, absorb: true, stopY: 0.53 + handLift },
      { x: -0.27, z: -0.11, absorb: true, stopY: 0.515 + handLift },
      { x: 0.31, z: -0.09, absorb: true, stopY: 0.515 + handLift },
      { x: 0.05, z: 0.7, absorb: true, stopY: 0.525 + handLift },
      { x: 0.57, z: -0.16, absorb: true, stopY: 0.485 + handLift }
    ];
    var PX = 512;
    var filmCanvas = document.createElement("canvas");
    filmCanvas.width = PX;
    filmCanvas.height = PX;
    var fctx = filmCanvas.getContext("2d");
    /* Flesh and bone are each drawn as one opaque mask, then composited once, so
       overlapping fingers and metacarpals do not stack into lighter patches. */
    var fleshMask = document.createElement("canvas");
    fleshMask.width = PX;
    fleshMask.height = PX;
    var boneMask = document.createElement("canvas");
    boneMask.width = PX;
    boneMask.height = PX;
    var filmTex = new THREE.CanvasTexture(filmCanvas);
    filmTex.anisotropy = 4;
    /* The film plane is rotated -90 deg about x, so its texture's top row (v = 1)
       lies at world -z and its left column at -x. Pixels are measured from the
       film's own centre so the shadow lands directly under the hand. */
    function xzToPx(x, z) {
      return {
        cx: (((x - filmX) / filmW) + 0.5) * PX,
        cy: (((z - filmZ) / filmD) + 0.5) * PX
      };
    }
    var segs = [];
    function paintCapsule(ctx, ax, az, bx, bz, radius, fill) {
      var a = xzToPx(ax, az);
      var b = xzToPx(bx, bz);
      ctx.strokeStyle = fill;
      ctx.lineWidth = Math.max(6, (radius / filmW) * PX * 2);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      ctx.stroke();
    }
    function paintMasks() {
      var mctx = fleshMask.getContext("2d");
      mctx.clearRect(0, 0, PX, PX);
      segs.forEach(function (seg) {
        paintCapsule(mctx, seg.a.x, seg.a.z, seg.b.x, seg.b.z, seg.rF, "#807468");
      });
      var bctx = boneMask.getContext("2d");
      bctx.clearRect(0, 0, PX, PX);
      segs.forEach(function (seg) {
        paintCapsule(bctx, seg.a.x, seg.a.z, seg.b.x, seg.b.z, seg.rB * 1.55, "rgba(236,230,218,0.5)");
      });
      segs.forEach(function (seg) {
        paintCapsule(bctx, seg.a.x, seg.a.z, seg.b.x, seg.b.z, seg.rB * 1.12, "#fbf8f0");
      });
    }
    function paintFilm(develop) {
      fctx.globalAlpha = 1;
      fctx.fillStyle = "#fffaf1";
      fctx.fillRect(0, 0, PX, PX);
      if (develop > 0) {
        /* Air: every X-ray reaches the film, so it blackens fully. */
        fctx.fillStyle = "rgba(14,12,11," + (0.94 * develop) + ")";
        fctx.fillRect(0, 0, PX, PX);
        /* Flesh: most X-rays get through, so only a little lighter than air. */
        fctx.globalAlpha = 0.5 * develop;
        fctx.drawImage(fleshMask, 0, 0);
        /* Bone: X-rays absorbed, so the film stays white there. */
        fctx.globalAlpha = 0.97 * develop;
        fctx.drawImage(boneMask, 0, 0);
        fctx.globalAlpha = 1;
      }
      filmTex.needsUpdate = true;
    }
    var cassette = new THREE.Mesh(
      new THREE.BoxGeometry(filmW + 0.32, 0.1, filmD + 0.32),
      new THREE.MeshStandardMaterial({ color: 0x4b5058, roughness: 0.65, metalness: 0.15 })
    );
    cassette.position.set(filmX, filmY - 0.08, filmZ);
    var film = new THREE.Mesh(
      new THREE.PlaneGeometry(filmW, filmD),
      new THREE.MeshStandardMaterial({
        map: filmTex,
        roughness: 0.6,
        metalness: 0.02,
        emissive: 0xffffff,
        emissiveMap: filmTex,
        emissiveIntensity: 0.28
      })
    );
    film.rotation.x = -Math.PI / 2;
    film.position.set(filmX, filmY, filmZ);
    gfx.scene.add(cassette, film);

    var fleshMat = new THREE.MeshStandardMaterial({
      color: 0xf3c7a8,
      roughness: 0.58,
      metalness: 0.0,
      emissive: 0x6b3a22,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.FrontSide
    });
    var boneMat = new THREE.MeshStandardMaterial({
      color: 0xfaf4e6,
      roughness: 0.38,
      metalness: 0.04,
      emissive: 0xfff5e0,
      emissiveIntensity: 0.38
    });
    var hand = new THREE.Group();
    hand.position.y = handLift;
    gfx.scene.add(hand);
    var nBone = 0;
    var nFlesh = 0;
    function vec(x, y, z) {
      return new THREE.Vector3(x, y, z);
    }
    function addSeg(from, to, fleshRadius, boneRadius) {
      var along = to.clone().sub(from);
      var length = along.length();
      if (length < 0.04) return;
      along.normalize();
      var mid = from.clone().add(to).multiplyScalar(0.5);
      var align = new THREE.Quaternion().setFromUnitVectors(yAxis, along);
      var flesh = new THREE.Mesh(new THREE.CylinderGeometry(fleshRadius * 0.9, fleshRadius, 1, 20), fleshMat);
      var bone = new THREE.Mesh(new THREE.CylinderGeometry(boneRadius * 0.88, boneRadius, 1, 14), boneMat);
      flesh.scale.set(1, length, 1);
      bone.scale.set(1, length * 0.93, 1);
      flesh.quaternion.copy(align);
      bone.quaternion.copy(align);
      flesh.position.copy(mid);
      bone.position.copy(mid);
      hand.add(flesh, bone);
      nFlesh += 1;
      nBone += 1;
      segs.push({ a: from.clone(), b: to.clone(), rF: fleshRadius, rB: boneRadius });
    }
    function addJoint(at, radius) {
      var joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), fleshMat);
      joint.position.copy(at);
      hand.add(joint);
      nFlesh += 1;
    }
    function finger(knuckle, heading, lengths, fleshRadius, boneRadius) {
      var along = heading.clone().normalize();
      var at = knuckle.clone();
      addJoint(at, fleshRadius * 1.08);
      lengths.forEach(function (length, i) {
        var next = at.clone().addScaledVector(along, length);
        next.y -= 0.018 * (i + 1);
        var shrink = 1 - i * 0.14;
        addSeg(at, next, fleshRadius * shrink, boneRadius * shrink);
        addJoint(next, fleshRadius * shrink * 0.9);
        at = next;
      });
    }
    /* No palm blob: the hand is its bones and the flesh around each one, so the
       metacarpals fan out from the wrist the way they do on a real radiograph. */
    addSeg(vec(0.2, 0.5, -1.18), vec(0.22, 0.52, -0.72), 0.17, 0.075);
    addSeg(vec(-0.06, 0.5, -1.18), vec(-0.08, 0.52, -0.72), 0.155, 0.068);
    addJoint(vec(0.08, 0.51, -0.72), 0.28);
    var mcp = {
      index: vec(-0.38, 0.52, 0.36),
      middle: vec(0.04, 0.54, 0.48),
      ring: vec(0.42, 0.52, 0.38),
      pinky: vec(0.76, 0.48, 0.2),
      thumb: vec(-0.68, 0.5, -0.16)
    };
    addSeg(vec(-0.16, 0.51, -0.58), mcp.index, 0.145, 0.058);
    addSeg(vec(0.02, 0.52, -0.58), mcp.middle, 0.155, 0.062);
    addSeg(vec(0.2, 0.51, -0.56), mcp.ring, 0.145, 0.056);
    addSeg(vec(0.38, 0.49, -0.52), mcp.pinky, 0.125, 0.05);
    addSeg(vec(-0.18, 0.5, -0.42), mcp.thumb, 0.15, 0.06);
    finger(mcp.index, vec(-0.16, -0.04, 1), [0.4, 0.25, 0.19], 0.125, 0.05);
    finger(mcp.middle, vec(0.03, -0.03, 1), [0.44, 0.28, 0.21], 0.135, 0.055);
    finger(mcp.ring, vec(0.16, -0.04, 1), [0.4, 0.25, 0.18], 0.125, 0.05);
    finger(mcp.pinky, vec(0.32, -0.05, 1), [0.32, 0.2, 0.15], 0.11, 0.044);
    finger(mcp.thumb, vec(-0.78, -0.04, 0.58), [0.36, 0.28], 0.14, 0.058);
    paintMasks();

    var rays = [];
    specs.forEach(function (sp, i) {
      var stopY = sp.absorb ? sp.stopY : filmY + 0.04;
      var glyph = wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(sp.x, startY, sp.z),
        dir: new THREE.Vector3(0, -1, 0),
        length: startY - stopY,
        amp: 0.09,
        waves: 3.4,
        radius: 0.028,
        hex: 0xd4a017,
        phase: i * 0.45,
        side: new THREE.Vector3(1, 0, 0)
      });
      sp.stopY = stopY;
      rays.push(glyph);
    });

    var t0 = performance.now();
    var lastT = 0;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function apply(sec) {
      lastT = sec;
      var develop = clamp01((sec - 0.12) / (reduced ? 0.25 : 1.05));
      paintFilm(develop);
      rays.forEach(function (g, i) {
        if (g.userData.update) g.userData.update(sec + i);
      });
      placeHud(hudX, canvas, gfx.camera, new THREE.Vector3(0.1, startY - 0.1, -0.85));
      placeHud(hudBone, canvas, gfx.camera, new THREE.Vector3(0.04, 0.92 + handLift, 0.48));
      placeHud(hudFlesh, canvas, gfx.camera, new THREE.Vector3(-0.22, 0.3 + handLift, -1.16));
      placeHud(hudFilm, canvas, gfx.camera, new THREE.Vector3(0.08, filmY - 0.02, 2.05));
    }
    function lumAt(x, z) {
      var p = xzToPx(x, z);
      var cx = Math.max(0, Math.min(511, Math.round(p.cx)));
      var cy = Math.max(0, Math.min(511, Math.round(p.cy)));
      var d = fctx.getImageData(cx, cy, 1, 1).data;
      return 0.3 * d[0] + 0.6 * d[1] + 0.1 * d[2];
    }
    function restart() { t0 = performance.now(); paintFilm(0); }
    function frame(now) {
      apply((now - t0) / 1000);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      var fleshSpec = specs.filter(function (s) { return !s.absorb; });
      var boneSpec = specs.filter(function (s) { return s.absorb; });
      var fleshLum = fleshSpec.reduce(function (a, s) { return a + lumAt(s.x, s.z); }, 0) / Math.max(1, fleshSpec.length);
      var boneLum = boneSpec.reduce(function (a, s) { return a + lumAt(s.x, s.z); }, 0) / Math.max(1, boneSpec.length);
      gfx.scene.updateMatrixWorld(true);
      var live = imagingFromScene(gfx.scene, filmY);
      var minNX = 1;
      var maxNX = -1;
      var minNY = 1;
      var maxNY = -1;
      function addNdc(world) {
        var v = world.clone().project(gfx.camera);
        if (v.x < minNX) minNX = v.x;
        if (v.x > maxNX) maxNX = v.x;
        if (v.y < minNY) minNY = v.y;
        if (v.y > maxNY) maxNY = v.y;
      }
      function addBoxCorners(box) {
        var ix;
        var iy;
        var iz;
        for (ix = 0; ix < 2; ix += 1) {
          for (iy = 0; iy < 2; iy += 1) {
            for (iz = 0; iz < 2; iz += 1) {
              addNdc(new THREE.Vector3(
                ix ? box.max.x : box.min.x,
                iy ? box.max.y : box.min.y,
                iz ? box.max.z : box.min.z
              ));
            }
          }
        }
      }
      hand.traverse(function (obj) {
        if (obj.isMesh) addNdc(obj.getWorldPosition(new THREE.Vector3()));
      });
      addNdc(new THREE.Vector3(0.15, startY, 0.3));
      addBoxCorners(meshWorldBox(film));
      addBoxCorners(meshWorldBox(cassette));
      return {
        oneHand: live.oneHand,
        twoSlabs: live.twoSlabs,
        filmCount: live.filmCount,
        filmUnder: filmY < 0,
        nBone: nBone,
        nFlesh: nFlesh,
        boneLum: boneLum,
        fleshLum: fleshLum,
        rayCount: rays.length,
        stopInBone: live.stopInBone,
        stopInFlesh: live.stopInFlesh,
        throughFlesh: live.throughFlesh,
        reachFilm: fleshSpec.length,
        raysDown: live.raysDown,
        fillX: (maxNX - minNX) / 2,
        fillY: (maxNY - minNY) / 2,
        fillMinX: minNX,
        fillMaxX: maxNX,
        fillMinY: minNY,
        fillMaxY: maxNY,
        clipped: minNX < -1.02 || maxNX > 1.02 || minNY < -1.02 || maxNY > 1.02,
        t: lastT
      };
    }
    hostReplay(host, restart);
    paintFilm(0);
    apply(0);
    requestAnimationFrame(frame);
    scenes.imaging = { replay: restart, snapshot: snapshot };
  }

  function pairBall(hex, sign) {
    var g = new THREE.Group();
    g.add(ball(0.11, hex));
    var d = signDecal(sign, "#ffffff");
    d.position.z = 0.12;
    g.add(d);
    return g;
  }

  function ionpower(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.8, halfH: 2.2 });
    gfx.camera.position.set(0.4, 0.8, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    function trail(y, hex, nPairs, spacing, wavy) {
      var line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 8.6, 8),
        new THREE.MeshBasicMaterial({ color: hex })
      );
      line.rotation.z = Math.PI / 2;
      line.position.set(0.3, y, 0);
      gfx.scene.add(line);
      var i;
      for (i = 0; i < nPairs; i += 1) {
        var x = -3.6 + i * spacing;
        var plus = pairBall(0xc0392b, "+");
        var minus = pairBall(0x2a62a8, "−");
        plus.position.set(x, y + 0.22, 0.05);
        minus.position.set(x + 0.18, y - 0.22, 0.05);
        gfx.scene.add(plus, minus);
      }
      if (wavy) {
        return wavyArrow(gfx.scene, {
          origin: new THREE.Vector3(-4.55, y, 0),
          dir: new THREE.Vector3(1, 0, 0),
          length: 1.35,
          amp: 0.13,
          waves: 3.4,
          hex: 0xd4a017
        });
      }
      return null;
    }
    var alpha = nucleonCluster(2, 2, 0.18);
    alpha.scale.setScalar(0.45);
    alpha.position.set(-4.55, 1.15, 0);
    var beta = ball(0.12, 0x1d4f91);
    beta.position.set(-4.55, 0.05, 0);
    gfx.scene.add(alpha, beta);
    trail(1.15, 0xc0392b, 12, 0.62, false);
    trail(0.05, 0x1d4f91, 4, 1.45, false);
    var gGlyph = trail(-1.1, 0xc9a227, 2, 2.4, true);
    var t0 = performance.now();
    function frame(now) {
      if (gGlyph) gGlyph.userData.update((now - t0) / 1000);
      placeHud(hudA, canvas, gfx.camera, new THREE.Vector3(-4.55, 1.55, 0));
      placeHud(hudB, canvas, gfx.camera, new THREE.Vector3(-4.55, 0.45, 0));
      placeHud(hudG, canvas, gfx.camera, new THREE.Vector3(-4.55, -0.7, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.ionpower = {};
  }

  function tracks(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 30, x: 0.2, y: 3.8, z: 8.5, lookX: 0, lookY: 0, lookZ: 0 }
    });
    gfx.scene.background = new THREE.Color(0x11150f);
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.12, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x1a2218, roughness: 0.85 })
    );
    box.position.y = -1.15;
    var glass = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 2.4, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x243028, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    gfx.scene.add(box, glass);
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    var kind = "alpha";
    var trails = [];
    function hudFor(name) {
      if (name === "alpha") return hudA;
      if (name === "beta") return hudB;
      return hudG;
    }
    function showKindHud(name) {
      [hudA, hudB, hudG].forEach(function (el) {
        if (el) el.style.display = el === hudFor(name) ? "" : "none";
      });
    }
    function kindAnchor() {
      if (kind === "alpha") {
        var a = trails[2] || trails[0];
        return a ? a.position.clone().add(new THREE.Vector3(0, 0.32, 0)) : new THREE.Vector3(0, 0.15, 0);
      }
      if (kind === "beta") {
        return new THREE.Vector3(0.15, 0.22, 0);
      }
      var sum = new THREE.Vector3();
      trails.forEach(function (m) { sum.add(m.position); });
      if (!trails.length) return new THREE.Vector3(0, 0.1, 0);
      return sum.multiplyScalar(1 / trails.length).add(new THREE.Vector3(0, 0.35, 0));
    }
    function clearTrails() {
      trails.forEach(function (m) { gfx.scene.remove(m); });
      trails = [];
    }
    function makeAlpha() {
      var i;
      for (i = 0; i < 5; i += 1) {
        var m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 1, 8),
          new THREE.MeshBasicMaterial({ color: 0xf4f0e4 })
        );
        m.rotation.z = Math.PI / 2;
        m.userData.y = -0.55 + i * 0.35;
        m.userData.max = 2.4 + (i % 3) * 0.45;
        gfx.scene.add(m);
        trails.push(m);
      }
    }
    function makeBeta() {
      var i;
      for (i = 0; i < 6; i += 1) {
        var pts = [];
        var s;
        var y = -0.7 + i * 0.28;
        for (s = 0; s <= 24; s += 1) {
          pts.push(new THREE.Vector3(-3.6 + s * 0.28, y + Math.sin(s * 0.7 + i) * 0.18, Math.sin(s * 0.4) * 0.12));
        }
        var m = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6, false),
          new THREE.MeshBasicMaterial({ color: 0xdfe7f2 })
        );
        gfx.scene.add(m);
        trails.push(m);
      }
    }
    function makeGamma() {
      var i;
      for (i = 0; i < 10; i += 1) {
        var d = ball(0.05, 0xf4f0e4);
        d.position.set(-3 + (i % 5) * 1.4, -0.6 + Math.floor(i / 5) * 0.7, (i % 3) * 0.2);
        gfx.scene.add(d);
        trails.push(d);
      }
    }
    function setKind(next) {
      kind = next === "beta" || next === "gamma" ? next : "alpha";
      clearTrails();
      if (kind === "alpha") makeAlpha();
      else if (kind === "beta") makeBeta();
      else makeGamma();
      showKindHud(kind);
    }
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      if (kind === "alpha") {
        trails.forEach(function (m, i) {
          var grow = ((t * 1.6 + i * 0.3) % (m.userData.max + 1.2));
          grow = Math.min(m.userData.max, grow);
          m.scale.set(1, Math.max(0.1, grow), 1);
          m.position.set(-3.5 + grow / 2, m.userData.y, 0);
        });
      } else if (kind === "gamma") {
        trails.forEach(function (m, i) {
          m.position.x = -3.2 + ((i * 1.1 + t * 0.8) % 6.8);
        });
      }
      placeHud(hudFor(kind), canvas, gfx.camera, kindAnchor());
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    function snapshot() {
      var hud = hudFor(kind);
      var proj = projectXY(gfx.camera, canvas, kindAnchor());
      return {
        kind: kind,
        label: hud ? hud.textContent.trim() : "",
        visible: hud ? hud.style.display !== "none" : false,
        hiddenOthers: [hudA, hudB, hudG].every(function (el) {
          return !el || el === hud || el.style.display === "none";
        }),
        hudX: hud ? parseFloat(hud.style.left) : null,
        hudY: hud ? parseFloat(hud.style.top) : null,
        projX: proj.x,
        projY: proj.y,
        canvasOffsetLeft: canvas.offsetLeft || 0,
        canvasOffsetTop: canvas.offsetTop || 0
      };
    }
    setKind("alpha");
    requestAnimationFrame(frame);
    scenes.tracks = { setKind: setKind, snapshot: snapshot };
  }

  function hydrogen(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 2.6, y: 2.2, z: 7.5, lookX: 0, lookY: 0.1, lookZ: 0 }
    });
    var hud = host.querySelector('[data-hud="iso"]');
    var shell = ring(1.35, 0x9bb6c4);
    var electron = ball(0.12, 0x2a62a8);
    var nucleus = new THREE.Group();
    gfx.scene.add(shell, electron, nucleus);
    var nNeutrons = 0;
    var angle = 0;
    function rebuild() {
      while (nucleus.children.length) nucleus.remove(nucleus.children[0]);
      nucleus.add(nucleonCluster(1, nNeutrons, 0.28));
    }
    function setN(n) {
      nNeutrons = n;
      rebuild();
      var names = ["¹H  protium  N = 0", "²H  deuterium  N = 1", "³H  tritium  N = 2"];
      if (hud) hud.textContent = names[nNeutrons] + "  ·  Z = 1";
      var cap = document.getElementById("iso-label");
      if (cap) cap.textContent = names[nNeutrons] + "  ·  Z = 1";
    }
    function frame() {
      angle += 0.02;
      electron.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
      placeHud(hud, canvas, gfx.camera, new THREE.Vector3(0, -1.7, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    rebuild();
    setN(0);
    requestAnimationFrame(frame);
    scenes.hydrogen = { setN: setN };
  }

  function nuclide(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 32, x: 3.1, y: 2.4, z: 8.2, lookX: 0.4, lookY: 0.1, lookZ: 0 }
    });
    var hud = host.querySelector('[data-hud="nuclide"]');
    var data = {
      H: { a: 1, z: 1, n: 0, e: 1, name: "H" },
      He: { a: 4, z: 2, n: 2, e: 2, name: "He" },
      Li: { a: 7, z: 3, n: 4, e: 3, name: "Li" },
      C: { a: 12, z: 6, n: 6, e: 6, name: "C" }
    };
    var cluster = new THREE.Group();
    var inner = ring(1.15, 0x9bb6c4);
    var outer = ring(1.95, 0x9bb6c4);
    outer.rotation.y = 0.45;
    var electrons = [];
    gfx.scene.add(cluster, inner, outer);
    var key = "C";
    var angle = 0;
    function setKey(next) {
      key = data[next] ? next : "C";
      var d = data[key];
      while (cluster.children.length) cluster.remove(cluster.children[0]);
      cluster.add(nucleonCluster(d.z, d.n, 0.26));
      electrons.forEach(function (e) { gfx.scene.remove(e); });
      electrons = [];
      var i;
      for (i = 0; i < d.e; i += 1) {
        var e = ball(0.1, 0x2a62a8);
        electrons.push(e);
        gfx.scene.add(e);
      }
      inner.visible = d.e > 0;
      outer.visible = d.e > 2;
      if (hud) hud.textContent = "ᴬ_Z " + d.name;
      var cap = document.getElementById("nuclide-counts");
      if (cap) {
        cap.innerHTML =
          '<span class="nuc"><span class="az"><span>' + d.a + "</span><span>" + d.z +
          "</span></span>" + d.name + "</span>   A = " + d.a +
          "   Z = " + d.z + "   N = " + d.n + "   electrons = " + d.e;
      }
    }
    function frame() {
      angle += 0.015;
      var d = data[key];
      electrons.forEach(function (e, i) {
        if (i < 2) {
          var a = angle + i * Math.PI;
          e.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
        } else {
          var a2 = -angle + (i - 2) * (Math.PI * 2 / Math.max(d.e - 2, 1));
          e.position.set(Math.cos(a2) * 1.95, 0.12 * Math.sin(a2 * 2), Math.sin(a2) * 1.95);
        }
      });
      placeHud(hud, canvas, gfx.camera, new THREE.Vector3(0, -2.05, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    setKey("C");
    requestAnimationFrame(frame);
    scenes.nuclide = { setKey: setKey };
  }

  function kinds(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 6.0, halfH: 2.15 });
    gfx.camera.position.set(0.3, 1.3, 12);
    gfx.camera.lookAt(0, 0.1, 0);
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    var hudX = host.querySelector('[data-hud="xray"]');
    var alpha = nucleonCluster(2, 2, 0.28);
    alpha.position.set(-4.3, 0.15, 0);
    var beta = ball(0.2, 0x2a62a8);
    beta.position.set(-1.45, 0.15, 0);
    var minus = signDecal("−", "#ffffff");
    minus.position.z = 0.22;
    beta.add(minus);
    gfx.scene.add(alpha, beta);
    var gGlyphs = [
      wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(0.35, 0.28, 0),
        dir: new THREE.Vector3(1, 0.12, 0),
        length: 1.55,
        amp: 0.12,
        waves: 3.2,
        phase: 0,
        hex: 0xd4a017
      }),
      wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(0.4, 0.02, 0),
        dir: new THREE.Vector3(1, -0.08, 0.08),
        length: 1.4,
        amp: 0.1,
        waves: 3.0,
        phase: 1.1,
        hex: 0xc9a227
      })
    ];
    var gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.55, 12), metal(0x333333));
    gun.rotation.z = Math.PI / 2;
    gun.position.set(3.55, 0.15, 0);
    var tgt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.4), metal(0x8a9098));
    tgt.rotation.z = -Math.PI / 4;
    tgt.position.set(4.55, 0.18, 0);
    gfx.scene.add(gun, tgt);
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      gGlyphs.forEach(function (g) { g.userData.update(t); });
      placeHud(hudA, canvas, gfx.camera, alpha.position.clone().add(new THREE.Vector3(0, -0.95, 0)));
      placeHud(hudB, canvas, gfx.camera, beta.position.clone().add(new THREE.Vector3(0, -0.95, 0)));
      placeHud(hudG, canvas, gfx.camera, new THREE.Vector3(1.4, -0.95, 0));
      placeHud(hudX, canvas, gfx.camera, new THREE.Vector3(4.05, -0.95, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.kinds = {};
  }

  function makexray(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.8, halfH: 2.15 });
    gfx.camera.position.set(0.2, 1.5, 12);
    gfx.camera.lookAt(0, 0.05, 0);
    var labels = ["A", "B", "C", "D"];
    var huds = labels.map(function (k) {
      return host.querySelector('[data-hud="' + k + '"]');
    });
    function sponge(x) {
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: 0.9 })
      );
      m.scale.set(1.15, 0.55, 0.8);
      m.position.set(x, -0.55, 0);
      gfx.scene.add(m);
      return m;
    }
    function metalBlock(x) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.55), metal(0x8a9098));
      m.position.set(x, -0.55, 0);
      gfx.scene.add(m);
      return m;
    }
    sponge(-4.15);
    metalBlock(-1.4);
    sponge(1.35);
    metalBlock(4.15);
    var uvA = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(-4.15, 1.15, 0),
      dir: new THREE.Vector3(0, -1, 0),
      length: 1.15,
      amp: 0.1,
      waves: 3.0,
      hex: 0x7e57c2
    });
    var uvB = wavyArrow(gfx.scene, {
      origin: new THREE.Vector3(-1.4, 1.15, 0),
      dir: new THREE.Vector3(0, -1, 0),
      length: 1.15,
      amp: 0.1,
      waves: 3.0,
      phase: 0.8,
      hex: 0x7e57c2
    });
    var eC = [];
    var eD = [];
    var i;
    for (i = 0; i < 5; i += 1) {
      var c = ball(0.09, 0x2a62a8);
      var d = ball(0.09, 0x2a62a8);
      eC.push(c);
      eD.push(d);
      gfx.scene.add(c, d);
    }
    var xrayOut = [
      wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(4.15, -0.28, 0),
        dir: new THREE.Vector3(0.15, 1, 0.12),
        length: 1.15,
        amp: 0.1,
        waves: 3.2,
        hex: 0xd4a017
      }),
      wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(4.15, -0.28, 0),
        dir: new THREE.Vector3(0.72, 0.7, 0),
        length: 1.05,
        amp: 0.09,
        waves: 3.0,
        phase: 1.2,
        hex: 0xd4a017
      }),
      wavyArrow(gfx.scene, {
        origin: new THREE.Vector3(4.15, -0.28, 0),
        dir: new THREE.Vector3(-0.45, 0.9, 0.2),
        length: 1.1,
        amp: 0.1,
        waves: 3.1,
        phase: 2.1,
        hex: 0xc9a227
      })
    ];
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      uvA.userData.update(t);
      uvB.userData.update(t);
      xrayOut.forEach(function (g) { g.userData.update(t); });
      eC.forEach(function (m, idx) {
        var u = (t * 0.7 + idx * 0.18) % 1;
        m.position.set(1.35, lerp(1.15, -0.2, u), 0);
      });
      eD.forEach(function (m, idx) {
        var u = (t * 0.7 + idx * 0.18) % 1;
        m.position.set(4.15, lerp(1.15, -0.2, u), 0);
      });
      placeHud(huds[0], canvas, gfx.camera, new THREE.Vector3(-4.15, 1.55, 0));
      placeHud(huds[1], canvas, gfx.camera, new THREE.Vector3(-1.4, 1.55, 0));
      placeHud(huds[2], canvas, gfx.camera, new THREE.Vector3(1.35, 1.55, 0));
      placeHud(huds[3], canvas, gfx.camera, new THREE.Vector3(4.15, 1.55, 0));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.makexray = {};
  }

  function pie(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, {
      persp: { fov: 28, x: 0.2, y: 4.6, z: 6.4, lookX: 0, lookY: 0.05, lookZ: 0 }
    });
    var hud20 = host.querySelector('[data-hud="art"]');
    var slices = [
      { frac: 0.42, hex: 0xc47a12, label: "42%" },
      { frac: 0.16, hex: 0x8d6e3f, label: "16%" },
      { frac: 0.13, hex: 0x5c7a6a, label: "13%" },
      { frac: 0.09, hex: 0x7aa39a, label: "9%" },
      { frac: 0.20, hex: 0x0e5f56, label: "20%" }
    ];
    var start = -Math.PI / 2;
    var art = null;
    slices.forEach(function (s) {
      var sweep = s.frac * Math.PI * 2;
      var mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.55, 1.55, 0.42, 48, 1, false, start, sweep),
        new THREE.MeshStandardMaterial({ color: s.hex, roughness: 0.45 })
      );
      gfx.scene.add(mesh);
      var mid = start + sweep / 2;
      s.start = start;
      s.mid = mid;
      s.sweepDeg = sweep * 180 / Math.PI;
      s.anchor = new THREE.Vector3(Math.sin(mid) * 0.85, 0.28, Math.cos(mid) * 0.85);
      if (s.frac === 0.2) art = s;
      start += sweep;
    });
    function sliceScreenPoly(slice) {
      var y = slice.anchor.y;
      var pts = [projectXY(gfx.camera, canvas, new THREE.Vector3(0, y, 0))];
      var sweep = slice.sweepDeg * Math.PI / 180;
      var steps = 12;
      var i;
      for (i = 0; i <= steps; i += 1) {
        var th = slice.start + sweep * (i / steps);
        pts.push(projectXY(
          gfx.camera,
          canvas,
          new THREE.Vector3(Math.sin(th) * 1.55, y, Math.cos(th) * 1.55)
        ));
      }
      return pts;
    }
    function frame() {
      placeHud(hud20, canvas, gfx.camera, art.anchor);
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.pie = {
      snapshot: function () {
        gfx.camera.updateMatrixWorld();
        placeHud(hud20, canvas, gfx.camera, art.anchor);
        var hud = hudXY(hud20);
        var proj = projectXY(gfx.camera, canvas, art.anchor);
        var inside = isFinite(hud.x) && isFinite(hud.y) && pointInPoly(hud.x, hud.y, sliceScreenPoly(art));
        return {
          sweepDeg: art.sweepDeg,
          label: hud20 ? hud20.textContent.trim() : "",
          labelInside: inside,
          hudX: hud.x,
          projX: proj.x
        };
      }
    };
  }

  function sumpaths(host) {
    if (!THREE) return;
    var canvas = host.querySelector("canvas");
    var gfx = stage(canvas, { halfW: 5.4, halfH: 1.9 });
    gfx.camera.position.set(0.4, 0.9, 12);
    gfx.camera.lookAt(0, 0, 0);
    var hudA = host.querySelector('[data-hud="alpha"]');
    var hudB = host.querySelector('[data-hud="beta"]');
    var hudG = host.querySelector('[data-hud="gamma"]');
    var alpha = nucleonCluster(2, 2, 0.2);
    alpha.scale.setScalar(0.45);
    var beta = ball(0.11, 0x1d4f91);
    var gamma = ball(0.09, 0xc9a227);
    gfx.scene.add(alpha, beta, gamma);
    var t0 = performance.now();
    function frame(now) {
      var u = ((now - t0) / 1000 * 0.4) % 1;
      var aPos = new THREE.Vector3(lerp(-3.8, 3.0, u), lerp(0, 1.15, u * u), 0);
      var bPos = new THREE.Vector3(lerp(-3.8, 2.4, u), lerp(0, -1.25, Math.pow(u, 1.3)), 0);
      var gPos = new THREE.Vector3(lerp(-3.8, 3.8, u), 0, 0);
      alpha.position.copy(aPos);
      beta.position.copy(bPos);
      gamma.position.copy(gPos);
      placeHud(hudA, canvas, gfx.camera, aPos.clone().add(new THREE.Vector3(0.2, 0.35, 0)));
      placeHud(hudB, canvas, gfx.camera, bPos.clone().add(new THREE.Vector3(0.2, -0.35, 0)));
      placeHud(hudG, canvas, gfx.camera, gPos.clone().add(new THREE.Vector3(0.2, 0.3, 0)));
      gfx.renderer.render(gfx.scene, gfx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    scenes.sumpaths = {};
  }

  var builders = {
    knockout: knockout,
    ionpair: ionpair2d,
    "beams-em": beamsEm,
    "beams-e": beamsE,
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
    badge: badge,
    imaging: imaging,
    ionpower: ionpower,
    tracks: tracks,
    hydrogen: hydrogen,
    nuclide: nuclide,
    kinds: kinds,
    makexray: makexray,
    pie: pie,
    sumpaths: sumpaths
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

