/* script.js */

// ==========================================================================
// AEROLAB AERODYNAMIC SIMULATOR & VECTOR ENGINE
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // State & Aerodynamic Parameters
    const state = {
        speed: 220, // km/h
        aoa: 5.0, // degrees
        area: 125, // m^2
        weight: 65000, // kg
        density: 1.225, // kg/m^3
        showVectors: true,
        showPressure: true,
        showParticles: true,
        preset: 'jet'
    };

    // Smooth lerp state variables for vector animation
    const smoothState = {
        liftLength: 0,
        dragLength: 0,
        weightLength: 0
    };

    // Aircraft Presets Configuration Database
    const presets = {
        jet: { speed: 220, aoa: 5.0, area: 125, weight: 65000 },
        fighter: { speed: 450, aoa: 8.0, area: 78, weight: 22000 },
        glider: { speed: 90, aoa: 4.0, area: 12, weight: 450 },
        cargo: { speed: 200, aoa: 6.0, area: 450, weight: 280000 }
    };

    // DOM References
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
        weightReq: document.getElementById('readout-weight-req'),
        heroCl: document.getElementById('hero-cl-val'),
        heroLd: document.getElementById('hero-ld-val')
    };

    const statusBadge = document.getElementById('flight-status-badge');
    const stallOverlay = document.getElementById('stall-warning');
    const balanceStatusText = document.getElementById('balance-status-text');
    const balanceDesc = document.getElementById('balance-desc');

    const fillLift = document.getElementById('fill-lift');
    const fillDrag = document.getElementById('fill-drag');

    const heroCanvas = document.getElementById('hero-wing-canvas');
    const simCanvas = document.getElementById('sim-main-canvas');
    const bgCanvas = document.getElementById('bg-canvas');

    const graphClCanvas = document.getElementById('graph-cl-aoa');
    const graphDragCanvas = document.getElementById('graph-drag-speed');
    const graphLdCanvas = document.getElementById('graph-ld-ratio');

    let heroParticles = [];
    let simParticles = [];
    let bgParticles = [];

    // ==========================================================================
    // REALISTIC AERODYNAMIC PHYSICS COMPUTATION
    // ==========================================================================

    function calculatePhysics() {
        const v_m_s = state.speed / 3.6; // km/h -> m/s
        const rho = state.density;
        const S = state.area;

        // Dynamic Pressure q = 0.5 * rho * v^2
        const q = 0.5 * rho * v_m_s * v_m_s;

        // Lift Coefficient Curve (C_L)
        const alpha_crit = 15.0; // Stall boundary angle
        let C_L = 0;
        let isStalled = false;

        if (state.aoa <= alpha_crit) {
            // Linear thin-airfoil lift curve C_L = C_L0 + 2*pi*alpha
            C_L = 0.25 + 0.11 * state.aoa;
        } else {
            // Post-stall lift collapse curve
            const drop = Math.exp(-(state.aoa - alpha_crit) * 0.28);
            C_L = (0.25 + 0.11 * alpha_crit) * drop;
            isStalled = true;
        }

        // Drag Coefficients
        const AR = 8.0; // Aspect Ratio
        const Oswald_e = 0.82;
        const C_D0 = 0.020; // Parasitic drag coeff
        const C_Di = (C_L * C_L) / (Math.PI * AR * Oswald_e); // Induced drag coeff
        let C_D = C_D0 + C_Di;

        if (isStalled) {
            C_D += 0.09 * (state.aoa - alpha_crit);
        }

        // Dynamic Forces
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

    // Safely render KaTeX math or formatted fallback strings
    function safeRenderMath(id, texString, textFallback) {
        const el = document.getElementById(id);
        if (!el) return;
        if (window.katex) {
            try {
                katex.render(texString, el, { displayMode: false, throwOnError: false });
            } catch (e) {
                el.innerHTML = textFallback;
            }
        } else {
            el.innerHTML = textFallback;
        }
    }

    // ==========================================================================
    // UI DASHBOARD UPDATES
    // ==========================================================================

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

        readouts.heroCl.textContent = p.C_L.toFixed(2);
        readouts.heroLd.textContent = p.LD_Ratio.toFixed(1);

        fillLift.style.width = Math.min(100, (p.Lift_N / (p.Weight_N * 1.4)) * 100) + '%';
        fillDrag.style.width = Math.min(100, (p.Drag_N / (p.Lift_N * 0.35 || 1)) * 100) + '%';

        // Flight Condition & Stall Overlay
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

        // Live Equations Display
        safeRenderMath(
            'katex-lift',
            `L = \\frac{1}{2}(${state.density})(${p.v_m_s.toFixed(1)})^2(${state.area})(${p.C_L.toFixed(2)}) = \\text{${fmtN(p.Lift_N)}}`,
            `L = ½ · ${state.density} · (${p.v_m_s.toFixed(1)})² · ${state.area} · ${p.C_L.toFixed(2)} = <b>${fmtN(p.Lift_N)}</b>`
        );

        safeRenderMath(
            'katex-drag',
            `D = \\frac{1}{2}(${state.density})(${p.v_m_s.toFixed(1)})^2(${state.area})(${p.C_D.toFixed(3)}) = \\text{${fmtN(p.Drag_N)}}`,
            `D = ½ · ${state.density} · (${p.v_m_s.toFixed(1)})² · ${state.area} · ${p.C_D.toFixed(3)} = <b>${fmtN(p.Drag_N)}</b>`
        );

        renderGraphs(p);
    }

    // Input Listeners
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
    document.querySelectorAll('.preset-btn, .airframe-card').forEach(el => {
        el.addEventListener('click', () => {
            const presetKey = el.dataset.preset || el.dataset.selectPreset;
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
                const activeBtn = document.querySelector(`.preset-btn[data-preset="${presetKey}"]`);
                if (activeBtn) activeBtn.classList.add('active');

                updateDashboard();
            }
        });
    });

    // Toggle Toggles
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
    // CANVAS WING & FLOW RENDER ENGINE
    // ==========================================================================

    function initParticles(canvas, particleArray, count) {
        particleArray.length = 0;
        for (let i = 0; i < count; i++) {
            particleArray.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                speed: 3 + Math.random() * 4,
                size: 1.5 + Math.random() * 1.5
            });
        }
    }

    // NACA 2412 Airfoil Profile Generator
    function getAirfoilPoint(t, chord) {
        const x = t * chord;
        const yc = t < 0.4 ? 0.125 * (0.8 * t - t * t) : 0.0555 * (0.2 + 0.8 * t - t * t);
        const yt = 0.6 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * Math.pow(t, 3) - 0.1015 * Math.pow(t, 4));
        return {
            x: x - chord / 2,
            yUpper: -(yc + yt) * chord,
            yLower: -(yc - yt) * chord
        };
    }

    // Helper for Smooth Arrow Head Drawing
    function drawArrow(ctx, fromX, fromY, toX, toY, color, label) {
        const headLen = 10;
        const angle = Math.atan2(toY - fromY, toX - fromX);

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

        if (label) {
            ctx.font = 'bold 11px JetBrains Mono';
            ctx.fillText(label, toX + 8, toY + 4);
        }
    }

    function renderWingCanvas(canvas, p, isHero = false) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const centerX = width * 0.45;
        const centerY = height * 0.50;
        const chord = isHero ? width * 0.36 : width * 0.32;

        // FIXED PITCH ROTATION:
        // Aircraft nose points LEFT into the wind.
        // Positive AoA pitches nose UP (Leading edge UP / negative Y in canvas).
        const aoaRad = (state.aoa * Math.PI) / 180;

        // Streamlines / Particles
        if (state.showParticles) {
            const particles = isHero ? heroParticles : simParticles;
            if (particles.length === 0) initParticles(canvas, particles, isHero ? 90 : 130);

            particles.forEach(pt => {
                pt.x += (state.speed / 45) * pt.speed;
                if (pt.x > width) pt.x = 0;

                const dx = pt.x - centerX;
                const distY = pt.y - centerY;
                const relX = dx / chord;

                let dy = 0;
                if (relX > -0.6 && relX < 1.2) {
                    const influence = Math.exp(-Math.pow((relX - 0.2) * 2.2, 2));
                    if (pt.y < centerY) {
                        // Low pressure top suction flow
                        dy = -influence * (p.isStalled ? 35 : 20 * (1 + state.aoa * 0.05));
                    } else {
                        // Downwash deflection bottom
                        dy = influence * 12 * (1 + state.aoa * 0.04);
                    }
                }

                ctx.fillStyle = pt.y < centerY ? 'rgba(6, 182, 212, 0.65)' : 'rgba(249, 115, 22, 0.65)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y + dy, pt.size, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Pressure Glow Field
        if (state.showPressure) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(-aoaRad); // Rotate with airfoil pitch

            // Top Suction (Cyan/Red)
            const topGrad = ctx.createRadialGradient(0, -chord * 0.2, 5, 0, -chord * 0.2, chord * 0.55);
            topGrad.addColorStop(0, p.isStalled ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.35)');
            topGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = topGrad;
            ctx.fillRect(-chord, -chord, chord * 2, chord);

            // Bottom High Pressure (Orange)
            const botGrad = ctx.createRadialGradient(0, chord * 0.2, 5, 0, chord * 0.2, chord * 0.45);
            botGrad.addColorStop(0, 'rgba(249, 115, 22, 0.3)');
            botGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = botGrad;
            ctx.fillRect(-chord, 0, chord * 2, chord);

            ctx.restore();
        }

        // Render Airfoil Profile
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-aoaRad); // Nose points Left, pitches UP with positive AoA

        ctx.beginPath();
        const steps = 60;
        for (let i = 0; i <= steps; i++) {
            const pt = getAirfoilPoint(i / steps, chord);
            if (i === 0) ctx.moveTo(-pt.x, pt.yUpper); // Flip X so leading edge is left
            else ctx.lineTo(-pt.x, pt.yUpper);
        }
        for (let i = steps; i >= 0; i--) {
            const pt = getAirfoilPoint(i / steps, chord);
            ctx.lineTo(-pt.x, pt.yLower);
        }
        ctx.closePath();

        const wingGrad = ctx.createLinearGradient(0, -25, 0, 25);
        wingGrad.addColorStop(0, '#e2e8f0');
        wingGrad.addColorStop(0.5, '#94a3b8');
        wingGrad.addColorStop(1, '#334155');
        ctx.fillStyle = wingGrad;
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Smoothly Animated Vector Arrows
        if (state.showVectors) {
            const targetLift = Math.min(160, (p.Lift_N / (p.Weight_N || 1)) * 80);
            const targetDrag = Math.min(120, (p.Drag_N / (p.Lift_N || 1)) * 100);
            const targetWeight = Math.min(100, 80);

            // Smooth Interpolation (Lerp)
            smoothState.liftLength += (targetLift - smoothState.liftLength) * 0.1;
            smoothState.dragLength += (targetDrag - smoothState.dragLength) * 0.1;
            smoothState.weightLength += (targetWeight - smoothState.weightLength) * 0.1;

            // Lift Arrow (UPWARD -> Negative Y in Canvas)
            drawArrow(ctx, centerX, centerY, centerX, centerY - smoothState.liftLength, '#10b981', 'LIFT');

            // Drag Arrow (RIGHTWARD -> Positive X in Canvas)
            drawArrow(ctx, centerX, centerY, centerX + smoothState.dragLength, centerY, '#ef4444', 'DRAG');

            // Weight Arrow (DOWNWARD -> Positive Y in Canvas)
            drawArrow(ctx, centerX, centerY, centerX, centerY + smoothState.weightLength, 'rgba(148, 163, 184, 0.7)', 'WEIGHT');
        }
    }

    // Background Particles Canvas
    function renderBgParticles() {
        if (!bgCanvas) return;
        const ctx = bgCanvas.getContext('2d');
        if (bgCanvas.width !== window.innerWidth || bgCanvas.height !== window.innerHeight) {
            bgCanvas.width = window.innerWidth;
            bgCanvas.height = window.innerHeight;
            initParticles(bgCanvas, bgParticles, 50);
        }

        ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';

        bgParticles.forEach(p => {
            p.x += p.speed * 0.25;
            if (p.x > bgCanvas.width) p.x = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // ==========================================================================
    // PERFORMANCE GRAPHS RENDERER
    // ==========================================================================

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

        // Grid Lines
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

        // Draw Plot Curve
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

        // Current Operating State Point
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
        ctx.fillText(xLabel, w / 2 - 25, h - 6);
    }

    // ==========================================================================
    // MAIN ANIMATION LOOP
    // ==========================================================================

    function animate() {
        const p = calculatePhysics();
        renderWingCanvas(heroCanvas, p, true);
        renderWingCanvas(simCanvas, p, false);
        renderBgParticles();
        requestAnimationFrame(animate);
    }

    updateDashboard();
    animate();
});