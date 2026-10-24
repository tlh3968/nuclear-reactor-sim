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
const fuelConductance = (flow) => 2.2 * (0.12 + 0.88 * flow);
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
      fuelTemperature: primary + q / fuelConductance(flow),
      primaryTemperature: primary,
      steamTemperature: steam,
      condenserTemperature: condenser,
      rotorEnergy: PARAMETERS.rotorEnergy,
      fuelReserveMWh: PARAMETERS.fuelReserveMWh,
      tripReason: null,
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
  }

  fluxes() {
    const s = this.state;
    const c = this.controls;
    const primaryFlow = c.primary / 100;
    const coolingFlow = c.cooling / 100;
    const heat = s.fissionPower + s.decayHeat;
    const fuelToPrimary =
      fuelConductance(primaryFlow) * (s.fuelTemperature - s.primaryTemperature);
    const primaryToSteam =
      steamConductance(primaryFlow) *
      (s.primaryTemperature - s.steamTemperature);
    const turbineHeat =
      4.4 *
      (c.steam / 100) *
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
    const auxiliaryPower = 3 + 8 * primaryFlow ** 3 + 4 * coolingFlow ** 3;
    const netElectric = grossElectric - auxiliaryPower;
    const coolingHeat =
      32.2 * coolingFlow * (s.condenserTemperature - PARAMETERS.ambient);
    const condenserHeat = turbineHeat - shaftPower;
    const rejectedHeat =
      coolingHeat + rotorLoss + generatorLoad * 0.02 + auxiliaryPower;
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
      const target = this.state.tripReason
        ? 0
        : ((PARAMETERS.ratedHeat * this.controls.reactor) / 100) * 0.94;
      const responseTime = this.state.tripReason ? 0.65 : 9;
      s.fissionPower +=
        (target - s.fissionPower) * (1 - Math.exp(-dt / responseTime));
      const decayTarget = (s.fissionPower * 0.06) / 0.94;
      s.decayHeat += (decayTarget - s.decayHeat) * (1 - Math.exp(-dt / 180));

      const q = this.fluxes();
      s.fuelTemperature +=
        ((q.heat - q.fuelToPrimary) * dt) / PARAMETERS.fuelCapacity;
      s.primaryTemperature +=
        ((q.fuelToPrimary - q.primaryToSteam) * dt) /
        PARAMETERS.primaryCapacity;
      s.steamTemperature +=
        ((q.primaryToSteam - q.turbineHeat) * dt) / PARAMETERS.steamCapacity;
      s.condenserTemperature +=
        ((q.condenserHeat - q.coolingHeat) * dt) / PARAMETERS.condenserCapacity;
      s.rotorEnergy += (q.shaftPower - q.rotorLoss - q.generatorLoad) * dt;
      s.fuelReserveMWh = Math.max(0, s.fuelReserveMWh - (q.heat * dt) / 3600);
      this.energy.generated += q.heat * dt;
      this.energy.exported += q.netElectric * dt;
      this.energy.rejected += q.rejectedHeat * dt;
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
      p.primaryCapacity * (s.primaryTemperature - p.ambient) +
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
