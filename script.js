// script.js

// State Management
const state = {
    speed: 240,       // km/h
    aoa: 6.0,         // degrees
    area: 45,         // m^2
    weight: 120,      // kN
    density: 1.225,   // kg/m^3
    showVectors: true,
    showPressure: true,
    showParticles: true,

    // Calculated Aerodynamics
    cL: 0,
    cD: 0,
    lift: 0,          // kN
    drag: 0,          // kN
    ldRatio: 0,
    isStalled: false,
    criticalAoA: 15.0
};

// Aircraft Presets Configuration
const presets = {
    passenger: { speed: 450, aoa: 4.5, area: 125, weight: 220, density: 1.225 },
    fighter: { speed: 580, aoa: 8.0, area: 48, weight: 140, density: 1.225 },
    glider: { speed: 90, aoa: 5.0, area: 16, weight: 6, density: 1.225 },
    cargo: { speed: 310, aoa: 6.5, area: 310, weight: 320, density: 1.225 }
};

// Particle System for Streamline Visualizer
class Particle {
    constructor(width, height) {
        this.reset(width, height, true);
    }

    reset(width, height, initial = false) {
        this.x = initial ? Math.random() * width : 0;
        this.y = Math.random() * height;
        this.vx = 4 + Math.random() * 2;
        this.vy = 0;
        this.life = Math.random() * 100;
        this.maxLife = 100 + Math.random() * 50;
    }

    update(width, height, state) {
        const speedFactor = state.speed / 200;
        const rad = (state.aoa * Math.PI) / 180;
        
        // Airfoil influence box coordinates centered in canvas
        const cx = width * 0.45;
        const cy = height * 0.5;
        const chord = 180;

        const dx = this.x - cx;
        const dy = this.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Streamline bending around airfoil
        if (dist < 160) {
            const influence = (1 - dist / 160);
            
            if (state.isStalled) {
                // Turbulent separation post-stall
                if (this.x > cx) {
                    this.vx += (Math.random() - 0.5) * 2;
                    this.vy += (Math.random() - 0.5) * 3 - 0.5;
                }
            } else {
                // Upwash before wing, Downwash behind wing
                const upwash = -Math.sin(rad) * influence * 2;
                const downwash = Math.sin(rad * 1.5) * influence * 3;
                
                if (this.x < cx) {
                    this.vy += upwash * 0.1;
                } else {
                    this.vy += downwash * 0.15;
                }
            }
        }

        this.x += this.vx * speedFactor;
        this.y += this.vy;

        // Friction / Air damping
        this.vy *= 0.95;

        if (this.x > width || this.y < 0 || this.y > height) {
            this.reset(width, height);
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.fill();
    }
}

// Global Variables
let mainCanvas, mainCtx;
let particles = [];
let bgParticles = [];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initControls();
    initCanvases();
    initBgParticles();
    initPresetCards();
    
    // Initial Aerodynamics Calculation & Loop Start
    calculatePhysics();
    requestAnimationFrame(renderLoop);
});

// Theme Switching
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        renderGraphs(); // Redraw graphs with updated colors
    });
}

// Binding Inputs and Controls
function initControls() {
    const inputs = ['speed', 'aoa', 'area', 'weight', 'density'];
    inputs.forEach(id => {
        const input = document.getElementById(`param-${id}`);
        input.addEventListener('input', (e) => {
            state[id] = parseFloat(e.target.value);
            document.getElementById(`val-${id}`).innerText = state[id];
            calculatePhysics();
            renderGraphs();
        });
    });

    document.getElementById('chk-vectors').addEventListener('change', (e) => state.showVectors = e.target.checked);
    document.getElementById('chk-pressure').addEventListener('change', (e) => state.showPressure = e.target.checked);
    document.getElementById('chk-particles').addEventListener('change', (e) => state.showParticles = e.target.checked);

    document.getElementById('reset-params').addEventListener('click', () => {
        applyPreset(presets.passenger);
    });
}

// Airfoil Physics Calculations
function calculatePhysics() {
    const vMS = state.speed / 3.6; // Convert km/h to m/s
    const alphaRad = (state.aoa * Math.PI) / 180;
    
    // Check stall state
    state.isStalled = state.aoa > state.criticalAoA;

    // Lift Coefficient (cL) equation with non-linear stall degradation
    if (!state.isStalled) {
        state.cL = 0.25 + 2 * Math.PI * alphaRad * 0.85;
    } else {
        // Post-stall lift breakdown
        const stallAngleDiff = state.aoa - state.criticalAoA;
        const maxCL = 0.25 + 2 * Math.PI * ((state.criticalAoA * Math.PI) / 180) * 0.85;
        state.cL = Math.max(0.2, maxCL - stallAngleDiff * 0.08);
    }

    // Drag Coefficient (cD) - Parasite + Induced Drag
    const cD0 = 0.02; // Parasite drag
    const aspectR = 7.5; // Aspect ratio
    const e = 0.82; // Oswald efficiency factor
    
    if (!state.isStalled) {
        state.cD = cD0 + (Math.pow(state.cL, 2) / (Math.PI * e * aspectR));
    } else {
        // Post-stall massive drag increase
        state.cD = cD0 + 0.25 + Math.pow(Math.sin(alphaRad), 2) * 1.2;
    }

    // Lift Force Equation: L = 1/2 * rho * V^2 * S * cL
    const q = 0.5 * state.density * Math.pow(vMS, 2); // Dynamic pressure (Pa)
    state.lift = (q * state.area * state.cL) / 1000; // Convert to kN
    state.drag = (q * state.area * state.cD) / 1000; // Convert to kN
    state.ldRatio = state.drag > 0 ? (state.lift / state.drag) : 0;

    updateUI();
}

// Update UI Telemetry Values
function updateUI() {
    document.getElementById('metric-lift').innerHTML = `${state.lift.toFixed(1)} <small>kN</small>`;
    document.getElementById('metric-drag').innerHTML = `${state.drag.toFixed(1)} <small>kN</small>`;
    document.getElementById('metric-ld').innerText = state.ldRatio.toFixed(2);
    
    const margin = ((state.lift - state.weight) / state.weight) * 100;
    const marginElem = document.getElementById('metric-margin');
    marginElem.innerText = `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%`;
    marginElem.style.color = margin >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const stallWarning = document.getElementById('stall-warning');

    if (state.isStalled) {
        statusDot.className = 'status-dot warning';
        statusText.innerText = 'STALLED';
        stallWarning.classList.remove('hidden');
    } else if (Math.abs(state.lift - state.weight) < 15) {
        statusDot.className = 'status-dot';
        statusText.innerText = 'Level Flight';
        stallWarning.classList.add('hidden');
    } else if (state.lift > state.weight) {
        statusDot.className = 'status-dot';
        statusText.innerText = 'Climbing Flight';
        stallWarning.classList.add('hidden');
    } else {
        statusDot.className = 'status-dot warning';
        statusText.innerText = 'Descending / Low Lift';
        stallWarning.classList.add('hidden');
    }

    // Hero quick metric update
    const heroLift = document.getElementById('stat-lift');
    if (heroLift) heroLift.innerText = state.lift.toFixed(1);
}

// Setup Canvases
function initCanvases() {
    mainCanvas = document.getElementById('airfoil-canvas');
    mainCtx = mainCanvas.getContext('2d');
    
    resizeCanvas(mainCanvas);
    window.addEventListener('resize', () => resizeCanvas(mainCanvas));

    // Create Streamline particles
    particles = [];
    for (let i = 0; i < 120; i++) {
        particles.push(new Particle(mainCanvas.width, mainCanvas.height));
    }

    renderGraphs();
}

function resizeCanvas(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

// Preset Cards Setup
function initPresetCards() {
    const cards = document.querySelectorAll('.preset-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const key = card.getAttribute('data-preset');
            applyPreset(presets[key]);
        });
    });
}

function applyPreset(p) {
    state.speed = p.speed;
    state.aoa = p.aoa;
    state.area = p.area;
    state.weight = p.weight;
    state.density = p.density;

    document.getElementById('param-speed').value = p.speed;
    document.getElementById('param-aoa').value = p.aoa;
    document.getElementById('param-area').value = p.area;
    document.getElementById('param-weight').value = p.weight;
    document.getElementById('param-density').value = p.density;

    document.getElementById('val-speed').innerText = p.speed;
    document.getElementById('val-aoa').innerText = p.aoa;
    document.getElementById('val-area').innerText = p.area;
    document.getElementById('val-weight').innerText = p.weight;
    document.getElementById('val-density').innerText = p.density;

    calculatePhysics();
    renderGraphs();
}

// Background Particle Grid
function initBgParticles() {
    const bgCanvas = document.getElementById('bg-particles');
    const bgCtx = bgCanvas.getContext('2d');
    
    const resizeBg = () => {
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
    };
    resizeBg();
    window.addEventListener('resize', resizeBg);

    bgParticles = Array.from({ length: 60 }, () => ({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        r: Math.random() * 2 + 1,
        vx: Math.random() * 0.5 + 0.2
    }));

    function animBg() {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        
        bgParticles.forEach(p => {
            p.x += p.vx;
            if (p.x > bgCanvas.width) p.x = 0;
            bgCtx.beginPath();
            bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            bgCtx.fill();
        });

        requestAnimationFrame(animBg);
    }
    animBg();
}

// Main Canvas Animation Loop
function renderLoop() {
    const w = mainCanvas.width;
    const h = mainCanvas.height;

    mainCtx.clearRect(0, 0, w, h);

    // Render Streamline Particles
    if (state.showParticles) {
        particles.forEach(p => {
            p.update(w, h, state);
            p.draw(mainCtx);
        });
    }

    // Canvas Center
    const cx = w * 0.45;
    const cy = h * 0.5;

    // Pressure Gradient Effect
    if (state.showPressure) {
        const rad = (state.aoa * Math.PI) / 180;
        
        // Low Pressure Region (Above Wing)
        const topGrad = mainCtx.createRadialGradient(cx, cy - 30, 5, cx, cy - 30, 90);
        topGrad.addColorStop(0, state.isStalled ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.3)');
        topGrad.addColorStop(1, 'transparent');
        mainCtx.fillStyle = topGrad;
        mainCtx.beginPath();
        mainCtx.arc(cx, cy - 30, 90, 0, Math.PI * 2);
        mainCtx.fill();

        // High Pressure Region (Below Wing)
        const botGrad = mainCtx.createRadialGradient(cx, cy + 30, 5, cx, cy + 30, 80);
        botGrad.addColorStop(0, 'rgba(249, 115, 22, 0.25)');
        botGrad.addColorStop(1, 'transparent');
        mainCtx.fillStyle = botGrad;
        mainCtx.beginPath();
        mainCtx.arc(cx, cy + 30, 80, 0, Math.PI * 2);
        mainCtx.fill();
    }

    // Render Airfoil Shape
    mainCtx.save();
    mainCtx.translate(cx, cy);
    mainCtx.rotate((-state.aoa * Math.PI) / 180); // Negative for pitch up visual

    mainCtx.beginPath();
    // NACA 0012 Airfoil Profile Approximation
    mainCtx.moveTo(-90, 0);
    mainCtx.bezierCurveTo(-40, -28, 30, -22, 90, 0);
    mainCtx.bezierCurveTo(30, 10, -40, 8, -90, 0);
    mainCtx.closePath();

    mainCtx.fillStyle = '#1e293b';
    mainCtx.strokeStyle = '#38bdf8';
    mainCtx.lineWidth = 2.5;
    mainCtx.fill();
    mainCtx.stroke();

    mainCtx.restore();

    // Render Force Vector Arrows
    if (state.showVectors) {
        // Lift Arrow (Upward)
        const liftScale = Math.min(state.lift * 0.8, 140);
        drawArrow(mainCtx, cx, cy, cx, cy - liftScale, '#38bdf8', 'Lift: ' + state.lift.toFixed(1) + ' kN');

        // Drag Arrow (Backward)
        const dragScale = Math.min(state.drag * 3.5, 120);
        drawArrow(mainCtx, cx, cy, cx - dragScale, cy, '#f97316', 'Drag: ' + state.drag.toFixed(1) + ' kN');
    }

    requestAnimationFrame(renderLoop);
}

// Vector Arrow Drawing Helper
function drawArrow(ctx, fromx, fromy, tox, toy, color, label) {
    const headlen = 10;
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;

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

    // Text Label
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(label, tox + (dx === 0 ? 10 : -30), toy + (dy < 0 ? -10 : 20));

    ctx.restore();
}

// Render Telemetry Live Graphs
function renderGraphs() {
    renderCLvsAoAGraph();
    renderDragVsSpeedGraph();
    renderEfficiencyGraph();
}

function getGraphThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#94a3b8' : '#475569',
        grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        accent: '#38bdf8',
        highlight: '#f97316'
    };
}

function renderCLvsAoAGraph() {
    const canvas = document.getElementById('graph-cl-aoa');
    if (!canvas) return;
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const colors = getGraphThemeColors();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 25); ctx.stroke();
    }
    for (let y = 10; y < h - 25; y += 30) {
        ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Plot CL vs AoA Curve (-5° to 25°)
    ctx.beginPath();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.5;

    for (let aoa = -5; aoa <= 25; aoa += 0.5) {
        const rad = (aoa * Math.PI) / 180;
        let cL = 0;
        if (aoa <= 15) {
            cL = 0.25 + 2 * Math.PI * rad * 0.85;
        } else {
            cL = 1.4 - (aoa - 15) * 0.08;
        }

        const px = 40 + ((aoa + 5) / 30) * (w - 50);
        const py = (h - 30) - (cL / 1.8) * (h - 40);

        if (aoa === -5) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Highlight Current AoA Position
    const currentPx = 40 + ((state.aoa + 5) / 30) * (w - 50);
    const currentPy = (h - 30) - (state.cL / 1.8) * (h - 40);

    ctx.fillStyle = colors.highlight;
    ctx.beginPath();
    ctx.arc(currentPx, currentPy, 5, 0, Math.PI * 2);
    ctx.fill();
}

function renderDragVsSpeedGraph() {
    const canvas = document.getElementById('graph-drag-speed');
    if (!canvas) return;
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const colors = getGraphThemeColors();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.5;

    for (let spd = 40; spd <= 600; spd += 10) {
        const vMS = spd / 3.6;
        const q = 0.5 * state.density * Math.pow(vMS, 2);
        const dragVal = (q * state.area * state.cD) / 1000;

        const px = 40 + ((spd - 40) / 560) * (w - 50);
        const py = (h - 30) - Math.min(dragVal / 80, 1) * (h - 40);

        if (spd === 40) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current Speed point
    const curPx = 40 + ((state.speed - 40) / 560) * (w - 50);
    const curPy = (h - 30) - Math.min(state.drag / 80, 1) * (h - 40);

    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
    ctx.fill();
}

function renderEfficiencyGraph() {
    const canvas = document.getElementById('graph-efficiency');
    if (!canvas) return;
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    const colors = getGraphThemeColors();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;

    for (let a = -2; a <= 20; a += 0.5) {
        const rad = (a * Math.PI) / 180;
        let cL = a <= 15 ? 0.25 + 2 * Math.PI * rad * 0.85 : 1.4 - (a - 15) * 0.08;
        let cD = 0.02 + (Math.pow(cL, 2) / (Math.PI * 0.82 * 7.5));
        let ratio = cL / cD;

        const px = 40 + ((a + 2) / 22) * (w - 50);
        const py = (h - 30) - Math.max(0, ratio / 25) * (h - 40);

        if (a === -2) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current Point
    const curPx = 40 + ((state.aoa + 2) / 22) * (w - 50);
    const curPy = (h - 30) - Math.max(0, state.ldRatio / 25) * (h - 40);

    ctx.fillStyle = colors.highlight;
    ctx.beginPath();
    ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
    ctx.fill();
}