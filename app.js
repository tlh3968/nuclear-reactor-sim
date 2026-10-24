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
// A new storage key deliberately leaves the previous V2 side-panel layout intact.
const panelNames = ["systems", "trends", "alarms"];
const defaultLayout = () => ({
  order: [...panelNames],
  weights: { systems: 50, trends: 28, alarms: 22 },
});
let layout = defaultLayout();
try {
  const saved = JSON.parse(localStorage.getItem("reactor-lab-v2-plan-layout"));
  if (
    saved &&
    Array.isArray(saved.order) &&
    saved.order.length === 3 &&
    new Set(saved.order).size === 3 &&
    saved.order.every((name) => panelNames.includes(name))
  ) {
    layout.order = saved.order;
    for (const name of panelNames)
      layout.weights[name] = clamp(
        Number(saved.weights?.[name]) || layout.weights[name],
        name === "systems" ? 40 : 18,
        name === "systems" ? 62 : 40,
      );
  }
  const volume = localStorage.getItem("reactor-lab-v2-volume");
  if (volume !== null && Number.isFinite(Number(volume)))
    el("volume").value = clamp(Number(volume), 0, 100);
} catch {
  /* Optional local preferences. */
}
sound.setVolume(Number(el("volume").value) / 100);
text("volume-value", `${el("volume").value}%`);
function applyLayout() {
  for (const name of layout.order) {
    const panel = document.querySelector(`[data-panel="${name}"]`);
    el("instrument-dock").append(panel);
    panel.style.flexGrow = layout.weights[name];
    const handle = panel.querySelector("[data-resize]");
    handle.setAttribute("aria-valuenow", Math.round(layout.weights[name]));
    handle.setAttribute(
      "aria-valuetext",
      `${Math.round(layout.weights[name])} layout weight`,
    );
  }
}
function saveLayout() {
  try {
    localStorage.setItem("reactor-lab-v2-plan-layout", JSON.stringify(layout));
    text(
      "saved-layout",
      editing ? "EDIT MODE · DRAG HEADERS" : "LAYOUT LOCKED · SAVED",
    );
  } catch {
    text("saved-layout", "LAYOUT SAVED THIS SESSION");
  }
}
function setEditing(value) {
  editing = value;
  document.body.classList.toggle("editing", editing);
  document
    .querySelectorAll("[data-drag]")
    .forEach((header) => (header.draggable = editing));
  document
    .querySelectorAll("[data-resize]")
    .forEach((handle) => (handle.tabIndex = editing ? 0 : -1));
  el("layout-button").setAttribute("aria-pressed", String(editing));
  text("layout-button", editing ? "Lock layout" : "Customize layout");
  el("layout-reset").hidden = !editing;
  saveLayout();
}
function movePanel(name, target) {
  if (!editing || !panelNames.includes(name)) return;
  const from = layout.order.indexOf(name);
  const to = target
    ? layout.order.indexOf(target)
    : (from + 1) % panelNames.length;
  if (to < 0 || to === from) return;
  [layout.order[from], layout.order[to]] = [
    layout.order[to],
    layout.order[from],
  ];
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
    button.addEventListener("click", () => movePanel(button.dataset.move)),
  );
let draggedPanel = null;
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
    if (editing && draggedPanel && draggedPanel !== panel.dataset.panel) {
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
    if (editing && draggedPanel) {
      event.preventDefault();
      movePanel(draggedPanel, panel.dataset.panel);
    }
    panel.classList.remove("drop-target");
    draggedPanel = null;
  });
});
function resizePanel(name, delta) {
  const index = layout.order.indexOf(name);
  const neighbor =
    layout.order[index === layout.order.length - 1 ? index - 1 : index + 1];
  const min = name === "systems" ? 40 : 18,
    max = name === "systems" ? 62 : 40;
  const neighborMin = neighbor === "systems" ? 40 : 18,
    neighborMax = neighbor === "systems" ? 62 : 40;
  const amount = clamp(
    delta,
    Math.max(
      min - layout.weights[name],
      layout.weights[neighbor] - neighborMax,
    ),
    Math.min(
      max - layout.weights[name],
      layout.weights[neighbor] - neighborMin,
    ),
  );
  layout.weights[name] += amount;
  layout.weights[neighbor] -= amount;
  applyLayout();
}
document.querySelectorAll("[data-resize]").forEach((handle) => {
  const name = handle.dataset.resize;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", `Resize ${name} panel`);
  handle.setAttribute("aria-valuemin", name === "systems" ? 40 : 18);
  handle.setAttribute("aria-valuemax", name === "systems" ? 62 : 40);
  handle.tabIndex = -1;
  handle.addEventListener("keydown", (event) => {
    if (!editing || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const last = layout.order.indexOf(name) === 2;
    resizePanel(name, (event.key === "ArrowRight" ? 2 : -2) * (last ? -1 : 1));
    saveLayout();
  });
  handle.addEventListener("pointerdown", (event) => {
    if (!editing) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    let lastX = event.clientX;
    const direction = layout.order.indexOf(name) === 2 ? -1 : 1;
    const move = (next) => {
      const delta =
        ((next.clientX - lastX) / el("instrument-dock").clientWidth) *
        100 *
        direction;
      lastX = next.clientX;
      resizePanel(name, delta);
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
// Relative dragging avoids a jump when grabbing a knob. Keyboard controls follow ARIA slider conventions.
function updateKnob(name) {
  const knob = el(`${name}-knob`),
    value = sim.controls[name];
  knob.setAttribute("aria-valuenow", value);
  knob.setAttribute("aria-valuetext", `${value} percent`);
  el(`${name}-needle`).setAttribute(
    "transform",
    `rotate(${-135 + value * 2.7} 50 50)`,
  );
}
function setKnob(name, value, audible = true) {
  const next = clamp(Math.round(value), 0, 100);
  if (next === sim.controls[name]) return;
  sim.setControl(name, next);
  selectEquipment(name);
  if (audible) sound.click();
  render();
}
document.querySelectorAll("[data-knob]").forEach((knob) => {
  const name = knob.dataset.knob;
  knob.addEventListener("keydown", (event) => {
    const steps = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    if (Object.hasOwn(steps, event.key)) {
      event.preventDefault();
      setKnob(name, sim.controls[name] + steps[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setKnob(name, event.key === "Home" ? 0 : 100);
    }
  });
  knob.addEventListener(
    "wheel",
    (event) => {
      if (document.activeElement !== knob) return;
      event.preventDefault();
      setKnob(name, sim.controls[name] + (event.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );
  knob.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    knob.focus();
    knob.setPointerCapture(event.pointerId);
    knob.classList.add("dragging");
    const x = event.clientX,
      y = event.clientY,
      start = sim.controls[name];
    const move = (next) =>
      setKnob(
        name,
        start + (y - next.clientY) * 0.5 + (next.clientX - x) * 0.15,
        false,
      );
    const stop = () => {
      knob.classList.remove("dragging");
      knob.removeEventListener("pointermove", move);
      knob.removeEventListener("pointerup", stop);
      knob.removeEventListener("pointercancel", stop);
      knob.removeEventListener("lostpointercapture", stop);
      sound.click();
    };
    knob.addEventListener("pointermove", move);
    knob.addEventListener("pointerup", stop);
    knob.addEventListener("pointercancel", stop);
    knob.addEventListener("lostpointercapture", stop);
  });
});
document.querySelectorAll("[data-valve]").forEach((button) =>
  button.addEventListener("click", () => {
    setKnob("steam", Number(button.dataset.valve));
  }),
);

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
        100,
        ...samples.map((point) =>
          Math.max(point.heat, point.electric, point.cooling),
        ),
      ) / 100,
    ) * 100;
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
  fill("inventory-fill", r.coolantFraction * 100);
  text("inventory-state", r.coolantFraction < 0.8 ? "LOW LEVEL" : "NOMINAL");
  text("primary-flow", `${n(r.actual.primary, 0)}%`);
  text("steam-temp", n(r.steamTemperature));
  text("condenser-temp", n(r.condenserTemperature));
  text("heat-rejection", `${n(r.coolingHeat)} MW`);
  text("decay-heat", `${n(r.decayHeat)} MW`);
  text("auxiliary-power", `${n(r.auxiliaryPower)} MW`);
  text("efficiency", r.efficiency === null ? "—" : n(r.efficiency));
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
  text("reactor-target-power", n(sim.controls.reactor * 10, 0));
  fill("stat-primary-flow", r.actual.primary);
  fill("stat-decay-heat", r.decayHeat / 0.6);
  fill("stat-auxiliary-power", r.auxiliaryPower / 0.2);
  fill("stat-fuel-reserve", r.fuelPercent);
  fill("steam-temp-bar", r.steamTemperature / 3.5);
  fill("condenser-temp-bar", r.condenserTemperature / 0.85);
  fill("efficiency-bar", (r.efficiency ?? 0) * 2.5);
  el("efficiency").title =
    r.efficiency === null
      ? "Not meaningful during transients or shutdown"
      : "Net electricity divided by reactor heat";
  for (const name of ["reactor", "primary", "steam", "cooling"]) {
    percent(`${name}-command`, sim.controls[name]);
    const actual = name === "reactor" ? r.heat / 10 : r.actual[name];
    percent(`${name}-actual`, actual);
    fill(`${name}-travel`, actual);
    el(`${name}-target`).style.left = `${sim.controls[name]}%`;
    if (name !== "reactor") updateKnob(name);
  }
  for (const name of ["primary", "cooling", "emergency"]) {
    const on = sim.equipment[name],
      button = el(`${name}-switch`);
    button.setAttribute("aria-pressed", String(on));

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
  flow(".emergency-flow path", r.actual.emergency / 100, 1.8);
  document.querySelector(".emergency-pipe").style.opacity =
    r.actual.emergency > 1 ? ".65" : "0";
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
