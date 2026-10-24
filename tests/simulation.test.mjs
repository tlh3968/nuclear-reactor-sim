import test from "node:test";
import assert from "node:assert/strict";
import {
  ReactorSimulation,
  PARAMETERS,
  saturationPressure,
} from "../simulation.mjs";

test("initial operating point remains at thermal equilibrium", () => {
  const sim = new ReactorSimulation();
  const start = sim.readings();
  sim.step(120);
  const end = sim.readings();
  assert.equal(end.tripReason, null);
  assert.ok(Math.abs(end.fuelTemperature - start.fuelTemperature) < 0.001);
  assert.ok(Math.abs(end.storageRate) < 0.001);
  assert.ok(end.netElectric > 150 && end.netElectric < 210);
  assert.ok(end.efficiency > 25 && end.efficiency < 40);
});

test("raising reactor setting increases power gradually, then increases electricity", () => {
  const sim = new ReactorSimulation();
  const start = sim.readings();
  sim.setControl("reactor", 65);
  sim.step(0.05);
  assert.ok(sim.readings().heat > start.heat && sim.readings().heat < 601);
  sim.step(120);
  const end = sim.readings();
  assert.equal(end.tripReason, null);
  assert.ok(end.netElectric > start.netElectric + 5);
  assert.ok(end.primaryTemperature > start.primaryTemperature);
});

test("less cooling warms the condenser and lowers electrical output", () => {
  const sim = new ReactorSimulation();
  const start = sim.readings();
  sim.setControl("cooling", 20);
  sim.step(30);
  const end = sim.readings();
  assert.ok(end.condenserTemperature > start.condenserTemperature + 3);
  assert.ok(end.netElectric < start.netElectric);
});

test("shutdown rapidly suppresses fission but retains decay heat and cooling", () => {
  const sim = new ReactorSimulation();
  sim.scram();
  sim.step(10);
  const r = sim.readings();
  assert.equal(r.tripReason, "Manual shutdown");
  assert.ok(r.fissionPower < 0.01);
  assert.ok(r.decayHeat > 25 && r.decayHeat < 36);
  assert.ok(r.coolingHeat > r.heat);
  assert.equal(r.efficiency, null);
  sim.setControl("reactor", 100);
  assert.equal(sim.controls.reactor, 0, "shutdown stays latched until reset");
});

test("loss of primary circulation causes a latched protective shutdown", () => {
  const sim = new ReactorSimulation();
  sim.setControl("primary", 0);
  sim.step(600);
  const r = sim.readings();
  assert.ok(r.tripReason);
  assert.equal(sim.controls.reactor, 0);
  for (const [key, value] of Object.entries(r)) {
    if (typeof value === "number")
      assert.ok(Number.isFinite(value), `${key} must remain finite`);
  }
});

test("energy is conserved through control changes and shutdown", () => {
  const sim = new ReactorSimulation();
  const initialEnergy = sim.storedEnergy();
  sim.setControl("reactor", 65);
  sim.step(40);
  sim.setControl("steam", 80);
  sim.setControl("cooling", 45);
  sim.step(40);
  sim.scram();
  sim.step(120);
  const storedChange = sim.storedEnergy() - initialEnergy;
  const balance =
    sim.energy.generated - sim.energy.exported - sim.energy.rejected;
  assert.ok(
    Math.abs(balance - storedChange) < 1e-6,
    `Energy error: ${balance - storedChange} MJ`,
  );
  const fuelUsed = PARAMETERS.fuelReserveMWh - sim.state.fuelReserveMWh;
  assert.ok(Math.abs(fuelUsed - sim.energy.generated / 3600) < 1e-5);
});

test("time subdivision preserves behavior at faster playback speeds", () => {
  const a = new ReactorSimulation();
  const b = new ReactorSimulation();
  a.setControl("steam", 40);
  b.setControl("steam", 40);
  a.step(20);
  for (let i = 0; i < 400; i++) b.step(0.05);
  assert.ok(
    Math.abs(a.state.primaryTemperature - b.state.primaryTemperature) < 1e-8,
  );
  assert.ok(
    Math.abs(a.state.steamTemperature - b.state.steamTemperature) < 1e-8,
  );
});

test("steam saturation pressure has plausible reference points", () => {
  assert.ok(Math.abs(saturationPressure(100) - 1.0142) < 0.005);
  assert.ok(Math.abs(saturationPressure(200) - 15.549) < 0.02);
  assert.ok(saturationPressure(245) > 36 && saturationPressure(245) < 37);
});

test("controls are bounded, invalid inputs fail, and reset restores initial state", () => {
  const sim = new ReactorSimulation();
  sim.setControl("primary", -15);
  sim.setControl("cooling", 150);
  assert.equal(sim.controls.primary, 0);
  assert.equal(sim.controls.cooling, 100);
  assert.throws(() => sim.setControl("missing", 1));
  assert.throws(() => sim.setControl("steam", NaN));
  assert.throws(() => sim.step(-1));
  sim.scram();
  sim.step(1);
  sim.reset();
  assert.equal(sim.state.time, 0);
  assert.equal(sim.state.tripReason, null);
  assert.equal(sim.controls.reactor, 60);
  assert.equal(sim.state.fuelReserveMWh, PARAMETERS.fuelReserveMWh);
});
