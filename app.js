import { ReactorSimulation, PARAMETERS } from "./simulation.mjs";

const simulation = new ReactorSimulation();
const byId = (id) => document.getElementById(id);
const number = (value, digits = 1) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const timeLabel = (time) => {
  const total = Math.floor(time);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const controlNames = ["reactor", "primary", "steam", "cooling"];
let paused = false;
let speed = 1;
let accumulator = 0;
let previousFrame = null;
let lastRender = -Infinity;
let lastSample = 0;
let history = [];

function text(id, value) {
  byId(id).textContent = value;
}
function meter(id, fraction, warning = false) {
  byId(id).style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  byId(id).classList.toggle("warning", warning);
}

function syncControls() {
  for (const name of controlNames) {
    const value = simulation.controls[name];
    const input = byId(`${name}-input`);
    input.value = value;
    input.style.setProperty("--fill", `${value}%`);
    byId(`${name}-value`).replaceChildren(
      document.createTextNode(value),
      Object.assign(document.createElement("span"), { textContent: "%" }),
    );
    input.setAttribute("aria-valuetext", `${value} percent`);
  }
  byId("reactor-input").disabled = Boolean(simulation.state.tripReason);
  byId("scram-button").disabled = Boolean(simulation.state.tripReason);
}

function sample() {
  const r = simulation.readings();
  history.push({
    time: r.time,
    heat: r.heat,
    electric: r.netElectric,
    cooling: r.coolingHeat,
  });
  const cutoff = r.time - 120;
  // Retain the sample just before the window boundary for a continuous trace.
  while (history.length > 2 && history[1].time < cutoff) history.shift();
}

function renderChart(r) {
  const start = Math.max(0, r.time - 120);
  const end = start + 120;
  const ceiling =
    Math.ceil(
      Math.max(
        1000,
        ...history.map((point) =>
          Math.max(point.heat, point.electric, point.cooling),
        ),
      ) / 500,
    ) * 500;
  text("chart-top", number(ceiling, 0));
  text("chart-middle", number(ceiling / 2, 0));
  for (const [id, field] of [
    ["heat-trend", "heat"],
    ["electric-trend", "electric"],
    ["cooling-trend", "cooling"],
  ]) {
    const points = history.filter((point) => point.time >= start);
    if (points.length === 1)
      points.push({ ...points[0], time: points[0].time + 0.15 });
    byId(id).setAttribute(
      "d",
      points
        .map((point, i) => {
          const x = 38 + ((point.time - start) / 120) * 947;
          const y = 125 - (point[field] / ceiling) * 110;
          return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" "),
    );
  }
  text("chart-start", timeLabel(start));
  text("chart-end", timeLabel(end));
}

function setFlow(selector, fraction, baselineDuration) {
  document.querySelectorAll(selector).forEach((path) => {
    path.style.animationDuration = `${baselineDuration / Math.max(0.04, fraction)}s`;
    path.style.opacity = fraction < 0.01 ? "0" : "1";
  });
}

function render() {
  const r = simulation.readings();
  text("sim-time", timeLabel(r.time));
  text("thermal-power", number(r.heat));
  text("electrical-power", number(r.netElectric));
  text("heat-rejection", number(r.coolingHeat));
  text("efficiency", r.efficiency === null ? "—" : number(r.efficiency));
  text(
    "efficiency-detail",
    r.tripReason
      ? "Stored heat still supplies the turbine"
      : r.efficiency === null
        ? "Waiting for temperatures to settle"
        : "Net electricity / reactor heat",
  );
  byId("efficiency").title =
    r.efficiency === null
      ? "Waiting for steady operation; stored heat affects output during transients."
      : "Net electrical output divided by reactor thermal power.";
  text(
    "thermal-detail",
    r.tripReason
      ? `${number(r.decayHeat)} MW of residual decay heat`
      : `${number(r.heat / 10, 0)}% of rated heat output`,
  );
  text(
    "electrical-detail",
    r.netElectric >= 0
      ? `${number(r.auxiliaryPower)} MW used by the plant`
      : "Importing power to run plant equipment",
  );
  text("fuel-temp", number(r.fuelTemperature, 0));
  text("primary-temp", number(r.primaryTemperature, 1));
  text("steam-pressure", number(r.steamPressure));
  text("steam-temp", number(r.steamTemperature, 1));
  text("turbine-rpm", number(r.rpm, 0));
  text("fuel-reserve", `${number(r.fuelPercent, 2)}%`);
  text("svg-fuel-temp", `${number(r.fuelTemperature, 0)} °C fuel`);
  text("svg-primary-temp", `${number(r.primaryTemperature, 0)} °C`);
  text("svg-steam-temp", `${number(r.steamTemperature, 0)} °C steam`);
  text("svg-steam-pressure", `${number(r.steamPressure)} bar`);
  text("svg-condenser-temp", `${number(r.condenserTemperature, 1)} °C`);
  text("svg-rpm", `${number(r.rpm, 0)} rpm`);
  text("svg-electric", `${number(r.netElectric)} MW net`);
  meter("thermal-bar", r.heat / PARAMETERS.ratedHeat);
  meter("electrical-bar", r.netElectric / 350);
  meter("fuel-meter", r.fuelTemperature / 1100, r.fuelTemperature > 950);
  meter(
    "primary-meter",
    r.primaryTemperature / 342,
    r.primaryTemperature > 330,
  );
  meter("steam-meter", r.steamPressure / 90, r.steamPressure > 75);
  meter("rpm-meter", r.rpm / PARAMETERS.nominalRPM);
  meter("reserve-fill", r.fuelPercent / 100);

  let status = r.settling ? "Finding balance" : "Stable operation";
  let insight =
    "Heat in, electricity and cooling out. Your plant is in balance.";
  let statusClass = r.settling ? "settling" : "";
  if (r.tripReason) {
    status =
      r.tripReason === "Manual shutdown"
        ? "Reactor shut down"
        : "Protection tripped";
    statusClass = "tripped";
    insight = `${r.tripReason}. ${number(r.decayHeat)} MW of decay heat remains. Keep cooling active; reset to restart.`;
  } else if (
    r.primaryTemperature > 330 ||
    r.fuelTemperature > 950 ||
    r.steamPressure > 75 ||
    r.condenserTemperature > 70
  ) {
    status = "Approaching a limit";
    statusClass = "settling";
    insight =
      "Temperatures or pressure are high. Reduce reactor heat or improve heat removal.";
  } else if (r.heat < 10) {
    status = "Low-power operation";
    insight =
      "Reactor heat is low. Stored heat may still drive the turbine; pumps continue to consume electricity.";
  } else if (r.storageRate > 8) {
    insight =
      "Heat is accumulating in the plant. Temperatures will rise until more energy can leave.";
  } else if (r.storageRate < -8) {
    insight =
      "The plant is releasing stored heat. Electrical output can lag behind changes at the reactor.";
  } else if (r.settling) {
    insight =
      "The reactor is responding. Watch the temperatures and output as heat moves through each circuit.";
  }
  if (paused) status = "Simulation paused";
  const badge = byId("plant-status");
  if (badge.dataset.status !== status) {
    badge.replaceChildren(
      document.createElement("span"),
      document.createTextNode(status),
    );
    badge.dataset.status = status;
  }
  badge.className = `status-badge ${statusClass}`;
  text("plant-insight", insight);
  text(
    "storage-rate",
    Math.abs(r.storageRate) < 0.5
      ? "0 MW stored"
      : `${r.storageRate >= 0 ? "+" : "−"}${number(Math.abs(r.storageRate), 0)} MW stored`,
  );
  setFlow(".primary-flow path", simulation.controls.primary / 100, 1.4);
  setFlow(".steam-flow path", Math.min(1.5, r.turbineHeat / 700), 1.4);
  setFlow(".cooling-flow path", simulation.controls.cooling / 100, 1.5);
  setFlow(".shaft-motion", r.rpm / PARAMETERS.nominalRPM, 0.6);
  document.querySelector(".fuel-rods").style.opacity = String(
    0.25 + Math.min(0.75, r.heat / 1000),
  );
  syncControls();
  renderChart(r);
}

for (const name of controlNames) {
  byId(`${name}-input`).addEventListener("input", (event) => {
    simulation.setControl(name, Number(event.target.value));
    render();
  });
}

function setPaused(value) {
  paused = value;
  accumulator = 0;
  previousFrame = null;
  document.body.classList.toggle("paused", paused);
  byId("pause-button").setAttribute("aria-pressed", String(paused));
  byId("pause-button").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  byId("pause-icon").setAttribute(
    "d",
    paused ? "m8 5 11 7-11 7Z" : "M9 5v14M15 5v14",
  );
  render();
}

byId("pause-button").addEventListener("click", () => setPaused(!paused));
byId("speed").addEventListener("change", (event) => {
  speed = Number(event.target.value);
});
byId("scram-button").addEventListener("click", () => {
  simulation.scram();
  render();
});
byId("reset-button").addEventListener("click", () => {
  simulation.reset();
  history = [];
  lastSample = 0;
  speed = 1;
  byId("speed").value = "1";
  sample();
  setPaused(false);
});
document
  .querySelector('a[href="#model-notes"]')
  .addEventListener("click", () => {
    byId("model-notes").open = true;
  });
document.addEventListener("visibilitychange", () => {
  // A background tab must not catch up with an enormous time step on return.
  previousFrame = null;
  accumulator = 0;
});

function frame(timestamp) {
  if (previousFrame === null) previousFrame = timestamp;
  const elapsed = Math.min(
    0.25,
    Math.max(0, (timestamp - previousFrame) / 1000),
  );
  previousFrame = timestamp;
  if (!paused && !document.hidden) {
    accumulator += elapsed * speed;
    while (accumulator >= PARAMETERS.maxStep) {
      simulation.step(PARAMETERS.maxStep);
      accumulator -= PARAMETERS.maxStep;
      if (simulation.state.time - lastSample >= 0.5) {
        sample();
        lastSample = simulation.state.time;
      }
    }
  }
  if (timestamp - lastRender > 150) {
    render();
    lastRender = timestamp;
  }
  requestAnimationFrame(frame);
}

sample();
render();
requestAnimationFrame(frame);
