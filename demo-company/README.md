# Helios Software Inc. — Demo Company Generator

## Overview

This package generates a realistic, synthetic enterprise dataset for **Helios Software Inc.**, a fictional B2B Enterprise SaaS company. The generated data provides FLOW OS with a complete simulation environment for validation, testing, and demonstration purposes.

**Helios Software Inc.** is a 450-person enterprise workflow automation and intelligence platform company with $48M ARR, 210 customers, and five offices globally (San Francisco, New York, London, Singapore, Austin).

## What is Helios Software?

Helios Software Inc. is built around four core products:

- **Helios Platform** — Core enterprise workflow and automation engine (5 GitHub repos, HPLT Jira key)
- **Helios Analytics** — Real-time business intelligence and reporting (4 GitHub repos, HANA Jira key)
- **Helios Connect** — API integration hub and connector marketplace (4 GitHub repos, HCON Jira key)
- **Helios Guard** — Security, compliance, and access control platform (3 GitHub repos, HGRD Jira key)

The organization is structured across 12 functional departments: Executive (8), Platform Engineering (85), Analytics Engineering (60), Connect Engineering (55), Guard Engineering (40), Product (28), Design (18), QA (22), DevOps & Infrastructure (20), Customer Success (45), Sales (50), and GTM functions (19).

## Running the Generator

```bash
# Install dependencies (one-time)
npm install

# Generate all datasets
npm run generate

# Clean up previously generated datasets
npm run clean
```

The generator will produce 22 dataset JSON files in `exports/datasets/` plus a `manifest.json` index.

## Output Contract

The generator produces the following structure:

```
exports/
├── manifest.json            # Index of all datasets: metadata + file references
├── datasets/
│   ├── company.json         # Company profile
│   ├── products.json        # Product catalog
│   ├── departments.json     # Department structure
│   ├── people.json          # Employee directory (450+ entries)
│   ├── teams.json           # Cross-functional teams
│   ├── github_repos.json    # 16 GitHub repositories (4 per product)
│   ├── github_pr.json       # Pull request history + samples
│   ├── github_issues.json   # Issues + bug reports
│   ├── github_commits.json  # Commit history (normalized by product)
│   ├── slack_channels.json  # Slack channel directory
│   ├── slack_messages.json  # Sample message threads
│   ├── gmail_threads.json   # Email thread samples
│   ├── calendar_events.json # Meeting calendar (next 90 days)
│   ├── jira_projects.json   # 4 Jira projects (1 per product)
│   ├── jira_issues.json     # Issue backlog + current sprint
│   ├── decisions.json       # Executive decisions + outcomes
│   ├── incidents.json       # Operational incidents + resolutions
│   ├── onboarding.json      # New hire onboarding narratives
│   ├── goals_okrs.json      # Company + product-level OKRs
│   └── timeline.json        # Historical events (6-month narrative)
```

The `manifest.json` provides metadata for each dataset: record count, schema summary, and file path reference.

## Design Philosophy

**No FLOW Source Dependency:** This package is completely self-contained. It:
- Uses only `@faker-js/faker` as a dependency
- Does NOT import anything from FLOW OS `src/`
- Does NOT reference FLOW modules or services
- Produces pure JSON datasets

**Deterministic Output:** All generators use `faker.seed(12345)` for reproducible, consistent data across runs.

**FLOW Integration:** FLOW OS consumes the `manifest.json` + dataset files via the importer. The datasets serve as the single source of truth for the demo environment.

## Development

To add a new dataset generator:

1. Create a generator function in `src/generators/[name].js`
2. Export it from `src/generators/index.js`
3. Call it in `src/generate.js`
4. Add the output file to `exports/datasets/`
5. Update `manifest.json` with metadata

## License

Proprietary. FLOW OS Demo Environment.
