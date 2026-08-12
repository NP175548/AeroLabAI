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

  // Airframe Preset Data
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

  // Canvas Sizing and Initialization
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
    for (let i = 0; i < 200; i++) {
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

  // Pure Physical Aerodynamic Calculations
  function computePhysics() {
    const alphaRad = (state.aoa * Math.PI) / 180;

    // Lift Coefficient (Cl) Model with Stall Post-Peak Decay
    if (state.aoa <= state.criticalAoA) {
      state.cl = 2 * Math.PI * (alphaRad + 0.05);
    } else {
      const stallRatio = (state.aoa - state.criticalAoA) / 10;
      const maxCl = 2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05);
      state.cl = maxCl * Math.exp(-stallRatio * 1.1) + Math.sin(2 * alphaRad) * 0.12;
    }

    state.isStalled = state.aoa > state.criticalAoA;

    // Drag Coefficient (Cd) Model: Parasite + Induced + Stall Drag
    const cd0 = 0.02;
    const aspect = 7.5;
    const oswald = 0.85;
    const cdi = (state.cl * state.cl) / (Math.PI * oswald * aspect);
    const stallDrag = state.isStalled ? 0.15 * Math.pow((state.aoa - state.criticalAoA) / 4, 1.8) : 0;

    state.cd = cd0 + cdi + stallDrag;

    // Forces Equations: L = 0.5 * rho * v^2 * S * Cl
    const q = 0.5 * state.density * state.airspeed * state.airspeed;
    state.lift = q * state.area * state.cl;
    state.drag = q * state.area * state.cd;
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;
  }

  // Update Readouts & Dynamic Flight Status
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

    // Equilibrium Balance Calculation
    const liftWeightRatio = state.lift / weightForceN;
    const balancePct = Math.min(100, Math.max(0, liftWeightRatio * 50));
    DOM.balanceIndicator.style.width = `${balancePct}%`;

    // Flight Status Direction Logic
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

    // Hero Stats Updates
    const mach = (state.airspeed / 343).toFixed(2);
    const heroq = ((0.5 * state.density * state.airspeed * state.airspeed) / 1000).toFixed(1);
    document.getElementById("hero-mach").textContent = mach;
    document.getElementById("hero-q").textContent = `${heroq} kPa`;

    renderCharts();
  }

  // Draw Simulation Wind Tunnel Viewport
  function renderSimulation() {
    const w = DOM.simCanvas.width;
    const h = DOM.simCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 10;

    simCtx.clearRect(0, 0, w, h);

    // Speed multiplier driven by Airspeed slider
    const speedRatio = state.airspeed / 150;
    // Wing Area scaling factor driven by Wing Area slider
    const areaScale = Math.sqrt(state.area / 125);
    // Air Density opacity visual cue
    const densityOpacity = Math.min(1.0, Math.max(0.3, state.density / 1.225));

    // Render Streamlines / Flow Particles
    flowParticles.forEach(p => {
      p.x += p.speed * speedRatio * 2.2;
      if (p.x > w) p.x = 0;

      const dx = p.x - cx;
      const dy = p.y - cy;
      const distSq = dx * dx + dy * dy;

      let py = p.y;
      if (distSq < 22000) {
        const inf = Math.exp(-distSq / 14000);
        // Positive AoA causes downstream downwash deflection (air pushed down)
        const downwash = state.aoa * 1.8 * (dx > 0 ? (dx / 160) : 0);

        if (state.isStalled && dx > 0) {
          py += Math.sin(p.x * 0.15 + Date.now() * 0.015) * 18 * inf + downwash;
        } else {
          py -= (inf * 28 * Math.sign(state.aoa || 1)) - downwash;
        }
      }

      simCtx.fillStyle = state.isStalled 
        ? `rgba(255, 71, 87, ${0.7 * densityOpacity})` 
        : `rgba(0, 210, 255, ${0.65 * densityOpacity})`;
      simCtx.beginPath();
      simCtx.arc(p.x, py, p.size, 0, Math.PI * 2);
      simCtx.fill();
    });

    // Draw Airfoil Profile
    // Note: Canvas Y goes down. Positive Angle of Attack = Nose pitched UP = Counter-Clockwise rotation (-aoa)
    simCtx.save();
    simCtx.translate(cx, cy);
    simCtx.rotate((-state.aoa * Math.PI) / 180);

    const chord = 180 * areaScale;
    simCtx.beginPath();
    for (let i = 0; i <= chord; i += 2) {
      const xc = i / chord;
      // NACA 4-Digit Symmetric/Cambered Thickness profile
      const yt = 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * Math.pow(xc, 2) + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4)) * chord;
      const camber = 0.04 * (1 - xc) * xc * chord; // Curved upper camber
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

    // Render Vector Force Indicators
    if (state.mode === "all" || state.mode === "vectors") {
      // Lift Vector (Points UP -> -Y in canvas coordinates)
      const liftPx = Math.min(150, (state.lift / 1200000) * 110);
      if (Math.abs(liftPx) > 2) {
        drawVector(cx, cy, cx, cy - liftPx, "#00d2ff", `Lift (${(state.lift / 1000).toFixed(0)} kN)`);
      }

      // Drag Vector (Points Right -> +X in canvas coordinates)
      const dragPx = Math.min(130, (state.drag / 300000) * 90);
      if (dragPx > 2) {
        drawVector(cx, cy, cx + dragPx, cy, "#ff4757", `Drag (${(state.drag / 1000).toFixed(0)} kN)`);
      }

      // Weight Gravity Vector (Points DOWN -> +Y in canvas coordinates)
      const weightN = state.weight * 9.81;
      const weightPx = Math.min(150, (weightN / 1200000) * 110);
      if (weightPx > 2) {
        drawVector(cx, cy, cx, cy + weightPx, "#ffb703", `Weight (${(weightN / 1000).toFixed(0)} kN)`);
      }
    }

    requestAnimationFrame(renderSimulation);
  }

  // Vector Arrow Drawing Function
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

  // Draw Real-Time Performance Telemetry Plots
  function renderCharts() {
    // Cl vs Alpha
    drawPlot(clCtx, DOM.chartCl, (a) => {
      const rad = (a * Math.PI) / 180;
      if (a <= state.criticalAoA) return 2 * Math.PI * (rad + 0.05);
      const stallRatio = (a - state.criticalAoA) / 10;
      const maxCl = 2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05);
      return maxCl * Math.exp(-stallRatio * 1.1) + Math.sin(2 * rad) * 0.12;
    }, -10, 25, -0.5, 2.2, state.aoa, state.cl);

    // Drag vs Velocity
    drawPlot(dragCtx, DOM.chartDrag, (v) => {
      const q = 0.5 * state.density * v * v;
      return (q * state.area * state.cd) / 1000;
    }, 20, 350, 0, (state.drag / 1000) * 1.5 || 500, state.airspeed, state.drag / 1000);

    // L/D vs Alpha
    drawPlot(ldCtx, DOM.chartLd, (a) => {
      const rad = (a * Math.PI) / 180;
      let clVal = (a <= state.criticalAoA) ? 2 * Math.PI * (rad + 0.05) : (2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05)) * Math.exp(-((a - state.criticalAoA)/10) * 1.1);
      const cdiVal = (clVal * clVal) / (Math.PI * 0.85 * 7.5);
      const cdVal = 0.02 + cdiVal + (a > state.criticalAoA ? 0.15 : 0);
      return cdVal > 0 ? clVal / cdVal : 0;
    }, -10, 25, -5, 30, state.aoa, state.ldRatio);
  }

  function drawPlot(ctx, canvas, func, minX, maxX, minY, maxY, curX, curY) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 26;

    ctx.clearRect(0, 0, w, h);

    // Plot Axes
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // Plot Curve Line
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const x = minX + (i / steps) * (maxX - minX);
      const y = func(x);

      const px = pad + ((x - minX) / (maxX - minX)) * (w - 2 * pad);
      const py = (h - pad) - ((y - minY) / (maxY - minY)) * (h - 2 * pad);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Live Indicator Marker
    const px = pad + ((curX - minX) / (maxX - minX)) * (w - 2 * pad);
    const py = (h - pad) - ((curY - minY) / (maxY - minY)) * (h - 2 * pad);

    ctx.fillStyle = state.isStalled ? "#ff4757" : "#2ed573";
    ctx.beginPath();
    ctx.arc(px, Math.max(pad, Math.min(h - pad, py)), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Background Particle Animation
  function renderBackground() {
    bgCtx.clearRect(0, 0, DOM.bgCanvas.width, DOM.bgCanvas.height);
    
    // Background atmosphere visual density
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

  // Slider & Button Input Event Listeners
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

    DOM.themeToggle.addEventListener("click", () => {
      const currentTheme = DOM.html.getAttribute("data-theme");
      DOM.html.setAttribute("data-theme", currentTheme === "dark" ? "light" : "dark");
    });
  }

  // App Initialization
  resizeCanvases();
  bindEvents();
  updateUI();
  renderSimulation();
  renderBackground();
});