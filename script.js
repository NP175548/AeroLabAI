const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Simulation Flight & Dynamic Mass Variables
let pitchAngle = 0; // Pitch angle in degrees
let velocity = { x: 14, y: 0 }; // Canvas vector space: +Y is DOWN
let position = { x: 160, y: 190 };
let aircraftMassKg = 12000; // Mass in kilograms (Aircraft Weight = Mass * g)

const CRITICAL_AOA = 15; // Critical angle of attack for aerodynamic stall
const AIR_DENSITY = 1.225; // kg/m^3 standard sea level
const WING_AREA = 30; // m^2 wing surface area

// Visual Particle System for airflow vector lines
const particles = Array.from({ length: 30 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  speed: 4 + Math.random() * 4
}));

// DOM Elements
const statusTag = document.getElementById('status-tag');
const aoaTag = document.getElementById('aoa-tag');
const speedTag = document.getElementById('speed-tag');
const weightTag = document.getElementById('weight-tag');
const weightSlider = document.getElementById('weightSlider');
const weightValueDisplay = document.getElementById('weightValueDisplay');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// Dark Mode Toggle Logic
let isDarkMode = false;
themeToggleBtn.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  themeToggleBtn.textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
});

// Update Aircraft Mass via Slider
weightSlider.addEventListener('input', (e) => {
  aircraftMassKg = parseFloat(e.target.value);
  weightValueDisplay.textContent = `${aircraftMassKg.toLocaleString()} kg`;
});

function updatePhysics() {
  // 1. Calculate true speed and flight path angle (invert canvas Y coordinate)
  const speed = Math.hypot(velocity.x, velocity.y);
  const flightPathAngleDeg = Math.atan2(-velocity.y, velocity.x) * (180 / Math.PI);

  // 2. True Angle of Attack = Pitch Angle - Flight Path Angle
  const angleOfAttack = pitchAngle - flightPathAngleDeg;

  // 3. Stall logic: Triggered if Angle of Attack exceeds 15 deg or speed drops critically low
  const minRequiredSpeed = 6 + (aircraftMassKg / 3000); // Heavier aircraft stall at higher speeds
  const isStalled = angleOfAttack > CRITICAL_AOA || speed < minRequiredSpeed;

  // 4. Calculate Lift and Drag Coefficients
  let liftCoefficient = isStalled ? 0.08 : angleOfAttack * 0.095;
  let dragCoefficient = isStalled ? 0.12 : 0.015 + Math.pow(Math.max(0, angleOfAttack) * 0.018, 2);

  // Aerodynamic Forces (Scaled for simulator time step)
  const liftForce = 0.5 * liftCoefficient * AIR_DENSITY * Math.pow(speed, 2) * WING_AREA * 0.01;
  const dragForce = 0.5 * dragCoefficient * AIR_DENSITY * Math.pow(speed, 2) * WING_AREA * 0.01;
  
  // Weight Effect: Force scaled down to canvas physics space
  const weightForce = (aircraftMassKg * 0.00012);

  // 5. Apply Forces based on current velocity direction
  const flightRad = Math.atan2(velocity.y, velocity.x);

  // Lift acts perpendicular to flight path (-90°), Drag acts opposite
  const netAx = (-dragForce * Math.cos(flightRad) - liftForce * Math.sin(flightRad)) / (aircraftMassKg / 10000);
  const netAy = (-dragForce * Math.sin(flightRad) + liftForce * Math.cos(flightRad)) / (aircraftMassKg / 10000);

  velocity.x += netAx;
  velocity.y -= netAy; // Subtract lift component because Canvas +Y is down

  // Apply Gravity Weight downward (+Y direction on canvas)
  velocity.y += weightForce;

  // Steady engine thrust compensation
  if (velocity.x < 12 && !isStalled) {
    velocity.x += 0.15;
  }

  // Update Y position with boundary locks
  position.y += velocity.y;
  if (position.y < 60) { position.y = 60; velocity.y = 0; }
  if (position.y > 340) { position.y = 340; velocity.y = 0; }

  // 6. Invert vertical speed check: Screen UP means velocity.y < 0
  const verticalSpeed = -velocity.y; // Positive = Climbing, Negative = Descent

  let flightStatus = "Level Flight";
  if (isStalled) {
    flightStatus = "STALL DETECTED";
  } else if (verticalSpeed > 0.25) {
    flightStatus = "Climbing";
  } else if (verticalSpeed < -0.25) {
    flightStatus = "Descent";
  }

  // Update Telemetry Display
  statusTag.textContent = `Status: ${flightStatus}`;
  statusTag.className = isStalled ? "stat stall" : "stat";
  aoaTag.textContent = `AoA: ${angleOfAttack.toFixed(1)}°`;
  speedTag.textContent = `Speed: ${(speed * 10).toFixed(0)} kts`;
  weightTag.textContent = `Weight: ${aircraftMassKg.toLocaleString()} kg`;
}

function render() {
  // Theme aware background rendering
  ctx.fillStyle = isDarkMode ? '#121212' : '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Gridlines
  ctx.strokeStyle = isDarkMode ? '#2c2c2e' : '#e5e5ea';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Draw Airflow Vectors (Cyan Streams)
  ctx.strokeStyle = isDarkMode ? '#00d2ff' : '#0071e3';
  ctx.lineWidth = 1.5;
  particles.forEach(p => {
    p.x += p.speed;
    if (p.x > canvas.width) p.x = 0;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 12, p.y);
    ctx.stroke();
  });

  // Render Airfoil
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate((-pitchAngle * Math.PI) / 180); // Invert pitch for visual rendering

  // Wing body
  ctx.fillStyle = isDarkMode ? '#ffffff' : '#1d1d1f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Reference Chord Line (Blue)
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

// Event Controls
document.getElementById('pitchUpBtn').addEventListener('click', () => { pitchAngle += 2; });
document.getElementById('pitchDownBtn').addEventListener('click', () => { pitchAngle -= 2; });
document.getElementById('resetBtn').addEventListener('click', () => {
  pitchAngle = 0;
  velocity = { x: 14, y: 0 };
  position = { x: 160, y: 190 };
});

// Start physics loop
loop();