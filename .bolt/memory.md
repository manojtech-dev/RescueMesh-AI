# Project memory

## Product intent & audience

- RescueMesh AI is an emergency/incident command-center web app for coordinating disaster response across India.
- Audience: emergency operators, rescue coordinators, and command-center staff managing incidents, rescue teams, and relief resources.
- Originally scoped to Vellore; upgraded to a nationwide "INDIA CENTRAL COMMAND CENTER" supporting multi-city operations simultaneously.

## Brand personality & voice

- Authoritative, operational, mission-critical tone.
- UI labels favor clarity and action (e.g. "Locate Selected Incident", "View All India").

## Visual design & UX direction

- Existing dashboard layout, colors, and sidebar are preserved; new UI must integrate with the current design, not rebuild it.
- Stack constraints (from authoritative `.bolt/prompt`): JSX + Tailwind, React hooks, Lucide React icons, `@/` alias → `src/`. No extra UI/theme/icon packages unless required.
- Header contains the title plus a working location dropdown selector (`All India`, all 36 states/UTs, and the city list).
- Pages: command center stats, triage queue, latest reports, rescue teams, relief resources, analytics, AI decision trace, incident assignment, and Live India Map.
- Map UX: India as default view, city/area search bar, "View All India" re-center button, "Locate Selected Incident" zoom button (disabled until a report is selected), markers respect selected scope + search text.
- Custom CSS classes introduced: `.scope-select`, `.map-controls`.

## Decisions, constraints & rationale

- A single shared "location scope" state drives every page: stats, reports, teams, resources, analytics, AI decision trace, assignment dropdown, and map markers — ensuring consistent filtering on location change.
- City directory supports: Tamil Nadu, Chennai, Vellore, Coimbatore, Madurai, Bengaluru, Hyderabad, Mumbai, New Delhi, Kolkata, Kochi, plus All India and all states/UTs.
- Each city must have its own coordinates; fixed Vellore-only coordinates must not be reused for other cities.
- Demo records must be clearly labelled as demo data; no fake counts or hardcoded Vellore-only data in production paths.
- Build and typecheck must pass clean before claiming completion.

## Open questions & assumptions

- "Other Indian states, districts and cities dynamically" — currently backed by a static directory; dynamic search/selection scope not confirmed.
- Map provider/tiles and how marker data is persisted/stored across sessions are not yet specified.
- Whether incident records are stored in a real backend or in-memory demo store is unconfirmed.