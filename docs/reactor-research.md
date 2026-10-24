# Choosing the first reactor model

## Recommendation

Start with a simplified **pressurized water reactor (PWR)** for an educational, browser-based simulator. Use HTML, CSS, and JavaScript initially; no framework or physics library is necessary to establish the first model.

Here, “simple” means easy to understand and simulate, not easy to construct. The project models a power plant rather than designing a physical reactor.

A PWR is a good match for the proposed interface because its systems have clear boundaries: the reactor makes heat, a separate circuit makes steam, the turbine drives a generator, and a condenser rejects unused heat. Its extra heat exchanger adds a component but makes the visual story and software model easier to separate.

This is a preliminary research synthesis of established reactor principles. Official source pages were attempted on 24 October 2026, but the environment's network proxy denied access. The references below are reading targets, not sources successfully inspected in this session. Check them before treating this document as a verified literature review. No current deployment counts or vendor claims are relied on here.

## How a nuclear power plant produces electricity

Fission releases heat in the fuel. A coolant carries that heat away. In a steam-cycle plant, steam expands through a turbine, which drives a generator. Exhaust steam condenses back to water and returns to the steam-producing system. A separate cooling system carries waste heat to the environment.

The moderator and coolant are different *roles*. A moderator slows neutrons in a thermal reactor; a coolant transfers heat. Ordinary water can perform both roles. Fast reactors do not use a moderator to sustain a thermal neutron spectrum.

Control rods influence the fission reaction by absorbing neutrons. They do not directly set electrical output. Electrical output also depends on heat transfer, steam flow, turbine behavior, and generator load. Heat remains after shutdown because radioactive fission products continue to decay; stopping the chain reaction does not immediately remove the need for cooling.

## Reactor families

These categories overlap: reactor families can be described by coolant, moderator, neutron spectrum, fuel form, or size. An SMR, for example, can also be a PWR.

| Type | Basic arrangement | What it offers a simulator | Main complication | Fit for the first version |
| --- | --- | --- | --- | --- |
| Pressurized water reactor (PWR) | Ordinary water cools and moderates the core. A pressurized primary circuit transfers heat through a steam generator to a separate water/steam circuit. | Clear separation between reactor heat, steam production, and power conversion; familiar plant components. | A steam generator, primary pressure system, and several fluid inventories must be represented. | **Recommended:** strongest fit for a clear whole-plant interface. |
| Boiling water reactor (BWR) | Ordinary water cools and moderates the core and boils inside the reactor vessel. Steam goes to the turbine, then returns as feedwater. | A shorter route from core to turbine and fewer major heat-transfer boundaries. | Boiling, steam voids, pressure, core flow, and reactor power interact; the turbine circuit carries reactor steam. | Good alternative if fewer components matter more than separation of systems. |
| Pressurized heavy-water reactor (PHWR; CANDU is a major example) | Heavy water provides moderation; CANDU designs use pressure tubes and a separate heavy-water coolant circuit feeding steam generators. | Distinctive pressure-tube layout and opportunities to explain moderation and refueling. | Many channels, separate moderator behavior, and online refueling add scope. | Better as a later reactor family. |
| Gas-cooled, graphite-moderated reactors (such as AGR) | Graphite moderates; a gas coolant transfers core heat to steam generators. AGR uses carbon dioxide coolant. | Makes the separate roles of moderator and coolant visible. | Gas circulation and graphite thermal storage introduce different dynamics. | Later expansion. |
| High-temperature gas-cooled reactor (HTGR) | Typically helium coolant, graphite moderation, and coated-particle fuel; power conversion depends on the design. | High-temperature heat transfer and possible uses beyond electricity. | Fuel behavior, substantial graphite thermal inertia, and design-dependent power cycles. | Interesting later option, but a less direct baseline for this steam-loop project. |
| Liquid-metal-cooled fast reactor | Often sodium or lead coolant, with no neutron moderator. Sodium designs commonly use an intermediate heat-transfer circuit. | Distinctive heat-transfer loops and a comparison with thermal reactors. | Coolant-specific physics and additional systems; sodium/water interaction matters when a steam cycle is used. | Too much additional scope for the first model. |
| Molten-salt reactor (MSR) | Molten salt is used as coolant; in some designs fuel is dissolved in the salt, while others use solid fuel. Thermal and fast concepts exist. | Visually distinctive fluid systems and advanced-reactor comparisons. | No single canonical layout; chemistry, fuel location, and power cycle depend on the concept. | Defer until a specific design is chosen. |
| Small modular reactor (SMR) | A size and deployment category, not a unique coolant or reactor physics category. Some designs are integral PWRs; others use different technologies. | Potentially compact plant layouts. | “Small” does not automatically mean a simpler simulation; integrated equipment can hide useful system boundaries. | Revisit after establishing the baseline PWR model. |

The ranking concerns the cost of making an understandable simulator. It is not a ranking of real-world safety, economics, licensing readiness, or construction difficulty.

## PWR versus BWR: the practical decision

A BWR wins on a component-count definition of simplicity: no separate steam generator or PWR primary pressurizer is needed. A PWR wins on a separation-of-concerns definition: the reactor coolant stays in its own circuit while the secondary circuit handles steam and turbine behavior.

For this project, the second advantage is more useful. We can build and explain one subsystem at a time, then connect their energy flows. A BWR could reuse much of the turbine, generator, condenser, and interface work later, with a different reactor/steam model.

## Proposed first plant layout

```text
PRIMARY WATER CIRCUIT
Reactor -> steam generator (hot side) -> primary pump -> reactor
               |
               | heat transfer; no intended fluid mixing
               v
SECONDARY WATER / STEAM CIRCUIT
Steam generator -> steam turbine -> condenser -> feedwater pump
       ^                                                |
       +------------------------------------------------+
                         |
Turbine shaft ----------> generator ----------> electrical output

COOLING-WATER CIRCUIT
Cooling sink -> cooling-water pump -> condenser -> cooling sink
```

The primary water stays liquid during normal modeled operation. Secondary water boils in the steam generator and condenses after passing through the turbine. Cooling water removes heat from the condenser without intentionally mixing with the secondary water.

The cooling sink can initially be an abstract environment. A cooling tower is one possible heat-rejection arrangement, not a mandatory part of every nuclear plant. The diagram omits supporting equipment; a later detailed PWR view should include the pressurizer and other relevant systems.

## First simulation scope, once implementation starts

Use an intentionally simplified, lumped model: one or a few representative states per component rather than a spatial model of the core or piping. Label the simulation educational and avoid implying plant-specific fidelity.

Suggested displayed quantities:

- Reactor thermal power and retained decay heat.
- Representative primary coolant temperature and flow.
- Steam-generator heat transfer and secondary steam production.
- Turbine mechanical power and generator electrical output.
- Condenser heat rejection and cooling-water temperature.
- Pump power use, with gross and net electrical output distinguished.

Suggested controls are reactor power demand, primary coolant flow, turbine steam admission, feedwater flow, and cooling-system flow. Start from a stable operating state; cold startup, detailed shutdown procedures, and accident scenarios can wait.

Build the model around energy accounting: reactor heat must go into stored energy, useful power, rejected heat, or explicitly modeled losses. Transport and thermal inertia should produce gradual responses. Do not make every temperature or electrical output jump immediately when a control moves.

For the first version, treat pressure regulation and secondary water inventory as simplified managed systems and disclose that choice. Do not add an apparently functional control for a physical effect the model does not represent. Later versions can add coupled pressure, boiling, inventory, and reactivity feedback models.

Before adding detailed reactor physics, decide whether the experience prioritizes teaching energy flow, operating a control room, or reproducing transients. That choice determines the required model fidelity. The current pitch most directly supports teaching energy flow.

## Web implementation direction

Keep the first implementation dependency-free:

- HTML for structure, labeled controls, and numerical readouts.
- CSS for a responsive plant layout, circuit colors, and clear component states.
- JavaScript for simulation state, updates, control inputs, and rendering.
- SVG for an interactive plant schematic if needed; SVG elements can be styled and accessed directly through the browser DOM.

Separate model updates from rendering. Use elapsed simulation time rather than frame counts, with bounded time steps so changing frame rate does not change the physics. Keep units explicit in state and in the interface.

Useful future checks will include energy balance, stable operation, a bounded response to a power-demand change, delayed temperature response, and continued heat generation following shutdown. Automated tests should be added with the model; the current blank page has no reactor behavior to test.

No simulator implementation, framework, charting library, 3D engine, or additional dependency is introduced by this research decision.

## Reference reading to verify

1. US Nuclear Regulatory Commission: [Pressurized Water Reactor](https://www.nrc.gov/reading-rm/basic-ref/students/animated-pwr.html). Primary reference for the PWR system layout.
2. US Nuclear Regulatory Commission: [Boiling Water Reactor](https://www.nrc.gov/reading-rm/basic-ref/students/animated-bwr.html). Primary comparison for direct steam production in the vessel.
3. US Department of Energy: [Nuclear 101: How Does a Nuclear Reactor Work?](https://www.energy.gov/ne/articles/nuclear-101-how-does-nuclear-reactor-work). Introductory explanation of fission and light-water reactors.
4. International Atomic Energy Agency: [What Are Small Modular Reactors (SMRs)?](https://www.iaea.org/newscenter/news/what-are-small-modular-reactors-smrs). Clarifies the SMR category.
5. World Nuclear Association: [Nuclear Power Reactors](https://world-nuclear.org/information-library/nuclear-fuel-cycle/nuclear-power-reactors/nuclear-power-reactors). Industry overview for comparing reactor families; distinguish it from regulatory guidance.

Next research step: verify the source pages, then define the PWR component boundaries, units, model assumptions, and acceptance checks before implementing interactive behavior.
