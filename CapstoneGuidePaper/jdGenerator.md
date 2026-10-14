# AI Job Description Generator — Implementation Plan

Hiwalay na working doc para sa pag-build ng Layered AI Job Description Generator
(tingnan ang buong desisyon/research sa `CapstoneGuidePaper/AIplanning.md` §5).
Dito lang ang diagram, file plan, at progress checklist habang ginagawa.

---

## Architecture Diagram

```mermaid
flowchart TD
    A[HR Input: job title, category, level, branch, contract duration] --> B

    subgraph L1["Layer 1 — Sariling ML (core, gumagana offline)"]
        B[TF-IDF + Cosine Similarity<br/>lib/matching.ts: buildJobDoc + analyzeMatch] --> C[Top-k pinakakahawig na<br/>existing MR.DIY job postings]
        C --> D[Retrieval-based draft:<br/>responsibilities + requirements]
        C --> E[Skill extraction<br/>ResumeSkills vocabulary]
    end

    D --> F
    E --> F

    subgraph L2A["Layer 2 — Sariling Rules (compliance)"]
        F[Kumpletong sections:<br/>About / Responsibilities / Requirements / Benefits] --> G[Mandatory benefits<br/>SSS / PhilHealth / Pag-IBIG]
        G --> H{Bawal na wording?<br/>hal. age limit — RA 10911}
    end

    H -->|malinis| I
    H -->|may warning| I[Draft + warnings]

    I --> J{May sapat na kahawig<br/>na posting ba sa Layer 1?}

    subgraph L3["Layer 3 — Gemini (COLD-START HANDLER, mandatory kapag walang kahawig)"]
        J -->|cold start:<br/>walang/kaunting<br/>kahawig na posting| K[Bubuo ng bagong content<br/>o pinakikinis ang draft]
    end

    J -->|may sapat na<br/>kahawig na posting| M
    K --> L

    subgraph L2B["Layer 2 ulit — Guardrail sa Gemini output"]
        L{Kumpleto pa ba?<br/>May naimbentong sweldo/benefits?} -->|bumagsak| M
        L -->|pasado| N
    end

    M[Layer 2 draft ang gamitin] --> N
    N[Layer 4 — HR review + edit] --> O[I-publish sa Jobs page]

    style L1 fill:#fef3c7,stroke:#92400e
    style L2A fill:#dbeafe,stroke:#1e40af
    style L2B fill:#dbeafe,stroke:#1e40af
    style L3 fill:#ede9fe,stroke:#5b21b6
```

**Paano basahin:** dilaw = sariling ML (laging tumatakbo), asul = sariling rules/guardrail
(laging tumatakbo, dalawang beses dumadaan dito ang output), lila = Gemini —
**cold-start handler**, hindi "optional/pampaganda" lang: mandatory ito kapag walang
sapat na kahawig na posting sa database (bagong klase ng trabaho), dahil doon talagang
wala nang ibang pagkukunan ng content. Kapag may sapat na katulad, hindi na ito ginagamit.
Parehong pattern ang ginagamit sa Resume Validator (§5.6 ng AIplanning.md) —
Gemini bilang fallback kapag mababa ang confidence ng sariling trained model, hindi
lang para sa JD Generator o FAQ assistant mag-isa (tingnan §5.8 para sa buong larawan).

---

## File / Folder Plan (Phase 1)

| File | Layer | Laman |
|---|---|---|
| `lib/jobDescriptionGenerator.ts` | Layer 1 + 2 | `findSimilarJobs()`, `buildDraft()`, `checkCompliance()` — muling gagamitin ang `buildJobDoc`/`analyzeMatch` mula sa existing `lib/matching.ts` |
| `app/api/jobs/generate-description/route.ts` | API | `POST { title, category, level, branchId, contractDurationMonths }` → `{ draft, basedOn, warnings }` |

Walang bagong folder — sinusunod ang existing convention (`lib/` para sa shared logic,
`app/api/<resource>/<action>/route.ts` para sa endpoints).

**Phase 2** (UI): wala ring bagong file, idadagdag lang sa `app/jobs/page.tsx`.

**Phase 3** (Gemini — cold-start handler): bagong `lib/gemini.ts` + `GEMINI_API_KEY` sa `.env.local`. Tatawagin lang kapag mababa/walang similarity score mula sa Layer 1 (walang kahawig na posting).

---

## Progress Checklist

- [ ] Phase 1 — `lib/jobDescriptionGenerator.ts` (Layer 1 + 2), lint + build + `curl` test
- [ ] Phase 1 — `app/api/jobs/generate-description/route.ts`
- [ ] Phase 2 — Button + "Based on" + warnings sa `app/jobs/page.tsx`
- [ ] Phase 3 — Gemini cold-start handler + guardrail + behavior kapag may sapat nang kahawig
