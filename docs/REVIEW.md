# Weekly review of submissions and corrections

Submissions arrive through two Tally forms and never change the data automatically. Once a week, export the responses, run the review script, and apply what you approve by hand.

## The two forms

The share links are set in the Vercel project and in `.env.local` locally:

```
NEXT_PUBLIC_TALLY_SUBMIT_URL=https://tally.so/r/DqpvPq
NEXT_PUBLIC_TALLY_CORRECT_URL=https://tally.so/r/4a7Nyk
```

While either variable is missing its button is hidden rather than broken.

**Submit a project** (button in the header and on the Explorer page, open to everyone). Keep these labels so the review script maps them:

| Label | Type | Notes |
|---|---|---|
| Project name | short text, required | |
| Website | URL | |
| X handle | short text | with or without the @ |
| Sector | dropdown, required | the 22 Base sectors: AI Agents · Bridges & Interoperability · DAOs, Governance & Public Goods · Data & Analytics · DEXs & Liquidity · Ecosystem, Funding & Education · Exchanges & On/Off-Ramps · Infrastructure & Dev Tools · Launchpads · Lending & Credit · Memecoins & Community · NFTs, Gaming & Collectibles · Other · Perps, Options & Derivatives · Prediction Markets · RWA & Tokenized Assets · Security, Risk & Compliance · Social & Identity · Stablecoins & Payments · Trading Tools & Bots · Wallets & Custody · Yield & Asset Management |
| Native chain | dropdown, required | Base native · Other EVM · Other non-EVM · Centralized / off-chain |
| Short description | long text | one or two sentences |
| Contract addresses | long text | one per line, Base only |
| Evidence URL | URL, required | docs, explorer, announcement |
| Contact | email, optional | |

**Suggest a correction** (button inside the project modal only). The modal opens the form with two hidden fields prefilled from the URL, `project` (the project name) and `page` (the Atlas URL the reader was on). In Tally these are *Hidden fields* named exactly `project` and `page`, then:

| Label | Type | Notes |
|---|---|---|
| Which field is wrong | dropdown, required | the ecosystem CSV columns, Website · Sector/Category · Subcategory · Native Chain · Native Chain Detail · Status · Description · X Handle · Funding Type · Investors / Backers · Amount Raised · Token · Audits · Incidents · Red Flags · Other (explain) |
| Correct value | long text, required | |
| Evidence URL | URL, required | |
| Contact | email, optional | |

## The weekly loop

1. In Tally, open each form, then Submissions, Export, CSV. Save the files into `data/submissions/` (for example `submit-2026-11-24.csv` and `corrections-2026-11-24.csv`). Keep them for an audit trail, or delete them once processed.
2. Run the review:

   ```bash
   npm run review
   ```

   Each submission prints next to the current CSV row. `≠` marks a field whose submitted value differs from the current one, and `NEW PROJECT` means no row matched by name.
3. Open the evidence link. Apply approved changes by editing the files in `data/`:
   - corrections go to the matching row in `base-ecosystem-*.csv`;
   - new projects become a new row (keep the 29 columns; blanks mean no data, never 0; `Discovered Via` is `Community submission`);
   - contract addresses go to `data/contracts.csv`, only from the issuer's docs, DefiLlama or the project's own channels, never by name or symbol;
   - a new DefiLlama listing goes to `data/defillama-map.csv` (one row per slug; an empty Project means reviewed and ignored);
   - funding rounds go to `data/base-funding-rounds-*.csv` (one row per round, investors separated by `;`, Project spelled exactly as in the ecosystem CSV).
4. If counts changed, update `data/expected.json` (projects, sectors, subcategories, tier counts, rounds, Base-related rounds). Run `npm run data` and `npm test`; the build fails loudly on any mismatch.
5. Commit with your own git identity and push after `git pull --rebase` (the daily refresh also commits to `main`). Vercel redeploys from `main`.

The review script only prints. Nothing from a form is applied without a person reading it.
