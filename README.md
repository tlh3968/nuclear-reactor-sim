# Reactor Lab · V2

A desktop PWR operating sandbox built with HTML, CSS, JavaScript, and SVG. This version lives on **`V2`**. The original simulator is preserved on **`main`**.

## Open the simulator

If you use GitHub Pages, open the repository's **Settings → Pages**, choose **Deploy from a branch**, and select **V2 / (root)**. Save and wait for the deployment to complete. The existing site address stays the same; selecting V2 changes which version it serves. Selecting main restores the original site. Changing branches in GitHub's code viewer alone does not change Pages.

For local development, run this from the repository directory **on your own computer**, then open `http://localhost:8000` in that computer's browser:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

A server running in a cloud workspace is not reachable through your computer's localhost. Use your host's supported web access or publish through Pages. There is no package installation, build step, external font, or downloaded audio required by the application. Serve over HTTP; opening the file directly does not load its JavaScript modules reliably.

## V2 operating console

Designed primarily for **1920 × 1080** and **1366 × 768** desktops. Essential controls and instruments fit on one screen at those resolutions, with only alarm history scrolling internally. Mobile layout is intentionally deferred.

- Six critical instruments remain at the top: thermal power, net electricity, fuel and primary coolant temperatures, steam pressure, and turbine RPM.
- System instruments show coolant inventory, flow, steam and condenser temperatures, heat rejection, decay heat, efficiency, auxiliary consumption, core integrity, and the illustrative fuel energy reserve.
- The process diagram shows all three circuits. Select the reactor, primary pump, turbine, or cooling equipment to highlight the related controls.
- Hold **− / +** to adjust a command. A keyboard-activated button makes one adjustment. Markers indicate the command; bars and numbers indicate actual response.
- Maintained pump switches retain their speed setpoint when stopped. Pumps ramp up and coast down; the steam valve travels toward its command.
- **SCRAM** stays in the top bar. It suppresses fission and latches the trip, leaving cooling equipment available. Raising reactor power is blocked until a new experiment is started.
- **Auxiliary core cooling** provides independent modeled heat removal and makeup water. It must be deliberately engaged.
- **ACK ALL** acknowledges current alarms; **SILENCE** suppresses their audible signal. Neither changes the plant. New or escalated alarms re-annunciate. Cleared conditions remain in the alarm history.
- **Reset experiment** restores plant conditions, inputs, damage, time, and history. It is separate from alarm acknowledgment and from layout reset.
- Playback supports pause and 1×/5×/20×/60× speeds. Model information pauses the experiment while open. Background tabs do not accumulate catch-up simulation time.

## Customize the workspace

Choose **Customize layout**. Drag between the two side-panel headers or between the two bottom-panel headers to swap them. The swap buttons provide a keyboard alternative. Drag the side-panel edges to resize within limits; the focused separators also accept Left/Right arrows.

Choose **Lock layout** to return to operation. Panel arrangement and widths are stored in this browser. **Reset layout** restores the default without resetting the plant. The central diagram, top critical instruments, plant state, and SCRAM control remain fixed. This is constrained docking, not arbitrary placement of individual gauges.

## Sound

Sound is off until explicitly enabled, respecting browser autoplay restrictions. It is synthesized locally: equipment hum follows actual pump flow and rotor speed, controls have short click tones, and unacknowledged alarms have priority-dependent signals. Master volume applies to all sound. Mute is distinct from silencing current alarms. Volume is remembered; sound never automatically enables on reload. Visual alarms are sufficient to operate the simulator. Reduced-motion preferences disable animated flow and flashing indicators.

## Heat removal, damage, and recovery

A successful trip does not instantly cool the fuel. Two effective decay-heat groups and stored energy remain. Stopping primary circulation and leaving auxiliary cooling isolated can produce a cooling emergency after the trip, followed by fuel damage if heat removal remains inadequate. Faster playback helps observe these slower effects.

Auxiliary cooling or restored circulation can reduce temperatures. **Core damage persists after stabilization**; only Reset experiment clears it. A safe reduction in reactor power does not itself trigger an emergency. At low steam power the ideal generator unloads and the rotor coasts down rather than reporting a reactor “stall.”

## Model boundaries

This is an educational, illustrative model, **not engineering or operating guidance**. Ratings, heat capacities, conductances, actuator times, damage rates, protection limits, and auxiliary systems are fictionalized for this sandbox.

`simulation.mjs` separates model state from presentation. It accounts for energy in fuel, primary coolant, secondary water/steam, the condenser, and the rotor. Heat moves between reservoirs; net electricity and environmental heat leave the model. Pump consumption, generator and rotor losses, auxiliary cooling, and energy carried by lost coolant are included. Cold makeup changes coolant mass and temperature without adding thermal energy relative to the fixed 18 °C reference.

The power input is an ideal heat-output controller, not rod position or neutron kinetics. Two exponential groups approximate decay heat; there is no isotope inventory. Primary pressure is regulated at 155 bar. Coolant loss above the illustrative saturation threshold and independent makeup are aggregate approximations, not complete two-phase hydraulics. Secondary inventory and feedwater remain automatically managed. Auxiliary power is assumed available even when the generator is unloaded. Auxiliary cooling is an abstract heat-removal system, not a real ECCS design. Generator loading is idealized; demand, grid synchronization, containment, radiation release, and detailed severe-accident progression are not modeled. Cumulative fuel damage is an illustrative thermal-exposure indicator, not a prediction of real fuel failure or meltdown.

Net efficiency is withheld during significant transients and shutdown because stored heat can temporarily supply the turbine. Negative net electrical output means auxiliary electricity is being imported. Fuel reserve is an energy budget, not fuel mass or isotopic depletion. All limits and diagnostic states describe this model only.

`plant-state.mjs` derives operating states and alarm conditions. `app.js` manages controls, fixed-step playback, alarms, trends, and saved layouts. `sound.mjs` owns opt-in Web Audio synthesis. `styles.css` defines the desktop console. See [reactor research](docs/reactor-research.md) for the original reactor comparison and source-access limitations.

## Tests

The model and diagnostic tests require Node.js 18 or newer, with no installed npm packages:

```sh
node --test tests/*.test.mjs
```

They cover equilibrium, control response, actuator travel, decay heat, protective shutdown, post-trip damage, recovery with persistent damage, coolant loss and makeup, energy conservation, safe low-power classification, saturation pressure, and reset.

The optional browser smoke test requires Python, Playwright, and Chromium. With the server running, use:

```sh
python3 tests/browser_smoke.py
```

Install those testing tools separately if needed (`python3 -m pip install playwright` and `python3 -m playwright install chromium`). The test uses system Chromium when available, otherwise Playwright's installed Chromium. Options `--url`, `--chromium`, and `--artifacts` override the server, browser executable, and screenshot directory. These are development-only tools; the deployed application has no runtime dependencies.
