import test from "node:test";
import assert from "node:assert/strict";
import { ReactorSimulation } from "../simulation.mjs";
import { diagnose } from "../plant-state.mjs";

test("safe low-power operation is not reported as an emergency", () => {
  const sim = new ReactorSimulation();
  sim.setControl("reactor", 0);
  sim.step(3600);
  const state = diagnose(sim.readings());
  assert.equal(state.phase, "LOW-POWER OPERATION");
  assert.equal(state.severity, "normal");
  assert.equal(state.alarms.length, 0);
});

test("hot fuel with adequate heat removal is identified as recovery rather than cooling failure", () => {
  const sim = new ReactorSimulation();
  sim.state.fuelTemperature = 1100;
  sim.scram();
  const state = diagnose(sim.readings());
  assert.equal(state.phase, "COOLING RECOVERY");
  assert.equal(state.severity, "warning");
  assert.ok(!state.alarms.some((alarm) => alarm.id === "heat-removal"));
  sim.state.coreDamage = 5;
  assert.ok(!diagnose(sim.readings()).guidance.includes("is accumulating"));
});

test("cooling failure escalates after shutdown and damage remains after recovery", () => {
  const sim = new ReactorSimulation();
  sim.setEquipment("primary", false);
  sim.step(30);
  const emergency = diagnose(sim.readings());
  assert.equal(emergency.phase, "COOLING EMERGENCY");
  assert.ok(emergency.alarms.some((alarm) => alarm.id === "trip"));
  assert.ok(
    emergency.alarms.some(
      (alarm) => alarm.id === "heat-removal" && alarm.level === "danger",
    ),
  );
  sim.step(1170);
  assert.equal(diagnose(sim.readings()).phase, "CORE DAMAGE");
  sim.setEquipment("emergency", true);
  sim.step(240);
  const recovered = diagnose(sim.readings());
  assert.equal(recovered.phase, "DAMAGE STABILIZED");
  assert.ok(recovered.alarms.some((alarm) => alarm.id === "core-damage"));
  sim.reset();
  assert.equal(diagnose(sim.readings()).alarms.length, 0);
});
