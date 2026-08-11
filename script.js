/* ==========================================================================
   AEROLAB REAL-TIME PHYSICS & VISUALIZATION ENGINE
   ========================================================================== */

// --- Global Aerodynamic State ---
const state = {
  speed: 150,       // m/s
  aoa: 6.0,         // degrees
  area: 120,        // m²
  mass: 65000,      // kg
  density: 1.225,   // kg/m³
  
  // Computed outputs
  cl: 0,
  cd: 0,
  lift: 0,          // N
  drag: 0,          // N
  reqLift: 0,       // N
  ldRatio: 0,
  isStalled: false,

  // Display options
  showParticles: true,
  showVectors: true,
  showPressure: true
};

// Aircraft Presets
const AIRCRAFT_PRESETS = {
  commercial: { speed: 250, aoa: 4.5, area: 325, mass: 180000, density: 0.413 },
  fighter: { speed: 280, aoa: 8.0, area: 78, mass: 22000, density: 1.225 },
  glider: { speed: 35, aoa: 5.0, area: 11, mass: 380, density: 1.225 },
  cargo: { speed: 180, aoa: 6.5, area: 350, mass: 210000, density: 1.225 }
};

// --- DOM Elements Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  initBackgroundCanvas();
  initControls();
  initSimulationCanvas();
  initGraphCanvases();
  updatePhysics();
});

// --- Physics Calculations Engine ---
function updatePhysics() {
  const g = 9.81; // m/s²
  state.reqLift = state.mass * g;

  // Lift Coefficient Model (Linear regime + post-stall breakdown)
  const critAoA = 15.0; // Stall angle in degrees
  const aoaRad = (state.aoa * Math.PI) / 180;
  
  if (state.aoa <= critAoA) {
    // Standard thin airfoil lift slope: ~2*pi per radian + camber offset
    state.cl = 0.25 + 2 * Math.PI * (aoaRad + 0.03);
    state.isStalled = false;
  } else {
    // Post-stall lift cliff
    const stallFactor = Math.exp(-0.25 * (state.aoa - critAoA));
    state.cl = (0.25 + 2 * Math.PI * ((critAoA * Math.PI) / 180 + 0.03)) * stallFactor;
    state.isStalled = true;
  }

  // Drag Coefficient Model (Parasite + Induced Drag + Stall Penalty)
  const cd0 = 0.020; // Zero-lift parasite drag coefficient
  const aspectFlex = 7.5; // Typical wing aspect ratio
  const e = 0.85; // Oswald efficiency factor
  const cdInduced = (state.cl * state.cl) / (Math.PI * aspectFlex * e);
  
  let cdStallPenalty = 0;
  if (state.isStalled) {
    cdStallPenalty = 0.08 * Math.pow(state.aoa - critAoA, 1.5);
  }

  state.cd = cd0 + cdInduced + cdStallPenalty;

  // Fundamental Aerodynamic Force Equations: L = 1/2 * rho * v^2 * S * CL
  const dynamicPressure = 0.5 * state.density * Math.pow(state.speed, 2);
  state.lift = dynamicPressure * state.area * state.cl;
  state.drag = dynamicPressure * state.area * state.cd;

  state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;

  // Update UI & Displays
  updateDOMReadouts();
  drawGraphs();
}

// --- DOM Readouts Update ---
function updateDOMReadouts() {
  // Sliders Labels
  document.getElementById("valSpeed").innerText = `${state.speed} m/s`;
  document.getElementById("valSpeedKts").innerText = `${Math.round(state.speed * 1.94384)} kts`;
  document.getElementById("valAoA").innerText = `${state.aoa.toFixed(1)}°`;
  document.getElementById("valArea").innerText = `${state.area} m²`;
  document.getElementById("valMass").innerText = `${state.mass.toLocaleString()} kg`;
  document.getElementById("valReqForce").innerText = `${(state.reqLift / 1000).toFixed(1)} kN`;
  document.getElementById("valDensity").innerText = `${state.density.toFixed(3)} kg/m³`;

  // Hero Stat sync
  document.getElementById("heroLift").innerHTML = `${(state.lift / 1000).toFixed(1)} <span class="unit">kN</span>`;
  document.getElementById("heroLD").innerText = state.ldRatio.toFixed(1);
  document.getElementById("heroMach").innerText = (state.speed / 343).toFixed(2);
  
  const heroStatus = document.getElementById("heroStatus");
  if (state.isStalled) {
    heroStatus.innerText = "STALL ALERT";
    heroStatus.className = "stat-value";
    heroStatus.style.color = "var(--color-danger)";
  } else {
    heroStatus.innerText = "STABLE";
    heroStatus.className = "stat-value status-ok";
    heroStatus.style.color = "var(--color-emerald)";
  }

  // Viewport & Telemetry Panel
  document.getElementById("dispCL").innerText = state.cl.toFixed(2);
  document.getElementById("dispCD").innerText = state.cd.toFixed(3);
  document.getElementById("readoutLift").innerText = `${(state.lift / 1000).toFixed(1)} kN`;
  document.getElementById("readoutReqLift").innerText = `${(state.reqLift / 1000).toFixed(1)} kN`;
  document.getElementById("readoutDrag").innerHTML = `${(state.drag / 1000).toFixed(1)} <span class="unit">kN</span>`;
  document.getElementById("readoutLD").innerText = state.ldRatio.toFixed(1);

  // Meter Fill Percentage
  const liftRatioPct = Math.min(100, Math.max(0, (state.lift / state.reqLift) * 70));
  document.getElementById("meterLiftFill").style.width = `${liftRatioPct}%`;

  // Pressure Diff visual text
  const deltaP = (0.5 * state.density * Math.pow(state.speed, 2) * state.cl) / 1000;
  document.getElementById("dispPressureDiff").innerText = `${deltaP >= 0 ? "+" : ""}${deltaP.toFixed(1)} kPa`;

  // Stall Warning Visual Overlay
  const stallOverlay = document.getElementById("stallAlertOverlay");
  const statusDot = document.getElementById("statusDot");
  const simStatusText = document.getElementById("simStatusText");

  if (state.isStalled) {
    stallOverlay.classList.remove("hidden");
    statusDot.style.backgroundColor = "var(--color-danger)";
    statusDot.style.boxShadow = "0 0 10px var(--color-danger)";
    simStatusText.innerText = "CRITICAL STALL DETECTED";
    simStatusText.style.color = "var(--color-danger)";
  } else {
    stallOverlay.classList.add("hidden");
    statusDot.style.backgroundColor = "var(--color-emerald)";
    statusDot.style.boxShadow = "0 0 10px var(--color-emerald)";
    simStatusText.innerText = "ATTACHED FLOW";
    simStatusText.style.color = "var(--text-main)";
  }

  // Flight Condition Badge
  const condBadge = document.getElementById("conditionBadge");
  const netAccel = (state.lift - state.reqLift) / state.mass;
  if (state.isStalled) {
    condBadge.innerText = "Rapid Altitude Loss (Stall)";
    condBadge.style.background = "rgba(239,68,68,0.2)";
    condBadge.style.color = "var(--color-danger)";
  } else if (Math.abs(netAccel) < 0.2) {
    condBadge.innerText = "Level Flight Equilibrium";
    condBadge.style.background = "rgba(16,185,129,0.15)";
    condBadge.style.color = "var(--color-emerald)";
  } else if (netAccel > 0) {
    condBadge.innerText = `Climbing (+${netAccel.toFixed(1)} m/s²)`;
    condBadge.style.background = "rgba(0,242,254,0.15)";
    condBadge.style.color = "var(--color-accent-cyan)";
  } else {
    condBadge.innerText = `Descent (${netAccel.toFixed(1)} m/s²)`;
    condBadge.style.background = "rgba(245,158,11,0.15)";
    condBadge.style.color = "var(--color-warning)";
  }
}

// --- Event Listeners Setup ---
function initControls() {
  const bindSlider = (id, prop) => {
    const slider = document.getElementById(id);
    slider.addEventListener("input", (e) => {
      state[prop] = parseFloat(e.target.value);
      updatePhysics();
    });
  };

  bindSlider("sliderSpeed", "speed");
  bindSlider("sliderAoA", "aoa");
  bindSlider("sliderArea", "area");
  bindSlider("sliderMass", "mass");
  bindSlider("sliderDensity", "density");

  // Checkbox Toggles
  document.getElementById("chkParticles").addEventListener("change", (e) => state.showParticles = e.target.checked);
  document.getElementById("chkVectors").addEventListener("change", (e) => state.showVectors = e.target.checked);
  document.getElementById("chkPressure").addEventListener("change", (e) => state.showPressure = e.target.checked);

  // Preset Buttons
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pKey = btn.getAttribute("data-preset");
      if (AIRCRAFT_PRESETS[pKey]) {
        const p = AIRCRAFT_PRESETS[pKey];
        state.speed = p.speed;
        state.aoa = p.aoa;
        state.area = p.area;
        state.mass = p.mass;
        state.density = p.density;

        // Sync inputs
        document.getElementById("sliderSpeed").value = p.speed;
        document.getElementById("sliderAoA").value = p.aoa;
        document.getElementById("sliderArea").value = p.area;
        document.getElementById("sliderMass").value = p.mass;
        document.getElementById("sliderDensity").value = p.density;

        document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        updatePhysics();
      }
    });
  });

  document.getElementById("resetControls").addEventListener("click", () => {
    document.querySelector('.preset-btn[data-preset="commercial"]').click();
  });
}

// --- Wind Tunnel Particle Visualizer ---
let particles = [];
const NUM_PARTICLES = 160;

function initSimulationCanvas() {
  const canvas = document.getElementById("windTunnelCanvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Seed Particles
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speedOffset: 0.8 + Math.random() * 0.4
    });
  }

  // Animation Loop
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 20;
    const chordLen = 220;
    const radAoA = (-state.aoa * Math.PI) / 180; // Inverted for screen Y axis

    // Draw Pressure Gradient Map
    if (state.showPressure) {
      const gradient = ctx.createRadialGradient(cx, cy - 40, 10, cx, cy, chordLen);
      if (state.isStalled) {
        gradient.addColorStop(0, "rgba(239, 68, 68, 0.25)");
        gradient.addColorStop(1, "transparent");
      } else {
        gradient.addColorStop(0, "rgba(0, 242, 254, 0.2)");
        gradient.addColorStop(0.5, "rgba(79, 172, 254, 0.08)");
        gradient.addColorStop(1, "transparent");
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Render Streamline Particles
    if (state.showParticles) {
      ctx.fillStyle = "rgba(0, 242, 254, 0.7)";
      particles.forEach((p) => {
        p.x += (state.speed / 15) * p.speedOffset;
        if (p.x > canvas.width) {
          p.x = 0;
          p.y = Math.random() * canvas.height;
        }

        // Deflect flow around wing airfoil shape
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let curY = p.y;
        if (dist < 180) {
          const factor = (180 - dist) / 180;
          if (p.y < cy) {
            // Upper surface velocity acceleration & deflection
            curY -= factor * 35 * Math.cos(radAoA);
            if (state.isStalled && p.x > cx) {
              // Turbulent chaotic flow in stall regime
              curY += (Math.random() - 0.5) * 25;
            }
          } else {
            // Lower surface high pressure deflection
            curY += factor * 15;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, curY, state.isStalled && p.x > cx ? 2 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw Airfoil Profile (NACA 2412 Curve Approximation)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(radAoA);

    ctx.beginPath();
    ctx.moveTo(-chordLen / 2, 0);
    // Upper camber curve
    ctx.bezierCurveTo(
      -chordLen / 4, -chordLen / 3.5,
      chordLen / 4, -chordLen / 4,
      chordLen / 2, 0
    );
    // Lower camber curve
    ctx.bezierCurveTo(
      chordLen / 4, chordLen / 8,
      -chordLen / 4, chordLen / 10,
      -chordLen / 2, 0
    );

    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.isStalled ? "#ef4444" : "#00f2fe";
    ctx.shadowBlur = 15;
    ctx.shadowColor = state.isStalled ? "#ef4444" : "#00f2fe";
    ctx.stroke();
    ctx.restore();

    // Render Vectors (Lift & Drag Force Arrows)
    if (state.showVectors) {
      const liftMag = Math.min(180, (state.lift / state.reqLift) * 70);
      const dragMag = Math.min(120, (state.drag / 20000) * 15);

      // Lift Vector (Perpendicular UP)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - liftMag);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#10b981";
      ctx.stroke();

      // Arrowhead Lift
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - liftMag + 8);
      ctx.lineTo(cx, cy - liftMag);
      ctx.lineTo(cx + 6, cy - liftMag + 8);
      ctx.fillStyle = "#10b981";
      ctx.fill();

      // Drag Vector (Parallel RIGHT)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dragMag, cy);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ef4444";
      ctx.stroke();

      // Arrowhead Drag
      ctx.beginPath();
      ctx.moveTo(cx + dragMag - 8, cy - 5);
      ctx.lineTo(cx + dragMag, cy);
      ctx.lineTo(cx + dragMag - 8, cy + 5);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}

// --- Live Graphs Drawing ---
function initGraphCanvases() {
  window.addEventListener("resize", drawGraphs);
}

function drawGraphs() {
  drawGraph("chartCL", (a) => {
    if (a <= 15) return 0.25 + 2 * Math.PI * ((a * Math.PI) / 180 + 0.03);
    return (0.25 + 2 * Math.PI * ((15 * Math.PI) / 180 + 0.03)) * Math.exp(-0.25 * (a - 15));
  }, -5, 25, state.aoa, "AoA (°)", "CL");

  drawGraph("chartDrag", (v) => {
    const q = 0.5 * state.density * v * v;
    return (q * state.area * state.cd) / 1000;
  }, 10, 300, state.speed, "Speed (m/s)", "Drag (kN)");

  drawGraph("chartLD", (a) => {
    const cl = a <= 15 ? 0.25 + 2 * Math.PI * ((a * Math.PI) / 180 + 0.03) : (0.25 + 2 * Math.PI * ((15 * Math.PI) / 180 + 0.03)) * Math.exp(-0.25 * (a - 15));
    const cd = 0.02 + (cl * cl) / (Math.PI * 7.5 * 0.85) + (a > 15 ? 0.08 * Math.pow(a - 15, 1.5) : 0);
    return cl / cd;
  }, -5, 25, state.aoa, "AoA (°)", "L/D Ratio");
}

function drawGraph(canvasId, fn, minX, maxX, currentX, labelX, labelY) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  const w = canvas.width;
  const h = canvas.height;
  const pad = 35;

  ctx.clearRect(0, 0, w, h);

  // Compute curve points
  const points = [];
  let minY = Infinity, maxY = -Infinity;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const xVal = minX + (i / steps) * (maxX - minX);
    const yVal = fn(xVal);
    points.push({ x: xVal, y: yVal });
    if (yVal < minY) minY = yVal;
    if (yVal > maxY) maxY = yVal;
  }

  // Padding bounds on Y
  if (minY > 0) minY = 0;
  maxY *= 1.1;

  // Gridlines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (h - 2 * pad);
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
  }
  ctx.stroke();

  // Curve Line
  ctx.beginPath();
  points.forEach((p, idx) => {
    const cx = pad + ((p.x - minX) / (maxX - minX)) * (w - 2 * pad);
    const cy = h - pad - ((p.y - minY) / (maxY - minY)) * (h - 2 * pad);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.strokeStyle = "#00f2fe";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Active Parameter Marker Dot
  const curY = fn(currentX);
  const markX = pad + ((currentX - minX) / (maxX - minX)) * (w - 2 * pad);
  const markY = h - pad - ((curY - minY) / (maxY - minY)) * (h - 2 * pad);

  ctx.beginPath();
  ctx.arc(markX, markY, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#10b981";
  ctx.shadowBlur = 10;
  ctx.shadowColor = "#10b981";
  ctx.fill();
  ctx.shadowBlur = 0;
}

// --- Dynamic Ambient Particle Background ---
function initBackgroundCanvas() {
  const canvas = document.getElementById("bgCanvas");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const bgParticles = Array.from({ length: 45 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 2 + 0.5,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 242, 254, 0.15)";

    bgParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }
  animate();
}
