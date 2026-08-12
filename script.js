/**
 * AeroLab Dynamic Physics & Real-Time Visualization Engine
 * Made By: Neel Patel
 */

document.addEventListener("DOMContentLoaded", () => {
  // Simulator Dynamic State
  const state = {
    airspeed: 150,     // m/s
    aoa: 5.0,          // degrees (+ is pitch up)
    area: 125,         // m²
    weight: 45000,     // kg
    density: 1.225,    // kg/m³
    mode: "all",       // "all", "vectors", "flow"
    criticalAoA: 15.0, // critical stall angle

    lift: 0,
    drag: 0,
    cl: 0,
    cd: 0,
    ldRatio: 0,
    isStalled: false
  };

  // Airframe Preset Configurations
  const presets = {
    passenger: { speed: 240, aoa: 3.5, area: 320, weight: 120000, density: 1.225 },
    fighter:   { speed: 310, aoa: 6.0, area: 75,  weight: 18000,  density: 1.225 },
    glider:    { speed: 45,  aoa: 4.5, area: 25,  weight: 450,    density: 1.225 },
    cargo:     { speed: 190, aoa: 4.0, area: 380, weight: 160000, density: 1.225 }
  };

  // DOM Handles
  const DOM = {
    sliderSpeed: document.getElementById("slider-speed"),
    sliderAoA: document.getElementById("slider-aoa"),
    sliderArea: document.getElementById("slider-area"),
    sliderWeight: document.getElementById("slider-weight"),
    sliderDensity: document.getElementById("slider-density"),

    dispSpeed: document.getElementById("disp-speed"),
    dispAoA: document.getElementById("disp-aoa"),
    dispArea: document.getElementById("disp-area"),
    dispWeight: document.getElementById("disp-weight"),
    dispDensity: document.getElementById("disp-density"),

    valLift: document.getElementById("val-lift"),
    valDrag: document.getElementById("val-drag"),
    valLD: document.getElementById("val-ld"),
    valStatus: document.getElementById("val-status"),

    barLift: document.getElementById("bar-lift"),
    barDrag: document.getElementById("bar-drag"),
    barLD: document.getElementById("bar-ld"),

    reqLift: document.getElementById("req-lift"),
    genLift: document.getElementById("gen-lift"),
    balanceIndicator: document.getElementById("balance-indicator"),
    stallAlert: document.getElementById("stall-alert"),

    themeToggle: document.getElementById("theme-toggle"),
    html: document.documentElement,

    simCanvas: document.getElementById("sim-canvas"),
    bgCanvas: document.getElementById("bg-canvas"),

    chartCl: document.getElementById("chart-cl"),
    chartDrag: document.getElementById("chart-drag"),
    chartLd: document.getElementById("chart-ld")
  };

  const simCtx = DOM.simCanvas.getContext("2d");
  const bgCtx = DOM.bgCanvas.getContext("2d");

  const clCtx = DOM.chartCl.getContext("2d");
  const dragCtx = DOM.chartDrag.getContext("2d");
  const ldCtx = DOM.chartLd.getContext("2d");

  let flowParticles = [];
  let bgParticles = [];

  // Canvas Sizing and Particle Initialization
  function resizeCanvases() {
    const wrapper = DOM.simCanvas.parentElement;
    DOM.simCanvas.width = wrapper.clientWidth;
    DOM.simCanvas.height = wrapper.clientHeight;

    DOM.bgCanvas.width = window.innerWidth;
    DOM.bgCanvas.height = window.innerHeight;

    [DOM.chartCl, DOM.chartDrag, DOM.chartLd].forEach(chart => {
      const parent = chart.parentElement;
      chart.width = parent.clientWidth;
      chart.height = parent.clientHeight;
    });

    initParticles();
  }

  function initParticles() {
    flowParticles = [];
    for (let i = 0; i < 220; i++) {
      flowParticles.push({
        x: Math.random() * DOM.simCanvas.width,
        y: Math.random() * DOM.simCanvas.height,
        speed: 2 + Math.random() * 3,
        size: 1.5 + Math.random() * 1.5
      });
    }

    bgParticles = [];
    const count = Math.floor(window.innerWidth / 16);
    for (let i = 0; i < count; i++) {
      bgParticles.push({
        x: Math.random() * DOM.bgCanvas.width,
        y: Math.random() * DOM.bgCanvas.height,
        size: Math.random() * 2.2,
        vy: 0.2 + Math.random() * 0.5
      });
    }
  }

  // Calculate Lift Coefficient Cl(alpha)
  function calcCl(alpha) {
    const alphaRad = (alpha * Math.PI) / 180;
    if (alpha <= state.criticalAoA) {
      // Thin Airfoil Theory linear slope: Cl = 2 * pi * (alpha + alpha_0)
      return 2 * Math.PI * (alphaRad + 0.05);
    } else {
      // Post-stall separation drop-off
      const stallRatio = (alpha - state.criticalAoA) / 10;
      const maxCl = 2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05);
      return maxCl * Math.exp(-stallRatio * 1.1) + Math.sin(2 * alphaRad) * 0.12;
    }
  }

  // Calculate Drag Coefficient Cd(alpha)
  function calcCd(alpha) {
    const clVal = calcCl(alpha);
    const cd0 = 0.02;       // Parasite drag coefficient
    const aspect = 7.5;     // Wing Aspect Ratio (AR)
    const oswald = 0.85;    // Oswald efficiency factor (e)
    
    // Induced Drag: Cdi = Cl^2 / (pi * e * AR)
    const cdi = (clVal * clVal) / (Math.PI * oswald * aspect);
    const stallDrag = alpha > state.criticalAoA ? 0.15 * Math.pow((alpha - state.criticalAoA) / 4, 1.8) : 0;
    
    return cd0 + cdi + stallDrag;
  }

  // Calculate Aerodynamic Forces and Variables
  function computePhysics() {
    state.cl = calcCl(state.aoa);
    state.cd = calcCd(state.aoa);
    state.isStalled = state.aoa > state.criticalAoA;

    // Dynamic Pressure q = 0.5 * rho * v^2 [Pa]
    const q = 0.5 * state.density * state.airspeed * state.airspeed;
    
    // Aerodynamic Forces [N]
    state.lift = q * state.area * state.cl;
    state.drag = q * state.area * state.cd;
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;
  }

  // Update Controls Readout & Indicators
  function updateUI() {
    computePhysics();

    DOM.dispSpeed.textContent = `${state.airspeed} m/s`;
    DOM.dispAoA.textContent = `${state.aoa.toFixed(1)}°`;
    DOM.dispArea.textContent = `${state.area} m²`;
    DOM.dispWeight.textContent = `${state.weight.toLocaleString()} kg`;
    DOM.dispDensity.textContent = `${state.density.toFixed(3)} kg/m³`;

    const liftKN = (state.lift / 1000).toFixed(1);
    const dragKN = (state.drag / 1000).toFixed(1);

    DOM.valLift.textContent = `${liftKN} kN`;
    DOM.valDrag.textContent = `${dragKN} kN`;
    DOM.valLD.textContent = state.ldRatio.toFixed(1);

    DOM.barLift.style.width = `${Math.min(100, Math.max(0, (state.lift / 2000000) * 100))}%`;
    DOM.barDrag.style.width = `${Math.min(100, Math.max(0, (state.drag / 500000) * 100))}%`;
    DOM.barLD.style.width = `${Math.min(100, Math.max(0, (state.ldRatio / 30) * 100))}%`;

    const weightForceN = state.weight * 9.81;
    const weightForceKN = (weightForceN / 1000).toFixed(1);
    DOM.reqLift.textContent = `${weightForceKN} kN`;
    DOM.genLift.textContent = `${liftKN} kN`;

    // Flight Equilibrium Ratio
    const liftWeightRatio = state.lift / weightForceN;
    const balancePct = Math.min(100, Math.max(0, liftWeightRatio * 50));
    DOM.balanceIndicator.style.width = `${balancePct}%`;

    if (state.isStalled) {
      DOM.stallAlert.classList.remove("hidden");
      DOM.valStatus.textContent = "STALL / FLOW SEPARATION";
      DOM.valStatus.style.color = "var(--red)";
      DOM.balanceIndicator.style.backgroundColor = "var(--red)";
    } else if (liftWeightRatio > 1.03) {
      DOM.stallAlert.classList.add("hidden");
      DOM.valStatus.textContent = "Ascending Flight (Climbing ▲)";
      DOM.valStatus.style.color = "var(--cyan)";
      DOM.balanceIndicator.style.backgroundColor = "var(--cyan)";
    } else if (liftWeightRatio < 0.97) {
      DOM.stallAlert.classList.add("hidden");
      DOM.valStatus.textContent = "Descending Flight (Sinking ▼)";
      DOM.valStatus.style.color = "var(--gold)";
      DOM.balanceIndicator.style.backgroundColor = "var(--gold)";
    } else {
      DOM.stallAlert.classList.add("hidden");
      DOM.valStatus.textContent = "Level Equilibrium Cruise";
      DOM.valStatus.style.color = "var(--green)";
      DOM.balanceIndicator.style.backgroundColor = "var(--green)";
    }

    // Hero Header Metrics
    const mach = (state.airspeed / 343).toFixed(2);
    const heroq = ((0.5 * state.density * state.airspeed * state.airspeed) / 1000).toFixed(1);
    const elemMach = document.getElementById("hero-mach");
    const elemQ = document.getElementById("hero-q");
    if (elemMach) elemMach.textContent = mach;
    if (elemQ) elemQ.textContent = `${heroq} kPa`;

    renderCharts();
  }

  // Draw Wind Tunnel Viewport
  function renderSimulation() {
    const w = DOM.simCanvas.width;
    const h = DOM.simCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 10;

    simCtx.clearRect(0, 0, w, h);

    const speedRatio = state.airspeed / 150;
    const areaScale = Math.sqrt(state.area / 125);
    const densityOpacity = Math.min(1.0, Math.max(0.3, state.density / 1.225));

    // Streamlines & Downwash
    flowParticles.forEach(p => {
      p.x += p.speed * speedRatio * 2.2;
      if (p.x > w) p.x = 0;

      const dx = p.x - cx;
      const dy = p.y - cy;
      const distSq = dx * dx + dy * dy;

      let renderY = p.y;
      if (distSq < 25000) {
        const inf = Math.exp(-distSq / 16000);
        
        // Downwash pushes air downwards (+Y in canvas) behind trailing edge (dx > 0)
        const downwash = (dx > 0) ? (state.aoa * 1.5 * (dx / 150)) : 0;

        if (state.isStalled && dx > 0) {
          renderY += Math.sin(p.x * 0.12 + Date.now() * 0.012) * 16 * inf + downwash;
        } else {
          const liftDeflection = inf * 18 * Math.sin((state.aoa * Math.PI) / 180);
          renderY = p.y - liftDeflection + downwash;
        }
      }

      simCtx.fillStyle = state.isStalled 
        ? `rgba(255, 71, 87, ${0.7 * densityOpacity})` 
        : `rgba(0, 210, 255, ${0.65 * densityOpacity})`;
      simCtx.beginPath();
      simCtx.arc(p.x, renderY, p.size, 0, Math.PI * 2);
      simCtx.fill();
    });

    // Draw Airfoil Profile
    // Negated sign rotates positive AoA nose UP (-Y) and tail DOWN (+Y)
    simCtx.save();
    simCtx.translate(cx, cy);
    simCtx.rotate(-(state.aoa * Math.PI) / 180);

    const chord = 180 * areaScale;
    simCtx.beginPath();
    for (let i = 0; i <= chord; i += 2) {
      const xc = i / chord;
      const yt = 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * Math.pow(xc, 2) + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4)) * chord;
      const camber = 0.04 * (1 - xc) * xc * chord;
      if (i === 0) simCtx.moveTo(i - chord / 2, -yt - camber);
      else simCtx.lineTo(i - chord / 2, -yt - camber);
    }
    for (let i = chord; i >= 0; i -= 2) {
      const xc = i / chord;
      const yt = 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * Math.pow(xc, 2) + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4)) * chord;
      const camber = 0.04 * (1 - xc) * xc * chord;
      simCtx.lineTo(i - chord / 2, yt - camber);
    }
    simCtx.closePath();

    const wingGrad = simCtx.createLinearGradient(-chord / 2, 0, chord / 2, 0);
    wingGrad.addColorStop(0, "#00d2ff");
    wingGrad.addColorStop(1, "#3b82f6");
    simCtx.fillStyle = wingGrad;
    simCtx.fill();
    simCtx.strokeStyle = "#ffffff";
    simCtx.lineWidth = 2;
    simCtx.stroke();

    simCtx.restore();

    // Render Vectors
    if (state.mode === "all" || state.mode === "vectors") {
      // Lift Vector (Points UP -> -Y)
      const liftPx = Math.min(150, (state.lift / 1200000) * 110);
      if (Math.abs(liftPx) > 2) {
        drawVector(cx, cy, cx, cy - liftPx, "#00d2ff", `Lift (${(state.lift / 1000).toFixed(0)} kN)`);
      }

      // Drag Vector (Points Right -> +X)
      const dragPx = Math.min(130, (state.drag / 300000) * 90);
      if (dragPx > 2) {
        drawVector(cx, cy, cx + dragPx, cy, "#ff4757", `Drag (${(state.drag / 1000).toFixed(0)} kN)`);
      }

      // Weight Vector (Points DOWN -> +Y)
      const weightN = state.weight * 9.81;
      const weightPx = Math.min(150, (weightN / 1200000) * 110);
      if (weightPx > 2) {
        drawVector(cx, cy, cx, cy + weightPx, "#ffb703", `Weight (${(weightN / 1000).toFixed(0)} kN)`);
      }
    }

    requestAnimationFrame(renderSimulation);
  }

  // Draw Force Vector Line
  function drawVector(fx, fy, tx, ty, color, label) {
    const angle = Math.atan2(ty - fy, tx - fx);
    const headlen = 9;

    simCtx.strokeStyle = color;
    simCtx.fillStyle = color;
    simCtx.lineWidth = 3;

    simCtx.beginPath();
    simCtx.moveTo(fx, fy);
    simCtx.lineTo(tx, ty);
    simCtx.stroke();

    simCtx.beginPath();
    simCtx.moveTo(tx, ty);
    simCtx.lineTo(tx - headlen * Math.cos(angle - Math.PI / 6), ty - headlen * Math.sin(angle - Math.PI / 6));
    simCtx.lineTo(tx - headlen * Math.cos(angle + Math.PI / 6), ty - headlen * Math.sin(angle + Math.PI / 6));
    simCtx.fill();

    simCtx.font = "bold 11px sans-serif";
    simCtx.fillText(label, tx + 8, ty + 4);
  }

  // Render Telemetry Plots
  function renderCharts() {
    // 1. Lift Coefficient (Cl) vs Angle (alpha)
    drawPlot(
      clCtx, 
      DOM.chartCl, 
      (a) => calcCl(a), 
      -10, 25, -0.5, 2.2, 
      state.aoa, 
      "Angle (α)", "Cl", "°", "",
      `Current Point: α = ${state.aoa.toFixed(1)}°, Cl = ${state.cl.toFixed(2)}`
    );

    // 2. Drag Force (D) vs Airspeed (v)
    const maxDragVal = Math.max(500, (state.drag / 1000) * 1.4);
    drawPlot(
      dragCtx, 
      DOM.chartDrag, 
      (v) => {
        const q = 0.5 * state.density * v * v;
        return (q * state.area * state.cd) / 1000;
      }, 
      20, 350, 0, maxDragVal, 
      state.airspeed, 
      "Airspeed (v)", "Drag (kN)", "m/s", "kN",
      `Current Point: v = ${state.airspeed} m/s, Drag = ${(state.drag / 1000).toFixed(1)} kN`
    );

    // 3. Efficiency Ratio (L/D) vs Angle (alpha)
    drawPlot(
      ldCtx, 
      DOM.chartLd, 
      (a) => {
        const clVal = calcCl(a);
        const cdVal = calcCd(a);
        return cdVal > 0 ? clVal / cdVal : 0;
      }, 
      -10, 25, -5, 30, 
      state.aoa, 
      "Angle (α)", "L/D", "°", "",
      `Current Point: α = ${state.aoa.toFixed(1)}°, L/D = ${state.ldRatio.toFixed(1)}`
    );
  }

  // Draw Plot Chart
  function drawPlot(ctx, canvas, func, minX, maxX, minY, maxY, curX, labelX, labelY, unitX, unitY, dotLegend) {
    const w = canvas.width;
    const h = canvas.height;
    const padL = 36;
    const padR = 16;
    const padT = 24;
    const padB = 30;

    ctx.clearRect(0, 0, w, h);

    // Grid & Axes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();

    // Plot Curve Line
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const x = minX + (i / steps) * (maxX - minX);
      const y = func(x);

      const px = padL + ((x - minX) / (maxX - minX)) * (w - padL - padR);
      const py = (h - padB) - ((y - minY) / (maxY - minY)) * (h - padT - padB);
      const clampedPy = Math.max(padT, Math.min(h - padB, py));

      if (i === 0) ctx.moveTo(px, clampedPy);
      else ctx.lineTo(px, clampedPy);
    }
    ctx.stroke();

    // Dot Y evaluated directly from curve function
    const exactY = func(curX);
    const dotPx = padL + ((curX - minX) / (maxX - minX)) * (w - padL - padR);
    const rawPy = (h - padB) - ((exactY - minY) / (maxY - minY)) * (h - padT - padB);
    const dotPy = Math.max(padT, Math.min(h - padB, rawPy));

    // Outer Ring
    ctx.fillStyle = state.isStalled ? "rgba(255, 71, 87, 0.3)" : "rgba(46, 213, 115, 0.3)";
    ctx.beginPath();
    ctx.arc(dotPx, dotPy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Inner Dot
    ctx.fillStyle = state.isStalled ? "#ff4757" : "#2ed573";
    ctx.beginPath();
    ctx.arc(dotPx, dotPy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Legend Header
    ctx.fillStyle = "rgba(240, 244, 248, 0.9)";
    ctx.font = "10px sans-serif";
    ctx.fillText(`● ${dotLegend}`, padL + 4, padT - 8);
  }

  // Background Canvas Animation
  function renderBackground() {
    bgCtx.clearRect(0, 0, DOM.bgCanvas.width, DOM.bgCanvas.height);
    const bgOpacity = Math.min(0.25, 0.08 * (state.density / 1.225));
    bgCtx.fillStyle = `rgba(255, 255, 255, ${bgOpacity})`;

    bgParticles.forEach(p => {
      p.y -= p.vy * (state.airspeed / 100);
      if (p.y < 0) p.y = DOM.bgCanvas.height;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bgCtx.fill();
    });

    requestAnimationFrame(renderBackground);
  }

  // Event Listeners
  function bindEvents() {
    window.addEventListener("resize", resizeCanvases);

    DOM.sliderSpeed.addEventListener("input", (e) => { state.airspeed = parseFloat(e.target.value); updateUI(); });
    DOM.sliderAoA.addEventListener("input", (e) => { state.aoa = parseFloat(e.target.value); updateUI(); });
    DOM.sliderArea.addEventListener("input", (e) => { state.area = parseFloat(e.target.value); updateUI(); });
    DOM.sliderWeight.addEventListener("input", (e) => { state.weight = parseFloat(e.target.value); updateUI(); });
    DOM.sliderDensity.addEventListener("input", (e) => { state.density = parseFloat(e.target.value); updateUI(); });

    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
      });
    });

    document.querySelectorAll(".preset-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".preset-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        const cfg = presets[card.dataset.preset];
        if (cfg) {
          state.airspeed = cfg.speed;
          state.aoa = cfg.aoa;
          state.area = cfg.area;
          state.weight = cfg.weight;
          state.density = cfg.density;

          DOM.sliderSpeed.value = cfg.speed;
          DOM.sliderAoA.value = cfg.aoa;
          DOM.sliderArea.value = cfg.area;
          DOM.sliderWeight.value = cfg.weight;
          DOM.sliderDensity.value = cfg.density;

          updateUI();
        }
      });
    });

    if (DOM.themeToggle) {
      DOM.themeToggle.addEventListener("click", () => {
        const currentTheme = DOM.html.getAttribute("data-theme");
        DOM.html.setAttribute("data-theme", currentTheme === "dark" ? "light" : "dark");
      });
    }
  }

  // App Initialization
  resizeCanvases();
  bindEvents();
  updateUI();
  renderSimulation();
  renderBackground();
});