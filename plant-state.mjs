// Presentation diagnostics for the illustrative model, not real plant alarm setpoints.
export function diagnose(r) {
  const heatDeficit = r.heat - r.fuelToPrimary - r.emergencyHeat;
  const emergency =
    (r.fuelTemperature > 1000 && heatDeficit > 1) ||
    (r.tripReason &&
      r.actual.primary < 12 &&
      r.emergencyHeat < r.heat &&
      r.heat > 5);
  let phase = "NORMAL OPERATION",
    severity = "normal";
  let guidance = "Heat transfer balanced. Equipment available.";
  if (r.coreDamage > 0.01) {
    phase =
      r.fuelTemperature >= 1000
        ? r.coreDamage >= 100
          ? "SEVERE CORE DAMAGE"
          : "CORE DAMAGE"
        : "DAMAGE STABILIZED";
    severity = r.fuelTemperature >= 1000 ? "danger" : "warning";
    guidance =
      r.fuelTemperature >= 1000
        ? r.fuelTemperature > 1200
          ? "Fuel damage is accumulating. Restore heat removal; shutdown alone is insufficient."
          : "Fuel remains hot. Maintain heat removal; existing damage remains."
        : "Fuel is cooling. Existing core damage remains until the experiment is reset.";
  } else if (emergency) {
    phase = "COOLING EMERGENCY";
    severity = "danger";
    guidance =
      "Inadequate core heat removal. Restore primary circulation or engage auxiliary cooling.";
  } else if (r.fuelTemperature > 1000) {
    phase = "COOLING RECOVERY";
    severity = "warning";
    guidance =
      "Heat removal restored. Fuel is still hot; continue cooling and monitor temperatures.";
  } else if (r.tripReason) {
    phase =
      r.fuelTemperature < 120 && r.heat < 5
        ? "SHUTDOWN / COOLED"
        : "REACTOR TRIPPED";
    severity = "warning";
    guidance = `${r.tripReason}. Keep cooling available. Decay and stored heat remain.`;
  } else if (
    r.primaryTemperature > 330 ||
    r.steamPressure > 75 ||
    r.condenserTemperature > 70 ||
    r.coolantFraction < 0.8
  ) {
    phase = "OPERATING CAUTION";
    severity = "warning";
    guidance =
      "Operating margin reduced. Inspect temperatures, pressure, and heat removal.";
  } else if (r.heat < 10) {
    phase = "LOW-POWER OPERATION";
    guidance =
      r.shaftPower < 0.7
        ? "Generator unloaded. Turbine coasting; auxiliary loads may require imported power."
        : "Low reactor heat. Stored heat still supplies the turbine.";
  } else if (r.settling) {
    phase = "PLANT TRANSIENT";
    guidance = "Temperatures are responding to the new equipment settings.";
  }
  const alarms = [];
  const add = (id, active, level, title, detail) => {
    if (active) alarms.push({ id, level, title, detail });
  };
  add(
    "core-damage",
    r.coreDamage > 0.01,
    r.fuelTemperature >= 1000 ? "danger" : "warning",
    "Core damage recorded",
    `${r.coreDamage.toFixed(2)}% cumulative model damage`,
  );
  add(
    "heat-removal",
    emergency,
    "danger",
    "Core heat removal inadequate",
    `Fuel ${Math.round(r.fuelTemperature)} °C · decay heat ${r.decayHeat.toFixed(1)} MW`,
  );
  add(
    "fuel-hot",
    r.fuelTemperature > 1000,
    r.fuelTemperature > 1200 ? "danger" : "warning",
    "Fuel temperature high",
    "Thermal damage accumulates above the model limit.",
  );
  add(
    "trip",
    Boolean(r.tripReason),
    "warning",
    "Reactor trip latched",
    r.tripReason,
  );
  add(
    "low-flow",
    r.actual.primary < 15 && r.heat > 5,
    "warning",
    "Primary circulation low",
    `${r.actual.primary.toFixed(0)}% actual pump flow`,
  );
  add(
    "inventory",
    r.coolantFraction < 0.8,
    r.coolantFraction < 0.5 ? "danger" : "warning",
    "Primary coolant inventory low",
    "Auxiliary cooling also supplies modeled makeup water.",
  );
  add(
    "primary-hot",
    r.primaryTemperature > 330,
    "warning",
    "Primary coolant temperature high",
    `${r.primaryTemperature.toFixed(1)} °C`,
  );
  add(
    "steam-pressure",
    r.steamPressure > 75,
    "warning",
    "Steam pressure high",
    `${r.steamPressure.toFixed(1)} bar`,
  );
  add(
    "condenser-hot",
    r.condenserTemperature > 70,
    "warning",
    "Condenser temperature high",
    `${r.condenserTemperature.toFixed(1)} °C`,
  );
  alarms.sort(
    (a, b) => Number(b.level === "danger") - Number(a.level === "danger"),
  );
  return { phase, severity, guidance, heatDeficit, alarms };
}
