// AeroLab Simulation Engine

const state = {
    speed: 240,       // km/h
    aoa: 6.0,         // deg
    area: 45,         // m^2
    weight: 120,      // kN
    density: 1.225,   // kg/m^3
    showVectors: true,
    showPressure: true,
    showParticles: true,

    // Physics Results
    cL: 0,
    cD: 0,
    lift: 0,
    drag: 0,
    ldRatio: 0,
    isStalled: false,
    criticalAoA: 15.0
};

const presets = {
    passenger: { speed: 450, aoa: 4.5, area: 125, weight: 220, density: 1.225 },
    fighter: { speed: 580, aoa: 8.0, area: 48, weight: 140, density: 1.225 },
    glider: { speed: 90, aoa: 5.0, area: 16, weight: 6, density: 1.225 },
    cargo: { speed: 310, aoa: 6.5, area: 310, weight: 320, density: 1.225 }
};

class StreamParticle {
    constructor(w, h) {
        this.reset(w, h, true);
    }

    reset(w, h, initial = false) {
        this.x = initial ? Math.random() * w : 0;
        this.y = Math.random() * h;
        this.vx = 3 + Math.random() * 2;
        this.vy = 0;
    }

    update(w, h, state) {
        const speedFactor = state.speed / 180;
        const rad = (state.aoa * Math.PI) / 180;
        const cx = w * 0.45;
        const cy = h * 0.5;

        const dx = this.x - cx;
        const dy = this.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 140) {
            const influence = 1 - dist / 140;
            if (state.isStalled) {
                if (this.x > cx) {
                    this.vx += (Math.random() - 0.5) * 1.5;
                    this.vy += (Math.random() - 0.5) * 2.5 - 0.5;
                }
            } else {
                const angleEffect = Math.sin(rad) * influence;
                if (this.x < cx) {
                    this.vy -= angleEffect * 1.5;
                } else {
                    this.vy += angleEffect * 2.5;
                }
            }
        }

        this.x += this.vx * speedFactor;
        this.y += this.vy;
        this.vy *= 0.92;

        if (this.x > w || this.y < 0 || this.y > h) {
            this.reset(w, h);
        }
    }

    draw(ctx, isDark) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
    }
}

let mainCanvas, mainCtx;
let particles = [];
let bgParticles = [];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initControls();
    initCanvases();
    initBgParticles();
    initPresets();

    calculatePhysics();
    requestAnimationFrame(renderLoop);
});

// Theme Toggle
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        renderGraphs();
    });
}

// Controls Logic
function initControls() {
    ['speed', 'aoa', 'area', 'weight', 'density'].forEach(id => {
        const input = document.getElementById(`param-${id}`);
        if (!input) return;
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

    document.getElementById('reset-params').addEventListener('click', () => applyPreset(presets.passenger));
}

// Physics Formulas
function calculatePhysics() {
    const vMS = state.speed / 3.6; // Speed in m/s
    const alphaRad = (state.aoa * Math.PI) / 180;

    state.isStalled = state.aoa > state.criticalAoA;

    // Lift Coefficient calculation
    if (!state.isStalled) {
        state.cL = 0.25 + 2 * Math.PI * alphaRad * 0.85;
    } else {
        const diff = state.aoa - state.criticalAoA;
        const maxCL = 0.25 + 2 * Math.PI * ((state.criticalAoA * Math.PI) / 180) * 0.85;
        state.cL = Math.max(0.15, maxCL - diff * 0.08);
    }

    // Drag Coefficient calculation
    const cD0 = 0.02;
    const aspectR = 7.5;
    const e = 0.82;

    if (!state.isStalled) {
        state.cD = cD0 + (Math.pow(state.cL, 2) / (Math.PI * e * aspectR));
    } else {
        state.cD = cD0 + 0.2 + Math.pow(Math.sin(alphaRad), 2) * 1.1;
    }

    // Lift Equation: L = 1/2 * rho * V^2 * S * cL
    const q = 0.5 * state.density * Math.pow(vMS, 2);
    state.lift = (q * state.area * state.cL) / 1000; // kN
    state.drag = (q * state.area * state.cD) / 1000; // kN
    state.ldRatio = state.drag > 0 ? (state.lift / state.drag) : 0;

    updateUI();
}

function updateUI() {
    document.getElementById('metric-lift').innerHTML = `${state.lift.toFixed(1)} <small>kN</small>`;
    document.getElementById('metric-drag').innerHTML = `${state.drag.toFixed(1)} <small>kN</small>`;
    document.getElementById('metric-ld').innerText = state.ldRatio.toFixed(2);

    const margin = ((state.lift - state.weight) / state.weight) * 100;
    const marginElem = document.getElementById('metric-margin');
    marginElem.innerText = `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}%`;
    marginElem.style.color = margin >= 0 ? 'var(--success)' : 'var(--danger)';

    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const stallWarning = document.getElementById('stall-warning');

    if (state.isStalled) {
        statusDot.className = 'status-dot warning';
        statusText.innerText = 'Stalled';
        stallWarning.classList.remove('hidden');
    } else if (Math.abs(state.lift - state.weight) < 15) {
        statusDot.className = 'status-dot';
        statusText.innerText = 'Level Cruise';
        stallWarning.classList.add('hidden');
    } else if (state.lift > state.weight) {
        statusDot.className = 'status-dot';
        statusText.innerText = 'Ascending';
        stallWarning.classList.add('hidden');
    } else {
        statusDot.className = 'status-dot warning';
        statusText.innerText = 'Descending';
        stallWarning.classList.add('hidden');
    }

    const heroLift = document.getElementById('stat-lift');
    const heroLD = document.getElementById('stat-ld');
    if (heroLift) heroLift.innerText = state.lift.toFixed(1);
    if (heroLD) heroLD.innerText = state.ldRatio.toFixed(1);
}

// Canvas Initialization with resizing
function initCanvases() {
    mainCanvas = document.getElementById('airfoil-canvas');
    mainCtx = mainCanvas.getContext('2d');

    resizeCanvas(mainCanvas);
    window.addEventListener('resize', () => {
        resizeCanvas(mainCanvas);
        renderGraphs();
    });

    particles = [];
    for (let i = 0; i < 90; i++) {
        particles.push(new StreamParticle(mainCanvas.width || 600, mainCanvas.height || 380));
    }

    renderGraphs();
}

function resizeCanvas(canvas) {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width || 600;
    canvas.height = rect.height || 300;
}

// Aircraft Presets
function initPresets() {
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

    ['speed', 'aoa', 'area', 'weight', 'density'].forEach(id => {
        document.getElementById(`param-${id}`).value = p[id];
        document.getElementById(`val-${id}`).innerText = p[id];
    });

    calculatePhysics();
    renderGraphs();
}

// Ambient Background Particles
function initBgParticles() {
    const bgCanvas = document.getElementById('bg-particles');
    const bgCtx = bgCanvas.getContext('2d');

    const resizeBg = () => {
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
    };
    resizeBg();
    window.addEventListener('resize', resizeBg);

    bgParticles = Array.from({ length: 35 }, () => ({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        r: Math.random() * 1.5 + 0.5,
        vx: Math.random() * 0.4 + 0.1
    }));

    function animBg() {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        bgCtx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';

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

// Main Canvas Render Loop
function renderLoop() {
    const w = mainCanvas.width || 600;
    const h = mainCanvas.height || 380;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    mainCtx.clearRect(0, 0, w, h);

    // Streamline particles
    if (state.showParticles) {
        particles.forEach(p => {
            p.update(w, h, state);
            p.draw(mainCtx, isDark);
        });
    }

    const cx = w * 0.45;
    const cy = h * 0.5;

    // Pressure Gradient Overlay
    if (state.showPressure) {
        const topGrad = mainCtx.createRadialGradient(cx, cy - 25, 5, cx, cy - 25, 80);
        topGrad.addColorStop(0, state.isStalled ? 'rgba(239, 68, 68, 0.22)' : 'rgba(59, 130, 246, 0.22)');
        topGrad.addColorStop(1, 'transparent');
        mainCtx.fillStyle = topGrad;
        mainCtx.beginPath();
        mainCtx.arc(cx, cy - 25, 80, 0, Math.PI * 2);
        mainCtx.fill();

        const botGrad = mainCtx.createRadialGradient(cx, cy + 25, 5, cx, cy + 25, 70);
        botGrad.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
        botGrad.addColorStop(1, 'transparent');
        mainCtx.fillStyle = botGrad;
        mainCtx.beginPath();
        mainCtx.arc(cx, cy + 25, 70, 0, Math.PI * 2);
        mainCtx.fill();
    }

    // Airfoil Wing Drawing
    mainCtx.save();
    mainCtx.translate(cx, cy);
    mainCtx.rotate((-state.aoa * Math.PI) / 180);

    mainCtx.beginPath();
    mainCtx.moveTo(-90, 0);
    mainCtx.bezierCurveTo(-40, -28, 30, -24, 90, 0);
    mainCtx.bezierCurveTo(30, 10, -40, 8, -90, 0);
    mainCtx.closePath();

    mainCtx.fillStyle = isDark ? '#2d313e' : '#e5e7eb';
    mainCtx.strokeStyle = isDark ? '#f3f4f6' : '#111827';
    mainCtx.lineWidth = 2;
    mainCtx.fill();
    mainCtx.stroke();

    mainCtx.restore();

    // Force Vectors Overlay
    if (state.showVectors) {
        const liftScale = Math.min(state.lift * 0.6, 120);
        drawArrow(mainCtx, cx, cy, cx, cy - liftScale, isDark ? '#3b82f6' : '#2563eb', 'Lift: ' + state.lift.toFixed(1) + ' kN');

        const dragScale = Math.min(state.drag * 3.0, 100);
        drawArrow(mainCtx, cx, cy, cx - dragScale, cy, isDark ? '#f59e0b' : '#d97706', 'Drag: ' + state.drag.toFixed(1) + ' kN');
    }

    requestAnimationFrame(renderLoop);
}

function drawArrow(ctx, fx, fy, tx, ty, color, label) {
    const headlen = 8;
    const dx = tx - fx;
    const dy = ty - fy;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headlen * Math.cos(angle - Math.PI / 6), ty - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tx - headlen * Math.cos(angle + Math.PI / 6), ty - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText(label, tx + (dx === 0 ? 8 : -25), ty + (dy < 0 ? -8 : 16));

    ctx.restore();
}

// Live Graph Rendering
function renderGraphs() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const strokeColor = isDark ? '#3b82f6' : '#2563eb';

    renderGraph('graph-cl-aoa', (ctx, w, h) => {
        drawGrid(ctx, w, h, gridColor);
        ctx.beginPath();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;

        for (let a = -5; a <= 25; a += 0.5) {
            const rad = (a * Math.PI) / 180;
            let cL = a <= 15 ? 0.25 + 2 * Math.PI * rad * 0.85 : 1.4 - (a - 15) * 0.08;
            const px = 30 + ((a + 5) / 30) * (w - 40);
            const py = (h - 20) - (cL / 1.8) * (h - 30);
            if (a === -5) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        const curPx = 30 + ((state.aoa + 5) / 30) * (w - 40);
        const curPy = (h - 20) - (state.cL / 1.8) * (h - 30);
        drawPoint(ctx, curPx, curPy, isDark ? '#f59e0b' : '#d97706');
    });

    renderGraph('graph-drag-speed', (ctx, w, h) => {
        drawGrid(ctx, w, h, gridColor);
        ctx.beginPath();
        ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
        ctx.lineWidth = 2;

        for (let spd = 40; spd <= 600; spd += 10) {
            const vMS = spd / 3.6;
            const q = 0.5 * state.density * Math.pow(vMS, 2);
            const dragVal = (q * state.area * state.cD) / 1000;

            const px = 30 + ((spd - 40) / 560) * (w - 40);
            const py = (h - 20) - Math.min(dragVal / 80, 1) * (h - 30);
            if (spd === 40) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        const curPx = 30 + ((state.speed - 40) / 560) * (w - 40);
        const curPy = (h - 20) - Math.min(state.drag / 80, 1) * (h - 30);
        drawPoint(ctx, curPx, curPy, strokeColor);
    });

    renderGraph('graph-efficiency', (ctx, w, h) => {
        drawGrid(ctx, w, h, gridColor);
        ctx.beginPath();
        ctx.strokeStyle = isDark ? '#10b981' : '#059669';
        ctx.lineWidth = 2;

        for (let a = -2; a <= 20; a += 0.5) {
            const rad = (a * Math.PI) / 180;
            let cL = a <= 15 ? 0.25 + 2 * Math.PI * rad * 0.85 : 1.4 - (a - 15) * 0.08;
            let cD = 0.02 + (Math.pow(cL, 2) / (Math.PI * 0.82 * 7.5));
            let ratio = cL / cD;

            const px = 30 + ((a + 2) / 22) * (w - 40);
            const py = (h - 20) - Math.max(0, ratio / 25) * (h - 30);
            if (a === -2) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        const curPx = 30 + ((state.aoa + 2) / 22) * (w - 40);
        const curPy = (h - 20) - Math.max(0, state.ldRatio / 25) * (h - 30);
        drawPoint(ctx, curPx, curPy, isDark ? '#f59e0b' : '#d97706');
    });
}

function renderGraph(id, drawFn) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFn(ctx, canvas.width, canvas.height);
}

function drawGrid(ctx, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let x = 30; x < w; x += 35) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 10; y < h; y += 25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
}

function drawPoint(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
}