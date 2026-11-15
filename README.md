# P&ID Generator

Draft P&IDs by selecting equipment in flow order, or by describing the process in plain text. Tags are numbered automatically and the design is checked as you build.

Built with Claude Code. Version 1.

## Features

- Equipment palette: tank, vessel / reactor, pump, heat exchanger, isolation and check valves, control valves (temp, flow, pressure, level)
- ISA-style auto-numbered tags (P-101, TV-101, PSV-101)
- Control loops drawn automatically
- Engineering checks: pump isolation and check valves, PSV on vessels, control loop completeness
- Text to P&ID using the Claude API
- Equipment list and instrument index, with CSV export
- Zoom and fit controls

## Project structure

```
pid-generator/
├── server.js        Express server and API routes
├── validate.js      Process model, tagging and engineering rules
├── public/
│   └── index.html   Front end (single file, no build step)
├── package.json
├── .env.example
└── .gitignore
```

## Run it

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env      # then put your Anthropic API key in .env
npm start
```

Open http://localhost:3000

Without an API key the manual builder, checks and CSV export still work. Only "Generate with AI" needs the key.

## API

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/api/generate` | `{ "description": "..." }` | `{ title, items, checks }` |
| POST | `/api/validate` | `{ "items": [{ "k": "pump" }] }` | `{ checks }` |
| POST | `/api/export` | `{ "items": [...] }` | CSV file |
| GET | `/api/health` | | `{ ok, ai, model }` |

Item kinds: `tank`, `vessel`, `pump`, `hx`, `valve`, `check`, `cvT`, `cvF`, `cvP`, `cvL`.

## Security notes

- The API key lives only on the server in `.env`. It is never sent to the browser.
- Requests are rate limited (20 per minute per IP) and input length is capped.
- Claude's output is sanitized: only known item kinds are accepted.

## Roadmap

- Branches: bypass and minimum-flow lines
- Click an item in the drawing to select it
- Export to SVG, DXF, DEXPI
- Upload an image and digitize an existing P&ID
- HAZOP starter suggestions

## Disclaimer

Output is a draft. Real P&IDs need engineering review and a HAZOP before use.

## License

MIT
