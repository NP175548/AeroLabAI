// script.js

/**
 * AeroLab — Aerodynamics Engine
 * Interactive pitch, flow particle system, and vector balance renderer
 */

// Flight Dynamics & Visual Display State
const state = {
    aoa: 4.0,           // Angle of Attack (deg)
    speed: 120,         // True Airspeed v (m/s)
    area: 125,          // Wing Area S (m²)
    mass: 65000,        // Aircraft Mass m (kg)
    density: 1.225,     // Air Density rho (kg/m³)

    // Display Toggles
    showVectors: true,
    showPressureGlow: true,
    showParticles: true,

    // Airfoil Constant Parameters (NACA 0012 baseline)
    cl0: 0.10,          // Zero-AoA Lift Coefficient
    cla: 0.10,          // Lift slope per degree
    aoaStall: 15.0,     // Stall angle of attack (deg)
    cd0: 0.020,         // Parasitic Drag Coefficient C_D0
    aspectRatio: 8.5,   // Wing Aspect Ratio AR
    oswaldEff: 0.82,    // Oswald Efficiency Factor e

    // Computed Dynamics
    cl: 0,
    cd: 0,
    lift: 0,            // Dynamic Lift Force L (N)
    drag: 0,            // Drag Force D (N)
    q: 0,               // Dynamic Pressure (Pa)
    ldRatio: 0,
    isStalled: false,
    reqLift: 0,         // Equilibrium Lift W = m*g (N)

    // Vector Smoothing Interpolations
    smoothLiftX: 0,
    smoothLiftY: 0,
    smoothDragX: 0,
    smoothDragY: 0
};

// Aircraft Presets Catalog
const aircraftPresets = {
    commercial: { speed: 120, aoa: 4.0, area: 125, mass: 65000, density: 1.225 },
    fighter:    { speed: 220, aoa: 3.0, area: 28,  mass: 12000, density: 1.225 },
    glider:     { speed: 35,  aoa: 5.0, area: 15,  mass: 450,   density: 1.225 },
    cargo:      { speed: 110, aoa: 5.5, area: 350, mass: 180000,density: 1.225 }
};

// Flow Particle Streamer System
class StreamParticle {
    constructor(w, h) {
        this.reset(w, h, true);
    }

    reset(w, h, randomX = false) {
        this.x = randomX ? Math.random() * w : -10;
        this.y = Math.random() * h;
        this.size = Math.random() * 1.8 + 1.2;
        this.alpha = Math.random() * 0.5 + 0.35;
    }

    update(w, h, foilX, foilY, chord) {
        // Pitch Angle Correction: Canvas positive pitch tilts wing leading edge UP
        const pitchRad = (state.aoa * Math.PI) / 180;
        
        // Translate particle position relative to airfoil pivot center
        const dx = this.x - foilX;
        const dy = this.y - foilY;

        // Transform into wing local coordinate system
        const localX = dx * Math.cos(pitchRad) + dy * Math.sin(pitchRad);
        const localY = -dx * Math.sin(pitchRad) + dy * Math.cos(pitchRad);

        const halfChord = chord * 0.5;
        const thickness = chord * 0.12;

        // Particle Interaction Boundary
        if (localX > -halfChord * 1.1 && localX < halfChord * 1.1) {
            const normX = Math.max(0, Math.min(1, (localX + halfChord) / chord));
            
            // NACA 0012 Thickness Profile
            const yt = 5 * thickness * (
                0.2969 * Math.sqrt(normX) - 
                0.1260 * normX - 
                0.3516 * Math.pow(normX, 2) + 
                0.2843 * Math.pow(normX, 3) - 
                0.1015 * Math.pow(normX, 4)
            );

            // Flow Deflection along upper and lower surfaces
            if (localY < 0 && localY > -yt - 28) {
                // Suction Side
                const targetY = -yt - 6;
                this.y += (targetY - localY) * 0.12;
                
                if (state.isStalled && localX > 0) {
                    // Flow Separation Turbulence in Stall
                    this.y += (Math.random() - 0.5) * 6;
                    this.x += (Math.random() - 0.5) * 3;
                }
            } else if (localY >= 0 && localY < yt + 28) {
                // Pressure Side
                const targetY = yt + 6;
                this.y += (targetY - localY) * 0.12;
            }
        }

        // Advance particle downstream
        this.x += state.speed * 0.04 + 2.5;

        // Reset if offscreen
        if (this.x > w + 15 || this.y < -20 || this.y > h + 20) {
            this.reset(w, h, false);
        }
    }

    draw(ctx, isLightMode) {
        ctx.fillStyle = isLightMode 
            ? `rgba(2, 132, 199, ${this.alpha * 1.1})` 
            : `rgba(0, 240, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

let particles = [];

// Initialize Application Logic
function init() {
    initTheme();
    bindInputs();
    bindPresets();
    bindToggles();
    updatePhysics();
    initCanvas();

    window.addEventListener('resize', initCanvas);
    requestAnimationFrame(renderLoop);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Light / Dark Theme Switcher
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    
    btn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
    });
}

// Bind Display Toggle Switches
function bindToggles() {
    const toggleVec = document.getElementById('toggle-vectors');
    const togglePress = document.getElementById('toggle-pressure');
    const togglePart = document.getElementById('toggle-particles');

    if (toggleVec) {
        toggleVec.addEventListener('change', (e) => state.showVectors = e.target.checked);
    }
    if (togglePress) {
        togglePress.addEventListener('change', (e) => state.showPressureGlow = e.target.checked);
    }
    if (togglePart) {
        togglePart.addEventListener('change', (e) => state.showParticles = e.target.checked);
    }
}

// Bind Sliders and Reset Controls
function bindInputs() {
    const sliderMap = [
        { id: 'slider-aoa', key: 'aoa' },
        { id: 'slider-speed', key: 'speed' },
        { id: 'slider-area', key: 'area' },
        { id: 'slider-mass', key: 'mass' },
        { id: 'slider-density', key: 'density' }
    ];

    sliderMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            const updateHandler = (e) => {
                state[item.key] = parseFloat(e.target.value);
                updatePhysics();
            };
            el.addEventListener('input', updateHandler);
            el.addEventListener('change', updateHandler);
        }
    });

    const resetBtn = document.getElementById('reset-params-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            Object.assign(state, aircraftPresets.commercial);
            syncControls();
            updatePhysics();
        });
    }
}

// Bind Aircraft Presets
function bindPresets() {
    const cards = document.querySelectorAll('.preset-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const key = card.getAttribute('data-preset');
            if (aircraftPresets[key]) {
                Object.assign(state, aircraftPresets[key]);
                syncControls();
                updatePhysics();
            }
        });
    });
}

function syncControls() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setVal('slider-aoa', state.aoa);
    setVal('slider-speed', state.speed);
    setVal('slider-area', state.area);
    setVal('slider-mass', state.mass);
    setVal('slider-density', state.density);
}

// Core Physics Calculations
function updatePhysics() {
    const alpha = state.aoa;

    // 1. Lift Coefficient (Linear range + Post-Stall Regime)
    if (alpha <= state.aoaStall) {
        state.cl = state.cl0 + state.cla * alpha;
        state.isStalled = false;
    } else {
        const clPeak = state.cl0 + state.cla * state.aoaStall;
        const stallDrop = (alpha - state.aoaStall) * 0.075;
        state.cl = Math.max(0.15, clPeak - stallDrop);
        state.isStalled = true;
    }

    // 2. Induced Drag C_Di = (C_L^2) / (pi * AR * e)
    const cdi = Math.pow(state.cl, 2) / (Math.PI * state.aspectRatio * state.oswaldEff);

    // 3. Stall Induced Drag Penalty
    const stallDrag = state.isStalled ? Math.pow(alpha - state.aoaStall, 1.7) * 0.012 : 0;

    // 4. Total Drag Coefficient C_D
    state.cd = state.cd0 + cdi + stallDrag;

    // 5. Dynamic Pressure q = 0.5 * rho * v^2
    state.q = 0.5 * state.density * Math.pow(state.speed, 2);

    // 6. Generated Forces (N)
    state.lift = state.q * state.area * state.cl;
    state.drag = state.q * state.area * state.cd;
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;

    // 7. Dynamic Equilibrium Weight W = m * g
    const g = 9.81;
    state.reqLift = state.mass * g;

    updateUI(cdi);
}

// Update UI Values and Dynamic Displays
function updateUI(cdi) {
    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    setTxt('val-aoa', state.aoa.toFixed(1));
    setTxt('val-speed', Math.round(state.speed));
    setTxt('val-knots', Math.round(state.speed * 1.94384));
    setTxt('val-area', Math.round(state.area));
    setTxt('val-mass', state.mass.toLocaleString());
    setTxt('val-density', state.density.toFixed(3));

    setTxt('hud-aoa', `${state.aoa.toFixed(1)}°`);
    setTxt('hud-speed', `${Math.round(state.speed)} m/s`);
    setTxt('hud-q', `${(state.q / 1000).toFixed(2)} kPa`);

    const liftKN = state.lift / 1000;
    const dragKN = state.drag / 1000;
    const reqLiftKN = state.reqLift / 1000;

    setTxt('calc-lift', `${liftKN.toFixed(1)} kN`);
    setTxt('calc-drag', `${dragKN.toFixed(1)} kN`);
    setTxt('calc-cl', state.cl.toFixed(3));
    
    const cdEl = document.getElementById('calc-cd');
    if (cdEl) cdEl.innerHTML = `C<sub>D</sub>: ${state.cd.toFixed(3)}`;

    setTxt('calc-ld', state.ldRatio.toFixed(1));
    setTxt('calc-weight-req', `Req Weight: ${reqLiftKN.toFixed(1)} kN`);

    setTxt('hero-lift-val', `${liftKN.toFixed(1)} kN`);
    setTxt('hero-drag-val', `${dragKN.toFixed(1)} kN`);
    setTxt('hero-ld-val', state.ldRatio.toFixed(1));

    const badge = document.getElementById('stall-badge');
    const badgeText = document.getElementById('stall-badge-text');
    const heroStatus = document.getElementById('hero-status-val');

    if (state.isStalled) {
        if (badge) badge.className = 'badge badge-danger';
        if (badgeText) badgeText.textContent = 'Flow Separation (Stall)';
        if (heroStatus) {
            heroStatus.textContent = 'STALL SEPARATION';
            heroStatus.className = 'telemetry-value status-bad';
        }
    } else {
        if (badge) badge.className = 'badge badge-success';
        if (badgeText) badgeText.textContent = 'Laminar Flow Attached';
        if (heroStatus) {
            heroStatus.textContent = 'Laminar Attached';
            heroStatus.className = 'telemetry-value status-good';
        }
    }

    setTxt('eq-rho-val', `${state.density.toFixed(3)} kg/m³`);
    setTxt('eq-v-val', `${Math.round(state.speed)} m/s`);
    setTxt('eq-q-val', `${(state.q / 1000).toFixed(2)} kPa`);
    setTxt('eq-s-val', `${Math.round(state.area)} m²`);
    setTxt('eq-cl-val', state.cl.toFixed(3));
    setTxt('eq-lift-val', `${liftKN.toFixed(1)} kN`);

    setTxt('eq-cd0-val', state.cd0.toFixed(3));
    setTxt('eq-cdi-val', cdi.toFixed(3));
    setTxt('eq-cd-val', state.cd.toFixed(3));
    setTxt('eq-ld-val', state.ldRatio.toFixed(1));
    setTxt('eq-drag-val', `${dragKN.toFixed(1)} kN`);
}

// Canvas Initialization
function initCanvas() {
    const canvas = document.getElementById('airfoil-canvas');
    if (!canvas) return;

    const rect = canvas.parentNode.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    particles = Array.from({ length: 120 }, () => new StreamParticle(rect.width, rect.height));
}

// Animation Render Loop
function renderLoop() {
    renderCanvas();
    renderBgParticles();
    requestAnimationFrame(renderLoop);
}

// Main Simulation Renderer
function renderCanvas() {
    const canvas = document.getElementById('airfoil-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';

    ctx.clearRect(0, 0, w, h);

    const foilX = w * 0.45;
    const foilY = h * 0.50;
    const chord = Math.min(w, h) * 0.42;

    // 1. Draw Flow Streamline Particles
    if (state.showParticles) {
        particles.forEach(p => {
            p.update(w, h, foilX, foilY, chord);
            p.draw(ctx, isLightMode);
        });
    }

    // 2. Airfoil Pitch Alignment:
    // Canvas pitch logic:
    // To tilt the NOSE (leading edge) UP when Angle of Attack (AoA) is POSITIVE (+):
    // In Canvas 2D (+Y is down), rotating by -AoA turns counter-clockwise, moving nose (-X) UP (-Y).
    const pitchRad = -(state.aoa * Math.PI) / 180;

    ctx.save();
    ctx.translate(foilX, foilY);
    ctx.rotate(pitchRad);

    // Force Field Gradient (If Toggled)
    if (state.showPressureGlow) {
        const topGlow = ctx.createRadialGradient(0, -15, 2, 0, -15, chord * 0.55);
        if (state.isStalled) {
            topGlow.addColorStop(0, 'rgba(239, 68, 68, 0.40)');
        } else {
            topGlow.addColorStop(0, isLightMode ? 'rgba(2, 132, 199, 0.35)' : 'rgba(0, 240, 255, 0.35)');
        }
        topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(-chord, -chord, chord * 2, chord);

        const botGlow = ctx.createRadialGradient(0, 15, 2, 0, 15, chord * 0.55);
        botGlow.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
        botGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = botGlow;
        ctx.fillRect(-chord, 0, chord * 2, chord);
    }

    // NACA 0012 Profile Geometry
    ctx.beginPath();
    ctx.fillStyle = isLightMode ? '#1e293b' : '#0f172a';
    ctx.strokeStyle = isLightMode ? '#0284c7' : '#00f0ff';
    ctx.lineWidth = 2.5;

    // Upper Profile Curve
    for (let i = 0; i <= 100; i++) {
        const xNorm = i / 100;
        const x = (xNorm - 0.5) * chord;
        const yt = 5 * 0.12 * chord * (
            0.2969 * Math.sqrt(xNorm) - 
            0.1260 * xNorm - 
            0.3516 * Math.pow(xNorm, 2) + 
            0.2843 * Math.pow(xNorm, 3) - 
            0.1015 * Math.pow(xNorm, 4)
        );
        if (i === 0) ctx.moveTo(x, -yt);
        else ctx.lineTo(x, -yt);
    }

    // Lower Profile Curve
    for (let i = 100; i >= 0; i--) {
        const xNorm = i / 100;
        const x = (xNorm - 0.5) * chord;
        const yt = 5 * 0.12 * chord * (
            0.2969 * Math.sqrt(xNorm) - 
            0.1260 * xNorm - 
            0.3516 * Math.pow(xNorm, 2) + 
            0.2843 * Math.pow(xNorm, 3) - 
            0.1015 * Math.pow(xNorm, 4)
        );
        ctx.lineTo(x, yt);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chord Center Reference Line
    ctx.beginPath();
    ctx.strokeStyle = isLightMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.moveTo(-chord * 0.5, 0);
    ctx.lineTo(chord * 0.5, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // 3. Draw Ultra-Smooth Force Vector Arrows
    if (state.showVectors) {
        // Target vector lengths (pixels)
        const targetLiftLen = Math.min(130, Math.max(-100, (state.lift / 1000) * 0.08));
        const targetDragLen = Math.min(100, Math.max(0, (state.drag / 1000) * 0.40));

        // Target End Points in World Space
        const targetLiftX = foilX;
        const targetLiftY = foilY - targetLiftLen;

        const targetDragX = foilX + targetDragLen;
        const targetDragY = foilY;

        // Exponential Smoothing (lerp)
        state.smoothLiftX += (targetLiftX - state.smoothLiftX) * 0.12;
        state.smoothLiftY += (targetLiftY - state.smoothLiftY) * 0.12;
        state.smoothDragX += (targetDragX - state.smoothDragX) * 0.12;
        state.smoothDragY += (targetDragY - state.smoothDragY) * 0.12;

        if (Math.hypot(state.smoothLiftX - foilX, state.smoothLiftY - foilY) === 0) {
            state.smoothLiftX = targetLiftX;
            state.smoothLiftY = targetLiftY;
            state.smoothDragX = targetDragX;
            state.smoothDragY = targetDragY;
        }

        // Lift Vector (Cyan / Blue)
        drawSmoothVector(
            ctx, foilX, foilY, 
            state.smoothLiftX, state.smoothLiftY, 
            isLightMode ? '#0284c7' : '#00f0ff', 
            `Lift (${(state.lift / 1000).toFixed(1)} kN)`,
            isLightMode
        );

        // Drag Vector (Red)
        drawSmoothVector(
            ctx, foilX, foilY, 
            state.smoothDragX, state.smoothDragY, 
            '#ef4444', 
            `Drag (${(state.drag / 1000).toFixed(1)} kN)`,
            isLightMode
        );
    }
}

// Render Anti-Aliased Vector Arrow
function drawSmoothVector(ctx, fromX, fromY, toX, toY, color, label, isLightMode) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);

    if (dist < 3) return;

    const headLen = 10;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Anti-Aliased Vector Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Sharp Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLen * Math.cos(angle - Math.PI / 6),
        toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - headLen * Math.cos(angle + Math.PI / 6),
        toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Text Label Overlay
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = isLightMode ? '#0f172a' : '#f8fafc';

    const labelX = toX + (dx >= 0 ? 10 : -85);
    const labelY = toY + (dy < 0 ? -8 : 16);
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
}

// Ambient Background Canvas Particles
function renderBgParticles() {
    const canvas = document.getElementById('bg-particle-canvas');
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== window.innerWidth * dpr || canvas.height !== window.innerHeight * dpr) {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(0, 136, 255, 0.12)';

    for (let i = 0; i < 25; i++) {
        const x = (Math.sin(Date.now() * 0.0003 + i) * 0.5 + 0.5) * window.innerWidth;
        const y = (Math.cos(Date.now() * 0.0002 + i * 1.5) * 0.5 + 0.5) * window.innerHeight;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) + 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}