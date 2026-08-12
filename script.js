const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Aerodynamic Constants
const CRITICAL_AOA = 15;
const AIR_DENSITY = 1.225;
const WING_AREA = 30;

// State Variables Controlled Exclusively by Sliders
let pitchAngle = 0;          // Degrees (-15 to 25)
let throttlePercent = 60;    // Percentage (0 to 100)
let flapDeflection = 0;      // Degrees (0 to 30)
let aircraftMassKg = 12000;   // Mass in kg (5,000 to 30,000)

let velocity = { x: 14, y: 0 };
let position = { x: 160, y: 190 };

// Particle system for wind tunnel airflow lines
const particles = Array.from({ length: 35 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  speed: 4 + Math.random() * 4
}));

// DOM Slider Bindings
const pitchSlider = document.getElementById('pitchSlider');
const throttleSlider = document.getElementById('throttleSlider');
const flapsSlider = document.getElementById('flapsSlider');
const weightSlider = document.getElementById('weightSlider');

// DOM Badge Displays
const pitchValueDisplay = document.getElementById('pitchValueDisplay');
const throttleValueDisplay = document.getElementById('throttleValueDisplay');
const flapsValueDisplay = document.getElementById('flapsValueDisplay');
const weightValueDisplay = document.getElementById('weightValueDisplay');

// Telemetry DOM Elements
const statusTag = document.getElementById('status-tag');
const aoaTag = document.getElementById('aoa-tag');
const speedTag = document.getElementById('speed-tag');
const thrustTag = document.getElementById('thrust-tag');
const weightTag = document.getElementById('weight-tag');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const resetBtn = document.getElementById('resetBtn');

// Dark Mode Toggle Logic
let isDarkMode = false;
themeToggleBtn.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  themeToggleBtn.textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
});

// Slider Event Listeners
pitchSlider.addEventListener('input', (e) => {
  pitchAngle = parseFloat(e.target.value);
  pitchValueDisplay.textContent = `${pitchAngle.toFixed(1)}°`;
});

throttleSlider.addEventListener('input', (e) => {
  throttlePercent = parseFloat(e.target.value);
  throttleValueDisplay.textContent = `${throttlePercent}%`;
});

flapsSlider.addEventListener('input', (e) => {
  flapDeflection = parseFloat(e.target.value);
  flapsValueDisplay.textContent = `${flapDeflection}°`;
});

weightSlider.addEventListener('input', (e) => {
  aircraftMassKg = parseFloat(e.target.value);
  weightValueDisplay.textContent = `${aircraftMassKg.toLocaleString()} kg`;
});

resetBtn.addEventListener('click', () => {
  pitchSlider.value = 0;
  throttleSlider.value = 60;
  flapsSlider.value = 0;
  weightSlider.value = 12000;

  pitchAngle = 0;
  throttlePercent = 60;
  flapDeflection = 0;
  aircraftMassKg = 12000;

  pitchValueDisplay.textContent = "0.0°";
  throttleValueDisplay.textContent = "60%";
  flapsValueDisplay.textContent = "0°";
  weightValueDisplay.textContent = "12,000 kg";

  velocity = { x: 14, y: 0 };
  position = { x: 160, y: 190 };
});

function updatePhysics() {
  const speed = Math.hypot(velocity.x, velocity.y);
  const flightPathAngleDeg = Math.atan2(-velocity.y, velocity.x) * (180 / Math.PI);
  const angleOfAttack = pitchAngle - flightPathAngleDeg;

  // Stall dynamics: Flaps slightly increase critical AoA tolerance
  const effectiveCriticalAoA = CRITICAL_AOA + (flapDeflection * 0.1);
  const minSpeedRequired = 5 + (aircraftMassKg / 3000) - (flapDeflection * 0.08);
  const isStalled = angleOfAttack > effectiveCriticalAoA || speed < minSpeedRequired;

  // Coefficients (Flaps add base lift and base drag)
  const baseCL = angleOfAttack * 0.095 + (flapDeflection * 0.018);
  const baseCD = 0.015 + Math.pow(Math.max(0, angleOfAttack) * 0.018, 2) + (flapDeflection * 0.006);

  const liftCoefficient = isStalled ? 0.08 : baseCL;
  const dragCoefficient = isStalled ? 0.14 : baseCD;

  // Force Calculations
  const liftForce = 0.5 * liftCoefficient * AIR_DENSITY * Math.pow(speed, 2) * WING_AREA * 0.01;
  const dragForce = 0.5 * dragCoefficient * AIR_DENSITY * Math.pow(speed, 2) * WING_AREA * 0.01;
  const thrustForce = (throttlePercent / 100) * 0.28;
  const gravityWeight = (aircraftMassKg * 0.00012);

  const flightRad = Math.atan2(velocity.y, velocity.x);
  const massFactor = aircraftMassKg / 12000;

  // Net accelerations along body/velocity axes
  const netAx = (thrustForce - dragForce * Math.cos(flightRad) - liftForce * Math.sin(flightRad)) / massFactor;
  const netAy = (-dragForce * Math.sin(flightRad) + liftForce * Math.cos(flightRad)) / massFactor;

  velocity.x += netAx;
  velocity.y -= netAy;         // -y on canvas is visually UP
  velocity.y += gravityWeight; // +y on canvas is visually DOWN

  // Clamp minimum forward speed to avoid vector division by zero
  if (velocity.x < 1) velocity.x = 1;

  // Boundaries on canvas height
  position.y += velocity.y;
  if (position.y < 60) { position.y = 60; velocity.y = 0; }
  if (position.y > 330) { position.y = 330; velocity.y = 0; }

  const verticalSpeed = -velocity.y;

  let flightStatus = "Level Flight";
  if (isStalled) {
    flightStatus = "STALL DETECTED";
  } else if (verticalSpeed > 0.25) {
    flightStatus = "Climbing";
  } else if (verticalSpeed < -0.25) {
    flightStatus = "Descent";
  }

  // Update Telemetry Displays
  statusTag.textContent = `Status: ${flightStatus}`;
  statusTag.className = isStalled ? "stat stall" : "stat";
  aoaTag.textContent = `AoA: ${angleOfAttack.toFixed(1)}°`;
  speedTag.textContent = `Speed: ${(speed * 10).toFixed(0)} kts`;
  thrustTag.textContent = `Thrust: ${throttlePercent}%`;
  weightTag.textContent = `Weight: ${aircraftMassKg.toLocaleString()} kg`;
}

function render() {
  ctx.fillStyle = isDarkMode ? '#121212' : '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Background Gridlines
  ctx.strokeStyle = isDarkMode ? '#2c2c2e' : '#e5e5ea';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Stream Particles speed influenced by forward speed
  const streamSpeed = Math.hypot(velocity.x, velocity.y);
  ctx.strokeStyle = isDarkMode ? '#00d2ff' : '#0071e3';
  ctx.lineWidth = 1.5;
  particles.forEach(p => {
    p.x += streamSpeed * 0.4 + p.speed * 0.2;
    if (p.x > canvas.width) p.x = 0;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 12, p.y);
    ctx.stroke();
  });

  // Aircraft Wing & Flap Render
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate((-pitchAngle * Math.PI) / 180);

  // Main Wing Body
  ctx.fillStyle = isDarkMode ? '#ffffff' : '#1d1d1f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trailing Edge Flap Deflection Visual
  if (flapDeflection > 0) {
    ctx.save();
    ctx.translate(-40, 2);
    ctx.rotate((flapDeflection * Math.PI) / 180);
    ctx.fillStyle = '#ff9500';
    ctx.fillRect(-12, -2, 14, 4);
    ctx.restore();
  }

  // Blue Reference Chord Line
  ctx.strokeStyle = '#0071e3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-60, 0);
  ctx.lineTo(60, 0);
  ctx.stroke();

  ctx.restore();
}

function loop() {
  updatePhysics();
  render();
  requestAnimationFrame(loop);
}

// Start physics loop
loop();