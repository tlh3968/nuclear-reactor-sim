// Educational lumped-parameter model. Power: MW; energy: MJ; time: s; temperature: °C.
// Coefficients and protection limits are illustrative, not plant operating data.
export const DEFAULT_CONTROLS = Object.freeze({
  reactor: 60,
  primary: 70,
  steam: 65,
  cooling: 75,
});
export const PARAMETERS = Object.freeze({
  ratedHeat: 1000,
  ambient: 18,
  fuelCapacity: 30,
  primaryCapacity: 180,
  steamCapacity: 120,
  condenserCapacity: 750,
  rotorEnergy: 300,
  nominalRPM: 3000,
  fuelReserveMWh: 12_000_000,
  maxStep: 0.05,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fuelConductance = (flow) => 0.0066 + 2.1934 * flow;
const steamConductance = (flow) => 14 * (0.06 + 0.94 * Math.sqrt(flow));
const turbineEfficiency = (hot, cold) =>
  clamp(0.78 * (1 - (cold + 273.15) / (hot + 273.15)), 0, 0.5);

// Saturation-pressure curve for pure water (Wagner form). Not a full steam-property model.
export function saturationPressure(temperature) {
  const kelvin = clamp(temperature, 0.01, 373.9) + 273.15;
  const tau = 1 - kelvin / 647.096;
  const terms =
    -7.85951783 * tau +
    1.84408259 * tau ** 1.5 -
    11.7866497 * tau ** 3 +
    22.6807411 * tau ** 3.5 -
    15.9618719 * tau ** 4 +
    1.80122502 * tau ** 7.5;
  return 220.64 * Math.exp((647.096 / kelvin) * terms);
}

export class ReactorSimulation {
  constructor() {
    this.reset();
  }

  reset() {
    this.controls = { ...DEFAULT_CONTROLS };
    this.equipment = { primary: true, cooling: true, emergency: false };
    this.actuators = { primary: 70, steam: 65, cooling: 75, emergency: 0 };
    const q = (PARAMETERS.ratedHeat * this.controls.reactor) / 100;
    const flow = this.controls.primary / 100;
    const valve = this.controls.steam / 100;
    const cooling = this.controls.cooling / 100;
    // Find a genuine equilibrium instead of starting with arbitrary dashboard readings.
    let condenser = 35;
    for (let i = 0; i < 80; i++) {
      const steam = condenser + q / (4.4 * valve);
      condenser =
        PARAMETERS.ambient +
        (q * (1 - turbineEfficiency(steam, condenser))) / (32.2 * cooling);
    }
    const steam = condenser + q / (4.4 * valve);
    const primary = steam + q / steamConductance(flow);
    this.state = {
      time: 0,
      fissionPower: q * 0.94,
      decayHeat: q * 0.06,
      decayFast: q * 0.06 * 0.3,
      decaySlow: q * 0.06 * 0.7,
      fuelTemperature: primary + q / fuelConductance(flow),
      primaryTemperature: primary,
      steamTemperature: steam,
      condenserTemperature: condenser,
      rotorEnergy: PARAMETERS.rotorEnergy,
      fuelReserveMWh: PARAMETERS.fuelReserveMWh,
      tripReason: null,
      coolantFraction: 1,
      coreDamage: 0,
    };
    this.energy = { generated: 0, exported: 0, rejected: 0 };
    return this.readings();
  }

  setControl(name, value) {
    if (!Object.hasOwn(DEFAULT_CONTROLS, name))
      throw new RangeError(`Unknown control: ${name}`);
    if (!Number.isFinite(value))
      throw new TypeError("Control value must be finite.");
    this.controls[name] =
      name === "reactor" && this.state.tripReason ? 0 : clamp(value, 0, 100);
  }

  setEquipment(name, running) {
    if (!Object.hasOwn(this.equipment, name))
      throw new RangeError(`Unknown equipment: ${name}`);
    if (typeof running !== "boolean")
      throw new TypeError("Equipment state must be boolean.");
    this.equipment[name] = running;
  }

  scram(reason = "Manual shutdown") {
    if (!this.state.tripReason) this.state.tripReason = reason;
    this.controls.reactor = 0;
  }

  checkProtection() {
    const s = this.state;
    if (s.fuelTemperature > 1100) this.scram("Fuel temperature limit");
    else if (s.primaryTemperature > 342)
      this.scram("Primary coolant temperature limit");
    else if (saturationPressure(s.steamTemperature) > 90)
      this.scram("Steam pressure limit");
    else if (s.condenserTemperature > 85)
      this.scram("Condenser temperature limit");
    else if (s.fuelReserveMWh <= 0) this.scram("Fuel energy depleted");
    else if (this.actuators.primary < 12 && s.fissionPower > 200)
      this.scram("Low primary flow");
    else if (s.coolantFraction < 0.6) this.scram("Low coolant inventory");
  }

  fluxes() {
    const s = this.state;
    const primaryFlow = this.actuators.primary / 100;
    const coolingFlow = this.actuators.cooling / 100;
    const wetness = clamp((s.coolantFraction - 0.15) / 0.65, 0, 1);
    const heat = s.fissionPower + s.decayHeat;
    const fuelToPrimary =
      fuelConductance(primaryFlow) *
      wetness *
      (s.fuelTemperature - s.primaryTemperature);
    const primaryToSteam =
      steamConductance(primaryFlow) *
      s.coolantFraction *
      (s.primaryTemperature - s.steamTemperature);
    const turbineHeat =
      4.4 *
      (this.actuators.steam / 100) *
      Math.max(0, s.steamTemperature - s.condenserTemperature);
    const shaftPower =
      turbineHeat *
      turbineEfficiency(s.steamTemperature, s.condenserTemperature);
    const rotorLoss = (0.7 * s.rotorEnergy) / PARAMETERS.rotorEnergy;
    // Ideal load governor: hold nominal speed when shaft power covers bearing losses.
    // At very low steam flow the generator unloads and the rotor coasts down.
    const generatorLoad =
      shaftPower >= 0.7
        ? Math.max(
            0,
            shaftPower -
              rotorLoss +
              (s.rotorEnergy - PARAMETERS.rotorEnergy) / 8,
          )
        : 0;
    const grossElectric = generatorLoad * 0.98;
    const emergencyHeat =
      (this.actuators.emergency / 100) *
      Math.min(120, Math.max(0, s.fuelTemperature - PARAMETERS.ambient) * 0.35);
    const auxiliaryPower =
      3 +
      8 * primaryFlow ** 3 +
      4 * coolingFlow ** 3 +
      (6 * this.actuators.emergency) / 100;
    const netElectric = grossElectric - auxiliaryPower;
    const coolingHeat =
      32.2 * coolingFlow * (s.condenserTemperature - PARAMETERS.ambient);
    const condenserHeat = turbineHeat - shaftPower;
    // Illustrative coolant loss above saturation. Vapor carries sensible and latent energy away.
    const boilHeat =
      s.coolantFraction > 0.15
        ? Math.min(80, Math.max(0, s.primaryTemperature - 345) * 0.8)
        : 0;
    const inventoryLoss = boilHeat / 60000;
    const inventoryEnthalpy =
      inventoryLoss *
      PARAMETERS.primaryCapacity *
      (s.primaryTemperature - PARAMETERS.ambient);
    const rejectedHeat =
      coolingHeat +
      rotorLoss +
      generatorLoad * 0.02 +
      auxiliaryPower +
      emergencyHeat +
      boilHeat +
      inventoryEnthalpy;
    const storageRate = heat - netElectric - rejectedHeat;
    return {
      heat,
      fuelToPrimary,
      primaryToSteam,
      turbineHeat,
      shaftPower,
      rotorLoss,
      generatorLoad,
      grossElectric,
      auxiliaryPower,
      netElectric,
      coolingHeat,
      condenserHeat,
      rejectedHeat,
      storageRate,
      emergencyHeat,
      boilHeat,
      inventoryLoss,
      inventoryEnthalpy,
    };
  }

  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Time step must be finite and nonnegative.");
    let remaining = seconds;
    while (remaining > 1e-10) {
      const dt = Math.min(remaining, PARAMETERS.maxStep);
      this.checkProtection();
      const s = this.state;
      for (const name of ["primary", "cooling", "emergency"]) {
        const command = this.equipment[name]
          ? name === "emergency"
            ? 100
            : this.controls[name]
          : 0;
        this.actuators[name] +=
          (command - this.actuators[name]) * (1 - Math.exp(-dt / 3));
      }
      this.actuators.steam += clamp(
        this.controls.steam - this.actuators.steam,
        -8 * dt,
        8 * dt,
      );
      const target = this.state.tripReason
        ? 0
        : ((PARAMETERS.ratedHeat * this.controls.reactor) / 100) * 0.94;
      const responseTime = this.state.tripReason ? 0.65 : 9;
      s.fissionPower +=
        (target - s.fissionPower) * (1 - Math.exp(-dt / responseTime));
      const decayTarget = (s.fissionPower * 0.06) / 0.94;
      s.decayFast +=
        (decayTarget * 0.3 - s.decayFast) * (1 - Math.exp(-dt / 80));
      s.decaySlow +=
        (decayTarget * 0.7 - s.decaySlow) * (1 - Math.exp(-dt / 1800));
      s.decayHeat = s.decayFast + s.decaySlow;

      const q = this.fluxes();
      s.fuelTemperature +=
        ((q.heat - q.fuelToPrimary - q.emergencyHeat) * dt) /
        PARAMETERS.fuelCapacity;
      const primaryEnergy =
        PARAMETERS.primaryCapacity *
        s.coolantFraction *
        (s.primaryTemperature - PARAMETERS.ambient);
      const makeup =
        (this.actuators.emergency / 100) * 0.015 * (1 - s.coolantFraction);
      s.coolantFraction = clamp(
        s.coolantFraction + (makeup - q.inventoryLoss) * dt,
        0.1499,
        1,
      );
      s.primaryTemperature =
        PARAMETERS.ambient +
        (primaryEnergy +
          (q.fuelToPrimary -
            q.primaryToSteam -
            q.boilHeat -
            q.inventoryEnthalpy) *
            dt) /
          (PARAMETERS.primaryCapacity * s.coolantFraction);
      s.steamTemperature +=
        ((q.primaryToSteam - q.turbineHeat) * dt) / PARAMETERS.steamCapacity;
      s.condenserTemperature +=
        ((q.condenserHeat - q.coolingHeat) * dt) / PARAMETERS.condenserCapacity;
      s.rotorEnergy += (q.shaftPower - q.rotorLoss - q.generatorLoad) * dt;
      s.fuelReserveMWh = Math.max(0, s.fuelReserveMWh - (q.heat * dt) / 3600);
      this.energy.generated += q.heat * dt;
      this.energy.exported += q.netElectric * dt;
      this.energy.rejected += q.rejectedHeat * dt;
      if (s.fuelTemperature > 1200)
        s.coreDamage = Math.min(
          100,
          s.coreDamage + ((dt * (s.fuelTemperature - 1200)) / 300) * 0.15,
        );
      s.time += dt;
      this.checkProtection();
      remaining -= dt;
    }
  }

  storedEnergy() {
    const s = this.state;
    const p = PARAMETERS;
    return (
      p.fuelCapacity * (s.fuelTemperature - p.ambient) +
      p.primaryCapacity *
        s.coolantFraction *
        (s.primaryTemperature - p.ambient) +
      p.steamCapacity * (s.steamTemperature - p.ambient) +
      p.condenserCapacity * (s.condenserTemperature - p.ambient) +
      s.rotorEnergy
    );
  }

  readings() {
    const q = this.fluxes();
    const s = this.state;
    const settling =
      Math.abs(q.storageRate) > Math.max(5, q.heat * 0.03) ||
      Math.abs(s.fissionPower - this.controls.reactor * 9.4) > 5;
    return {
      ...s,
      ...q,
      actual: { ...this.actuators },
      equipment: { ...this.equipment },
      steamPressure: saturationPressure(s.steamTemperature),
      rpm:
        PARAMETERS.nominalRPM *
        Math.sqrt(Math.max(0, s.rotorEnergy) / PARAMETERS.rotorEnergy),
      fuelPercent: (100 * s.fuelReserveMWh) / PARAMETERS.fuelReserveMWh,
      settling,
      efficiency:
        !s.tripReason && !settling && q.heat > 1
          ? (100 * q.netElectric) / q.heat
          : null,
    };
  }
}
