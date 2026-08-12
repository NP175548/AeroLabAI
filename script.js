// script.js

/**
 * AeroLab — Aerodynamics Simulation Engine
 * Rigorous fluid mechanics model and accurate HTML5 Canvas renderer
 */

// Flight Dynamics & Display State
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
    cla: 0.10,          // Lift slope per degree (2*pi rad^-1 ≈ 0.109 deg^-1)
    aoaStall: 15.0,     // Stall angle of attack (deg)
    cd0: 0.020,         // Parasitic Drag Coefficient C_D0
    aspectRatio: 8.5,   // Wing Aspect Ratio AR
    oswaldEff: 0.82,    // Oswald Efficiency Factor e

    // Derived Telemetry
    cl: 0,
    cd: 0,
    lift: 0,            // Force L (N)
    drag: 0,            // Force D (N)
    q: 0,               // Dynamic Pressure (Pa)
    ldRatio: 0,
    isStalled: false,
    reqLift: 0,         // Required force to balance weight W = m*g (N)

    // Smooth Vector Arrow Lengths
    smoothLiftLength: 0,
    smoothDragLength: 0
};

// Aircraft Presets Catalog
const aircraftPresets = {
    commercial: { speed: 120, aoa: 4.0, area: 125, mass: 65000, density: 1.225 },
    fighter:    { speed: 220, aoa: 3.0, area: 28,  mass: 12000, density: 1.225 },
    glider:     { speed: 35,  aoa: 5.0, area: 15,  mass: 450,   density: 1.225 },
    cargo:      { speed: 110, aoa: 5.5, area: 350, mass: 180000,density: 1.225 }
};

// Streamline Flow Particle System
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
        // Pitch Angle Correction: Canvas pitch angle is (state.aoa * PI / 180)
        const rad = (state.aoa * Math.PI) / 180;
        
        // Translate particle relative to wing center
        const dx = this.x - foilX;
        const dy = this.y - foilY;

        // Un-rotate particle coordinates relative to wing coordinate frame
        const localX = dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const localY = dx * Math.sin(-rad) + dy * Math.cos(-rad);

        const halfChord = chord * 0.5;
        const thickness = chord * 0.12;

        // Particle Interaction with Airfoil Contour
        if (localX > -halfChord * 1.1 && localX < halfChord * 1.1) {
            const normX = Math.max(0, Math.min(1, (localX + halfChord) / chord));
            
            // NACA 0012 Profile Equation
            const yt = 5 * thickness * (
                0.2969 * Math.sqrt(normX) - 
                0.1260 * normX - 
                0.3516 * Math.pow(normX, 2) + 
                0.2843 * Math.pow(normX, 3) - 
                0.1015 * Math.pow(normX, 4)
            );

            // Flow Deflection along upper and lower surfaces
            if (localY < 0 && localY > -yt - 28) {
                // Suction Side (Upper Surface)
                const targetY = -yt - 6;
                this.y += (targetY - localY) * 0.15;
                
                if (state.isStalled && localX > 0) {
                    // Flow Separation Turbulence in Stall
                    this.y += (Math.random() - 0.5) * 6;
                    this.x += (Math.random() - 0.5) * 3;
                }
            } else if (localY >= 0 && localY < yt + 28) {
                // Pressure Side (Lower Surface)
                const targetY = yt + 6;
                this.y += (targetY - localY) * 0.15;
            }
        }

        // Advance particle downstream
        this.x += state.speed * 0.05 + 2.5;

        // Reset if offscreen
        if (this.x > w + 15 || this.y < -20 || this.y > h + 20) {
            this.reset(w, h, false);
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(0, 240, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

let particles = [];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    bindInputs();
    bindPresets();
    bindToggles();
    updatePhysics();
    initCanvas();
    window.addEventListener('resize', initCanvas);
    requestAnimationFrame(renderLoop);
});

// Theme Toggle
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
    });
}

// Bind Display Toggle Switches
function bindToggles() {
    document.getElementById('toggle-vectors').addEventListener('change', (e) => {
        state.showVectors = e.target.checked;
    });
    document.getElementById('toggle-pressure').addEventListener('change', (e) => {
        state.showPressureGlow = e.target.checked;
    });
    document.getElementById('toggle-particles').addEventListener('change', (e) => {
        state.showParticles = e.target.checked;
    });
}

// Bind Sliders and Input Events
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
        el.addEventListener('input', (e) => {
            state[item.key] = parseFloat(e.target.value);
            updatePhysics();
        });
    });

    document.getElementById('reset-params-btn').addEventListener('click', () => {
        Object.assign(state, aircraftPresets.commercial);
        syncControls();
        updatePhysics();
    });
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
    document.getElementById('slider-aoa').value = state.aoa;
    document.getElementById('slider-speed').value = state.speed;
    document.getElementById('slider-area').value = state.area;
    document.getElementById('slider-mass').value = state.mass;
    document.getElementById('slider-density').value = state.density;
}

// Core Physics Engine
function updatePhysics() {
    const alpha = state.aoa;

    // 1. Lift Coefficient (Linear range + Stall Region)
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

    // 6. Aerodynamic Forces (N)
    state.lift = state.q * state.area * state.cl;
    state.drag = state.q * state.area * state.cd;
    state.ldRatio = state.drag > 0 ? state.lift / state.drag : 0;

    // 7. Equilibrium Weight W = m * g
    const g = 9.81;
    state.reqLift = state.mass * g;

    updateUI(cdi);
}

// Update UI Values
function updateUI(cdi) {
    document.getElementById('val-aoa').textContent = state.aoa.toFixed(1);
    document.getElementById('val-speed').textContent = Math.round(state.speed);
    document.getElementById('val-knots').textContent = Math.round(state.speed * 1.94384);
    document.getElementById('val-area').textContent = Math.round(state.area);
    document.getElementById('val-mass').textContent = state.mass.toLocaleString();
    document.getElementById('val-density').textContent = state.density.toFixed(3);

    document.getElementById('hud-aoa').textContent = `${state.aoa.toFixed(1)}°`;
    document.getElementById('hud-speed').textContent = `${Math.round(state.speed)} m/s`;
    document.getElementById('hud-q').textContent = `${(state.q / 1000).toFixed(2)} kPa`;

    const liftKN = state.lift / 1000;
    const dragKN = state.drag / 1000;
    const reqLiftKN = state.reqLift / 1000;

    document.getElementById('calc-lift').textContent = `${liftKN.toFixed(1)} kN`;
    document.getElementById('calc-drag').textContent = `${dragKN.toFixed(1)} kN`;
    document.getElementById('calc-cl').textContent = state.cl.toFixed(3);
    document.getElementById('calc-cd').innerHTML = `C<sub>D</sub>: ${state.cd.toFixed(3)}`;
    document.getElementById('calc-ld').textContent = state.ldRatio.toFixed(1);
    document.getElementById('calc-weight-req').textContent = `Req Weight: ${reqLiftKN.toFixed(1)} kN`;

    document.getElementById('hero-lift-val').textContent = `${liftKN.toFixed(1)} kN`;
    document.getElementById('hero-drag-val').textContent = `${dragKN.toFixed(1)} kN`;
    document.getElementById('hero-ld-val').textContent = state.ldRatio.toFixed(1);

    const badge = document.getElementById('stall-badge');
    const badgeText = document.getElementById('stall-badge-text');
    const heroStatus = document.getElementById('hero-status-val');

    if (state.isStalled) {
        badge.className = 'badge badge-danger';
        badgeText.textContent = 'Flow Separation (Stall)';
        heroStatus.textContent = 'STALL SEPARATION';
        heroStatus.className = 'telemetry-value status-bad';
    } else {
        badge.className = 'badge badge-success';
        badgeText.textContent = 'Laminar Flow Attached';
        heroStatus.textContent = 'Laminar Attached';
        heroStatus.className = 'telemetry-value status-good';
    }

    document.getElementById('eq-rho-val').textContent = `${state.density.toFixed(3)} kg/m³`;
    document.getElementById('eq-v-val').textContent = `${Math.round(state.speed)} m/s`;
    document.getElementById('eq-q-val').textContent = `${(state.q / 1000).toFixed(2)} kPa`;
    document.getElementById('eq-s-val').textContent = `${Math.round(state.area)} m²`;
    document.getElementById('eq-cl-val').textContent = state.cl.toFixed(3);
    document.getElementById('eq-lift-val').textContent = `${liftKN.toFixed(1)} kN`;

    document.getElementById('eq-cd0-val').textContent = state.cd0.toFixed(3);
    document.getElementById('eq-cdi-val').textContent = cdi.toFixed(3);
    document.getElementById('eq-cd-val').textContent = state.cd.toFixed(3);
    document.getElementById('eq-ld-val').textContent = state.ldRatio.toFixed(1);
    document.getElementById('eq-drag-val').textContent = `${dragKN.toFixed(1)} kN`;
}

// Canvas Initialization
function initCanvas() {
    const canvas = document.getElementById('airfoil-canvas');
    const rect = canvas.parentNode.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    particles = Array.from({ length: 120 }, () => new StreamParticle(rect.width, rect.height));
}

// Main Animation Loop
function renderLoop() {
    renderCanvas();
    renderBgParticles();
    requestAnimationFrame(renderLoop);
}

// Render Airfoil & Visual Overlays
function renderCanvas() {
    const canvas = document.getElementById('airfoil-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const foilX = w * 0.45;
    const foilY = h * 0.50;
    const chord = Math.min(w, h) * 0.42;

    // 1. Draw Streamline Particles (If Toggled)
    if (state.showParticles) {
        particles.forEach(p => {
            p.update(w, h, foilX, foilY, chord);
            p.draw(ctx);
        });
    }

    // 2. Airfoil Pitch Alignment:
    // Standard Canvas 2D: +Y is DOWN.
    // For positive AoA (nose pointing UP), the leading edge (at local -chord/2) must move UP (-Y).
    // Rotation angle = +(state.aoa * PI / 180).
    const pitchRad = (state.aoa * Math.PI) / 180;

    ctx.save();
    ctx.translate(foilX, foilY);
    ctx.rotate(pitchRad);

    // Dynamic Pressure Field Gradient (If Toggled)
    if (state.showPressureGlow) {
        const topGlow = ctx.createRadialGradient(0, -15, 2, 0, -15, chord * 0.55);
        topGlow.addColorStop(0, state.isStalled ? 'rgba(239, 68, 68, 0.40)' : 'rgba(0, 136, 255, 0.35)');
        topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(-chord, -chord, chord * 2, chord);

        const botGlow = ctx.createRadialGradient(0, 15, 2, 0, 15, chord * 0.55);
        botGlow.addColorStop(0, 'rgba(239, 68, 68, 0.30)');
        botGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = botGlow;
        ctx.fillRect(-chord, 0, chord * 2, chord);
    }

    // Plot NACA 0012 Airfoil Profile
    ctx.beginPath();
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;

    // Upper Contour
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

    // Lower Contour
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

    // Chord Reference Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.moveTo(-chord * 0.5, 0);
    ctx.lineTo(chord * 0.5, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // 3. Draw Smoothed Aerodynamic Force Vectors (If Toggled)
    if (state.showVectors) {
        // Target vector lengths (bounded)
        const targetLiftLen = Math.min(130, Math.max(-100, (state.lift / 1000) * 0.08));
        const targetDragLen = Math.min(100, Math.max(0, (state.drag / 1000) * 0.40));

        // Smooth Linear Interpolation (lerp)
        state.smoothLiftLength += (targetLiftLen - state.smoothLiftLength) * 0.1;
        state.smoothDragLength += (targetDragLen - state.smoothDragLength) * 0.1;

        // Lift Vector (Points UP perpendicular to relative wind)
        drawSmoothVector(
            ctx, foilX, foilY, 
            foilX, foilY - state.smoothLiftLength, 
            '#00f0ff', 
            `Lift (${(state.lift / 1000).toFixed(1)} kN)`
        );

        // Drag Vector (Points DOWNSTREAM / RIGHT parallel to relative wind)
        drawSmoothVector(
            ctx, foilX, foilY, 
            foilX + state.smoothDragLength, foilY, 
            '#ef4444', 
            `Drag (${(state.drag / 1000).toFixed(1)} kN)`
        );
    }
}

// Render Smooth Anti-Aliased Vector Arrow
function drawSmoothVector(ctx, fromX, fromY, toX, toY, color, label) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) return;

    const headLen = 10;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer Glow Line for Smooth Rendering
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // Vector Shaft
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
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

    // Text Label
    ctx.shadowBlur = 0;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const labelX = toX + (dx >= 0 ? 8 : -75);
    const labelY = toY + (dy < 0 ? -6 : 14);
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
}

// Ambient Background Particles
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

    ctx.fillStyle = 'rgba(0, 136, 255, 0.12)';
    for (let i = 0; i < 25; i++) {
        const x = (Math.sin(Date.now() * 0.0003 + i) * 0.5 + 0.5) * window.innerWidth;
        const y = (Math.cos(Date.now() * 0.0002 + i * 1.5) * 0.5 + 0.5) * window.innerHeight;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) + 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}