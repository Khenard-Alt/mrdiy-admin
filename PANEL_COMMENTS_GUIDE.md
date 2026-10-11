# Gabay sa Mga Komento ng Panel (personal na gabay)

Capstone: **A Mobile-Based Recruitment System Using Machine Learning For Mr. D.I.Y.**
Our Lady of Fatima University, College of Computer Studies, Antipolo City. Petsa ng komento: **25/05/2026**.
Mga proponent: Antuerpia Ray Miguel R., Conde Sprewell B., Balasta Joshua Allen P., Sultan Salahoden E.

Kopya nito ay nasa `MrDIY/PANEL_COMMENTS_GUIDE.md` at `mrdiyreact-admin/mrdiy-admin/PANEL_COMMENTS_GUIDE.md`.

**Huling update ng kalagayan:** 2026-10-12. Lahat ng 8 komento ay naitayo na sa code. **Kailangan lang i-run ang 1 SQL** (`MrDIY/supabase/migrations/202610120001_recruitment_pipeline.sql`) para gumana ang interview at checklist ng dokumento.

---

## Ang talaan

| # | Panelist | Komento ng panel | Kalagayan |
|---|---|---|---|
| 1 | Engr. Eliseo Francisco, MIT | Notification o status update pagkatapos mag-apply | **Tapos na** (app, tray, email). Push kapag nakasara ang app ay kailangan pa ng Firebase key. |
| 2 | Engr. Francisco | Mga hakbang mula pag-apply hanggang makapagtrabaho | **Tapos na sa code**: pipeline, timeline, interview, checklist ng dokumento |
| 3 | Engr. Francisco | Gaano kabilis magsisimula ang applicant | **Tapos na sa code**: Hiring Velocity (app at admin) |
| 4 | Engr. Francisco | Web-based (optional) | **Tapos na**: ang admin web |
| 5 | Engr. Francisco | Formatted biodata ng client (kung available) | **Tapos na**: biodata PDF mula sa admin |
| 6 | Michael Angelo Manalo, MIT | Improvements ng machine learning | **Tapos na sa code**: bagong pormula ng match (stemming, synonyms, skills, title, lokasyon) |
| 7 | Manalo | Wastong ranking system na may strengths at weaknesses | **Tapos na sa code**: ranking bawat job sa admin |
| 8 | Manalo | Automated AI explanation ng ranking | **Tapos na sa code**: awtomatikong paliwanag na pangungusap |

---

## Paano makita ang bawat isa (hakbang-hakbang)

### Bago magsimula (isang beses lang)
1. I-run ang `202610120001_recruitment_pipeline.sql` sa Supabase SQL Editor (New query, paste, Run).
2. I-restart ang admin (`npm run dev`).
3. I-install ang app sa phone (Run sa Android Studio) at isara at buksan ulit.

### 1. Notification pagkatapos mag-apply
- Mag-apply sa isang job sa app, tapos tingnan ang **bell** ("Application received").
- Sa admin, palitan ang status. Dapat lumabas ang notification sa bell, sa tray ng phone, at sa email ng applicant.
- Sa admin, **Applicant review** → "Emails sent to this applicant" ay nagpapakita ng Sent o Failed.

### 2. Mga hakbang hanggang makapagtrabaho
- **Pipeline:** admin → Applications → View Resume → **Update Application Status**. Mga hakbang: Pending, Under Review, Shortlisted, (Interview Scheduled), Hired, Rejected, On Hold.
- **Timeline sa app:** app → Home → icon ng Applications → pindutin ang application. Makikita ang "Where is my application?" na may ✓ at "← you are here".
- **Interview:** admin → sa parehong modal, seksyong **Interview** → petsa, oras, lugar → Schedule. Sa app: lalabas ang **Your interview** na may **Confirm** at **Can't attend**; makikita ng admin ang sagot.
- **Checklist ng dokumento:** palitan ang status sa **Hired**. Sa app, lalabas ang **Pre-employment documents** (7 dokumento) na may Upload. Sa admin, seksyong **Pre-employment documents** → View, Verify o Send back.

### 3. Gaano kabilis magsisimula
- **App:** sa application detail, kahon na **How soon can I start?** ("Estimated start: 2 - 4 business days") at ang mga dahilan.
- **Admin:** Applicant review → **How soon could they start**.
- Pormula: 7 araw na base; match 85% pataas -2; match na mas mababa sa 50% +3; kumpletong profile at resume -1; lahat ng dokumento ay verified -1. Ipinapakita bilang saklaw (±1 araw).

### 4. Web-based
- Ang admin web (`mrdiy-admin`): Dashboard, Jobs, Applications, Messages.

### 5. Formatted biodata
- Admin → Applications → View Resume → **Download biodata (PDF)**. Isang pahina na may larawan, impormasyon, edukasyon, karanasan, skills, detalye ng application, at linya para sa pirma.
- Para laman ang biodata, kailangang i-save ng applicant ang profile sa app (Edit Profile → Save). Isinasama na ngayon sa pag-save ang about, headline, skills, experience at education.

### 6. Improvements ng machine learning
- **Dati:** TF-IDF at Cosine Similarity lang. **Ngayon:** 60% TF-IDF (sa mga stem ng salita) + 25% saklaw ng mga skill na hinihingi ng job + 15% tugma ng posisyon sa title, at 30% ng huling score ay lapit ng lokasyon.
- **Stemming at synonyms:** "cashiering", "casher" at "kahera" ay iisa na sa kuwenta; "POS" at "point of sale" ay iisang skill.
- **Subok:** `RecruitmentPipelineTest.kt` (halimbawa, ang applicant na cashier ay mas mataas kaysa sa driver job) at ang 45 na unit test.
- Ang parehong pormula ay nasa app (`JobMatchingEngine.kt`) at admin (`lib/matching.ts`).

### 7. Ranking na may strengths at weaknesses
- Admin → Applications → **Rank applicants by job** → pumili ng job. Naka-ayos mula pinakamataas (#1, #2…), may bar at %. Pindutin ang isa para makita ang **Strengths** (+) at **Weaknesses at gaps** (−).
- Nasa Applicant review din ang "Rank #1 of N for this job".

### 8. AI explanation
- Sa ranking at sa Applicant review, kahon na **Why this rank**. Halimbawa: "Joshua Allen P. Balasta is ranked #1 of 1 with a 39% match for Customer Service Representative. The text of the profile and resume is 16% similar to the job, and it covers 1 of 3 required skills (customer service); the branch is about 4 km away. Experience: 3 years. Main gap: does not show these required skills: communication and training."
- Kasama ang listahan ng mga salitang nag-ambag (na may %) at ang resume na may highlight.

---

## Mga kailangan pa
- [ ] **Firebase service account key** para sa push kapag nakasara ang app (komento 1).
- [ ] I-run ang SQL ng pipeline (komento 2, 3).
- [ ] **Itama ang `CAPSTONE_DEFENSE_GUIDE.md`**: ang mga sagot nito ay naglalarawan ng mga feature. Ngayon ay totoo na ang karamihan, pero i-update ang bilang ng unit tests (45) at ang pangalan ng mga status (Under Review, Hired).
- [ ] Hindi pa nasubukan nang buo sa totoong phone: interview at upload ng dokumento. Subukan ito bago ang defense.

## Mga limitasyon na dapat alam kapag tinanong
- Ang **layo** ay tantya mula sa address (hindi GPS), mula gitna ng isang lungsod hanggang gitna ng isa pa.
- Ang **match %** ay text similarity at lapit ng lokasyon, **hindi** posibilidad na tatanggapin ang applicant. Ang HR ang may huling pasya.
- Ang bahagi ng **ML** ay TF-IDF at Cosine Similarity na may dagdag na skill at title; hindi ito deep learning. Dahilan: kaya nitong ipaliwanag kung bakit.
- Ang **Hiring Velocity** ay tantya mula sa pormula, hindi garantiya.
