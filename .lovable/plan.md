## Plan: Custom input option for every unit test

I will refactor the unit testing approach so each scenario can define its own explicit custom input data, instead of depending on shared mock vessel/sequence/cargo/bunker fixtures.

### 1. Add a custom input test builder
- Replace the current `buildInputs(overrides)` pattern that starts from shared mock data.
- Add a new helper such as `createVoyageTestInputs(customInput)` that builds a complete `VoyageInputs` object from scenario-local data.
- Keep small reusable helpers only for empty/default shapes, not business mock values.

### 2. Make every unit test scenario self-contained
- Update each unit test file so every `it(...)` block declares the exact vessel, sequence, cargo, bunker, hire, misc, and extra-time inputs needed for that scenario.
- Avoid importing `mockVessel`, `mockSimpleSequence`, `mockCargo`, etc. into unit tests.
- Each test will be easier to modify because all relevant input values will be visible inside the test or local scenario factory.

### 3. Support easy custom scenario creation
- Add a readable pattern like:

```ts
const inputs = createVoyageTestInputs({
  vessel: customVessel({ speedProfile: "eco" }),
  sequence: [customLeg({ distance: 1000, ecaDistance: 100 })],
  cargo: customCargo({ quantity: 50000, rate: 35 }),
  bunker: customBunker({ vlsfoPrice: 600 }),
});
```

- This gives full custom input control while avoiding repeated boilerplate.

### 4. Update validation tests similarly
- Validation tests will define exact invalid/valid inputs per scenario.
- Required-field and number-range tests will no longer depend on hidden mock defaults.

### 5. Update documentation
- Rewrite `docs/TESTING.md` to explain the new custom-input approach.
- Include examples for:
  - running all tests
  - running one test file
  - running one scenario by name
  - adding a new custom unit test

### Technical details
- Files expected to change:
  - `src/test/helpers/scenarios.ts`
  - `src/test/unit/01_vesselSection.test.ts`
  - `src/test/unit/02_sequenceSection.test.ts`
  - `src/test/unit/03_bunkerSection.test.ts`
  - `src/test/unit/04_cargoSection.test.ts`
  - `src/test/unit/05_miscSection.test.ts`
  - `src/test/unit/06_emissionSection.test.ts`
  - `src/test/unit/07_validation.test.ts`
  - `docs/TESTING.md`

### Result
After this change, every unit case can be tested with its own custom inputs, and future test cases can be added by copying a small scenario template and changing the exact input values.