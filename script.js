/* script.js */

// ==========================================================================
// AEROLAB SIMULATOR ENGINE
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // State & Aerodynamic Parameters
    const state = {
        speed: 220, // km/h
        aoa: 5.0,   // degrees
        area: 125,  // m^2
        weight: 65000, // kg
        density: 1.225, // kg/m^3
        showVectors: true,
        showPressure: true,
        showParticles: true
    };

    // Smoothed vector animation lengths (lerp)
    const smoothVectors = {
        lift: 0,
        drag: 0,
        weight: 0
    };

    // Aircraft Presets Configuration
    const presets = {
        jet: { speed: 220, aoa: 5.0, area: 125, weight: 65000 },
        fighter: { speed: 450, aoa: 8.0, area: 78, weight: 22000 },
        glider: { speed: 90, aoa: 4.0, area: 12, weight: 450 },
        cargo: { speed: 200, aoa: 6.0, area: 450, weight: 280000 }
    };

    // DOM Elements
    const inputs = {
        speed: document.getElementById('slider-speed'),
        aoa: document.getElementById('slider-aoa'),
        area: document.getElementById('slider-area'),
        weight: document.getElementById('slider-weight'),
        density: document.getElementById('slider-density')
    };

    const labels = {
        speed: document.getElementById('val-speed'),
        aoa: document.getElementById('val-aoa'),
        area: document.getElementById('val-area'),
        weight: document.getElementById('val-weight'),
        density: document.getElementById('val-density')
    };

    const readouts = {
        lift: document.getElementById('readout-lift'),
        drag: document.getElementById('readout-drag'),
        ld: document.getElementById('readout-ld'),
        q: document.getElementById('readout-q'),
        cl: document.getElementById('readout-cl'),
        cd: document.getElementById('readout-cd'),
        dragInduced: document.getElementById('readout-drag-induced'),
        dragParasitic: document.getElementById('readout-drag-parasitic'),
        weightReq: document.getElementById('readout-weight-req')
    };

    const calcLiftVal = document.getElementById('calc-lift-val');
    const calcDragVal = document.getElementById('calc-drag-val');

    const statusBadge = document.getElementById('flight-status-badge');
    const stallOverlay = document.getElementById('stall-warning');
    const balanceStatusText = document.getElementById('balance-status-text');
    const balanceDesc = document.getElementById('balance-desc');

    const fillLift = document.getElementById('fill-lift');
    const fillDrag = document.getElementById('fill-drag');

    const simCanvas = document.getElementById('sim-main-canvas');
    const graphClCanvas = document.getElementById('graph-cl-aoa');
    const graphDragCanvas = document.getElementById('graph-drag-speed');
    const graphLdCanvas = document.getElementById('graph-ld-ratio');

    let particles = [];

    // Render KaTeX Math safely
    function renderTex(id, formulaTex) {
        const el = document.getElementById(id);
        if (!el) return;
        if (window.katex) {
            try {
                katex.render(formulaTex, el, { displayMode: false, throwOnError: false });
            } catch (e) {
                el.innerText = formulaTex;
            }
        } else {
            el.innerText = formulaTex;
        }
    }

    // Render static KaTeX reference equations
    function initEquations() {
        renderTex('katex-lift', 'L = \\frac{1}{2} \\cdot \\rho \\cdot v^2 \\cdot S \\cdot C_L');
        renderTex('katex-drag', 'D = \\frac{1}{2} \\cdot \\rho \\cdot v^2 \\cdot S \\cdot C_D');
        
        renderTex('symbol-rho', '\\rho');
        renderTex('symbol-v', 'v');
        renderTex('symbol-s', 'S');
        renderTex('symbol-cl', 'C_L');
        renderTex('symbol-cd', 'C_D');
        renderTex('symbol-alpha', '\\alpha');
        renderTex('symbol-q', 'q');
        renderTex('symbol-ld', 'L/D');

        renderTex('katex-bernoulli', 'P + \\frac{1}{2} \\rho v^2 = \\text{Constant}');
        renderTex('katex-newton', 'F_{\\text{lift}} = - \\frac{\\Delta p_{\\text{air}}}{\\Delta t}');
    }

    // Physics Engine Calculation
    function calculatePhysics() {
        const v_m_s = state.speed / 3.6; // km/h -> m/s
        const rho = state.density;
        const S = state.area;

        // Dynamic Pressure q = 0.5 * rho * v^2
        const q = 0.5 * rho * v_m_s * v_m_s;

        // Lift Coefficient (C_L)
        const alpha_crit = 15.0; // Stall boundary angle
        let C_L = 0;
        let isStalled = false;

        if (state.aoa <= alpha_crit) {
            C_L = 0.25 + 0.11 * state.aoa;
        } else {
            const drop = Math.exp(-(state.aoa - alpha_crit) * 0.28);
            C_L = (0.25 + 0.11 * alpha_crit) * drop;
            isStalled = true;
        }

        // Drag Coefficients (Parasitic + Induced)
        const AR = 8.0;
        const Oswald_e = 0.82;
        const C_D0 = 0.020;
        const C_Di = (C_L * C_L) / (Math.PI * AR * Oswald_e);
        let C_D = C_D0 + C_Di;

        if (isStalled) {
            C_D += 0.09 * (state.aoa - alpha_crit);
        }

        // Forces in Newtons
        const Lift_N = q * S * C_L;
        const Drag_N = q * S * C_D;
        const Drag_Induced_N = q * S * C_Di;
        const Drag_Parasitic_N = q * S * C_D0;
        const Weight_N = state.weight * 9.81;

        const LD_Ratio = Drag_N > 0 ? (Lift_N / Drag_N) : 0;

        return {
            q, C_L, C_D, C_Di, C_D0,
            Lift_N, Drag_N, Drag_Induced_N, Drag_Parasitic_N, Weight_N,
            LD_Ratio, isStalled, v_m_s
        };
    }

    // Dashboard UI Updates
    function updateDashboard() {
        const p = calculatePhysics();
        const fmtN = (val) => val >= 1e6 ? (val / 1e6).toFixed(2) + ' MN' : (val / 1e3).toFixed(1) + ' kN';

        readouts.lift.textContent = fmtN(p.Lift_N);
        readouts.drag.textContent = fmtN(p.Drag_N);
        readouts.dragInduced.textContent = fmtN(p.Drag_Induced_N);
        readouts.dragParasitic.textContent = fmtN(p.Drag_Parasitic_N);
        readouts.weightReq.textContent = fmtN(p.Weight_N);

        readouts.ld.textContent = p.LD_Ratio.toFixed(1);
        readouts.q.textContent = Math.round(p.q).toLocaleString() + ' Pa';
        readouts.cl.textContent = p.C_L.toFixed(2);
        readouts.cd.textContent = p.C_D.toFixed(3);

        calcLiftVal.textContent = `L = ${fmtN(p.Lift_N)}`;
        calcDragVal.textContent = `D = ${fmtN(p.Drag_N)}`;

        fillLift.style.width = Math.min(100, (p.Lift_N / (p.Weight_N * 1.4)) * 100) + '%';
        fillDrag.style.width = Math.min(100, (p.Drag_N / (p.Lift_N * 0.35 || 1)) * 100) + '%';

        // Flight Condition & Stall Alerts
        if (p.isStalled) {
            statusBadge.textContent = 'STALL WARNING';
            statusBadge.className = 'status-badge stall';
            stallOverlay.classList.remove('hidden');
            balanceStatusText.textContent = 'LIFT COLLAPSED';
            balanceStatusText.style.color = 'var(--accent-red)';
            balanceDesc.textContent = 'Airflow fully detached. High drag, loss of lift.';
        } else {
            statusBadge.textContent = 'STABLE FLIGHT';
            statusBadge.className = 'status-badge';
            stallOverlay.classList.add('hidden');

            const diff = (p.Lift_N - p.Weight_N) / p.Weight_N;
            if (Math.abs(diff) < 0.05) {
                balanceStatusText.textContent = 'STEADY LEVEL FLIGHT';
                balanceStatusText.style.color = 'var(--accent-green)';
                balanceDesc.textContent = 'Lift force balances aircraft weight.';
            } else if (diff > 0.05) {
                balanceStatusText.textContent = 'CLIMBING (+)';
                balanceStatusText.style.color = 'var(--accent-blue)';
                balanceDesc.textContent = 'Lift exceeds weight. Aircraft ascending.';
            } else {
                balanceStatusText.textContent = 'DESCENDING (-)';
                balanceStatusText.style.color = 'var(--accent-orange)';
                balanceDesc.textContent = 'Weight exceeds lift. Aircraft descending.';
            }
        }

        renderGraphs(p);
    }

    // Input Event Listeners
    Object.keys(inputs).forEach(key => {
        inputs[key].addEventListener('input', (e) => {
            state[key] = parseFloat(e.target.value);

            if (key === 'speed') labels[key].textContent = state[key] + ' km/h';
            if (key === 'aoa') labels[key].textContent = state[key].toFixed(1) + '°';
            if (key === 'area') labels[key].textContent = state[key] + ' m²';
            if (key === 'weight') labels[key].textContent = state[key].toLocaleString() + ' kg';
            if (key === 'density') labels[key].textContent = state[key].toFixed(3) + ' kg/m³';

            updateDashboard();
        });
    });

    // Preset Selection
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.dataset.preset;
            if (presets[presetKey]) {
                const pr = presets[presetKey];
                state.speed = pr.speed;
                state.aoa = pr.aoa;
                state.area = pr.area;
                state.weight = pr.weight;

                inputs.speed.value = pr.speed;
                inputs.aoa.value = pr.aoa;
                inputs.area.value = pr.area;
                inputs.weight.value = pr.weight;

                labels.speed.textContent = pr.speed + ' km/h';
                labels.aoa.textContent = pr.aoa.toFixed(1) + '°';
                labels.area.textContent = pr.area + ' m²';
                labels.weight.textContent = pr.weight.toLocaleString() + ' kg';

                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                updateDashboard();
            }
        });
    });

    // Visualizer Toggle Controls
    document.getElementById('toggle-vectors').addEventListener('click', (e) => {
        state.showVectors = !state.showVectors;
        e.currentTarget.classList.toggle('active', state.showVectors);
    });
    document.getElementById('toggle-pressure').addEventListener('click', (e) => {
        state.showPressure = !state.showPressure;
        e.currentTarget.classList.toggle('active', state.showPressure);
    });
    document.getElementById('toggle-particles').addEventListener('click', (e) => {
        state.showParticles = !state.showParticles;
        e.currentTarget.classList.toggle('active', state.showParticles);
    });

    // Theme Switcher
    const themeBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        themeIcon.setAttribute('data-lucide', nextTheme === 'dark' ? 'moon' : 'sun');
        if (window.lucide) lucide.createIcons();
    });

    document.getElementById('reset-params').addEventListener('click', () => {
        document.querySelector('.preset-btn[data-preset="jet"]').click();
    });

    // ==========================================================================
    // CANVAS WING & STREAMLINE FLOW RENDERER
    // ==========================================================================

    // Initialize streamline particles aligned cleanly on parallel "telegraph line" tracks
    function initStreamlines(canvas) {
        particles = [];
        const numLines = 18;
        const lineSpacing = canvas.height / (numLines + 1);
        const particlesPerLine = 12;

        for (let i = 1; i <= numLines; i++) {
            const basePosY = i * lineSpacing;
            for (let j = 0; j < particlesPerLine; j++) {
                particles.push({
                    x: (j / particlesPerLine) * canvas.width,
                    baseY: basePosY,
                    speed: 3 + Math.random() * 0.8
                });
            }
        }
    }

    // NACA 2412 Airfoil Profile Generator
    // Airfoil orientation: Nose at -chord/2 (LEFT), Tail at +chord/2 (RIGHT)
    function getAirfoilPoint(t, chord) {
        const x = t * chord; // 0 to chord
        const yc = t < 0.4 ? 0.125 * (0.8 * t - t * t) : 0.0555 * (0.2 + 0.8 * t - t * t);
        const yt = 0.6 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * Math.pow(t, 3) - 0.1015 * Math.pow(t, 4));
        
        return {
            x: x - chord / 2, // Left is negative, right is positive
            yUpper: -(yc + yt) * chord,
            yLower: -(yc - yt) * chord
        };
    }

    // Draw Smooth Vector Arrows
    function drawArrow(ctx, fromX, fromY, toX, toY, color, label) {
        const headLen = 10;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Shaft
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Label
        if (label) {
            ctx.font = '700 11px JetBrains Mono';
            ctx.fillText(label, toX + 8, toY + 4);
        }
        ctx.restore();
    }

    function renderSimulatorCanvas() {
        if (!simCanvas) return;
        const ctx = simCanvas.getContext('2d');
        const rect = simCanvas.getBoundingClientRect();

        if (simCanvas.width !== rect.width || simCanvas.height !== rect.height) {
            simCanvas.width = rect.width;
            simCanvas.height = rect.height;
            initStreamlines(simCanvas);
        }

        const width = simCanvas.width;
        const height = simCanvas.height;
        ctx.clearRect(0, 0, width, height);

        const centerX = width * 0.45;
        const centerY = height * 0.50;
        const chord = width * 0.32;

        const p = calculatePhysics();

        // PITCH ANGLE (ANGLE OF ATTACK):
        // Nose is at -chord/2 (LEFT).
        // Positive AoA pitches nose UPWARDS (-Y in Canvas coordinate space).
        // Rotate by +aoaRad in Canvas (clockwise rotation):
        // Point (-c/2, 0) rotates to (-c/2 * cos(a), -c/2 * sin(a)).
        // Since sin(a) > 0 for positive a, -c/2 * sin(a) is negative (UPWARDS!).
        const aoaRad = (state.aoa * Math.PI) / 180;

        // Render Streamline Grid Lines & Particles ("Telegraph Lines")
        if (state.showParticles) {
            if (particles.length === 0) initStreamlines(simCanvas);

            // Draw underlying streamline guide lines
            const linesY = Array.from(new Set(particles.map(pt => pt.baseY)));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            linesY.forEach(y => {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            });

            // Animate dots moving smoothly along streamline tracks
            particles.forEach(pt => {
                pt.x += (state.speed / 40) * pt.speed;
                if (pt.x > width) pt.x = 0;

                const dx = pt.x - centerX;
                const relX = dx / chord;

                let dy = 0;
                // Fluid deflection field around airfoil
                if (relX > -0.6 && relX < 1.2) {
                    const influence = Math.exp(-Math.pow((relX - 0.2) * 2.2, 2));
                    if (pt.baseY < centerY) {
                        // Upper low-pressure suction stream
                        dy = -influence * (p.isStalled ? 35 : 22 * (1 + state.aoa * 0.05));
                    } else {
                        // Lower high-pressure downwash stream
                        dy = influence * 12 * (1 + state.aoa * 0.04);
                    }
                }

                ctx.fillStyle = pt.baseY < centerY ? 'rgba(56, 189, 248, 0.75)' : 'rgba(249, 115, 22, 0.75)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.baseY + dy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Render Pressure Glow Field
        if (state.showPressure) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(aoaRad); // Rotate with wing angle

            // Upper Suction Zone (Low Pressure -> Blue/Red on stall)
            const topGrad = ctx.createRadialGradient(0, -chord * 0.2, 5, 0, -chord * 0.2, chord * 0.55);
            topGrad.addColorStop(0, p.isStalled ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.35)');
            topGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = topGrad;
            ctx.fillRect(-chord, -chord, chord * 2, chord);

            // Lower High Pressure Zone (Orange)
            const botGrad = ctx.createRadialGradient(0, chord * 0.2, 5, 0, chord * 0.2, chord * 0.45);
            botGrad.addColorStop(0, 'rgba(249, 115, 22, 0.3)');
            botGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = botGrad;
            ctx.fillRect(-chord, 0, chord * 2, chord);

            ctx.restore();
        }

        // Render Airfoil Profile (Nose points LEFT into oncoming wind)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(aoaRad); // Rotates nose UP for positive AoA

        ctx.beginPath();
        const steps = 60;
        // Upper Surface
        for (let i = 0; i <= steps; i++) {
            const pt = getAirfoilPoint(i / steps, chord);
            if (i === 0) ctx.moveTo(pt.x, pt.yUpper);
            else ctx.lineTo(pt.x, pt.yUpper);
        }
        // Lower Surface
        for (let i = steps; i >= 0; i--) {
            const pt = getAirfoilPoint(i / steps, chord);
            ctx.lineTo(pt.x, pt.yLower);
        }
        ctx.closePath();

        const wingGrad = ctx.createLinearGradient(0, -25, 0, 25);
        wingGrad.addColorStop(0, '#f1f5f9');
        wingGrad.addColorStop(0.5, '#94a3b8');
        wingGrad.addColorStop(1, '#334155');
        ctx.fillStyle = wingGrad;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Render Smooth Force Vectors
        if (state.showVectors) {
            const targetLift = Math.min(160, (p.Lift_N / (p.Weight_N || 1)) * 80);
            const targetDrag = Math.min(120, (p.Drag_N / (p.Lift_N || 1)) * 100);
            const targetWeight = Math.min(100, 80);

            // Exponential smoothing (lerp)
            smoothVectors.lift += (targetLift - smoothVectors.lift) * 0.1;
            smoothVectors.drag += (targetDrag - smoothVectors.drag) * 0.1;
            smoothVectors.weight += (targetWeight - smoothVectors.weight) * 0.1;

            // Lift Vector (UPWARDS -> Negative Y in Canvas)
            drawArrow(ctx, centerX, centerY, centerX, centerY - smoothVectors.lift, '#10b981', 'LIFT');

            // Drag Vector (RIGHTWARDS / DOWNWIND -> Positive X in Canvas)
            drawArrow(ctx, centerX, centerY, centerX + smoothVectors.drag, centerY, '#ef4444', 'DRAG');

            // Weight Vector (DOWNWARDS -> Positive Y in Canvas)
            drawArrow(ctx, centerX, centerY, centerX, centerY + smoothVectors.weight, 'rgba(148, 163, 184, 0.8)', 'WEIGHT');
        }
    }

    // Performance Graph Renderer
    function renderGraphs(p) {
        drawGraph(graphClCanvas, 'Angle of Attack (α)', 'C_L', -5, 25, 0, 1.8, (aoa) => {
            if (aoa <= 15) return 0.25 + 0.11 * aoa;
            return (0.25 + 0.11 * 15) * Math.exp(-(aoa - 15) * 0.28);
        }, state.aoa, p.C_L);

        drawGraph(graphDragCanvas, 'Airspeed (km/h)', 'Drag (kN)', 40, 800, 0, 150, (v) => {
            const v_ms = v / 3.6;
            const q = 0.5 * state.density * v_ms * v_ms;
            return (q * state.area * p.C_D) / 1000;
        }, state.speed, p.Drag_N / 1000);

        drawGraph(graphLdCanvas, 'Angle of Attack (α)', 'L/D Efficiency', -5, 25, 0, 25, (aoa) => {
            let cl = aoa <= 15 ? 0.25 + 0.11 * aoa : (0.25 + 0.11 * 15) * Math.exp(-(aoa - 15) * 0.28);
            let cd = 0.020 + (cl * cl) / (Math.PI * 8.0 * 0.82);
            if (aoa > 15) cd += 0.09 * (aoa - 15);
            return cd > 0 ? cl / cd : 0;
        }, state.aoa, p.LD_Ratio);
    }

    function drawGraph(canvas, xLabel, yLabel, minX, maxX, minY, maxY, fn, currentX, currentY) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const w = canvas.width;
        const h = canvas.height;
        const padL = 40, padR = 20, padT = 20, padB = 28;

        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const y = padT + (h - padT - padB) * (i / 4);
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);

            const x = padL + (w - padL - padR) * (i / 4);
            ctx.moveTo(x, padT);
            ctx.lineTo(x, h - padB);
        }
        ctx.stroke();

        // Curve
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        const steps = 90;
        for (let i = 0; i <= steps; i++) {
            const xVal = minX + (maxX - minX) * (i / steps);
            const yVal = fn(xVal);

            const px = padL + ((xVal - minX) / (maxX - minX)) * (w - padL - padR);
            const py = (h - padB) - ((yVal - minY) / (maxY - minY)) * (h - padT - padB);

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, Math.max(padT, Math.min(h - padB, py)));
        }
        ctx.stroke();

        // Current Value Point Marker
        const markerX = padL + ((currentX - minX) / (maxX - minX)) * (w - padL - padR);
        const markerY = (h - padB) - ((currentY - minY) / (maxY - minY)) * (h - padT - padB);

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(markerX, Math.max(padT, Math.min(h - padB, markerY)), 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '10px Inter';
        ctx.fillText(xLabel, w / 2 - 30, h - 6);
    }

    // Animation Loop
    function animate() {
        renderSimulatorCanvas();
        requestAnimationFrame(animate);
    }

    initEquations();
    updateDashboard();
    animate();
});