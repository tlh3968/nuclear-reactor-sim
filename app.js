import { ReactorSimulation, PARAMETERS } from "./simulation.mjs";
import { diagnose } from "./plant-state.mjs";
import { PlantSound } from "./sound.mjs";

const sim = new ReactorSimulation();
const sound = new PlantSound();
const elements = new Map();
const el = (id) => {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
};
const text = (id, value) => {
  const node = el(id);
  if (node.textContent !== String(value)) node.textContent = value;
};
const n = (value, digits = 1) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const clock = (time) =>
  `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let paused = false,
  speed = 1,
  previousFrame = null,
  accumulator = 0,
  lastRender = 0,
  lastSample = 0;
let samples = [],
  alarmLog = new Map(),
  silenced = false,
  editing = false,
  selected = null;
let holdTimer, repeatTimer;
const defaultLayout = () => ({
  sides: false,
  bottom: false,
  widths: { systems: 228, controls: 292 },
});
let layout = defaultLayout();
try {
  const saved = JSON.parse(localStorage.getItem("reactor-lab-v2-layout"));
  if (
    saved &&
    typeof saved.sides === "boolean" &&
    typeof saved.bottom === "boolean"
  ) {
    layout = {
      sides: saved.sides,
      bottom: saved.bottom,
      widths: {
        systems: clamp(Number(saved.widths?.systems) || 228, 205, 300),
        controls: clamp(Number(saved.widths?.controls) || 292, 275, 330),
      },
    };
  }
  const volume = Number(localStorage.getItem("reactor-lab-v2-volume"));
  if (
    localStorage.getItem("reactor-lab-v2-volume") !== null &&
    Number.isFinite(volume)
  )
    el("volume").value = clamp(volume, 0, 100);
} catch {
  /* Local storage is optional, including in private browsing. */
}
sound.setVolume(Number(el("volume").value) / 100);
text("volume-value", `${el("volume").value}%`);

function applyLayout() {
  el("workspace").classList.toggle("swap-sides", layout.sides);
  el("workspace").classList.toggle("swap-bottom", layout.bottom);
  document.documentElement.style.setProperty(
    "--systems-width",
    `${layout.widths.systems}px`,
  );
  document.documentElement.style.setProperty(
    "--controls-width",
    `${layout.widths.controls}px`,
  );
  document
    .querySelectorAll("[data-resize]")
    .forEach((handle) =>
      handle.setAttribute(
        "aria-valuenow",
        Math.round(layout.widths[handle.dataset.resize]),
      ),
    );
}
function saveLayout() {
  try {
    localStorage.setItem("reactor-lab-v2-layout", JSON.stringify(layout));
    text(
      "saved-layout",
      editing ? "EDIT MODE · LAYOUT SAVED" : "LAYOUT LOCKED · SAVED",
    );
  } catch {
    text("saved-layout", "LAYOUT SAVED FOR THIS SESSION");
  }
}
function setEditing(value) {
  editing = value;
  document.body.classList.toggle("editing", editing);
  document
    .querySelectorAll("[data-drag]")
    .forEach((header) => (header.draggable = editing));
  el("layout-button").setAttribute("aria-pressed", String(editing));
  text("layout-button", editing ? "Lock layout" : "Customize layout");
  el("layout-reset").hidden = !editing;
  document
    .querySelectorAll("[data-resize]")
    .forEach((handle) => (handle.tabIndex = editing ? 0 : -1));
  saveLayout();
}
function swapPanels(pair) {
  if (!editing) return;
  layout[pair === "sides" ? "sides" : "bottom"] =
    !layout[pair === "sides" ? "sides" : "bottom"];
  applyLayout();
  saveLayout();
}
el("layout-button").addEventListener("click", () => setEditing(!editing));
el("layout-reset").addEventListener("click", () => {
  layout = defaultLayout();
  applyLayout();
  saveLayout();
});
document
  .querySelectorAll("[data-move]")
  .forEach((button) =>
    button.addEventListener("click", () => swapPanels(button.dataset.move)),
  );
let draggedPanel = null;
const matching = (a, b) =>
  a !== b &&
  ((["systems", "controls"].includes(a) &&
    ["systems", "controls"].includes(b)) ||
    (["trends", "alarms"].includes(a) && ["trends", "alarms"].includes(b)));
document.querySelectorAll("[data-drag]").forEach((header) => {
  header.addEventListener("dragstart", (event) => {
    if (!editing || event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    draggedPanel = header.dataset.drag;
    event.dataTransfer.setData("text/plain", draggedPanel);
    event.dataTransfer.effectAllowed = "move";
  });
  header.addEventListener("dragend", () => {
    draggedPanel = null;
    document
      .querySelectorAll(".drop-target")
      .forEach((node) => node.classList.remove("drop-target"));
  });
});
document.querySelectorAll("[data-panel]").forEach((panel) => {
  panel.addEventListener("dragover", (event) => {
    if (editing && matching(draggedPanel, panel.dataset.panel)) {
      event.preventDefault();
      panel.classList.add("drop-target");
      event.dataTransfer.dropEffect = "move";
    }
  });
  panel.addEventListener("dragleave", (event) => {
    if (!panel.contains(event.relatedTarget))
      panel.classList.remove("drop-target");
  });
  panel.addEventListener("drop", (event) => {
    if (editing && matching(draggedPanel, panel.dataset.panel)) {
      event.preventDefault();
      swapPanels(
        ["systems", "controls"].includes(draggedPanel) ? "sides" : "bottom",
      );
    }
    panel.classList.remove("drop-target");
    draggedPanel = null;
  });
});
document.querySelectorAll("[data-resize]").forEach((handle) => {
  const name = handle.dataset.resize;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", `Resize ${name} panel`);
  handle.setAttribute("aria-valuemin", name === "systems" ? 205 : 275);
  handle.setAttribute("aria-valuemax", name === "systems" ? 300 : 330);
  handle.tabIndex = -1;
  handle.addEventListener("keydown", (event) => {
    if (!editing || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const right = name === "controls" ? !layout.sides : layout.sides;
    layout.widths[name] = clamp(
      layout.widths[name] +
        (event.key === "ArrowRight" ? 10 : -10) * (right ? -1 : 1),
      name === "systems" ? 205 : 275,
      name === "systems" ? 300 : 330,
    );
    applyLayout();
    saveLayout();
  });
  handle.addEventListener("pointerdown", (event) => {
    if (!editing) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const name = handle.dataset.resize,
      start = event.clientX,
      width = layout.widths[name];
    const right = name === "controls" ? !layout.sides : layout.sides;
    const move = (next) => {
      layout.widths[name] = clamp(
        width + (next.clientX - start) * (right ? -1 : 1),
        name === "systems" ? 205 : 275,
        name === "systems" ? 300 : 330,
      );
      applyLayout();
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      saveLayout();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
});
applyLayout();

function percent(id, value) {
  const node = el(id);
  const small = document.createElement("small");
  small.textContent = "%";
  node.replaceChildren(document.createTextNode(n(value, 0)), small);
}
function fill(id, value, severity = "") {
  const node = el(id);
  node.style.width = `${clamp(value, 0, 100)}%`;
  node.className = severity;
}
function selectEquipment(name) {
  selected = name;
  document
    .querySelectorAll("[data-inspect]")
    .forEach((node) =>
      node.classList.toggle("selected", node.dataset.inspect === name),
    );
  document
    .querySelectorAll(".equipment-control")
    .forEach((node) =>
      node.classList.toggle("selected", node.id === `control-${name}`),
    );
  const descriptions = {
    reactor:
      "R-01 · Power controller. Hold − / + to change the thermal target.",
    primary:
      "P-01 · Pump switch and speed command. Actual flow ramps over time.",
    steam: "V-01 · Motor valve. Actual opening travels toward the command.",
    cooling: "P-02 · Condenser circuit. Cooling flow controls heat rejection.",
  };
  text("inspection-note", descriptions[name]);
}
document.querySelectorAll("[data-inspect]").forEach((node) => {
  node.addEventListener("click", () => selectEquipment(node.dataset.inspect));
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectEquipment(node.dataset.inspect);
    }
  });
});
function stopHold() {
  clearTimeout(holdTimer);
  clearInterval(repeatTimer);
}
function adjust(button) {
  if (button.disabled) {
    stopHold();
    return;
  }
  const name = button.dataset.adjust;
  sim.setControl(name, sim.controls[name] + Number(button.dataset.step));
  selectEquipment(name);
  sound.click();
  render();
}
document.querySelectorAll("[data-adjust]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || button.disabled) return;
    stopHold();
    button.setPointerCapture(event.pointerId);
    adjust(button);
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => adjust(button), 160);
    }, 350);
  });
  button.addEventListener("pointerup", stopHold);
  button.addEventListener("pointercancel", stopHold);
  button.addEventListener("lostpointercapture", stopHold);
  button.addEventListener("click", (event) => {
    if (event.detail === 0) adjust(button);
  });
});
window.addEventListener("blur", stopHold);
for (const name of ["primary", "cooling", "emergency"]) {
  el(`${name}-switch`).addEventListener("click", () => {
    sim.setEquipment(name, !sim.equipment[name]);
    sound.click();
    if (name !== "emergency") selectEquipment(name);
    render();
  });
}
function setPaused(value) {
  paused = value;
  accumulator = 0;
  previousFrame = null;
  document.body.classList.toggle("paused", paused);
  el("pause-button").setAttribute("aria-pressed", String(paused));
  el("pause-button").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  text("pause-label", paused ? "RUN" : "PAUSE");
  el("pause-icon").setAttribute(
    "d",
    paused ? "m7 4 12 8-12 8Z" : "M8 4v16M16 4v16",
  );
  render();
}
el("pause-button").addEventListener("click", () => setPaused(!paused));
el("speed").addEventListener(
  "change",
  () => (speed = Number(el("speed").value)),
);
el("scram-button").addEventListener("click", () => {
  stopHold();
  sim.scram();
  sound.click();
  render();
});
el("reset-button").addEventListener("click", () => {
  stopHold();
  sim.reset();
  samples = [];
  alarmLog.clear();
  silenced = false;
  speed = 1;
  lastSample = 0;
  el("speed").value = "1";
  sample();
  setPaused(false);
  sound.click();
});
el("sound-button").addEventListener("click", async () => {
  const enabled = await sound.toggle();
  el("sound-button").setAttribute("aria-pressed", String(enabled));
  text("sound-button", enabled ? "SOUND ON" : "SOUND OFF");
  if (!enabled && !globalThis.AudioContext && !globalThis.webkitAudioContext)
    text(
      "footer-message",
      "AUDIO UNAVAILABLE IN THIS BROWSER · VISUAL ALARMS REMAIN ACTIVE",
    );
  sound.click();
  render();
});
el("volume").addEventListener("input", () => {
  sound.setVolume(Number(el("volume").value) / 100);
  text("volume-value", `${el("volume").value}%`);
  try {
    localStorage.setItem("reactor-lab-v2-volume", el("volume").value);
  } catch {
    /* Optional preference. */
  }
});
let helpWasPaused = false;
el("help-button").addEventListener("click", () => {
  helpWasPaused = paused;
  setPaused(true);
  el("help-dialog").showModal();
});
el("help-dialog").addEventListener("close", () => {
  if (!helpWasPaused) setPaused(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editing && !el("help-dialog").open)
    setEditing(false);
});
document.addEventListener("visibilitychange", () => {
  stopHold();
  previousFrame = null;
  accumulator = 0;
  sound.visibility(document.hidden);
});

function reconcileAlarms(alarms, time) {
  const current = new Set();
  for (const alarm of alarms) {
    current.add(alarm.id);
    const old = alarmLog.get(alarm.id);
    const isNew =
      !old ||
      !old.active ||
      (old.level !== "danger" && alarm.level === "danger");
    if (isNew) {
      silenced = false;
      sound.lastAlarm = -Infinity;
    }
    alarmLog.set(alarm.id, {
      ...alarm,
      active: true,
      time: isNew ? time : old.time,
      acknowledged: isNew ? false : old.acknowledged,
    });
  }
  for (const [id, alarm] of alarmLog)
    if (!current.has(id) && alarm.active)
      alarmLog.set(id, { ...alarm, active: false, cleared: time });
  if (alarmLog.size > 50) {
    for (const [id, alarm] of alarmLog) {
      if (!alarm.active) alarmLog.delete(id);
      if (alarmLog.size <= 50) break;
    }
  }
}
function renderAlarms() {
  const alarms = [...alarmLog.values()].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.level === "danger") - Number(a.level === "danger") ||
      b.time - a.time,
  );
  const active = alarms.filter((alarm) => alarm.active);
  text("alarm-count", active.length);
  el("ack-button").disabled = !active.some((alarm) => !alarm.acknowledged);
  el("silence-button").disabled = active.length === 0;
  el("silence-button").setAttribute("aria-pressed", String(silenced));
  text("silence-button", silenced ? "SILENCED" : "SILENCE");
  const list = el("alarm-list");
  if (!alarms.length) {
    if (!list.querySelector(".no-alarms")) {
      const card = document.createElement("div");
      card.className = "no-alarms";
      for (const [tag, value] of [
        ["span", "✓"],
        ["strong", "NO ACTIVE ALARMS"],
        ["small", "Protection systems monitoring"],
      ]) {
        const node = document.createElement(tag);
        node.textContent = value;
        card.append(node);
      }
      list.replaceChildren(card);
    }
    return active;
  }
  const fragment = document.createDocumentFragment();
  for (const alarm of alarms) {
    const row = document.createElement("div");
    row.className = `alarm-entry ${alarm.level} ${!alarm.active ? "cleared" : !alarm.acknowledged ? "unack" : ""}`;
    row.dataset.alarm = alarm.id;
    const dot = document.createElement("i");
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = alarm.title;
    const detail = document.createElement("p");
    detail.textContent = alarm.detail;
    body.append(title, detail);
    const time = document.createElement("time");
    time.textContent = clock(alarm.active ? alarm.time : alarm.cleared);
    const state = document.createElement("small");
    state.textContent = !alarm.active
      ? "CLEARED"
      : alarm.acknowledged
        ? "ACK"
        : "NEW";
    time.append(state);
    row.append(dot, body, time);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
  return active;
}
el("ack-button").addEventListener("click", () => {
  for (const alarm of alarmLog.values())
    if (alarm.active) alarm.acknowledged = true;
  sound.click();
  render();
});
el("silence-button").addEventListener("click", () => {
  silenced = !silenced;
  sound.click();
  render();
});

function sample() {
  const r = sim.readings();
  samples.push({
    time: r.time,
    heat: r.heat,
    electric: r.netElectric,
    cooling: r.coolingHeat,
  });
  while (samples.length > 2 && samples[1].time < r.time - 300) samples.shift();
}
function renderChart(r) {
  const start = Math.max(0, r.time - 300),
    end = start + 300;
  const ceiling =
    Math.ceil(
      Math.max(
        1000,
        ...samples.map((point) =>
          Math.max(point.heat, point.electric, point.cooling),
        ),
      ) / 500,
    ) * 500;
  text("chart-top", n(ceiling, 0));
  text("chart-middle", n(ceiling / 2, 0));
  for (const [id, key] of [
    ["heat-trend", "heat"],
    ["electric-trend", "electric"],
    ["cooling-trend", "cooling"],
  ]) {
    const points = samples.filter((point) => point.time >= start);
    if (points.length === 1)
      points.push({ ...points[0], time: points[0].time + 0.2 });
    el(id).setAttribute(
      "d",
      points
        .map(
          (point, i) =>
            `${i ? "L" : "M"}${(40 + ((point.time - start) / 300) * 950).toFixed(2)},${(90 - (point[key] / ceiling) * 80).toFixed(2)}`,
        )
        .join(" "),
    );
  }
  text("chart-start", clock(start));
  text("chart-end", clock(end));
}
function flow(selector, fraction, duration) {
  document.querySelectorAll(selector).forEach((path) => {
    path.style.animationDuration = `${duration / Math.max(0.04, fraction)}s`;
    path.style.opacity = fraction < 0.01 ? "0" : "1";
  });
}
function render() {
  const r = sim.readings(),
    d = diagnose(r);
  document.body.classList.toggle("severity-danger", d.severity === "danger");
  document.body.classList.toggle("severity-warning", d.severity === "warning");
  text("plant-status", d.phase);
  text("plant-guidance", d.guidance);
  text("sim-time", clock(r.time));
  text(
    "footer-state",
    d.severity === "normal"
      ? paused
        ? "SIMULATION PAUSED"
        : "SYSTEMS MONITORING"
      : d.phase,
  );
  text("thermal-power", n(r.heat));
  text("electrical-power", n(r.netElectric));
  text("fuel-temp", n(r.fuelTemperature, 0));
  text("primary-temp", n(r.primaryTemperature));
  text("steam-pressure", n(r.steamPressure));
  text("turbine-rpm", n(r.rpm, 0));
  const gaugeData = [
    ["thermal-power", r.heat / 10, ""],
    ["electrical-power", r.netElectric / 3.5, ""],
    [
      "fuel-temp",
      r.fuelTemperature / 15,
      r.fuelTemperature > 1200
        ? "danger"
        : r.fuelTemperature > 1000
          ? "warning"
          : "",
    ],
    [
      "primary-temp",
      r.primaryTemperature / 3.42,
      r.primaryTemperature > 342
        ? "danger"
        : r.primaryTemperature > 330
          ? "warning"
          : "",
    ],
    [
      "steam-pressure",
      r.steamPressure / 0.9,
      r.steamPressure > 90 ? "danger" : r.steamPressure > 75 ? "warning" : "",
    ],
    ["turbine-rpm", r.rpm / 30, ""],
  ];
  for (const [id, value, severity] of gaugeData) {
    fill(`${id}-bar`, value, severity);
    el(id).className = severity;
  }
  text(
    "thermal-power-detail",
    r.tripReason
      ? `Fission ${n(r.fissionPower)} / decay ${n(r.decayHeat)} MW`
      : "1,000 MWth rated",
  );
  text(
    "electrical-power-detail",
    r.netElectric < 0
      ? "IMPORTING AUXILIARY POWER"
      : `Gross ${n(r.grossElectric)} MWe`,
  );
  text(
    "turbine-rpm-detail",
    r.shaftPower < 0.7 ? "GENERATOR UNLOADED / COASTING" : "3,000 rpm governed",
  );
  text("coolant-level", `${n(r.coolantFraction * 100)}%`);
  el("inventory-fill").style.height = `calc(${r.coolantFraction * 100}% - 6px)`;
  text("inventory-state", r.coolantFraction < 0.8 ? "LOW LEVEL" : "NOMINAL");
  text("primary-flow", `${n(r.actual.primary, 0)}% actual flow`);
  text("steam-temp", `${n(r.steamTemperature)} °C`);
  text("condenser-temp", `${n(r.condenserTemperature)} °C`);
  text("heat-rejection", `${n(r.coolingHeat)} MW`);
  text("decay-heat", `${n(r.decayHeat)} MW`);
  text("auxiliary-power", `${n(r.auxiliaryPower)} MW`);
  text(
    "efficiency",
    r.efficiency === null ? "TRANSIENT" : `${n(r.efficiency)}%`,
  );
  text("integrity-value", `${n(100 - r.coreDamage, 2)}%`);
  fill("integrity-fill", 100 - r.coreDamage);
  el("integrity-fill").style.background =
    r.coreDamage > 0.01 ? "var(--red)" : "var(--mint)";
  text(
    "damage-note",
    r.coreDamage > 0.01
      ? `${n(r.coreDamage, 2)}% irreversible fuel damage`
      : "No fuel damage recorded",
  );
  text("fuel-reserve", `${n(r.fuelPercent, 2)}%`);
  for (const name of ["reactor", "primary", "steam", "cooling"]) {
    percent(`${name}-command`, sim.controls[name]);
    const actual = name === "reactor" ? r.heat / 10 : r.actual[name];
    percent(`${name}-actual`, actual);
    fill(`${name}-travel`, actual);
    el(`${name}-target`).style.left = `${sim.controls[name]}%`;
  }
  for (const name of ["primary", "cooling", "emergency"]) {
    const on = sim.equipment[name],
      button = el(`${name}-switch`);
    button.setAttribute("aria-pressed", String(on));
    button.querySelector("span").textContent = on
      ? name === "emergency"
        ? "ON"
        : "RUN"
      : "OFF";
    button.setAttribute(
      "aria-label",
      `${on ? "Stop" : "Start"} ${name === "emergency" ? "auxiliary core cooling" : `${name} pump`}`,
    );
  }
  text(
    "emergency-state",
    sim.equipment.emergency
      ? `ENGAGED · ${n(r.emergencyHeat)} MW REMOVAL`
      : "AVAILABLE · ISOLATED",
  );
  el("scram-button").disabled = Boolean(r.tripReason);
  document
    .querySelectorAll('[data-adjust="reactor"]')
    .forEach((button) => (button.disabled = Boolean(r.tripReason)));
  text("svg-fuel-temp", `${n(r.fuelTemperature, 0)} °C fuel`);
  text("svg-primary-temp", `${n(r.primaryTemperature, 0)} °C`);
  text("svg-steam-temp", `${n(r.steamTemperature, 0)} °C steam`);
  text("svg-steam-pressure", `${n(r.steamPressure)} bar`);
  text("svg-condenser-temp", `${n(r.condenserTemperature)} °C`);
  text("svg-rpm", `${n(r.rpm, 0)} rpm`);
  text("svg-electric", `${n(r.netElectric)} MW net`);
  text(
    "storage-rate",
    `${Math.abs(r.storageRate) < 0.5 ? "0" : `${r.storageRate > 0 ? "+" : "−"}${n(Math.abs(r.storageRate), 0)}`} MW stored`,
  );
  text(
    "balance-label",
    d.heatDeficit > 5 && r.fuelTemperature > 750
      ? "CORE HEAT ACCUMULATING"
      : "ENERGY BALANCE",
  );
  flow(".primary-flow path", r.actual.primary / 100, 1.4);
  flow(".steam-flow path", r.turbineHeat / 700, 1.4);
  flow(".cooling-flow path", r.actual.cooling / 100, 1.5);
  flow(".shaft-motion", r.rpm / 3000, 0.6);
  document
    .querySelector(".pump.device")
    .classList.toggle("stopped", r.actual.primary < 1);
  document.querySelector(".fuel-rods").style.opacity = String(
    clamp(0.2 + r.fuelTemperature / 1000, 0.2, 1),
  );
  reconcileAlarms(d.alarms, r.time);
  const active = renderAlarms();
  const unack = active.some((alarm) => !alarm.acknowledged);
  sound.update(r, unack && !silenced, d.severity, paused || document.hidden);
  renderChart(r);
}
function frame(timestamp) {
  if (previousFrame === null) previousFrame = timestamp;
  const elapsed = clamp((timestamp - previousFrame) / 1000, 0, 0.1);
  previousFrame = timestamp;
  if (!paused && !document.hidden) {
    accumulator += elapsed * speed;
    while (accumulator >= PARAMETERS.maxStep) {
      sim.step(PARAMETERS.maxStep);
      accumulator -= PARAMETERS.maxStep;
      if (sim.state.time - lastSample >= 1) {
        sample();
        lastSample = sim.state.time;
      }
    }
  }
  if (timestamp - lastRender >= 125) {
    render();
    lastRender = timestamp;
  }
  requestAnimationFrame(frame);
}
sample();
render();
requestAnimationFrame(frame);
