# Reactor Lab

An interactive, simplified pressurized water reactor (PWR) simulator built with HTML, CSS, JavaScript, and SVG. Development takes place on `main`.

## Run

From the repository directory:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

The server serves `index.html` at `/`. Stop it with Ctrl+C. No package installation, external assets, or build step is required. Use a current browser with JavaScript modules enabled; serve the files over HTTP instead of opening `index.html` directly.

## Explore

The plant starts at a balanced operating point at 60% of its illustrative 1,000 MW thermal rating. Change one input at a time:

- **Reactor setting:** adjusts target thermal output with a gradual response.
- **Primary pump:** changes heat transfer from fuel through the primary circuit to the steam generator.
- **Steam valve:** changes the heat carried through the turbine and condenser.
- **Cooling flow:** changes condenser heat rejection and pump electricity use.

Watch temperatures, steam pressure, net electrical output, efficiency, turbine speed, fuel reserve, and the live trend. Use pause and 1×/3×/10× playback to inspect changes. Large adjustments can trigger a latched protective shutdown; cooling controls remain available. **Reset to balanced state** restores the initial inputs, temperatures, clock, and history. Manual shutdown suppresses fission, but decay heat and stored heat remain.

## Model and scope

This is an educational input/output sandbox, not a real plant simulator or operating tool. There are no scenarios, electricity demand targets, upgrades, or economic systems.

`simulation.mjs` contains the independent model. It tracks energy in four thermal reservoirs and a turbine rotor. Internal heat transfers cancel, while energy enters as reactor heat and leaves as net electricity or heat rejected. Pump consumption and generator losses are included. Heat capacities, conductances, rating, fuel budget, governor, and protection limits are illustrative. Fuel reserve is a slow-changing thermal-energy budget, not fuel mass or isotopic depletion.

The reactor input is an ideal heat-output controller, not a neutron-kinetics or rod-position simulation. Decay heat uses one effective group. Primary pressure is held at 155 bar; water inventories and feedwater are automatically managed. Steam pressure comes from the pure-water saturation curve; there is no full two-phase flow, steam-table, boiling-crisis, or pressure-vessel model. Small residual primary heat transfer remains with the pump stopped. The generator has ideal automatic loading to hold nominal speed while sufficient steam is available and coasts down at low flow; grid synchronization and demand are not modeled. Plant auxiliary power is assumed available from an external supply when needed. Protection stops fission but does not model core damage or radiation release.

Net efficiency is withheld during substantial transients or shutdown because stored heat can temporarily power the turbine. Negative net power means the plant is consuming electricity. Diagram motion indicates circulation and shaft rotation, not temperature or fluid mixing. The trend contains only samples generated since reset.

`app.js` connects inputs, fixed simulation steps, and rendering. `styles.css` contains responsive styles and respects reduced-motion preferences. Background tabs do not accumulate simulated catch-up time. All physics uses simulated seconds, including at faster playback speeds.

See [reactor research](docs/reactor-research.md) for the preliminary reactor comparison and reference-access limitations.

## Verify

With Node.js 18 or newer:

```sh
node --test tests/simulation.test.mjs
```

The tests exercise equilibrium, gradual input response, cooling changes, decay heat, protective shutdown, energy conservation, playback time subdivision, saturation pressure, and reset. Node is needed only for tests, not for serving the application.

For a browser smoke check: load the page, adjust a slider, and confirm the readout and subsequent plant outputs change. Pause should freeze the clock; resume should continue it. Shut down and verify residual heat remains, then reset and verify the original balanced state returns. Check the diagram and controls on a narrow viewport as well.
