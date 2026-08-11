/* ==========================================================================
   AEROLAB — AERODYNAMIC SIMULATION ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Preset Profiles
  const PRESETS = {
    commercial: { v: 150, aoa: 6.0, area: 120, mass: 65000, density: 1.225 },
    fighter:    { v: 240, aoa: 4.0, area: 78,  mass: 18000, density: 1.225 },
    glider:     { v: 35,  aoa: 5.0, area: 11,  mass: 450,   density: 1.225 },
    cargo:      { v: 180, aoa: 7.0, area: 350, mass: 180000,density: 1.225 }
  };

  // State Variables
  const state = { ...PRESETS.commercial };

  // DOM Elements
  const el = {
    sliderSpeed: document.getElementById('sliderSpeed'),
    sliderAoA: document.getElementById('sliderAoA'),
    sliderArea: document.getElementById('sliderArea'),
    sliderMass: document.getElementById('sliderMass'),
    sliderDensity: document.getElementById('sliderDensity'),
    
    valSpeed: document.getElementById('valSpeed'),
    valSpeedKts: document.getElementById('valSpeedKts'),
    valAoA: document.getElementById('valAoA'),
    valArea: document.getElementById('valArea'),
    valMass: document.getElementById('valMass'),
    valReqForce: document.getElementById('valReqForce'),
    valDensity: document.getElementById('valDensity'),
    valAltApprox: document.getElementById('valAltApprox'),

    chkParticles: document.getElementById('chkParticles'),
    chkVectors: document.getElementById('chkVectors'),
    chkPressure: document.getElementById('chkPressure'),

    heroLift: document.getElementById('heroLift'),
    heroLD: document.getElementById('heroLD'),
    heroMach: document.getElementById('heroMach'),
    heroStatus: document.getElementById('heroStatus'),

    dispPressureDiff: document.getElementById('dispPressureDiff'),
    dispCL: document.getElementById('dispCL'),
    dispCD: document.getElementById('dispCD'),

    meterLiftFill: document.getElementById('meterLiftFill'),
    readoutLift: document.getElementById('readoutLift'),
    readoutReqLift: document.getElementById('readoutReqLift'),
    readoutDrag: document.getElementById('readoutDrag'),
    readoutParasiteDrag: document.getElementById('readoutParasiteDrag'),
    readoutInducedDrag: document.getElementById('readoutInducedDrag'),
    readoutLD: document.getElementById('readoutLD'),
    ldRating: document.getElementById('ldRating'),
    conditionBadge: document.getElementById('conditionBadge'),
    
    simStatusText: document.getElementById('simStatusText'),
    statusDot: document.getElementById('statusDot'),
    stallOverlay: document.getElementById('stallAlertOverlay'),
    resetBtn: document.getElementById('resetControls')
  };

  // Canvas Setup
  const mainCanvas = document.getElementById('windTunnelCanvas');
  const ctx = mainCanvas.getContext('2d');
  
  const chartCLCanvas = document.getElementById('chartCL');
  const ctxCL = chartCLCanvas.getContext('2d');
  
  const chartDragCanvas = document.getElementById('chartDrag');
  const ctxDrag = chartDragCanvas.getContext('2d');
  
  const chartLDCanvas = document.getElementById('chartLD');
  const ctxLD = chartLDCanvas.getContext('2d');

  let particles = [];
  const PARTICLE_COUNT = 110;

  function resizeCanvases() {
    [mainCanvas, chartCLCanvas, chartDragCanvas, chartLDCanvas].forEach(c => {
      if (c) {
        c.width = c.parentElement.clientWidth;
        c.height = c.parentElement.clientHeight;
      }
    });
    initParticles();
  }

  window.addEventListener('resize', resizeCanvases);

  // Initialize Streamline Particles
  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * mainCanvas.width,
        y: Math.random() * mainCanvas.height,
        speedFactor: 0.8 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 1.5
      });
    }
  }

  /* ==========================================================================
     PHYSICS ENGINE CALCULATIONS (CORRECTED STALL & DOWNWARD ANGLE MECHANICS)
     ========================================================================== */
  function calculatePhysics() {
    const alpha = state.aoa; // Angle of attack in degrees
    const v = state.v;
    const rho = state.density;
    const S = state.area;
    const mass = state.mass;

    const CRITICAL_STALL_HIGH = 15.0; // Positive pitch stall limit
    const CRITICAL_STALL_LOW = -12.0;  // Negative pitch stall limit
    
    // Check Stall condition (Stalls only at extreme positive or extreme negative AoA)
    const isStalled = alpha > CRITICAL_STALL_HIGH || alpha < CRITICAL_STALL_LOW;

    // Calculate Lift Coefficient (CL)
    let CL = 0;
    const zeroLiftAoA = -2.0; // Standard cambered airfoil zero-lift angle
    
    if (!isStalled) {
      // Linear range lift slope (~0.1 per degree)
      CL = 0.11 * (alpha - zeroLiftAoA);
    } else {
      if (alpha > CRITICAL_STALL_HIGH) {
        // High positive AoA Stall post-peak decay
        const peakCL = 0.11 * (CRITICAL_STALL_HIGH - zeroLiftAoA);
        CL = peakCL * Math.exp(-0.15 * (alpha - CRITICAL_STALL_HIGH));
      } else {
        // High negative AoA Stall
        const minCL = 0.11 * (CRITICAL_STALL_LOW - zeroLiftAoA);
        CL = minCL * Math.exp(-0.15 * (CRITICAL_STALL_LOW - alpha));
      }
    }

    // Dynamic Pressure q = 0.5 * rho * v^2
    const q = 0.5 * rho * v * v;

    // Calculated Forces
    const liftForceN = q * S * CL; // Positive = upwards, Negative = downforce
    const reqWeightN = mass * 9.81;

    // Drag Calculation (CD = CD0 + CDi)
    const CD0 = 0.020; // Parasite drag coefficient
    const AR = 9.5;    // Wing Aspect Ratio
    const e = 0.82;    // Oswald efficiency factor
    
    const CDi = (CL * CL) / (Math.PI * AR * e);
    const CD = CD0 + CDi + (isStalled ? 0.18 : 0);

    const dragParasiteN = q * S * CD0;
    const dragInducedN = q * S * CDi;
    const dragTotalN = dragParasiteN + dragInducedN + (isStalled ? q * S * 0.18 : 0);

    const ldRatio = dragTotalN > 0 ? Math.abs(liftForceN / dragTotalN) : 0;
    const mach = v / 340.29; // Speed of sound at sea level

    return {
      CL, CD, CD0, CDi,
      liftForceN, reqWeightN,
      dragTotalN, dragParasiteN, dragInducedN,
      ldRatio, mach, isStalled
    };
  }

  // Update UI Readouts
  function updateUI() {
    const p = calculatePhysics();

    // Inputs Text
    el.valSpeed.textContent = `${state.v} m/s`;
    el.valSpeedKts.textContent = `${Math.round(state.v * 1.94384)} kts`;
    el.valAoA.textContent = `${state.aoa.toFixed(1)}°`;
    el.valArea.textContent = `${state.area} m²`;
    el.valMass.textContent = `${state.mass.toLocaleString()} kg`;
    el.valReqForce.textContent = `${(p.reqWeightN / 1000).toFixed(1)} kN`;
    el.valDensity.textContent = `${state.density.toFixed(3)} kg/m³`;

    // Alt approx
    const alt = Math.max(0, Math.round((1.225 - state.density) * 8500));
    el.valAltApprox.textContent = alt === 0 ? 'Sea Level (0 m)' : `~${alt.toLocaleString()} m`;

    // Hero Stats
    el.heroLift.innerHTML = `${(Math.abs(p.liftForceN) / 1000).toFixed(1)} <span class="unit">kN</span>`;
    el.heroLD.textContent = p.ldRatio.toFixed(1);
    el.heroMach.textContent = p.mach.toFixed(2);

    if (p.isStalled) {
      el.heroStatus.textContent = 'STALLED';
      el.heroStatus.style.color = 'var(--color-danger)';
      el.statusDot.style.backgroundColor = 'var(--color-danger)';
      el.simStatusText.textContent = 'BOUNDARY SEPARATION / STALL';
      el.simStatusText.style.color = 'var(--color-danger)';
      el.stallOverlay.classList.remove('hidden');
    } else {
      el.heroStatus.textContent = 'STABLE';
      el.heroStatus.style.color = 'var(--color-success)';
      el.statusDot.style.backgroundColor = 'var(--color-success)';
      el.simStatusText.textContent = 'STABLE LAMINAR FLOW';
      el.simStatusText.style.color = 'var(--text-main)';
      el.stallOverlay.classList.add('hidden');
    }

    // Viewport Footer
    const pDiff = (p.CL * 12.5).toFixed(1);
    el.dispPressureDiff.textContent = `${pDiff >= 0 ? '+' : ''}${pDiff} kPa`;
    el.dispCL.textContent = p.CL.toFixed(2);
    el.dispCD.textContent = p.CD.toFixed(3);

    // Meters & Telemetry
    const liftRatioPct = Math.min(100, Math.max(0, (p.liftForceN / p.reqWeightN) * 70));
    el.meterLiftFill.style.width = `${liftRatioPct}%`;
    el.meterLiftFill.style.backgroundColor = p.liftForceN < 0 ? 'var(--color-warning)' : 'var(--color-accent)';

    el.readoutLift.textContent = `${(p.liftForceN / 1000).toFixed(1)} kN`;
    el.readoutReqLift.textContent = `${(p.reqWeightN / 1000).toFixed(1)} kN`;
    el.readoutDrag.innerHTML = `${(p.dragTotalN / 1000).toFixed(1)} <span class="unit">kN</span>`;
    el.readoutParasiteDrag.textContent = `${(p.dragParasiteN / 1000).toFixed(1)} kN`;
    el.readoutInducedDrag.textContent = `${(p.dragInducedN / 1000).toFixed(1)} kN`;
    el.readoutLD.textContent = p.ldRatio.toFixed(1);

    // Rating
    if (p.ldRatio > 25) el.ldRating.textContent = 'Exceptional Glide Ratio';
    else if (p.ldRatio > 14) el.ldRating.textContent = 'Optimal Operational Range';
    else el.ldRating.textContent = 'High Relative Drag';

    // Condition
    const netForce = p.liftForceN - p.reqWeightN;
    if (p.isStalled) {
      el.conditionBadge.textContent = 'Rapid Altitude Loss (Stall)';
      el.conditionBadge.style.color = 'var(--color-danger)';
      el.conditionBadge.style.backgroundColor = 'rgba(255, 59, 48, 0.12)';
    } else if (p.liftForceN < 0) {
      el.conditionBadge.textContent = 'Negative G Downforce / Diving';
      el.conditionBadge.style.color = 'var(--color-warning)';
      el.conditionBadge.style.backgroundColor = 'rgba(255, 149, 0, 0.12)';
    } else if (Math.abs(netForce) < 5000) {
      el.conditionBadge.textContent = 'Level Cruise Flight';
      el.conditionBadge.style.color = 'var(--color-success)';
      el.conditionBadge.style.backgroundColor = 'rgba(52, 199, 89, 0.12)';
    } else if (netForce > 0) {
      el.conditionBadge.textContent = `Ascending (+${(netForce / 20000).toFixed(1)} m/s)`;
      el.conditionBadge.style.color = 'var(--color-accent)';
      el.conditionBadge.style.backgroundColor = 'rgba(0, 113, 227, 0.12)';
    } else {
      el.conditionBadge.textContent = `Descending (${(netForce / 20000).toFixed(1)} m/s)`;
      el.conditionBadge.style.color = 'var(--color-warning)';
      el.conditionBadge.style.backgroundColor = 'rgba(255, 149, 0, 0.12)';
    }
  }

  // Draw Primary Wind Tunnel
  function drawWindTunnel() {
    const w = mainCanvas.width;
    const h = mainCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const p = calculatePhysics();
    const cx = w * 0.45;
    const cy = h * 0.5;
    const chordLen = 170;
    const rad = (-state.aoa * Math.PI) / 180; // Negative because Canvas Y is inverted

    // Streamline Flow Animation
    if (el.chkParticles.checked) {
      ctx.lineWidth = 1.2;
      particles.forEach(pt => {
        pt.x += (state.v / 15) * pt.speedFactor;
        if (pt.x > w) pt.x = 0;

        // Flow deflection calculation
        let dx = pt.x - cx;
        let dy = pt.y - cy;
        let dist = Math.sqrt(dx * dx + dy * dy);

        let yOffset = 0;
        if (dist < 180) {
          const influence = (1 - dist / 180);
          if (p.isStalled && pt.x > cx) {
            // Turbulent wake
            yOffset = (Math.random() - 0.5) * 22 * influence;
          } else {
            // Laminar contouring around wing slope
            yOffset = -Math.sin(rad) * 35 * influence;
          }
        }

        ctx.fillStyle = p.isStalled ? 'rgba(255, 59, 48, 0.4)' : 'rgba(0, 113, 227, 0.35)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y + yOffset, pt.size, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Pressure Gradient Heatmap
    if (el.chkPressure.checked) {
      const grad = ctx.createRadialGradient(cx, cy - 30, 10, cx, cy, 140);
      if (state.aoa >= 0) {
        grad.addColorStop(0, 'rgba(0, 113, 227, 0.15)'); // Suction low pressure top
        grad.addColorStop(1, 'rgba(0, 113, 227, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 149, 0, 0.15)'); // Downforce suction bottom
        grad.addColorStop(1, 'rgba(255, 149, 0, 0)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw Airfoil Profile (NACA Cambered Geometry)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);

    ctx.beginPath();
    ctx.moveTo(-chordLen / 2, 0);
    // Upper Surface Curve
    ctx.bezierCurveTo(-chordLen / 4, -chordLen * 0.18, chordLen / 4, -chordLen * 0.12, chordLen / 2, 0);
    // Lower Surface Curve
    ctx.bezierCurveTo(chordLen / 4, chordLen * 0.04, -chordLen / 4, chordLen * 0.06, -chordLen / 2, 0);
    ctx.closePath();

    ctx.fillStyle = '#1d1d1f';
    ctx.fill();
    ctx.strokeStyle = '#86868b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Render Aerodynamic Force Vectors
    if (el.chkVectors.checked) {
      // Lift Vector
      const liftArrowLen = Math.min(140, Math.max(-140, (p.liftForceN / p.reqWeightN) * 60));
      ctx.strokeStyle = p.liftForceN >= 0 ? '#0071e3' : '#ff9500';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - liftArrowLen);
      ctx.stroke();

      // Drag Vector
      const dragArrowLen = Math.min(100, (p.dragTotalN / 15000) * 20);
      ctx.strokeStyle = '#ff3b30';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dragArrowLen + 15, cy);
      ctx.stroke();
    }
  }

  // Draw Static Telemetry Graphs
  function drawGraphs() {
    // 1. CL vs AoA Chart
    ctxCL.clearRect(0, 0, chartCLCanvas.width, chartCLCanvas.height);
    ctxCL.strokeStyle = '#e5e5e7';
    ctxCL.lineWidth = 1;
    ctxCL.beginPath();
    ctxCL.moveTo(25, 10); ctxCL.lineTo(25, 160); ctxCL.lineTo(chartCLCanvas.width - 10, 160);
    ctxCL.stroke();

    ctxCL.strokeStyle = '#0071e3';
    ctxCL.lineWidth = 2;
    ctxCL.beginPath();
    for (let a = -5; a <= 25; a += 1) {
      const x = 25 + ((a + 5) / 30) * (chartCLCanvas.width - 40);
      let sampleCL = 0.11 * (a + 2);
      if (a > 15) sampleCL = 0.11 * 17 * Math.exp(-0.15 * (a - 15));
      const y = 160 - ((sampleCL + 0.5) / 2.2) * 140;
      if (a === -5) ctxCL.moveTo(x, y); else ctxCL.lineTo(x, y);
    }
    ctxCL.stroke();

    // 2. Drag Chart
    ctxDrag.clearRect(0, 0, chartDragCanvas.width, chartDragCanvas.height);
    ctxDrag.strokeStyle = '#e5e5e7';
    ctxDrag.beginPath();
    ctxDrag.moveTo(25, 10); ctxDrag.lineTo(25, 160); ctxDrag.lineTo(chartDragCanvas.width - 10, 160);
    ctxDrag.stroke();

    ctxDrag.strokeStyle = '#ff3b30';
    ctxDrag.lineWidth = 2;
    ctxDrag.beginPath();
    for (let v = 10; v <= 300; v += 10) {
      const x = 25 + (v / 300) * (chartDragCanvas.width - 40);
      const q = 0.5 * 1.225 * v * v;
      const d = q * state.area * 0.035;
      const y = 160 - Math.min(140, (d / 200000) * 140);
      if (v === 10) ctxDrag.moveTo(x, y); else ctxDrag.lineTo(x, y);
    }
    ctxDrag.stroke();

    // 3. L/D Chart
    ctxLD.clearRect(0, 0, chartLDCanvas.width, chartLDCanvas.height);
    ctxLD.strokeStyle = '#e5e5e7';
    ctxLD.beginPath();
    ctxLD.moveTo(25, 10); ctxLD.lineTo(25, 160); ctxLD.lineTo(chartLDCanvas.width - 10, 160);
    ctxLD.stroke();

    ctxLD.strokeStyle = '#34c759';
    ctxLD.lineWidth = 2;
    ctxLD.beginPath();
    for (let a = 0; a <= 20; a += 1) {
      const x = 25 + (a / 20) * (chartLDCanvas.width - 40);
      const cl = 0.11 * (a + 2);
      const cd = 0.02 + (cl * cl) / (Math.PI * 9.5 * 0.82);
      const ld = Math.min(30, cl / cd);
      const y = 160 - (ld / 30) * 140;
      if (a === 0) ctxLD.moveTo(x, y); else ctxLD.lineTo(x, y);
    }
    ctxLD.stroke();
  }

  // Animation Loop
  function loop() {
    drawWindTunnel();
    requestAnimationFrame(loop);
  }

  // Event Listeners
  el.sliderSpeed.addEventListener('input', (e) => { state.v = parseFloat(e.target.value); updateUI(); drawGraphs(); });
  el.sliderAoA.addEventListener('input', (e) => { state.aoa = parseFloat(e.target.value); updateUI(); drawGraphs(); });
  el.sliderArea.addEventListener('input', (e) => { state.area = parseFloat(e.target.value); updateUI(); drawGraphs(); });
  el.sliderMass.addEventListener('input', (e) => { state.mass = parseFloat(e.target.value); updateUI(); drawGraphs(); });
  el.sliderDensity.addEventListener('input', (e) => { state.density = parseFloat(e.target.value); updateUI(); drawGraphs(); });

  // Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-preset');
      if (PRESETS[key]) {
        Object.assign(state, PRESETS[key]);
        el.sliderSpeed.value = state.v;
        el.sliderAoA.value = state.aoa;
        el.sliderArea.value = state.area;
        el.sliderMass.value = state.mass;
        el.sliderDensity.value = state.density;
        
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updateUI();
        drawGraphs();
      }
    });
  });

  // Reset Button
  el.resetBtn.addEventListener('click', () => {
    Object.assign(state, PRESETS.commercial);
    el.sliderSpeed.value = state.v;
    el.sliderAoA.value = state.aoa;
    el.sliderArea.value = state.area;
    el.sliderMass.value = state.mass;
    el.sliderDensity.value = state.density;
    updateUI();
    drawGraphs();
  });

  // Startup Initializations
  resizeCanvases();
  updateUI();
  drawGraphs();
  loop();
});