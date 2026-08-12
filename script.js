/**
 * AeroLab — Interactive Aerospace Aerodynamics Simulation Engine
 * Core Physics Engine, Particle Field Renderers, Chart Generators & UI Controls
 */

document.addEventListener("DOMContentLoaded", () => {
  // Global Simulation State
  const state = {
    airspeed: 150,     // m/s
    aoa: 5.0,          // degrees
    area: 125,         // m²
    weight: 45000,     // kg
    density: 1.225,    // kg/m³
    viewMode: "all",   // "all", "vectors", "particles"
    criticalAoA: 15.0, // Stall threshold
    
    // Calculated physics metrics
    lift: 0,           // N
    drag: 0,           // N
    cl: 0,             // Lift coefficient
    cd: 0,             // Drag coefficient
    ldRatio: 0,        // Lift/Drag ratio
    isStalled: false
  };

  // Aircraft Presets Configuration
  const presets = {
    passenger: { speed: 250, aoa: 3.0, area: 511, weight: 180000, density: 1.225 },
    fighter:   { speed: 310, aoa: 6.0, area: 78,  weight: 19700,  density: 1.225 },
    glider:    { speed: 35,  aoa: 4.5, area: 10.5,weight: 350,    density: 1.225 },
    cargo:     { speed: 210, aoa: 4.0, area: 353, weight: 120000, density: 1.225 }
  };

  // UI Elements DOM References
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
    
    meterLift: document.getElementById("meter-lift"),
    meterDrag: document.getElementById("meter-drag"),
    meterLD: document.getElementById("meter-ld"),

    reqLift: document.getElementById("req-lift"),
    genLift: document.getElementById("gen-lift"),
    balanceIndicator: document.getElementById("balance-indicator"),
    stallAlert: document.getElementById("stall-alert"),

    themeToggle: document.getElementById("theme-toggle"),
    htmlElem: document.documentElement,

    simCanvas: document.getElementById("sim-canvas"),
    bgCanvas: document.getElementById("bg-canvas"),

    chartCl: document.getElementById("chart-cl"),
    chartDrag: document.getElementById("chart-drag"),
    chartLd: document.getElementById("chart-ld")
  };

  // Setup Canvas Contexts
  const simCtx = DOM.simCanvas.getContext("2d");
  const bgCtx = DOM.bgCanvas.getContext("2d");

  // Telemetry Canvas Contexts
  const clCtx = DOM.chartCl.getContext("2d");
  const dragCtx = DOM.chartDrag.getContext("2d");
  const ldCtx = DOM.chartLd.getContext("2d");

  // Particle System Array for Wing Flow
  let flowParticles = [];
  const PARTICLE_COUNT = 180;

  // Background Starfield/Grid Particles
  let bgParticles = [];

  // Initialize Canvas Sizes
  function resizeCanvases() {
    DOM.simCanvas.width = DOM.simCanvas.parentElement.clientWidth;
    DOM.simCanvas.height = DOM.simCanvas.parentElement.clientHeight;

    DOM.bgCanvas.width = window.innerWidth;
    DOM.bgCanvas.height = window.innerHeight;

    [DOM.chartCl, DOM.chartDrag, DOM.chartLd].forEach(chart => {
      chart.width = chart.parentElement.clientWidth;
      chart.height = chart.parentElement.clientHeight;
    });

    initFlowParticles();
    initBgParticles();
  }

  // Particle Initializations
  function initFlowParticles() {
    flowParticles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      flowParticles.push({
        x: Math.random() * DOM.simCanvas.width,
        y: Math.random() * DOM.simCanvas.height,
        vx: 2 + Math.random() * 3,
        size: 1.5 + Math.random() * 2,
        opacity: 0.3 + Math.random() * 0.7
      });
    }
  }

  function initBgParticles() {
    bgParticles = [];
    const count = Math.floor(window.innerWidth / 15);
    for (let i = 0; i < count; i++) {
      bgParticles.push({
        x: Math.random() * DOM.bgCanvas.width,
        y: Math.random() * DOM.bgCanvas.height,
        size: Math.random() * 2,
        speed: 0.2 + Math.random() * 0.5
      });
    }
  }

  // Physics Calculations Engine
  function computePhysics() {
    const alphaRad = (state.aoa * Math.PI) / 180;
    
    // Lift Coefficient model: Linear growth up to stall, followed by post-stall turbulent drop
    if (state.aoa <= state.criticalAoA) {
      // Linear slope approx 2 * PI per radian (with thin airfoil theory)
      state.cl = 2 * Math.PI * (alphaRad + 0.05);
    } else {
      // Post stall separation formula
      const stallRatio = (state.aoa - state.criticalAoA) / 10;
      const maxCl = 2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05);
      state.cl = maxCl * Math.exp(-stallRatio * 1.2) + Math.sin(2 * alphaRad) * 0.2;
    }

    state.isStalled = state.aoa > state.criticalAoA;

    // Drag Coefficient Model: C_D = C_D0 + C_Di (Induced drag)
    const cd0 = 0.02; // Zero-lift drag coefficient
    const aspectRatio = 7.5;
    const oswaldEff = 0.82;
    const cdi = (state.cl * state.cl) / (Math.PI * oswaldEff * aspectRatio);
    
    let stallDragPenalty = 0;
    if (state.isStalled) {
      stallDragPenalty = 0.15 * Math.pow((state.aoa - state.criticalAoA) / 5, 2);
    }
    
    state.cd = cd0 + cdi + stallDragPenalty;

    // Aerodynamic Forces Equations
    // Lift: L = 0.5 * rho * v^2 * S * C_L
    const q = 0.5 * state.density * state.airspeed * state.airspeed; // Dynamic pressure
    state.lift = q * state.area * state.cl;
    state.drag = q * state.area * state.cd;

    // Lift-to-Drag Ratio
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;
  }

  // Update Telemetry & UI Displays
  function updateUI() {
    computePhysics();

    // Text Values
    DOM.dispSpeed.textContent = `${state.airspeed} m/s`;
    DOM.dispAoA.textContent = `${state.aoa.toFixed(1)}°`;
    DOM.dispArea.textContent = `${state.area} m²`;
    DOM.dispWeight.textContent = `${state.weight.toLocaleString()} kg`;
    DOM.dispDensity.textContent = `${state.density.toFixed(3)} kg/m³`;

    // Metrics formatting
    const liftKN = (state.lift / 1000).toFixed(1);
    const dragKN = (state.drag / 1000).toFixed(1);
    
    DOM.valLift.textContent = `${liftKN} kN`;
    DOM.valDrag.textContent = `${dragKN} kN`;
    DOM.valLD.textContent = state.ldRatio.toFixed(1);

    // Dynamic Meters Fill
    DOM.meterLift.style.width = `${Math.min(100, (state.lift / 2000000) * 100)}%`;
    DOM.meterDrag.style.width = `${Math.min(100, (state.drag / 500000) * 100)}%`;
    DOM.meterLD.style.width = `${Math.min(100, (state.ldRatio / 30) * 100)}%`;

    // Flight Balance Equilibrium
    const weightForceN = state.weight * 9.81;
    const weightForceKN = (weightForceN / 1000).toFixed(1);

    DOM.reqLift.textContent = `${weightForceKN} kN`;
    DOM.genLift.textContent = `${liftKN} kN`;

    const balancePct = Math.min(100, Math.max(0, (state.lift / weightForceN) * 50));
    DOM.balanceIndicator.style.width = `${balancePct}%`;

    if (state.isStalled) {
      DOM.stallAlert.classList.remove("hidden");
      DOM.valStatus.textContent = "STALL DETECTED";
      DOM.valStatus.style.color = "var(--accent-red)";
      DOM.balanceIndicator.style.backgroundColor = "var(--accent-red)";
    } else {
      DOM.stallAlert.classList.add("hidden");
      if (Math.abs(state.lift - weightForceN) / weightForceN < 0.1) {
        DOM.valStatus.textContent = "Equilibrium Flight";
        DOM.valStatus.style.color = "var(--accent-green)";
        DOM.balanceIndicator.style.backgroundColor = "var(--accent-green)";
      } else if (state.lift > weightForceN) {
        DOM.valStatus.textContent = "Climbing / Accelerating";
        DOM.valStatus.style.color = "var(--accent-cyan)";
        DOM.balanceIndicator.style.backgroundColor = "var(--accent-cyan)";
      } else {
        DOM.valStatus.textContent = "Desending / Losing Altitude";
        DOM.valStatus.style.color = "var(--accent-gold)";
        DOM.balanceIndicator.style.backgroundColor = "var(--accent-gold)";
      }
    }

    // Hero metrics dynamic updates
    const heroMach = document.getElementById("hero-mach");
    const heroq = document.getElementById("hero-q");
    if (heroMach) heroMach.textContent = (state.airspeed / 343).toFixed(2);
    if (heroq) heroq.textContent = `${((0.5 * state.density * state.airspeed * state.airspeed) / 1000).toFixed(1)} kPa`;

    // Render telemetry charts
    drawCharts();
  }

  // Draw Airfoil Simulation Canvas
  function drawSimulation() {
    const w = DOM.simCanvas.width;
    const h = DOM.simCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 20;

    simCtx.clearRect(0, 0, w, h);

    // Dynamic scale factor based on speed
    const speedFactor = state.airspeed / 150;

    // Draw Pressure Distribution Field in background
    if (state.viewMode === "all" || state.viewMode === "particles") {
      drawPressureField(cx, cy);
    }

    // Draw Moving Flow Particles
    flowParticles.forEach(p => {
      p.x += p.vx * speedFactor * 2;
      if (p.x > w) p.x = 0;

      // Deflect streamlines around wing profile (NACA Airfoil bending)
      const dx = p.x - cx;
      const dy = p.y - cy;
      const distSq = dx * dx + dy * dy;

      let py = p.y;
      if (distSq < 16000) {
        const influence = Math.exp(-distSq / 12000);
        // Angle of attack upwash/downwash shift
        const aoaShift = state.aoa * 2.5 * (dx / 200);
        
        if (state.isStalled && dx > 0) {
          // Turbulent vortex oscillation post-stall
          py += Math.sin(p.x * 0.1 + Date.now() * 0.01) * 15 * influence;
        } else {
          py -= (influence * 35) + aoaShift;
        }
      }

      simCtx.fillStyle = state.isStalled ? "rgba(255, 71, 87, 0.6)" : "rgba(0, 210, 255, 0.7)";
      simCtx.beginPath();
      simCtx.arc(p.x, py, p.size, 0, Math.PI * 2);
      simCtx.fill();
    });

    // Draw Airfoil Profile (NACA 0012 render with rotation)
    simCtx.save();
    simCtx.translate(cx, cy);
    simCtx.rotate((-state.aoa * Math.PI) / 180); // Rotate for Angle of Attack

    simCtx.beginPath();
    const chord = 180;
    // Draw NACA shape
    for (let i = 0; i <= chord; i += 2) {
      const xc = i / chord;
      // Formula for NACA symmetric airfoil profile thickness
      const yt = 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * Math.pow(xc, 2) + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4)) * chord;
      if (i === 0) simCtx.moveTo(i - chord / 2, -yt);
      else simCtx.lineTo(i - chord / 2, -yt);
    }
    for (let i = chord; i >= 0; i -= 2) {
      const xc = i / chord;
      const yt = 5 * 0.12 * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * Math.pow(xc, 2) + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4)) * chord;
      simCtx.lineTo(i - chord / 2, yt);
    }
    simCtx.closePath();

    // Wing Surface Styling
    const wingGrad = simCtx.createLinearGradient(-chord / 2, -20, chord / 2, 20);
    wingGrad.addColorStop(0, "#3a7bd5");
    wingGrad.addColorStop(1, "#00d2ff");
    simCtx.fillStyle = wingGrad;
    simCtx.fill();
    simCtx.strokeStyle = "rgba(255,255,255,0.8)";
    simCtx.lineWidth = 2;
    simCtx.stroke();

    simCtx.restore();

    // Render Aerodynamic Force Vectors (Lift & Drag)
    if (state.viewMode === "all" || state.viewMode === "vectors") {
      drawForceVectors(cx, cy);
    }

    requestAnimationFrame(drawSimulation);
  }

  // Draw Pressure Gradient Visualization Layer
  function drawPressureField(cx, cy) {
    const gradUpper = simCtx.createRadialGradient(cx, cy - 40, 5, cx, cy - 40, 100);
    const lowPressureColor = state.isStalled ? "rgba(255, 71, 87, 0.15)" : "rgba(0, 210, 255, 0.25)";
    gradUpper.addColorStop(0, lowPressureColor);
    gradUpper.addColorStop(1, "rgba(0,0,0,0)");

    simCtx.fillStyle = gradUpper;
    simCtx.beginPath();
    simCtx.arc(cx, cy - 40, 100, 0, Math.PI * 2);
    simCtx.fill();

    const gradLower = simCtx.createRadialGradient(cx, cy + 30, 5, cx, cy + 30, 90);
    gradLower.addColorStop(0, "rgba(255, 71, 87, 0.25)");
    gradLower.addColorStop(1, "rgba(0,0,0,0)");

    simCtx.fillStyle = gradLower;
    simCtx.beginPath();
    simCtx.arc(cx, cy + 30, 90, 0, Math.PI * 2);
    simCtx.fill();
  }

  // Draw Arrow Force Vectors
  function drawForceVectors(cx, cy) {
    // Lift Vector (Vertical Upwards)
    const liftLength = Math.min(180, (state.lift / 1000000) * 120);
    if (liftLength > 5) {
      drawArrow(simCtx, cx, cy, cx, cy - liftLength, "#00d2ff", 4, "Lift");
    }

    // Drag Vector (Horizontal Rearwards)
    const dragLength = Math.min(150, (state.drag / 250000) * 100);
    if (dragLength > 5) {
      drawArrow(simCtx, cx, cy, cx + dragLength, cy, "#ff4757", 4, "Drag");
    }
  }

  function drawArrow(ctx, fromx, fromy, tox, toy, color, width, label) {
    const headlen = 10;
    const angle = Math.atan2(toy - fromy, tox - fromx);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;

    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.font = "bold 12px sans-serif";
    ctx.fillText(label, tox + 8, toy + 4);
  }

  // Render Telemetry Live Dynamic Charts
  function drawCharts() {
    // 1. Lift Coefficient vs AoA Chart
    drawGraph(clCtx, DOM.chartCl, (a) => {
      const rad = (a * Math.PI) / 180;
      if (a <= state.criticalAoA) return 2 * Math.PI * (rad + 0.05);
      const stallRatio = (a - state.criticalAoA) / 10;
      const maxCl = 2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05);
      return maxCl * Math.exp(-stallRatio * 1.2) + Math.sin(2 * rad) * 0.2;
    }, -5, 25, 0, 2.0, state.aoa, state.cl, "AoA (°)", "C_L");

    // 2. Drag vs Speed Chart
    drawGraph(dragCtx, DOM.chartDrag, (v) => {
      const q = 0.5 * state.density * v * v;
      return (q * state.area * state.cd) / 1000; // in kN
    }, 20, 350, 0, (state.drag / 1000) * 1.5 || 500, state.airspeed, state.drag / 1000, "Speed (m/s)", "Drag (kN)");

    // 3. Lift/Drag Ratio vs AoA
    drawGraph(ldCtx, DOM.chartLd, (a) => {
      const rad = (a * Math.PI) / 180;
      let clVal = 0;
      if (a <= state.criticalAoA) clVal = 2 * Math.PI * (rad + 0.05);
      else clVal = (2 * Math.PI * ((state.criticalAoA * Math.PI / 180) + 0.05)) * Math.exp(-((a - state.criticalAoA)/10) * 1.2);
      
      const cdiVal = (clVal * clVal) / (Math.PI * 0.82 * 7.5);
      const cdVal = 0.02 + cdiVal + (a > state.criticalAoA ? 0.15 : 0);
      return clVal / cdVal;
    }, -5, 25, 0, 25, state.aoa, state.ldRatio, "AoA (°)", "L/D Ratio");
  }

  function drawGraph(ctx, canvas, func, minX, maxX, minY, maxY, currentX, currentY, labelX, labelY) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 30;

    ctx.clearRect(0, 0, w, h);

    // Draw Axes Grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // Plot Curve
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const xVal = minX + (i / steps) * (maxX - minX);
      const yVal = func(xVal);

      const px = pad + ((xVal - minX) / (maxX - minX)) * (w - 2 * pad);
      const py = (h - pad) - ((yVal - minY) / (maxY - minY)) * (h - 2 * pad);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw Current State Point
    const curPx = pad + ((currentX - minX) / (maxX - minX)) * (w - 2 * pad);
    const curPy = (h - pad) - ((currentY - minY) / (maxY - minY)) * (h - 2 * pad);

    ctx.fillStyle = state.isStalled ? "#ff4757" : "#2ed573";
    ctx.beginPath();
    ctx.arc(curPx, Math.max(pad, Math.min(h - pad, curPy)), 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Background Starfield Animation
  function drawBackground() {
    bgCtx.clearRect(0, 0, DOM.bgCanvas.width, DOM.bgCanvas.height);
    bgCtx.fillStyle = "rgba(255, 255, 255, 0.2)";

    bgParticles.forEach(p => {
      p.y -= p.speed;
      if (p.y < 0) p.y = DOM.bgCanvas.height;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bgCtx.fill();
    });

    requestAnimationFrame(drawBackground);
  }

  // Event Listeners Setup
  function bindEvents() {
    window.addEventListener("resize", resizeCanvases);

    // Sliders
    DOM.sliderSpeed.addEventListener("input", (e) => { state.airspeed = parseFloat(e.target.value); updateUI(); });
    DOM.sliderAoA.addEventListener("input", (e) => { state.aoa = parseFloat(e.target.value); updateUI(); });
    DOM.sliderArea.addEventListener("input", (e) => { state.area = parseFloat(e.target.value); updateUI(); });
    DOM.sliderWeight.addEventListener("input", (e) => { state.weight = parseFloat(e.target.value); updateUI(); });
    DOM.sliderDensity.addEventListener("input", (e) => { state.density = parseFloat(e.target.value); updateUI(); });

    // View Mode Buttons
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.viewMode = btn.dataset.view;
      });
    });

    // Preset Cards Selection
    document.querySelectorAll(".preset-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".preset-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        const presetKey = card.dataset.preset;
        const config = presets[presetKey];
        if (config) {
          state.airspeed = config.speed;
          state.aoa = config.aoa;
          state.area = config.area;
          state.weight = config.weight;
          state.density = config.density;

          DOM.sliderSpeed.value = config.speed;
          DOM.sliderAoA.value = config.aoa;
          DOM.sliderArea.value = config.area;
          DOM.sliderWeight.value = config.weight;
          DOM.sliderDensity.value = config.density;

          updateUI();
        }
      });
    });

    // Dark/Light Theme Toggle
    DOM.themeToggle.addEventListener("click", () => {
      const currentTheme = DOM.htmlElem.getAttribute("data-theme");
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      DOM.htmlElem.setAttribute("data-theme", nextTheme);
    });
  }

  // Initialization Sequence
  resizeCanvases();
  bindEvents();
  updateUI();
  drawSimulation();
  drawBackground();
});