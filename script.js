// script.js

// Dynamic State Store
const state = {
    speed: 120,          // Airspeed in m/s
    aoa: 4.0,            // Angle of Attack in degrees
    area: 125,           // Wing surface area in m²
    weight: 65000,       // Aircraft weight in kg
    density: 1.225,      // Air density in kg/m³
    
    // Aerodynamic Constants
    cl0: 0.25,           // Zero-AoA Lift Coefficient
    cla: 0.10,           // Lift Slope per degree
    aoaStall: 15.0,      // Critical Stall Angle
    cd0: 0.020,          // Zero-lift Parasitic Drag
    aspectRatio: 8.5,    // Wing Aspect Ratio

    // Calculated Dynamic Outputs
    cl: 0,
    cd: 0,
    lift: 0,             // In Newtons
    drag: 0,             // In Newtons
    ldRatio: 0,
    isStalled: false,
    reqLift: 0
};

// Aircraft Presets Configurations
const aircraftPresets = {
    passenger: { speed: 120, aoa: 4.0, area: 125, weight: 65000, density: 1.225, cl0: 0.25, cla: 0.10, aoaStall: 15.0, cd0: 0.020 },
    fighter:   { speed: 220, aoa: 3.0, area: 48,  weight: 18000, density: 1.225, cl0: 0.15, cla: 0.08, aoaStall: 18.0, cd0: 0.015 },
    glider:    { speed: 35,  aoa: 5.0, area: 16,  weight: 450,   density: 1.225, cl0: 0.35, cla: 0.11, aoaStall: 14.0, cd0: 0.010 },
    cargo:     { speed: 100, aoa: 6.0, area: 310, weight: 155000,density: 1.225, cl0: 0.40, cla: 0.09, aoaStall: 14.5, cd0: 0.028 }
};

// Particle Simulation for Airflow Canvas
class AirflowParticle {
    constructor(width, height) {
        this.reset(width, height, true);
    }

    reset(width, height, randomX = false) {
        this.x = randomX ? Math.random() * width : 0;
        this.y = Math.random() * height;
        this.vx = state.speed * 0.08 + 2;
        this.size = Math.random() * 2 + 1;
        this.alpha = Math.random() * 0.6 + 0.2;
    }

    update(width, height, foilX, foilY, aoa, isStalled) {
        this.vx = state.speed * 0.06 + 2;
        const rad = (aoa * Math.PI) / 180;
        
        // Deflection distance around wing
        const dx = this.x - foilX;
        const dy = this.y - foilY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 180) {
            const influence = (1 - dist / 180);
            
            if (this.y < foilY) {
                // Upper wing stream acceleration
                this.y -= (25 * influence * (1 + Math.sin(rad)));
                if (isStalled && this.x > foilX) {
                    // Turbulent stall eddies
                    this.y += (Math.random() - 0.5) * 12 * influence;
                    this.x += (Math.random() - 0.5) * 6;
                }
            } else {
                // Lower wing flow redirection
                this.y += (15 * influence * Math.cos(rad));
            }
        }

        this.x += this.vx;

        if (this.x > width || this.y < 0 || this.y > height) {
            this.reset(width, height, false);
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(0, 220, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Global Particle Collections
let simParticles = [];
let heroParticles = [];

// DOM References
let sliders = {};
let displays = {};

// Initialization Entry Point
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    bindDOM();
    setupEventListeners();
    updatePhysics();
    initCanvases();
    requestAnimationFrame(renderLoop);
});

// Theme Selector Toggle
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
    });
}

// Bind DOM Elements
function bindDOM() {
    sliders = {
        speed: document.getElementById('slider-speed'),
        aoa: document.getElementById('slider-aoa'),
        area: document.getElementById('slider-area'),
        weight: document.getElementById('slider-weight'),
        density: document.getElementById('slider-density')
    };

    displays = {
        speed: document.getElementById('disp-speed'),
        speedKnots: document.getElementById('disp-speed-knots'),
        aoa: document.getElementById('disp-aoa'),
        area: document.getElementById('disp-area'),
        weight: document.getElementById('disp-weight'),
        density: document.getElementById('disp-density'),

        valLift: document.getElementById('val-lift'),
        valDrag: document.getElementById('val-drag'),
        valLd: document.getElementById('val-ld'),
        valCondition: document.getElementById('val-flight-condition'),
        valReqLift: document.getElementById('val-weight-req'),

        gaugeLift: document.getElementById('gauge-lift'),
        gaugeDrag: document.getElementById('gauge-drag'),
        gaugeLd: document.getElementById('gauge-ld'),

        stallIndicator: document.getElementById('stall-indicator'),
        stallText: document.getElementById('stall-status-text'),

        heroLift: document.getElementById('hero-stat-lift'),
        heroLd: document.getElementById('hero-stat-ld'),
        heroStatus: document.getElementById('hero-stat-status'),

        eqRho: document.getElementById('eq-val-rho'),
        eqV: document.getElementById('eq-val-v'),
        eqS: document.getElementById('eq-val-s'),
        eqCl: document.getElementById('eq-val-cl'),
        eqL: document.getElementById('eq-val-l'),
        eqCd0: document.getElementById('eq-val-cd0'),
        eqCdi: document.getElementById('eq-val-cdi'),
        eqCd: document.getElementById('eq-val-cd'),
        eqQ: document.getElementById('eq-val-q'),
        eqD: document.getElementById('eq-val-d')
    };
}

// Setup Event Listeners
function setupEventListeners() {
    Object.keys(sliders).forEach(key => {
        sliders[key].addEventListener('input', () => {
            state[key] = parseFloat(sliders[key].value);
            updatePhysics();
        });
    });

    // Aircraft Preset Card Selectors
    const cards = document.querySelectorAll('.aircraft-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const presetKey = card.getAttribute('data-preset');
            if (aircraftPresets[presetKey]) {
                Object.assign(state, aircraftPresets[presetKey]);
                syncSlidersWithState();
                updatePhysics();
            }
        });
    });
}

// Sync UI Controls with Internal State
function syncSlidersWithState() {
    sliders.speed.value = state.speed;
    sliders.aoa.value = state.aoa;
    sliders.area.value = state.area;
    sliders.weight.value = state.weight;
    sliders.density.value = state.density;
}

// Physics Computation Engine
function updatePhysics() {
    const alpha = state.aoa;

    // Lift Coefficient Calculation (Linear slope + Stall drop-off)
    if (alpha <= state.aoaStall) {
        state.cl = state.cl0 + state.cla * alpha;
        state.isStalled = false;
    } else {
        // Post-stall lift decay
        const peakCl = state.cl0 + state.cla * state.aoaStall;
        const stallPenalty = (alpha - state.aoaStall) * 0.08;
        state.cl = Math.max(0.2, peakCl - stallPenalty);
        state.isStalled = true;
    }

    // Induced Drag: C_Di = (C_L^2) / (pi * AR * e)
    const e = 0.82; // Oswald efficiency factor
    const cdi = (state.cl * state.cl) / (Math.PI * state.aspectRatio * e);
    
    // Total Drag Coefficient (Parasitic + Induced + Stall separation penalty)
    let stallDragBonus = 0;
    if (state.isStalled) {
        stallDragBonus = Math.pow((alpha - state.aoaStall), 1.8) * 0.01;
    }
    state.cd = state.cd0 + cdi + stallDragBonus;

    // Dynamic Pressure: q = 0.5 * rho * v^2
    const q = 0.5 * state.density * Math.pow(state.speed, 2);

    // Forces in Newtons
    state.lift = q * state.area * state.cl;
    state.drag = q * state.area * state.cd;
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;

    // Aircraft Required Lift (Weight force = m * g)
    const g = 9.81;
    state.reqLift = state.weight * g;

    updateUI(cdi, q);
}

// Update DOM Displays and Gauges
function updateUI(cdi, q) {
    displays.speed.textContent = Math.round(state.speed);
    displays.speedKnots.textContent = Math.round(state.speed * 1.94384);
    displays.aoa.textContent = state.aoa.toFixed(1);
    displays.area.textContent = Math.round(state.area);
    displays.weight.textContent = state.weight.toLocaleString();
    displays.density.textContent = state.density.toFixed(3);

    const liftKN = state.lift / 1000;
    const dragKN = state.drag / 1000;
    const reqLiftKN = state.reqLift / 1000;

    displays.valLift.innerHTML = `${liftKN.toFixed(1)} <span class="unit">kN</span>`;
    displays.valDrag.innerHTML = `${dragKN.toFixed(1)} <span class="unit">kN</span>`;
    displays.valLd.textContent = state.ldRatio.toFixed(1);
    displays.valReqLift.textContent = `Required Lift: ${reqLiftKN.toFixed(1)} kN`;

    // Flight Status Determination
    if (state.isStalled) {
        displays.valCondition.textContent = "STALL WARNING";
        displays.valCondition.style.color = "var(--accent-red)";
        displays.stallIndicator.classList.add("stalled");
        displays.stallText.textContent = "Flow Separation (Stall)";
    } else if (liftKN >= reqLiftKN * 1.05) {
        displays.valCondition.textContent = "Climbing";
        displays.valCondition.style.color = "var(--accent-cyan)";
        displays.stallIndicator.classList.remove("stalled");
        displays.stallText.textContent = "Attached Airflow";
    } else if (liftKN >= reqLiftKN * 0.95) {
        displays.valCondition.textContent = "Level Cruise";
        displays.valCondition.style.color = "var(--accent-green)";
        displays.stallIndicator.classList.remove("stalled");
        displays.stallText.textContent = "Attached Airflow";
    } else {
        displays.valCondition.textContent = "Descending";
        displays.valCondition.style.color = "var(--accent-warning)";
        displays.stallIndicator.classList.remove("stalled");
        displays.stallText.textContent = "Insufficient Lift";
    }

    // Gauge Percentage Fills
    displays.gaugeLift.style.width = `${Math.min(100, (liftKN / (reqLiftKN * 1.5)) * 100)}%`;
    displays.gaugeDrag.style.width = `${Math.min(100, (dragKN / (liftKN * 0.25 || 1)) * 100)}%`;
    displays.gaugeLd.style.width = `${Math.min(100, (state.ldRatio / 25) * 100)}%`;

    // Hero Section Stats Sync
    displays.heroLift.textContent = `${liftKN.toFixed(1)} kN`;
    displays.heroLd.textContent = state.ldRatio.toFixed(1);
    displays.heroStatus.textContent = state.isStalled ? "Stall" : "Attached";

    // Equations Display Sync
    displays.eqRho.textContent = `${state.density.toFixed(3)} kg/m³`;
    displays.eqV.textContent = `${Math.round(state.speed)} m/s`;
    displays.eqS.textContent = `${Math.round(state.area)} m²`;
    displays.eqCl.textContent = state.cl.toFixed(2);
    displays.eqL.textContent = `${liftKN.toFixed(1)} kN`;

    displays.eqCd0.textContent = state.cd0.toFixed(3);
    displays.eqCdi.textContent = cdi.toFixed(3);
    displays.eqCd.textContent = state.cd.toFixed(3);
    displays.eqQ.textContent = `${Math.round(q).toLocaleString()} Pa`;
    displays.eqD.textContent = `${dragKN.toFixed(1)} kN`;
}

// Initializing Canvases and Particles
function initCanvases() {
    const particleCanvas = document.getElementById('particle-canvas');
    const heroCanvas = document.getElementById('hero-wing-canvas');
    const simCanvas = document.getElementById('sim-wing-canvas');

    resizeCanvasToDisplaySize(particleCanvas);
    resizeCanvasToDisplaySize(heroCanvas);
    resizeCanvasToDisplaySize(simCanvas);

    // Initialize Particle Arrays
    simParticles = Array.from({ length: 120 }, () => new AirflowParticle(simCanvas.width, simCanvas.height));
    heroParticles = Array.from({ length: 80 }, () => new AirflowParticle(heroCanvas.width, heroCanvas.height));
}

function resizeCanvasToDisplaySize(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

// Animation Loop
function renderLoop() {
    renderParticleBg();
    renderWingCanvas('sim-wing-canvas', simParticles, true);
    renderWingCanvas('hero-wing-canvas', heroParticles, false);

    renderGraphClAoa();
    renderGraphDragSpeed();
    renderGraphLdAoa();

    requestAnimationFrame(renderLoop);
}

// Background Floating Particles Canvas
function renderParticleBg() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 136, 255, 0.15)";
    for (let i = 0; i < 40; i++) {
        const x = (Math.sin(Date.now() * 0.0005 + i) * 0.5 + 0.5) * canvas.width;
        const y = (Math.cos(Date.now() * 0.0003 + i * 2) * 0.5 + 0.5) * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Render Airfoil Canvas Simulation
function renderWingCanvas(canvasId, particles, showVectors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const foilX = w * 0.45;
    const foilY = h * 0.5;
    const chord = Math.min(w, h) * 0.45;

    // Draw Particles Streamlines
    particles.forEach(p => {
        p.update(w, h, foilX, foilY, state.aoa, state.isStalled);
        p.draw(ctx);
    });

    // Draw Pressure Gradient Glow
    ctx.save();
    ctx.translate(foilX, foilY);
    ctx.rotate((-state.aoa * Math.PI) / 180);

    // Low Pressure (Top)
    const topGlow = ctx.createRadialGradient(0, -30, 5, 0, -30, chord * 0.6);
    topGlow.addColorStop(0, state.isStalled ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0, 136, 255, 0.3)');
    topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(-chord, -chord, chord * 2, chord);

    // High Pressure (Bottom)
    const botGlow = ctx.createRadialGradient(0, 30, 5, 0, 30, chord * 0.6);
    botGlow.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
    botGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = botGlow;
    ctx.fillRect(-chord, 0, chord * 2, chord);

    // Draw NACA Style Airfoil Geometry
    ctx.beginPath();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;

    for (let i = 0; i <= 100; i++) {
        const xNorm = i / 100;
        const x = (xNorm - 0.3) * chord;
        // Symmetric/Cambered airfoil shape approximation
        const yt = 5 * 0.12 * chord * (0.2969 * Math.sqrt(xNorm) - 0.1260 * xNorm - 0.3516 * Math.pow(xNorm, 2) + 0.2843 * Math.pow(xNorm, 3) - 0.1015 * Math.pow(xNorm, 4));
        const yc = 0.04 * chord * (xNorm - Math.pow(xNorm, 2)); // Camber
        const yUpper = -yt - yc;

        if (i === 0) ctx.moveTo(x, yUpper);
        else ctx.lineTo(x, yUpper);
    }

    for (let i = 100; i >= 0; i--) {
        const xNorm = i / 100;
        const x = (xNorm - 0.3) * chord;
        const yt = 5 * 0.12 * chord * (0.2969 * Math.sqrt(xNorm) - 0.1260 * xNorm - 0.3516 * Math.pow(xNorm, 2) + 0.2843 * Math.pow(xNorm, 3) - 0.1015 * Math.pow(xNorm, 4));
        const yc = 0.04 * chord * (xNorm - Math.pow(xNorm, 2));
        const yLower = yt - yc;
        ctx.lineTo(x, yLower);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Render Force Vectors (Lift & Drag)
    if (showVectors) {
        const liftLen = Math.min(140, (state.lift / 1000) * 0.08);
        const dragLen = Math.min(100, (state.drag / 1000) * 0.4);

        // Lift Vector (Perpendicular upward)
        drawVectorArrow(ctx, foilX, foilY, foilX, foilY - liftLen, '#00f0ff', 'Lift');
        // Drag Vector (Parallel downstream)
        drawVectorArrow(ctx, foilX, foilY, foilX + dragLen, foilY, '#ef4444', 'Drag');
    }
}

// Draw Vector Arrows with Labels
function drawVectorArrow(ctx, fromX, fromY, toX, toY, color, label) {
    const headLen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.font = '11px JetBrains Mono';
    ctx.fillText(label, toX + 8, toY + 4);
    ctx.restore();
}

// Canvas Live Graph Renderers
function renderGraphClAoa() {
    const canvas = document.getElementById('graph-cl-aoa');
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    drawGraphAxes(ctx, w, h, '-5°', '25°', '0', '2.0');

    ctx.beginPath();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;

    for (let a = -5; a <= 25; a += 0.5) {
        let cl = 0;
        if (a <= state.aoaStall) {
            cl = state.cl0 + state.cla * a;
        } else {
            const peakCl = state.cl0 + state.cla * state.aoaStall;
            cl = Math.max(0.2, peakCl - (a - state.aoaStall) * 0.08);
        }

        const x = mapRange(a, -5, 25, 30, w - 15);
        const y = mapRange(cl, 0, 2.0, h - 20, 15);

        if (a === -5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Plot Current Operating Point
    const currentX = mapRange(state.aoa, -5, 25, 30, w - 15);
    const currentY = mapRange(state.cl, 0, 2.0, h - 20, 15);
    drawPlotPoint(ctx, currentX, currentY, state.isStalled ? '#ef4444' : '#00f0ff');
}

function renderGraphDragSpeed() {
    const canvas = document.getElementById('graph-drag-speed');
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    drawGraphAxes(ctx, w, h, '10m/s', '300m/s', '0', 'Max');

    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;

    const maxDragVal = 0.5 * state.density * Math.pow(300, 2) * state.area * state.cd;

    for (let v = 10; v <= 300; v += 5) {
        const q = 0.5 * state.density * Math.pow(v, 2);
        const drag = q * state.area * state.cd;

        const x = mapRange(v, 10, 300, 30, w - 15);
        const y = mapRange(drag, 0, maxDragVal || 1, h - 20, 15);

        if (v === 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const currentX = mapRange(state.speed, 10, 300, 30, w - 15);
    const currentY = mapRange(state.drag, 0, maxDragVal || 1, h - 20, 15);
    drawPlotPoint(ctx, currentX, currentY, '#ef4444');
}

function renderGraphLdAoa() {
    const canvas = document.getElementById('graph-ld-aoa');
    if (!canvas) return;
    resizeCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    drawGraphAxes(ctx, w, h, '-5°', '25°', '0', '25');

    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;

    const e = 0.82;

    for (let a = -5; a <= 25; a += 0.5) {
        let cl = 0;
        let isStalled = a > state.aoaStall;

        if (!isStalled) {
            cl = state.cl0 + state.cla * a;
        } else {
            const peakCl = state.cl0 + state.cla * state.aoaStall;
            cl = Math.max(0.2, peakCl - (a - state.aoaStall) * 0.08);
        }

        const cdi = (cl * cl) / (Math.PI * state.aspectRatio * e);
        let stallBonus = isStalled ? Math.pow((a - state.aoaStall), 1.8) * 0.01 : 0;
        const cd = state.cd0 + cdi + stallBonus;
        const ld = cd > 0 ? cl / cd : 0;

        const x = mapRange(a, -5, 25, 30, w - 15);
        const y = mapRange(ld, 0, 25, h - 20, 15);

        if (a === -5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const currentX = mapRange(state.aoa, -5, 25, 30, w - 15);
    const currentY = mapRange(state.ldRatio, 0, 25, h - 20, 15);
    drawPlotPoint(ctx, currentX, currentY, '#10b981');
}

// Graph Grid Axes Helper
function drawGraphAxes(ctx, w, h, xMin, xMax, yMin, yMax) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Grid lines
    ctx.beginPath();
    ctx.moveTo(30, 15); ctx.lineTo(30, h - 20); ctx.lineTo(w - 15, h - 20);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText(xMin, 30, h - 5);
    ctx.fillText(xMax, w - 30, h - 5);
    ctx.fillText(yMax, 5, 20);
    ctx.fillText(yMin, 5, h - 20);
}

// Render Operating Point Marker
function drawPlotPoint(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// Range Mapping Helper
function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}