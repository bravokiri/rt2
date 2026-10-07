/* ============================================================
   scene.js — фоновая 3D-сцена (Three.js)
   Автогрейдер собран из примитивов: внешних 3D-моделей нет.
   Реализм даёт связка: карта окружения (отражения) + мягкие тени
   + плёночный тонмаппинг + двухцветная окраска и мелкая обвеска.

   Сцена управляется прокруткой страницы:
     data-scene="hero"     — машина стоит и медленно доворачивается
     data-scene="teardown" — узлы разлетаются (капремонт)
     data-scene="passby"   — автогрейдер проезжает по кадру
   ============================================================ */

(() => {
  "use strict";

  const host = document.querySelector("[data-scene-host]");
  if (!host || typeof THREE === "undefined") return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("scene-off");
    return;
  }

  const anchors = [...document.querySelectorAll("[data-scene]")].map((el) => ({
    el,
    kind: el.dataset.scene,
  }));
  if (!anchors.length) return;

  /* ---------- Палитра сцены ---------- */

  const COLOR = {
    bg: 0xffffff,
    floor: 0xf1eee6,
    paint: 0xe3551a,
    paintDeep: 0xb03f0f,
    chassis: 0x3c3a35,
    chassisDark: 0x242320,
    steel: 0xb4b1aa,
    steelDark: 0x6f6c65,
    tire: 0x1c1b19,
    glass: 0xbcd2dc,
    lamp: 0xfff3cf,
  };

  /* ---------- Рендерер ---------- */

  const isCoarse = window.matchMedia("(max-width: 900px)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    document.body.classList.add("scene-off");
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 2 : 2));
  renderer.setClearColor(COLOR.bg, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLOR.bg, 70, 190);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
  const camPos = new THREE.Vector3(9, 4.2, 12);
  const camAim = new THREE.Vector3(0, 1.6, 0);
  const camPosTarget = camPos.clone();
  const camAimTarget = camAim.clone();

  /* ---------- Карта окружения ----------
     Светлая «студия» вокруг машины: без неё металл и краска
     выглядят плоской заливкой. Считается один раз при старте. */

  const buildEnvironment = () => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.42, "#f2efe8");
    g.addColorStop(0.52, "#dcd7cc");
    g.addColorStop(1, "#9c968b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);

    const sky = new THREE.CanvasTexture(c);
    sky.colorSpace = THREE.SRGBColorSpace;

    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide })
    );
    envScene.add(dome);

    /* Две световые панели — дают машине протяжённые блики на кромках */
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [[16, 22, 10], [-20, 16, -14]].forEach(([x, y, z]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), panel);
      p.position.set(x, y, z);
      p.lookAt(0, 2, 0);
      envScene.add(p);
    });

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(envScene, 0.06).texture;
    pmrem.dispose();
    sky.dispose();
    return env;
  };

  scene.environment = buildEnvironment();

  /* ---------- Свет ---------- */

  const key = new THREE.DirectionalLight(0xfff4de, 2.7);
  const addLights = () => {
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc4bdaf, 0.68));

    key.position.set(7, 13, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(isCoarse ? 1024 : 2048, isCoarse ? 1024 : 2048);
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.035;
    const s = key.shadow.camera;
    s.left = -11;
    s.right = 11;
    s.top = 9;
    s.bottom = -7;
    s.near = 1;
    s.far = 46;
    s.updateProjectionMatrix();
    scene.add(key);
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(0xdfe8f2, 0.45);
    fill.position.set(-9, 5, 11);
    scene.add(fill);
  };

  /* ---------- Материалы ---------- */

  const std = (color, roughness, metalness, extra) =>
    new THREE.MeshStandardMaterial(
      Object.assign({ color, roughness, metalness, envMapIntensity: 1.1 }, extra || {})
    );

  const mat = {
    paint: std(COLOR.paint, 0.38, 0.22, { envMapIntensity: 1.35 }),
    paintDeep: std(COLOR.paintDeep, 0.46, 0.22),
    chassis: std(COLOR.chassis, 0.62, 0.35),
    chassisDark: std(COLOR.chassisDark, 0.72, 0.3),
    steel: std(COLOR.steel, 0.26, 1, { envMapIntensity: 1.6 }),
    steelDark: std(COLOR.steelDark, 0.38, 1, { envMapIntensity: 1.3 }),
    tire: std(COLOR.tire, 0.92, 0.05),
    rim: std(0xd44f16, 0.45, 0.4),
    glass: std(0x9db6c2, 0.06, 0.2, {
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 2.4,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: COLOR.lamp,
      emissive: 0xffd98a,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: 0xffb020,
      emissive: 0xff9000,
      emissiveIntensity: 0.5,
      roughness: 0.35,
    }),
  };

  /* ---------- Примитивы ---------- */

  const shade = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  /* Мелочь вроде болтов и грунтозацепов в тень не даёт ничего,
     а проход по карте теней удваивает её стоимость. */
  const noShadow = (m) => {
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  };

  /* Одинаковые детали (болты, ступеньки, грунтозацепы) повторяются
     десятками — геометрию считаем один раз и переиспользуем. */
  const geoCache = new Map();
  const cached = (key, make) => {
    let g = geoCache.get(key);
    if (!g) {
      g = make();
      geoCache.set(key, g);
    }
    return g;
  };

  const box = (w, h, d, material, x, y, z) => {
    const m = new THREE.Mesh(cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
    m.position.set(x, y, z);
    return shade(m);
  };

  const cyl = (r, h, material, x, y, z, axis, seg) => {
    const n = seg || 14;
    const m = new THREE.Mesh(cached(`c${r}|${h}|${n}`, () => new THREE.CylinderGeometry(r, r, h, n)), material);
    if (axis === "z") m.rotation.x = Math.PI / 2;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z);
    return shade(m);
  };

  /* Скруглённый прямоугольник — основа для фасок на панелях */
  const roundRect = (w, h, r) => {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };

  const BEVEL = isCoarse ? 1 : 2;

  /* Коробка с фаской по рёбрам. Именно фаска ловит свет и отличает
     литую деталь от «кубика из конструктора» — на ней держится реализм. */
  const rbox = (w, h, d, material, x, y, z, bevel) => {
    const b = Math.min(bevel === undefined ? 0.05 : bevel, w * 0.3, h * 0.3, d * 0.3);
    const m = new THREE.Mesh(
      cached(`r${w}|${h}|${d}|${b}`, () => {
        const iw = w - b * 2;
        const ih = h - b * 2;
        const id = d - b * 2;
        const rad = Math.max(0.004, Math.min(b * 1.7, iw / 2 - 0.002, ih / 2 - 0.002));
        const g = new THREE.ExtrudeGeometry(roundRect(iw, ih, rad), {
          depth: id,
          bevelEnabled: true,
          bevelSize: b,
          bevelThickness: b,
          bevelSegments: BEVEL,
          curveSegments: 4,
          steps: 1,
        });
        g.translate(0, 0, -id / 2);
        g.computeVertexNormals();
        return g;
      }),
      material
    );
    m.position.set(x, y, z);
    return shade(m);
  };

  /* Балка, идущая по кривой: так строится изогнутая передняя рама —
     самая узнаваемая линия силуэта автогрейдера. */
  const curvedBeam = (pts, thick, width, material) => {
    const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const top = curve.getPoints(26);
    const s = new THREE.Shape();
    s.moveTo(top[0].x, top[0].y);
    top.forEach((pt) => s.lineTo(pt.x, pt.y));
    for (let i = top.length - 1; i >= 0; i -= 1) s.lineTo(top[i].x, top[i].y - thick);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: width,
      bevelEnabled: true,
      bevelSize: 0.028,
      bevelThickness: 0.028,
      bevelSegments: 1,
      curveSegments: 2,
      steps: 1,
    });
    g.translate(0, 0, -width / 2);
    g.computeVertexNormals();
    return shade(new THREE.Mesh(g, material));
  };

  /* Отвал — не плоский лист, а гнутая дуга с завалом назад */
  const moldboard = (width, height, material) => {
    const k = height / 1.22;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(-0.3 * k, 0.42 * k, -0.34 * k, 0.86 * k, -0.02 * k, 1.22 * k);
    s.lineTo(0.15 * k, 1.19 * k);
    s.bezierCurveTo(-0.11 * k, 0.83 * k, -0.07 * k, 0.43 * k, 0.18 * k, 0.03 * k);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 14, steps: 1 });
    g.translate(0, 0, -width / 2);
    g.computeVertexNormals();
    return shade(new THREE.Mesh(g, material));
  };

  /* Корпус балансирной тележки: сужается к концам, как у настоящей */
  const tandemCase = (len, material) => {
    const h = len / 2;
    const s = new THREE.Shape();
    s.moveTo(-h, 0.2);
    s.lineTo(h, 0.2);
    s.lineTo(h * 0.97, -0.14);
    s.lineTo(0, -0.34);
    s.lineTo(-h * 0.97, -0.14);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.3,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      bevelSegments: 1,
      curveSegments: 2,
      steps: 1,
    });
    g.translate(0, 0, -0.15);
    g.computeVertexNormals();
    return shade(new THREE.Mesh(g, material));
  };

  /* ---------- Колесо ----------
     Протектор рисуем текстурой рельефа: 300 отдельных грунтозацепов
     телефон не потянет, а «ёлочка» на резине читается сразу. */

  const treadMap = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#1b1b1b";
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = "#e8e8e8";
    x.lineWidth = 15;
    x.beginPath();
    x.moveTo(-12, 0);
    x.lineTo(30, 32);
    x.lineTo(-12, 64);
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(20, 1);
    return t;
  })();

  /* Резина с рельефом протектора */
  mat.tread = new THREE.MeshStandardMaterial({
    color: COLOR.tire,
    roughness: 0.95,
    metalness: 0.04,
    bumpMap: treadMap,
    bumpScale: 0.035,
    envMapIntensity: 0.5,
  });

  const makeWheel = (radius, width) => {
    const g = new THREE.Group();
    const hw = width / 2;

    const tyre = new THREE.Mesh(
      cached(`t${radius}|${width}`, () =>
        new THREE.LatheGeometry(
          [
            [0.46, -0.98], [0.8, -1], [0.95, -0.8], [1, -0.5],
            [1, 0.5], [0.95, 0.8], [0.8, 1], [0.46, 0.98],
          ].map(([r, y]) => new THREE.Vector2(r * radius, y * hw)),
          isCoarse ? 22 : 32
        )
      ),
      mat.tread
    );
    tyre.rotation.x = Math.PI / 2;
    g.add(shade(tyre));

    /* Несколько настоящих грунтозацепов по плечу — чтобы силуэт колеса
       не был идеально круглым, как у игрушки */
    const lugGeo = cached(`lug${width}`, () => new THREE.BoxGeometry(0.11, 0.1, width * 0.38));
    const lugs = isCoarse ? 8 : 14;
    for (let i = 0; i < lugs; i += 1) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / lugs) * Math.PI * 2;
      [-1, 1].forEach((side) => {
        const lug = new THREE.Mesh(lugGeo, mat.tire);
        lug.position.set(radius * 0.985, 0, side * width * 0.27);
        lug.rotation.y = side * 0.4;
        pivot.add(noShadow(lug));
      });
      g.add(pivot);
    }

    const rim = new THREE.Mesh(
      cached(`rim${radius}|${width}`, () =>
        new THREE.LatheGeometry(
          [
            [0.17, -0.55], [0.48, -0.88], [0.53, -1.02],
            [0.53, 1.02], [0.48, 0.88], [0.19, 0.5],
          ].map(([r, y]) => new THREE.Vector2(r * radius, y * hw)),
          isCoarse ? 18 : 26
        )
      ),
      mat.rim
    );
    rim.rotation.x = Math.PI / 2;
    g.add(shade(rim));

    g.add(cyl(radius * 0.17, width * 1.02, mat.steelDark, 0, 0, 0, "z", 12));
    if (!isCoarse) {
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        g.add(noShadow(cyl(0.032, width * 1.06, mat.steel, Math.cos(a) * radius * 0.3, Math.sin(a) * radius * 0.3, 0, "z", 8)));
      }
      g.add(noShadow(cyl(0.02, 0.12, mat.steelDark, radius * 0.42, radius * 0.22, hw * 0.9, "z", 6)));
    }

    g.userData.wheel = true;
    return g;
  };

  const placeWheel = (tpl, x, y, z, lean) => {
    const w = tpl.clone();
    w.position.set(x, y, z);
    if (lean) w.rotation.y = lean;
    w.userData.wheel = true;
    return w;
  };

  /* ---------- Автогрейдер ----------
     Пропорции взяты с ГС 14.02: задний двигатель, кабина над шарниром,
     изогнутая передняя рама, поворотный круг с отвалом, тандемы сзади. */

  const grader = new THREE.Group();
  const units = {};

  const buildGrader = () => {
    /* ===== 01. Двигатель и капот ===== */
    const engine = new THREE.Group();
    engine.add(rbox(2.3, 1.06, 1.5, mat.paint, -3.62, 2.02, 0, 0.11));
    engine.add(rbox(2.36, 0.1, 1.58, mat.paintDeep, -3.62, 2.58, 0, 0.04));
    /* сужение капота к корме */
    engine.add(rbox(0.5, 0.92, 1.34, mat.paint, -4.85, 1.96, 0, 0.14));
    /* решётка радиатора */
    engine.add(rbox(0.12, 0.78, 1.2, mat.chassisDark, -5.12, 1.94, 0, 0.03));
    for (let i = 0; i < 6; i += 1) {
      engine.add(noShadow(box(0.04, 0.05, 1.22, mat.steelDark, -5.18, 1.64 + i * 0.13, 0)));
    }
    /* жалюзи на боковинах */
    [0.78, -0.78].forEach((z) => {
      for (let i = 0; i < 5; i += 1) {
        engine.add(noShadow(box(1.62, 0.045, 0.05, mat.chassisDark, -3.62, 1.68 + i * 0.19, z)));
      }
    });
    /* воздушный фильтр и выхлоп с грибком */
    engine.add(cyl(0.16, 0.76, mat.chassis, -2.88, 2.86, 0.52, null, 16));
    engine.add(cyl(0.18, 0.07, mat.chassisDark, -2.88, 3.27, 0.52, null, 16));
    engine.add(cyl(0.075, 1.36, mat.steelDark, -2.88, 3.1, -0.5, null, 14));
    engine.add(cyl(0.115, 0.5, mat.steelDark, -2.88, 2.66, -0.5, null, 12));
    engine.add(cyl(0.115, 0.08, mat.steelDark, -2.88, 3.8, -0.5, null, 14));
    /* противовес и буксирная проушина */
    engine.add(rbox(0.34, 0.5, 1.3, mat.chassisDark, -5.28, 1.32, 0, 0.06));
    engine.add(box(0.22, 0.26, 0.1, mat.steelDark, -5.45, 1.32, 0.3));
    engine.add(box(0.22, 0.26, 0.1, mat.steelDark, -5.45, 1.32, -0.3));
    units.engine = engine;

    /* ===== 02. КПП, мосты, тандемы ===== */
    const drive = new THREE.Group();
    drive.add(rbox(1.5, 0.66, 0.92, mat.chassisDark, -2.1, 1.08, 0, 0.09));
    drive.add(rbox(0.7, 0.5, 0.74, mat.chassis, -1.35, 1.12, 0, 0.1));
    drive.add(cyl(0.07, 1.5, mat.steelDark, -2.95, 1.02, 0, "x", 12));
    /* задний мост с редуктором */
    drive.add(cyl(0.17, 2.1, mat.chassisDark, -2.9, 0.86, 0, "z", 14));
    drive.add(cyl(0.34, 0.5, mat.chassis, -2.9, 0.86, 0, "z", 18));
    /* балансирные тележки */
    [1.16, -1.16].forEach((z) => {
      const t = tandemCase(2.1, mat.chassis);
      t.position.set(-2.9, 0.9, z);
      drive.add(t);
      drive.add(cyl(0.21, 0.46, mat.chassisDark, -2.9, 0.9, z, "z", 16));
      [-0.85, 0.85].forEach((dx) => drive.add(cyl(0.16, 0.5, mat.steelDark, -2.9 + dx, 0.86, z, "z", 12)));
    });
    units.drive = drive;

    /* ===== 03. Гидравлика ===== */
    const hydro = new THREE.Group();
    /* Шток блестит и тоньше корпуса — цилиндр сразу читается как гидравлика */
    const makeRam = (x, y, z, rotZ, rotY, len) => {
      const g = new THREE.Group();
      g.add(cyl(0.085, len * 0.62, mat.chassis, 0, len * 0.19, 0, null, 14));
      g.add(cyl(0.048, len * 0.72, mat.steel, 0, -len * 0.28, 0, null, 12));
      g.add(cyl(0.06, 0.09, mat.steelDark, 0, len * 0.5, 0, null, 12));
      g.add(cyl(0.055, 0.08, mat.steelDark, 0, -len * 0.62, 0, null, 12));
      g.position.set(x, y, z);
      g.rotation.set(0, rotY || 0, rotZ);
      return g;
    };
    /* подъём отвала — два цилиндра с гуська вниз на тяговую раму */
    hydro.add(makeRam(1.0, 1.95, 0.62, 0.3, 0.16, 1.5));
    hydro.add(makeRam(1.0, 1.95, -0.62, 0.3, -0.16, 1.5));
    /* вынос круга и поворот отвала */
    hydro.add(makeRam(2.05, 1.92, 0.22, -0.62, 0, 1.2));
    /* бак и распределитель */
    hydro.add(rbox(0.9, 0.72, 0.44, mat.paintDeep, -1.0, 1.8, 0.78, 0.08));
    hydro.add(cyl(0.05, 0.1, mat.steelDark, -1.0, 2.2, 0.78, null, 10));
    hydro.add(rbox(0.44, 0.3, 0.38, mat.chassisDark, 0.1, 2.22, 0, 0.05));
    /* цилиндры складывания рамы */
    [0.42, -0.42].forEach((z) => {
      const art = makeRam(-0.9, 1.34, z, Math.PI / 2, z > 0 ? 0.26 : -0.26, 1.1);
      hydro.add(art);
    });
    /* рукава высокого давления */
    [0.22, -0.22].forEach((z) => {
      const hose = cyl(0.03, 1.6, mat.chassisDark, 0.62, 2.02, z, null, 8);
      hose.rotation.z = 0.62;
      hydro.add(hose);
    });
    units.hydro = hydro;

    /* ===== 04. Поворотный круг и отвал ===== */
    const blade = new THREE.Group();
    /* тяговая рама: два луча от шарового шарнира к кругу */
    [0.52, -0.52].forEach((z) => {
      const arm = rbox(2.2, 0.16, 0.18, mat.chassis, 1.05, 1.16, z * 1.5, 0.04);
      arm.rotation.y = z > 0 ? -0.2 : 0.2;
      blade.add(arm);
    });
    blade.add(cyl(0.13, 0.22, mat.steelDark, -0.05, 1.2, 0, null, 14));
    /* поворотный круг с зубчатым венцом */
    blade.add(cyl(0.95, 0.14, mat.chassis, 1.6, 1.16, 0, null, 30));
    blade.add(cyl(0.72, 0.22, mat.chassisDark, 1.6, 1.12, 0, null, 24));
    const toothGeo = cached("tooth", () => new THREE.BoxGeometry(0.09, 0.1, 0.07));
    const teeth = isCoarse ? 18 : 30;
    for (let i = 0; i < teeth; i += 1) {
      const a = (i / teeth) * Math.PI * 2;
      const t = new THREE.Mesh(toothGeo, mat.steel);
      t.position.set(1.6 + Math.cos(a) * 0.97, 1.16, Math.sin(a) * 0.97);
      t.rotation.y = -a;
      blade.add(noShadow(t));
    }
    /* кронштейны круга к отвалу */
    [1.3, -1.3].forEach((z) => blade.add(rbox(0.5, 0.5, 0.14, mat.chassis, 1.72, 1.0, z, 0.04)));
    /* сам отвал: гнутый лист, рёбра жёсткости, нож и боковины */
    const board = moldboard(3.7, 1.16, mat.paint);
    board.position.set(1.86, 0.36, 0);
    board.rotation.y = 0.22;
    blade.add(board);
    for (let i = -1; i <= 1; i += 1) {
      const rib = rbox(0.34, 0.9, 0.1, mat.paintDeep, 1.74, 0.82, i * 1.1, 0.03);
      rib.rotation.z = 0.34;
      rib.rotation.y = 0.22;
      blade.add(rib);
    }
    const edge = rbox(0.2, 0.15, 3.74, mat.steelDark, 2.02, 0.2, 0, 0.03);
    edge.rotation.y = 0.22;
    blade.add(edge);
    [1.9, -1.9].forEach((z) => {
      const bit = rbox(0.22, 0.5, 0.12, mat.steelDark, 1.96, 0.46, z, 0.03);
      bit.rotation.z = 0.3;
      bit.rotation.y = 0.22;
      blade.add(bit);
    });
    units.blade = blade;

    /* ===== 05. Рама и ходовая ===== */
    const frame = new THREE.Group();
    /* задние лонжероны и поперечины */
    [0.5, -0.5].forEach((z) => {
      frame.add(rbox(4.1, 0.44, 0.24, mat.paint, -3.1, 1.36, z, 0.05));
    });
    frame.add(rbox(0.28, 0.4, 1.24, mat.paintDeep, -1.25, 1.36, 0, 0.04));
    frame.add(rbox(0.28, 0.4, 1.24, mat.paintDeep, -4.8, 1.36, 0, 0.04));
    /* шарнир складывания основной рамы */
    frame.add(cyl(0.24, 0.78, mat.steelDark, -0.72, 1.46, 0, null, 18));
    frame.add(cyl(0.3, 0.16, mat.chassis, -0.72, 1.86, 0, null, 18));
    /* изогнутая передняя рама — «гусёк» */
    const neck = curvedBeam(
      [[-0.85, 1.62], [0.1, 2.18], [1.3, 2.36], [2.5, 2.2], [3.4, 1.82], [4.05, 1.5]],
      0.34,
      0.5,
      mat.paint
    );
    frame.add(neck);
    /* передний мост, шкворни и поперечная рулевая тяга */
    frame.add(rbox(0.42, 0.34, 2.0, mat.chassis, 3.95, 1.12, 0, 0.06));
    [0.96, -0.96].forEach((z) => {
      frame.add(cyl(0.11, 0.62, mat.chassisDark, 3.95, 1.05, z, null, 12));
      frame.add(rbox(0.16, 0.5, 0.16, mat.chassisDark, 3.95, 0.98, z * 1.05, 0.03));
    });
    frame.add(cyl(0.045, 1.6, mat.steelDark, 3.7, 1.16, 0, "z", 10));
    /* бульдозерный отвал спереди (ОБГ) */
    const dozer = moldboard(2.1, 0.72, mat.paint);
    dozer.position.set(4.82, 0.38, 0);
    frame.add(dozer);
    frame.add(rbox(0.16, 0.1, 2.12, mat.steelDark, 4.94, 0.2, 0, 0.02));
    [0.5, -0.5].forEach((z) => {
      const push = rbox(0.9, 0.16, 0.14, mat.chassis, 4.42, 0.8, z, 0.03);
      push.rotation.z = -0.3;
      frame.add(push);
    });
    /* топливный бак и крылья */
    frame.add(rbox(1.5, 0.66, 0.42, mat.paintDeep, -2.6, 1.92, -0.92, 0.09));
    frame.add(cyl(0.06, 0.1, mat.steelDark, -2.0, 2.3, -0.92, null, 10));
    [1.2, -1.2].forEach((z) => {
      frame.add(rbox(2.8, 0.09, 0.8, mat.paintDeep, -2.9, 1.86, z, 0.04));
      frame.add(rbox(0.1, 0.3, 0.8, mat.paintDeep, -4.24, 1.72, z, 0.03));
    });
    /* лесенка и поручни с обеих сторон */
    [0.94, -0.94].forEach((z) => {
      for (let i = 0; i < 3; i += 1) {
        frame.add(box(0.34, 0.04, 0.09, mat.chassisDark, -1.9, 0.62 + i * 0.36, z));
      }
      frame.add(cyl(0.03, 1.4, mat.steel, -1.7, 1.15, z, null, 8));
      const rail = cyl(0.028, 2.2, mat.steel, -2.85, 2.04, z * 1.02, null, 8);
      rail.rotation.z = Math.PI / 2;
      frame.add(rail);
    });
    /* колёса: передние чуть наклонены, как при работе с откосом */
    const front = makeWheel(0.78, 0.4);
    const rear = makeWheel(0.86, 0.52);
    frame.add(placeWheel(front, 3.95, 0.78, 1.08));
    frame.add(placeWheel(front, 3.95, 0.78, -1.08));
    frame.add(placeWheel(rear, -2.05, 0.86, 1.2));
    frame.add(placeWheel(rear, -2.05, 0.86, -1.2));
    frame.add(placeWheel(rear, -3.75, 0.86, 1.2));
    frame.add(placeWheel(rear, -3.75, 0.86, -1.2));
    units.frame = frame;

    /* ===== 06. Кабина ===== */
    const cab = new THREE.Group();
    cab.add(rbox(1.9, 0.12, 1.7, mat.chassisDark, -1.35, 1.72, 0, 0.04));
    /* стойки: передние наклонены под лобовое стекло */
    [0.82, -0.82].forEach((z) => {
      const fp = rbox(0.09, 1.66, 0.09, mat.chassis, -0.44, 2.58, z, 0.02);
      fp.rotation.z = 0.12;
      cab.add(fp);
      cab.add(rbox(0.09, 1.62, 0.09, mat.chassis, -2.26, 2.56, z, 0.02));
      cab.add(rbox(0.06, 1.5, 0.06, mat.chassis, -1.36, 2.54, z, 0.02));
    });
    /* остекление: лобовое с наклоном, боковые во всю высоту */
    const glassFront = box(0.04, 1.5, 1.58, mat.glass, -0.5, 2.56, 0);
    glassFront.rotation.z = 0.12;
    cab.add(glassFront);
    cab.add(box(0.04, 1.44, 1.56, mat.glass, -2.24, 2.54, 0));
    cab.add(box(1.7, 1.46, 0.04, mat.glass, -1.36, 2.55, 0.8));
    cab.add(box(1.7, 1.46, 0.04, mat.glass, -1.36, 2.55, -0.8));
    /* крыша с козырьком */
    cab.add(rbox(2.06, 0.13, 1.88, mat.paint, -1.34, 3.4, 0, 0.06));
    cab.add(rbox(2.14, 0.05, 1.96, mat.paintDeep, -1.34, 3.49, 0, 0.02));
    const visor = rbox(0.34, 0.05, 1.8, mat.paintDeep, -0.28, 3.34, 0, 0.02);
    visor.rotation.z = 0.2;
    cab.add(visor);
    /* дверь, ручка, зеркала, дворник */
    cab.add(rbox(0.05, 1.42, 0.78, mat.chassis, -1.72, 2.54, 0.82, 0.02));
    cab.add(cyl(0.025, 0.2, mat.steel, -1.36, 2.5, 0.87, null, 8));
    [1.16, -1.16].forEach((z) => {
      cab.add(cyl(0.025, 0.46, mat.chassisDark, -0.5, 3.16, z * 0.82, "z", 8));
      const mirror = rbox(0.05, 0.34, 0.2, mat.steel, -0.5, 3.06, z, 0.02);
      cab.add(mirror);
    });
    const wiper = cyl(0.02, 0.56, mat.chassisDark, -0.43, 2.1, 0.22, null, 6);
    wiper.rotation.z = -0.42;
    cab.add(wiper);
    /* внутри: сиденье, руль на наклонной колонке, рычаги управления */
    cab.add(rbox(0.46, 0.18, 0.52, mat.chassisDark, -1.58, 2.06, 0, 0.06));
    cab.add(rbox(0.16, 0.66, 0.5, mat.chassisDark, -1.86, 2.36, 0, 0.06));
    const column = cyl(0.05, 0.6, mat.chassisDark, -1.02, 2.26, 0, null, 10);
    column.rotation.z = 0.5;
    cab.add(column);
    const wheelRing = new THREE.Mesh(
      cached("swheel", () => new THREE.TorusGeometry(0.2, 0.026, 8, 22)),
      mat.chassisDark
    );
    wheelRing.position.set(-0.86, 2.46, 0);
    wheelRing.rotation.y = Math.PI / 2;
    wheelRing.rotation.x = 0.5;
    cab.add(shade(wheelRing));
    for (let i = 0; i < 5; i += 1) {
      const lever = cyl(0.018, 0.4, mat.steel, -0.78, 2.2, -0.45 + i * 0.16, null, 6);
      lever.rotation.z = 0.2;
      cab.add(lever);
    }
    units.cab = cab;

    /* ===== 07. Электрика и приборы ===== */
    const wiring = new THREE.Group();
    wiring.add(rbox(0.5, 0.38, 0.46, mat.chassisDark, -2.4, 1.72, 0.76, 0.05));
    /* фары на гуське и на бульдозерном отвале */
    [0.4, -0.4].forEach((z) => {
      wiring.add(cyl(0.1, 0.12, mat.chassisDark, 3.28, 1.96, z, "x", 12));
      wiring.add(cyl(0.085, 0.04, mat.lamp, 3.36, 1.96, z, "x", 12));
    });
    /* рабочий свет на крыше — вперёд и назад */
    [0.74, -0.74].forEach((z) => {
      wiring.add(rbox(0.16, 0.14, 0.22, mat.chassisDark, -0.54, 3.54, z, 0.03));
      wiring.add(box(0.04, 0.11, 0.18, mat.lamp, -0.44, 3.54, z));
      wiring.add(rbox(0.16, 0.14, 0.22, mat.chassisDark, -2.16, 3.54, z, 0.03));
      wiring.add(box(0.04, 0.11, 0.18, mat.lamp, -2.26, 3.54, z));
    });
    /* проблесковый маячок */
    wiring.add(cyl(0.06, 0.05, mat.chassisDark, -2.0, 3.53, 0, null, 12));
    wiring.add(cyl(0.085, 0.15, mat.beacon, -2.0, 3.63, 0, null, 14));
    /* габариты сзади и жгут вдоль рамы */
    [0.46, -0.46].forEach((z) => wiring.add(box(0.06, 0.12, 0.16, mat.beacon, -5.34, 1.76, z)));
    wiring.add(cyl(0.028, 2.2, mat.chassisDark, -2.8, 1.6, 0.6, "x", 6));
    units.wiring = wiring;

    /* Своя копия материалов на каждый узел: иначе нельзя притушить
       соседние детали, когда разбираем конкретный узел. */
    Object.values(units).forEach((u) => {
      u.userData.base = u.position.clone();
      u.userData.mats = [];
      u.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        u.userData.mats.push({ m: o.material, base: o.material.color.clone() });
      });
      grader.add(u);
    });

    scene.add(grader);
  };

  /* Направления разлёта узлов при «разборке» */
  const EXPLODE = {
    engine: new THREE.Vector3(-1.5, 1.7, -0.3),
    drive: new THREE.Vector3(-0.3, -1.2, 1.2),
    hydro: new THREE.Vector3(0.2, 1.6, -1.3),
    blade: new THREE.Vector3(1.2, -0.7, 1.6),
    frame: new THREE.Vector3(0, -0.7, 0),
    cab: new THREE.Vector3(-0.2, 2.0, 0.2),
    wiring: new THREE.Vector3(0.6, 1.5, 1.7),
  };

  const UNIT_ORDER = ["engine", "drive", "hydro", "blade", "frame", "cab", "wiring"];

  /* ---------- Площадка ---------- */

  const road = new THREE.Group();

  const buildGround = () => {
    /* Площадка невидима: на белом фоне видна только мягкая тень машины */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 90),
      new THREE.ShadowMaterial({ opacity: 0.26 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const dashMat = new THREE.MeshBasicMaterial({ color: 0xe9e4d7 });
    for (let i = -16; i <= 16; i += 1) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(i * 5, 0.01, -3.4);
      road.add(dash);
    }
    scene.add(road);
  };

  /* ---------- Прогресс прокрутки ---------- */

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (t) => t * t * (3 - 2 * t);

  const readAnchor = (a) => {
    const r = a.el.getBoundingClientRect();
    const vh = window.innerHeight;
    const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    let p;

    if (a.kind === "teardown") {
      p = clamp01(-r.top / Math.max(1, r.height - vh));
    } else if (a.kind === "passby") {
      p = clamp01((vh - r.top) / (vh + r.height));
    } else {
      p = clamp01(-r.top / Math.max(1, r.height));
    }

    return { kind: a.kind, p, visible };
  };

  /* ---------- Позы камеры ---------- */

  const wide = () => window.innerWidth >= 1024;
  const fit = (base) => base * Math.min(1.55, Math.max(1, 1.05 / camera.aspect));

  const poseFor = (kind, p) => {
    const portrait = camera.aspect < 1;

    /* Цель камеры смещается вправо — машина уходит влево, освобождая панель */
    if (kind === "teardown") {
      const shift = wide() ? 3.2 : 0;
      /* На телефоне панель со списком занимает низ экрана — машину
         отодвигаем и приподнимаем прицел, чтобы она целиком влезла сверху. */
      return {
        pos: [shift, portrait ? 4.0 : 3.4 + p * 1.2, fit(portrait ? 22 : 20)],
        aim: [shift, portrait ? -8.0 : 1.9, 0],
      };
    }

    if (kind === "passby") {
      return {
        pos: [0, portrait ? 2.2 : 2.6, fit(16)],
        aim: [0, portrait ? 0.4 : 0.7, 0],
      };
    }

    const t = ease(p);
    return {
      pos: [9.5 - t * 2.2, 4.0 + t * 0.9, fit(12)],
      aim: [wide() ? -1.7 : 0, portrait ? 4.9 : 1.6, 0],
    };
  };

  /* ---------- Состояние ---------- */

  let activeUnit = -1;
  let wheelSpin = 0;
  const tmp = new THREE.Vector3();
  const DIM = new THREE.Color(0xa7a194);
  const DIM_FLOOR = 0.16;

  /* Доля сглаживания за прошедшее время: на слабом телефоне кадры реже,
     и без пересчёта анимация «застревала» на полпути. */
  const smooth = (dt, rate) => 1 - Math.exp(-rate * dt);

  const setUnit = (index) => {
    if (index === activeUnit) return;
    activeUnit = index;
    document.dispatchEvent(new CustomEvent("scene:unit", { detail: { index } }));
  };

  const spinWheels = () => {
    units.frame.children.forEach((child) => {
      if (child.userData.wheel) child.rotation.z = -wheelSpin;
    });
  };

  const applyStage = (state, dt) => {
    const { kind, p } = state;

    const explode = kind === "teardown" ? ease(clamp01(p * 1.15)) : 0;
    UNIT_ORDER.forEach((name) => {
      const unit = units[name];
      const solo = kind === "teardown"
        ? clamp01(p * UNIT_ORDER.length - UNIT_ORDER.indexOf(name))
        : 0;
      /* На телефоне кадр узкий — разлёт ужимаем, иначе узлы уходят за край */
      const k = explode * (0.45 + 0.55 * ease(solo)) * (camera.aspect < 1 ? 0.62 : 1);
      tmp.copy(EXPLODE[name]).multiplyScalar(k).add(unit.userData.base);
      unit.position.lerp(tmp, smooth(dt, 7.7));
    });

    /* Активный узел остаётся в цвете, остальные выцветают */
    UNIT_ORDER.forEach((name, i) => {
      const unit = units[name];
      const lit = kind !== "teardown" || activeUnit < 0 || activeUnit === i;
      const target = lit ? 1 : DIM_FLOOR;
      unit.userData.fade = unit.userData.fade === undefined ? 1 : unit.userData.fade;
      unit.userData.fade += (target - unit.userData.fade) * smooth(dt, 5);
      const f = unit.userData.fade;
      if (Math.abs(f - (unit.userData.applied ?? -1)) > 0.004) {
        unit.userData.applied = f;
        unit.userData.mats.forEach(({ m, base }) => m.color.copy(DIM).lerp(base, f));
      }
      /* Разлетаясь, узел слегка доворачивается — так разборка читается живее */
      const twist = kind === "teardown" ? (i % 2 ? 0.22 : -0.18) * explode : 0;
      unit.rotation.y += (twist - unit.rotation.y) * smooth(dt, 6.3);
      if (name !== "blade") unit.rotation.z += ((kind === "teardown" ? twist * 0.4 : 0) - unit.rotation.z) * smooth(dt, 6.3);
    });

    if (kind === "teardown") {
      setUnit(Math.min(UNIT_ORDER.length - 1, Math.floor(p * UNIT_ORDER.length)));
      /* По мере разлёта уводим машину правее: иначе улетевшие узлы
         выходят за левый край кадра */
      grader.position.x += (explode * 1.1 - grader.position.x) * smooth(dt, 5);
      grader.rotation.y += (Math.PI * 0.07 - grader.rotation.y) * smooth(dt, 3.7);
    } else if (kind === "passby") {
      setUnit(-1);
      const travel = -26 + ease(p) * 52;
      grader.position.x += (travel - grader.position.x) * smooth(dt, 9);
      grader.rotation.y += (0 - grader.rotation.y) * smooth(dt, 5);
    } else {
      setUnit(-1);
      grader.position.x += (0 - grader.position.x) * smooth(dt, 5);
      grader.rotation.y += (-0.6 + p * 0.5 - grader.rotation.y) * smooth(dt, 3.1);
    }

    /* Дорога под машиной едет всегда — значит и колёса всегда крутятся.
       Угловая скорость считается из линейной, иначе колёса «проскальзывают». */
    const speed = kind === "passby" ? 9 : 3.2;
    road.position.x = (road.position.x - dt * speed) % 5;
    wheelSpin += (dt * speed) / 0.78;
    spinWheels();

    if (units.blade) {
      const drop = kind === "passby" ? -0.12 : 0;
      units.blade.rotation.z += (drop - units.blade.rotation.z) * smooth(dt, 3.1);
    }

    /* Свет едет вместе с машиной, иначе тень уходит за край карты теней */
    key.position.set(grader.position.x + 7, 13, 8);
    key.target.position.set(grader.position.x, 0.8, 0);
    key.target.updateMatrixWorld();
  };

  /* ---------- Цикл ---------- */

  let last = performance.now();

  const resize = () => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* На вертикальном экране расширяем угол, иначе машина не помещается */
    camera.fov = camera.aspect < 1 ? 50 : 38;
    camera.updateProjectionMatrix();
  };

  const frame = (now) => {
    requestAnimationFrame(frame);

    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (document.hidden) return;

    let best = null;
    for (const a of anchors) {
      const s = readAnchor(a);
      if (!best || s.visible > best.visible) best = s;
    }

    /* Ничего «прозрачного» на экране — не тратим кадры */
    if (!best || best.visible < 40) return;

    const pose = poseFor(best.kind, best.p);
    camPosTarget.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    camAimTarget.set(pose.aim[0], pose.aim[1], pose.aim[2]);
    camPos.lerp(camPosTarget, smooth(dt, 4.4));
    camAim.lerp(camAimTarget, smooth(dt, 4.4));
    camera.position.copy(camPos);
    camera.lookAt(camAim);

    applyStage(best, dt);

    renderer.render(scene, camera);
  };

  /* ---------- Старт ---------- */

  addLights();
  buildGrader();
  buildGround();
  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.body.classList.add("scene-on");
  requestAnimationFrame(frame);
})();
