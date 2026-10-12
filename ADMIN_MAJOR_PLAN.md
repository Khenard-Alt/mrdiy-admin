# Admin Major Plan (MR.DIY Careers)

Kopya nito ay nasa `MrDIY/ADMIN_MAJOR_PLAN.md` din. Kung may babaguhin, baguhin sa dalawa.

Status: **Plano pa lang, wala pang naisusulat na code.**

Layunin: gawing buong HR system ang admin (hindi lang listahan ng applicants), at tiyaking bawat ginagawa sa admin ay may katapat na makikita ng applicant sa app.

---

## 0. Mga komento ng Panel (HUWAG KALIMUTAN)

Mula sa "Comments / Suggestions of the Panelist" (25/05/2026) para sa **"A Mobile-Based Recruitment System Using Machine Learning For Mr. D.I.Y."** (OLFU, College of Computer Studies, Antipolo City). Ang bawat feature sa ibaba ay dapat sumagot sa isa sa mga ito.

| # | Panelist | Komento | Kalagayan | Saan sa plano |
|---|---|---|---|---|
| 1 | Engr. Eliseo Francisco, MIT | Notification o status update pagkatapos mag-apply | **Tapos na:** bell sa app, notification sa tray, email (kailangan ng restart ng admin; push kapag nakasara ang app ay kailangan ng Firebase key) | NOTIFICATIONS_PLAN.md |
| 2 | Engr. Francisco | Mga hakbang na kailangan habang nag-a-apply hanggang makapagtrabaho | **Kulang:** pipeline na may timeline, interview, at checklist ng dokumento pagkatapos ma-hire | Seksyon 2C, 2D, 2I |
| 3 | Engr. Francisco | Notification o impormasyon kung gaano kabilis magsisimula ang applicant | **Kulang:** Hiring Velocity Estimator ("Estimated start: 2 - 4 business days") | CAPSTONE_ADVANCED_AI_PLANNING.md §2.1 |
| 4 | Engr. Francisco | Web-based (optional) | **Tapos na:** ang admin web (`mrdiy-admin`); lalawak pa sa plano | Buong dokumentong ito |
| 5 | Engr. Francisco | Humingi ng **formatted biodata** ng client kung available | **Kulang at wala pa sa anumang plano:** idinagdag sa 2K sa ibaba | Seksyon 2K (bago) |
| 6 | Michael Angelo Manalo, MIT | Improvements ng machine learning | **Bahagi pa lang:** naidagdag ang lapit ng lokasyon sa match score at ang paliwanag ng mga tumugmang salita. Kulang pa ang mga ito sa 2E. | Seksyon 2E |
| 7 | Manalo | Wastong **ranking system na may strengths at weaknesses** | **Kulang:** ang ranking ng mga applicant bawat job, na may listahan ng lakas at kulang na skills | Seksyon 2E at 2L (bago) |
| 8 | Manalo | **Automated AI explanation** ng resulta ng ranking | **Bahagi pa lang:** may mga salitang tumugma, pero walang pangungusap na paliwanag | AI plan §3, Seksyon 2E |

**Bagong dagdag na hindi pa nasa dating plano (mula sa komento 5, 7 at 8):**

- **2K. Formatted biodata:** isang pahina ng biodata ng applicant (pangalan, contact, address, edad kung ibibigay, edukasyon, karanasan, skills, larawan) na awtomatikong nabubuo mula sa profile, na maaaring i-**download bilang PDF** ng HR at i-print. Kasama ang opsyon na magdagdag ng mga field na hinihingi ng MR.DIY.
- **2L. Ranking ng mga applicant bawat job:** listahan na naka-rank mula pinakamataas ang match, na may ranggo (#1, #2…), **match %**, **mga lakas** at **mga kulang** bawat isa, at ang **paliwanag na pangungusap** (halimbawa: "Si [Pangalan] ay #2 na may 68% na match sa Cashier. Ang ranggong ito ay dahil sa 3 sa 5 kinakailangang skill (POS, cash handling, customer service) at 3 taong karanasan. Kulang siya sa: …").

---

## 1. Kalagayan ngayon (ano ang meron at ano ang kulang)

| Gawain | Sa app (applicant) | Sa admin (HR) ngayon | Kulang |
|---|---|---|---|
| Mga job | Makikita, hahanapin, i-filter ayon sa lugar | Add / edit / delete, pagination, responsibilities, requirements, benefits | Job type, category, level, bilang ng bakante, deadline, branch, draft/closed, duplicate |
| Mag-apply | One-tap apply | Listahan ng applications, search, filter ayon sa status | Queue, assignment, sorting ayon sa match %, layo |
| Profile | Larawan, skills, experience, education, about | Pangalan, contact, lugar, larawan, resume | Buong profile (education, experience, about), notes, tags |
| Resume | Upload at tingnan | Preview, text na may highlights, match % | Side-by-side na paghahambing ng candidates |
| Status | Under review, Accepted, Rejected | 4 na button (Pending, Reviewed, Approved, Rejected) | Shortlisted, Interview, Hired, On hold; kasaysayan ng bawat pagbabago |
| Interview | Wala | Wala | Buong feature (iskedyul, kumpirmasyon, kalendaryo) |
| Notifications | Bell, tray, email | Nagpapadala lang | Notifications para sa HR mismo |
| Messages | Chat sa HR | Messages page | Template na sagot, link sa application |
| Accounts | Isang account ng applicant | **Isang admin account lang** (`admin`) | Roles, maraming HR at branch managers |
| Analytics | Wala | Dashboard na kaunti ang bilang | Funnel, bawat branch, oras bago ma-hire |

### Mga problemang nakita na kailangang ayusin (hindi lang dagdag na feature)
- **Ang password ng admin ay naka-save at kinukumpara bilang plain text** (`app/api/login/route.ts`). Dapat i-hash ito (bcrypt o scrypt) at palitan ang kasalukuyan.
- Isang admin lang, kaya walang paraan para "magpasa" ng applicant dahil walang tatanggap.
- Walang tala kung **sino** ang nagpalit ng status at kailan (walang audit log).
- Walang limitasyon sa pagsubok mag-login, at ang session ay hindi mapapawalang-bisa.

---

## 2. Ang malalaking pagbabago

### A. Roles at maraming admin account
- **Super Admin:** namamahala ng mga account, branches, settings.
- **HR Officer:** nagsa-screen ng lahat ng applicants; maaaring magpasa sa branch.
- **Branch Manager:** nakakakita lang ng applicants ng sarili niyang branch; nagsasagawa ng interview at nagbibigay ng rekomendasyon.
- Pahina ng **Accounts** (gumawa, i-disable, i-reset ang password) para sa Super Admin.
- Ang bawat API ay susuri ng role (hindi lang kung naka-login).

**Status (2026-10-13): Tapos na at na-verify gamit ang totoong login per role.**

| Role | Jobs | Applications | Interviews | Messages | Accounts |
|---|---|---|---|---|---|
| Super Admin | Buo | Lahat | Lahat | Lahat | Manage |
| HR Officer | Buo | Lahat | Lahat | Lahat | ❌ walang access |
| Branch Manager | ❌ walang access | Sariling branch lang | Sariling branch lang | Sariling branch lang | ❌ walang access |

- `app/api/jobs/route.ts` + `app/api/jobs/duplicate/route.ts` — bawal nang dumaan ang `branch_manager` (403) sa GET/POST/PATCH/DELETE. Job postings ay trabaho ng HR Officer/Super Admin.
- `app/api/interviews/route.ts` — bago mag-GET/POST/PATCH, chinecheck muna kung ang `application.branch_id` ay tugma sa `session.branchId` ng branch manager.
- `app/api/messages/route.ts` — bago makapag-send ng mensahe, chinecheck kung ang applicant (receiver) ay may application sa sariling branch ng branch manager.
- `app/api/applications/route.ts` — existing na ito dati, narito lang ulit para sa kumpletong listahan.
- `components/Sidebar.tsx` — itinatago na ang "Jobs" at "Accounts" na link kung hindi pinapayagan ng role (client-side convenience lang; ang totoong proteksyon ay nasa API).

**Hindi pa ginagalaw/kasama:** `app/api/branches/route.ts` GET (listahan ng branches, kailangan pa rin ng lahat ng role para sa mga dropdown — mababang panganib, read-only).

### B. Pagpapasa ng applicant (hand-off)
Ang tinutukoy mong "magpapasahan." Ito ay mangyayari sa admin, at makikita rin ng applicant ang resulta.

- Bawat application ay may **may-hawak** (`assigned_to`) at **branch**.
- Mga aksyon: **Claim** (kunin), **Assign** (ipasa sa iba), **Return** (ibalik sa HR), at **Escalate** (sa mas mataas), na may **hand-off note**.
- Mga view: **My queue**, **Unassigned**, **All**, **From my branch**.
- **Awtomatikong ruta:** ang application ay napupunta sa branch manager ng branch ng job (ayon sa lokasyon ng job).
- **Proteksyon sa sabay na paggawa:** may nakasulat na "Currently handled by [pangalan]" para hindi magkagulo ang dalawang HR.
- **Kasaysayan:** bawat pasa ay naka-log (sino, kanino, kailan, bakit).
- **Notification para sa tatanggap** (admin bell), at para sa applicant: "Your application is now being handled by MR.DIY Pasig."

### C. Buong pipeline ng status
`Pending → Under Review → Shortlisted → Interview Scheduled → Hired`, at `Rejected` / `On Hold` / `Withdrawn` kahit saan.
- **Board view (kanban)** na may mga column bawat yugto, para madaling i-drag.
- Bawat paglipat ay may kasamang notification, email at tala sa kasaysayan.
- Ang "Approved" ngayon ay magiging **Hired**.

### D. Interview
- I-schedule: petsa, oras, lugar (default ang branch ng job) o online link, notes.
- I-reschedule at i-cancel, bawat isa ay may notification at email.
- **Kumpirmasyon ng applicant** (Confirm / Can't attend) at makikita ng admin ang sagot.
- **Kalendaryo** ng mga paparating na interview sa dashboard.
- Paalala sa applicant isang araw bago.

### E. Applicant 360 (kumpletong view ng applicant)
- Buong profile: about, education, experience, skills, larawan, resume.
- Match % na may paliwanag (Explainable AI) at mga lakas at kulang na skills.
- **Internal notes** (hindi nakikita ng applicant) at **tags**.
- **Paghahambing** ng 2 hanggang 3 applicants sa iisang job.
- Layo ng applicant sa branch.

### F. Jobs
- Job type, category, level, **bilang ng bakante**, **deadline**, **branch**.
- Status: Draft, Published, Closed (awtomatikong Closed kapag puno o lampas na ng deadline).
- **I-duplicate sa ibang branch** (isa sa mga pinaka-tipid sa oras).
- AI Job Description Generator (nasa AI plan).

### G. Analytics at ulat
- Funnel: ilan ang Applied, Shortlisted, Interviewed, Hired.
- Bawat branch, bawat job, pinakamaraming nag-apply, average na match score, average na araw bago ma-hire.
- **Export sa CSV.**

### H. Notifications at mensahe para sa admin
- Bell para sa HR: bagong application, sagot ng applicant, tumanggap ng hand-off, kinumpirma o tinanggihan ang interview.
- **Mga template** ng email at mensahe na maaaring baguhin.

### I. Pre-employment checklist (mula sa AI plan)
Pagkatapos ma-Hire: listahan ng dokumento (SSS, PhilHealth, Pag-IBIG, NBI, medical, TIN, contract) na maa-upload ng applicant at ma-verify ng HR.

### K. Formatted biodata (komento 5 ng panel)
Tingnan ang seksyon 0: biodata na awtomatikong nabubuo mula sa profile, na maaaring i-download bilang PDF.

### L. Ranking na may strengths at weaknesses (komento 6 hanggang 8 ng panel)
Tingnan ang seksyon 0: ranking ng mga applicant bawat job, na may lakas, kulang, at awtomatikong paliwanag na pangungusap.

### M. Bakante (openings) — display, hindi manual counter
Galing sa usapan noong 2026-10-12. Ang `openings` ay **target bilang** (hal. 5), at ang "filled" ay dapat **awtomatikong bilang** base sa applications na `Hired` para sa job na 'yon — ito na ang ginagawa ng `/api/jobs` ngayon (`lib/pipeline.ts`-style na logic sa loob mismo ng route), pero hindi pa ito ipinapakita sa UI.

- **Huwag** gawing manual na +/- button ang bakante — pwede itong hindi magtugma sa totoong bilang ng Hired kung may mag-a-adjust nang hindi dumadaan sa status change.
- Sa halip: idagdag ang column na **"Vacancy"** sa `/jobs` table, na nagpapakita ng `{filled} / {openings}` (hal. "3 / 5"), kinuha mula sa parehong Hired-count query na ginagamit na para sa auto-close.
- Idagdag din sa parehong column (o katabi) kung **bakit** closed ang isang job: "Filled" o "Deadline passed" — wala pa itong indicator ngayon.

### N. Contract-based na trabaho (4–6 buwan, karamihan minimum wage)
Kulang: walang field para sa tagal ng kontrata. Ang `job_type` ngayon ay `Full-time` / `Part-time` / `Contractual` lang, walang bilang ng buwan.

- Dagdag sa `jobs`: `contract_duration_months` (integer, null kung regular/walang katapusan).
- Dagdag sa `applications` (o bagong `employment_records` table, tingnan seksyon O): `contract_start_date`, `contract_end_date` — nabubuo kapag na-mark na `Hired` ang applicant (`contract_end_date` = `contract_start_date` + `contract_duration_months` ng job).
- Bagong status sa `STATUS_VALUES` (`lib/pipeline.ts`): `Contract Ended` — hiwalay sa `Rejected`, dahil natapos lang ang kontrata, hindi tinanggihan.
- Lalabas ito sa Applications table bilang bagong column o badge: "Contract: 5 mos (ends Mar 15, 2027)".
- **Paalala bago matapos** ang kontrata (hal. 14 araw bago ang `contract_end_date`): bagong admin alert (`admin_alerts`), katulad ng ginagawa na para sa interview reminders.

### O. Valid ID + requirements sa PROFILE level, hindi gate (desisyon 2026-10-12, Sprint 7 — admin web)
**Binago ang direksyon:** sa halip na i-require ang valid ID bago makapag-apply (gate), ang desisyon ay ilagay ang Valid ID **at** lahat ng pre-employment requirements sa **profile/account level** ng applicant — isang beses lang i-upload, optional/nullable, hindi bina-block ang pag-apply. Pagka-apply ng applicant sa kahit anong job, makikita na agad ng admin sa review panel kung ano na ang na-submit at na-verify, kahit hindi pa Hired.

**Tapos na (admin web side):**
- Bagong table **`public.applicant_documents`** (`202610120010_profile_documents.sql`): `user_id`, `document_name`, `status` (Pending/Uploaded/Verified/Rejected), `document_url`, `remarks` — `unique(user_id, document_name)`, lahat optional/nullable.
- Listahan ng document types (`lib/pipeline.ts`, `PROFILE_DOCUMENTS`): "Valid ID (with signature)" + lahat ng `PRE_EMPLOYMENT_REQUIREMENTS` (SSS, PhilHealth, Pag-IBIG, NBI, medical, TIN, Signed Employment Contract).
- Bagong Storage bucket **`applicant-documents`** (private, `{user_id}/{filename}`).
- `app/api/applicant-documents/route.ts`: GET (buong listahan per user, may "Not submitted" placeholder kung wala pa) at PATCH (Verify/Reject, may remarks, nag-aalert sa applicant) — parehong pattern ng existing `/api/requirements`.
- `app/applications/ProfileDocumentsPanel.tsx`: bagong panel sa Application detail, **laging nakikita** (hindi lang pag Hired, di gaya ng existing post-hire `RequirementsPanel`).

**Digital signature:** hindi hiwalay na field — bahagi ito ng "Signed Employment Contract" item sa parehong listahan (upload ng naka-scan na pirmadong kontrata). Totoong in-app signature pad (hindi lang upload ng larawan) ay **Android app work pa** — tingnan sa ibaba.

**Hindi pa ginawa, susunod na hakbang (Android app, `mrdiyreact`):**
1. Profile/Account screen: seksyon para i-upload ang Valid ID + mga requirement, kahit kailan, optional.
2. Walang gate sa Apply flow — pwede pa ring mag-apply kahit wala pang na-upload.
3. (Panukala ni Michael, kaugnay ng AI) Profile completeness/passing-rate percentage — hiwalay na feature, konektado sa AI planning doc, hindi pa saklaw nito.
4. Totoong e-signature capture (signature pad) para sa Signed Employment Contract, kapalit ng plain file upload.

**Hindi ginalaw:** ang existing post-hire `pre_employment_requirements` + `RequirementsPanel.tsx` (per-application, nag-start lang pagka-Hired) ay nananatiling hiwalay — dalawang sistema muna ito (profile-level docs na laging bukas, at post-hire checklist na specific sa isang trabaho). Pwedeng pagsamahin sa hinaharap kung kailangan (hal. i-prefill ang post-hire checklist mula sa mga verified na profile documents).

### P. Digital signature para sa contract — PLANO PA LANG, hindi pa code (desisyon 2026-10-13)

Hiningi: pagpirma sa contract gamit ang mouse (canvas, parang totoong pirma) sa admin web, may optional USB hardware signature pad support, at dapat makita ng Branch Manager ang listahan ng mga contract nila (start/end dates).

**Research muna bago gawin — buod:**

1. **Sino talaga ang pumipirma sa totoong proseso (general HR pattern, walang retail-specific o Pilipinas-specific na source na nakita):**
   - **HR ang nag-aari ng contract at ng record** nito — sila ang gumagawa/nag-aapruba ng content
   - **Manager (sa atin: Branch Manager) ang nag-countersign/approve** — "Signing Manager" role sa ibang HR systems
   - **Empleyado (applicant) ang huling pumipirma**, karaniwang parehong workflow/order
   - Payo ng isang e-signature vendor: **role-based routing** (HR → Manager → Legal kung kailangan), at dapat magkasama ang nalagdaang kontrata at ang audit trail nito
   - **Walang nahanap na retail-specific o Pilipinas-specific source** — ito ay general pattern lang, dapat kumpirmahin sa totoong patakaran ng MR.DIY/batas sa paggawa ng Pilipinas (Labor Code) kung may partikular na kailangan

2. **Canvas-based na pirma gamit ang mouse (totoong gagawin muna):**
   - Native HTML5 `<canvas>` + mouse/touch events — **kaya nang gawin nang walang external library**, katulad ng ginawa na ng ibang simpleng implementasyon (hal. ServiceNow widget)
   - Pwede ring gamitin ang `signature_pad` library (szimek) kung gusto ng mas makinis na stroke (Bézier curve interpolation) — maliit lang, walang dependency
   - I-save bilang PNG (`canvas.toDataURL()`) papunta sa Supabase Storage, parehong pattern ng ibang uploads natin

3. **USB hardware signature pad (hal. Topaz, StepOver, signotec) — MAHIRAP, hindi basta-basta:**
   - **Hindi kayang direktang i-access ng browser ang USB device** — kailangan ng **local na driver/helper software** na i-install sa computer (Topaz: browser API driver; StepOver: Java applet na kausap sa localhost WebSocket; signotec: sariling Web API install)
   - Karaniwang kailangan ng **admin rights** para i-install, at pwedeng ma-block ng antivirus
   - **Hindi suportado sa Safari** ang Topaz; iba-iba ang browser support ng bawat vendor
   - **Rekomendasyon:** huwag munang ituloy ang USB hardware support — masyadong komplikado, kailangan pa ng bibilhing hardware + vendor SDK, at maintenance burden. Ang **mouse/touchscreen canvas ay sapat na** para sa capstone scope. Puwede itong idagdag sa "future work" ng paper kung kailangan ng totoong hardware integration balang araw.

**Plano ng disenyo (hindi pa code):**

- **Sino pipirma dito sa admin web:** ang **Branch Manager** (bilang "Signing Manager" / countersignatory), hindi ang applicant — ang pirma ng applicant ay nasa **Android app** (separate work, Sprint 7 Android side, tingnan Seksyon O).
- **Saan lalabas ang Sign button:** sa application detail, kapag `status = Hired` **AT** may `contract_end_date` (ibig sabihin Contractual ang trabaho) — bagong "Sign Contract" button/panel, bubukas ng canvas signature pad.
- **Bagong DB fields (`applications` o bagong `contract_signatures` table):** `manager_signature_url`, `manager_signed_at`, `manager_signed_by` (admin id).
- **Bagong "My Contracts" view para sa Branch Manager:** listahan ng lahat ng Hired applicants nila na may `contract_start_date`/`contract_end_date`, may countdown ("25 araw na lang"), naka-sort ayon sa pinakamalapit nang matatapos — gamit ang parehong datos na ginawa na natin sa Sprint 6, display na lang ang kailangan.

**Desisyon (2026-10-13):**
1. **Required ang pirma ng Branch Manager** — hindi pwedeng isara/i-finalize ang "Hired" process kung walang pirma.
2. Bagong page: **`/contracts`** (o pangalang katumbas — pinal na pangalan TBD), para sa Branch Manager, dahil sila ang may-hawak ng employee record. (Supervisors pwede ring mag-interview sa totoong buhay, pero walang hiwalay na account/role para sa kanila — Branch Manager pa rin ang gumagawa nito sa system.)
3. **Pagkatapos ng contract, may "release"** — ito ay ang existing **"Contract Ended" status** na (Sprint 6, `lib/pipeline.ts`), kumpirmado tamang tawag.
4. Suportado na: **may jobs na walang contract span** (regular mula simula) — `contract_duration_months` ay nullable na.

**⚠️ MAHALAGANG LEGAL FLAG — hindi gagawin (research 2026-10-13):**

Tinanong kung dapat magkaroon ng "ilang buwan bago pwedeng mag-apply ulit" (cooldown) — **hindi ito gagawin**, dahil ito mismo ang tinatawag na **"5-5-5" scheme**, isang **ilegal na labor practice** sa Pilipinas (contractualization/"endo"):

- Sa ilalim ng Labor Code, **6 na buwan (180 araw) ang max na probationary period** — pagkatapos nito, **automatic na "regular" na ang empleyado "by operation of law,"** kahit hindi pa opisyal na na-regularize
- Ang "5-5-5"/endo scheme ay: tanggalin ang empleyado bago mag-6 buwan, hintayin, ibalik sa trabaho sa ibang short-term contract — **ginagawa ito para iwasan ang regularization**
- Sa *Umali v. Hobbywing Solutions* (G.R. 221356, 2018), kinilala ng Korte Suprema na ang paggamit ng successive short contracts para iwasan ang regularization ay **hindi pinapayagan**, kahit may "gap"
- Walang opisyal na DOLE "cooling-off period" bago pwedeng mag-rehire — ang buong ideya ng "maghintay bago papasukin ulit" ay **mismong ang ilegal na practice**

**Sa halip, compliance safety net ang gagawin (hindi loophole):**
- I-track ang **cumulative days** na nagtrabaho ang isang applicant sa MR.DIY (kahit maraming hiwalay na contract stints, pinagsama-sama)
- Kapag papalapit na sa **180 araw** → admin alert sa HR: *"Approaching regularization threshold — decide: regularize or do not re-engage"* — tapat na desisyon na kailangang gawin, hindi pagtatago mula sa batas

**Huling desisyon (2026-10-13):**
1. **Required munang ma-scroll/mabasa** ang buong contract text bago lumabas ang pirmahan — "I agree" pattern, scroll-to-bottom bago mag-enable ang Sign button.
2. Pangalan ng bagong page: **`/employees`** — mas malawak, dahil hawak ng Branch Manager ang buong employee record (hindi lang ang contract document mismo).

**Status: Tapos na ang code + na-verify live (2026-10-13).** `supabase/migrations/202610130003_contract_signature.sql`, `app/api/applications/sign-contract/route.ts`, `app/applications/ContractSignaturePanel.tsx`, `app/api/employees/route.ts`, `app/employees/page.tsx`. Na-test nang totoo: na-Hire sa Contractual job, na-compute ang contract dates, na-pirmahan, lumabas sa `/employees` na may tamang `signed: true`, naka-block ang double-sign, at tama ang branch-scoping.

### Q. Resignation / Termination — PLANO PA LANG, hindi pa code (research 2026-10-13)

Hiningi: i-check kung paano ang proseso para sa mga empleyadong **mag-re-resign** (hindi end-of-contract) — may naaalala ang ibang kumpanya na 1-2 linggong notice bago "ma-approve" ang pagtigil.

**Resulta ng research:**

- **30 araw ang legal na default na notice** (Labor Code, Article 300/dating 285), hindi 1-2 linggo — pero **pwedeng paikliin kung tatanggapin ng employer** ("acceptance of a shorter notice is a waiver of the balance"). Walang opisyal na "2-week rule" sa batas mismo; kung ganito ang practice ng isang kumpanya, desisyon lang 'yon nila, hindi legal requirement.
- **Resignation ay karapatan ng empleyado, hindi hiling na "inaaprubahan"** ng employer — ang "pag-apruba" ay tungkol lang sa **pagtanggap ng mas maikling notice** (waiver), hindi sa pagpayag na pwede silang mag-resign.
- **Just causes** (5 dahilan: pang-aabuso, krimen, atbp.) — pinapayagan ang **immediate resignation**, walang kailangang notice period.
- **Final pay:** dapat mailabas sa loob ng **30 araw** mula sa huling araw o pagkatapos ng clearance, alinman ang mauna.
- **Clearance** (pagbabalik ng ID/uniform/assets): hindi pwedeng gamitin para i-delay nang walang hangganan ang final pay.
- **Certificate of Employment:** kailangang ilabas sa loob ng **3 araw** mula sa hiling.

**Panukalang disenyo (hindi pa code):**

- Bagong status, hiwalay sa "Contract Ended" (na para sa pagtatapos ng FIXED-TERM contract): **"Resigned"** — para sa boluntaryong pag-alis, kahit regular o contractual pa ang empleyado.
- Bagong fields: `resignation_date` (petsa ng abiso), `last_working_day` (default = resignation_date + 30 araw, puwedeng paikliin ng HR/Branch Manager na may note — "accepted shorter notice"), `clearance_completed_at`, `final_pay_released_at`.
- **Compliance alert** (parehong pattern ng 180-day regularization alert sa Seksyon P): kapag lumagpas na sa 30 araw mula `last_working_day` o `clearance_completed_at` nang hindi pa naka-release ang final pay → admin_alert sa HR, dahil may legal deadline ito.
- Checklist ng clearance (pwedeng muling gamitin ang pattern ng `pre_employment_requirements`/`RequirementsPanel`, pero "exit checklist" sa halip na "entry checklist").

**Desisyon (2026-10-13):**
1. **Automatic na i-compute** ang `last_working_day` = `resignation_date` + 30 araw (default), puwedeng i-edit ng HR/Branch Manager kung tinanggap nila ang mas maikling notice (parehong pattern ng contract-dates computation sa Seksyon P).
2. **Kasama na agad ang clearance checklist** sa unang bersyon — bagong "exit checklist" table (parehong pattern ng `pre_employment_requirements`, pero exit items: ID, uniform, company assets, atbp.), may sariling panel gaya ng `RequirementsPanel.tsx`.

**Desisyon:**
3. **Admin-side entry lang muna** — HR/Branch Manager ang nagta-type ng resignation details, hindi kailangan ng Android app changes para dito.

**Status: Tapos na ang code (2026-10-13), hindi pa na-verify live.** Migration: `202610130004_resignation.sql`. Bagong status `Resigned` (`lib/pipeline.ts`), `app/api/applications/resign/route.ts`, `app/api/exit-checklist/route.ts`, `app/applications/ResignationPanel.tsx`, `app/applications/ExitChecklistPanel.tsx`, final-pay button + 30-day overdue compliance alert sa `app/api/applications/route.ts`.

**Follow-up gap na natuklasan (2026-10-13) — "incomplete notice" / AWOL habang nag-aabiso:**

Tanong: paano kung hindi tinapos ng empleyado ang 30-araw na notice (tumigil nang maaga), pero may final pay pa ring inaantay — paano ito mare-reflect?

- **Dalawang magkaibang petsa kailangan:** `last_working_day` (PLANNED, 30-araw default) vs. `actual_last_day` (TOTOONG huling araw na pumasok, null hanggang i-confirm ng HR).
- **Walang automatic na parusa/bawas sa sahod** — tanda lang ang "Incomplete notice" flag, desisyon pa rin ng HR/Legal kung may babawasing claim (tugma sa research: hindi automatic forfeiture, kailangang i-prove/i-quantify ng employer).
- **Ang 30-araw na final-pay deadline ay dapat mula sa ACTUAL last day** kapag alam na ito (mas maaga kaysa planned kung AWOL) — kung hindi pa alam, planned muna ang gagamitin bilang tantiya.
- **Status: Tapos na ang code (2026-10-13), hindi pa na-verify live.** Migration: `202610130005_actual_last_day.sql`. Bagong column `actual_last_day`, bagong "Confirm actual last day" button + "Incomplete notice — stopped N day(s) early" badge sa `app/applications/page.tsx`, na-update ang `remindFinalPayOverdue` sa `app/api/applications/route.ts` para gamitin ang `actual_last_day ?? last_working_day`.

### J. Seguridad at audit
- Password hashing, limit sa maling login, session na mapapawalang-bisa.
- **Audit log:** lahat ng mahalagang aksyon (status, hand-off, delete, account).

---

## 3. Ano ang kailangang gayahin sa app ng applicant

| Sa admin | Katapat sa app |
|---|---|
| Buong pipeline | **Timeline ng application** (Submitted → Under Review → Shortlisted → Interview → Hired) sa detalye ng application |
| Hand-off sa branch | Notification at linya sa application: "Handled by MR.DIY Pasig" |
| Interview | **Interview card** (petsa, oras, lugar), pindutang **Confirm** at **Can't attend**, paalala sa tray |
| Hired | Checklist ng dokumento na maa-upload |
| Closed / puno na ang job | "No longer accepting applications" sa job; hindi na pwedeng mag-apply |
| Maraming branch at manager | Pangalan ng branch at contact sa job at application |
| Withdrawn | Pindutang **Withdraw application** sa app |
| Template at mensahe | Chat sa HR (meron na), na may link papunta sa application |
| Bagong job type, category, level, bakante, deadline | Lumalabas sa job card at filter |

---

## 4. Mga bagong table (balangkas)

- `admin_users` (dagdagan): `email`, `role`, `branch_id`, `password_hash`, `is_active`
- `branches`: `id`, `name`, `location`, `manager_id`
- `applications` (dagdagan): `assigned_to`, `branch_id`, `stage`, `stage_changed_at`
- `application_events`: `application_id`, `actor_id`, `type` (status, assign, note, interview…), `detail`, `created_at` (audit at kasaysayan)
- `application_notes`: `application_id`, `author_id`, `body`, `created_at`
- `interviews`: `application_id`, `scheduled_at`, `venue`, `mode`, `notes`, `status`, `applicant_response`
- `admin_alerts`: `admin_id`, `type`, `title`, `message`, `application_id`, `is_read`, `created_at`
- `jobs` (dagdagan): `branch_id`, `openings`, `deadline`, `contract_duration_months` (bago, seksyon N)
- `applications` (dagdagan pa, seksyon N at O): `contract_start_date`, `contract_end_date`, `valid_id_url`, `valid_id_status`, `valid_id_verified_at`, `valid_id_verified_by`
- `email_templates`: `key`, `subject`, `body`
- `pre_employment_requirements` (nasa AI plan)
- Storage bucket na bago: `application-ids` (seksyon O)

---

## 5. Pagkakasunod-sunod na mungkahi

| Yugto | Laman | Laki |
|---|---|---|
| 1 | Seguridad (password hash), **Accounts at roles**, branches | M |
| 2 | **Hand-off / assignment** na may queue at kasaysayan, audit log | L |
| 3 | **Pipeline (status) + board view**, timeline sa app | M |
| 4 | **Interview** (admin + app + notification + email) | L |
| 5 | **Applicant 360**, **ranking na may strengths at weaknesses at paliwanag** (2L), at **formatted biodata na PDF** (2K) | L |
| 6 | **Jobs** (bakante, deadline, branch, duplicate), AI description | M |
| 7 | **Analytics** at CSV, admin notifications | M |
| 8 | Pre-employment checklist, hiring velocity | M |
| 9 | **Vacancy display** (seksyon M — mabilis, display lang, walang bagong table) | S |
| 10 | **Contract-based na trabaho + end-of-contract** (seksyon N) | M |
| 11 | **Valid ID + signature bago mag-apply** (seksyon O — kasama Android app) | L |

Mungkahing **minimum para sa defense:** Yugto 1 hanggang 4 **at ang bahagi ng Yugto 5 na sumasagot sa panel (2K at 2L, komento 5 hanggang 8)**; ang timeline at checklist ng dokumento ay sumasagot sa komento 2, at ang hiring velocity sa komento 3. Ang Yugto 1 hanggang 4, dahil ito ang nagpapakita ng buong daloy: maraming HR, hand-off sa branch, pipeline at interview, na may katapat sa app.

---

## 6. Mga tanong na kailangang sagutin bago magsimula
1. Anong mga role ang gusto mo talaga (HR Officer at Branch Manager lang, o may iba pa)?
2. Sa demo, ilang admin account ang ipapakita (halimbawa 1 HR at 2 branch managers)?
3. Ang branch ba ay ayon sa lokasyon ng job (halimbawa "SM City Taytay")? Gagawa tayo ng listahan ng branches mula sa mga job na meron.
4. Ang "Approved" ba ay papalitan ng "Hired" at idadagdag ang Shortlisted at Interview Scheduled?
5. Dapat bang makita ng applicant kung sinong branch o tao ang humahawak ng application niya?
6. Para sa seksyon N: lahat ba ng Contractual job ay may fixed na tagal (4-6 buwan), o may ibang contract type pa (hal. project-based, walang end date)?
7. Para sa seksyon O: kailangan ba talaga ng valid ID **bago** makapag-submit ng application (gate sa mobile app), o okay lang muna na requirement ito pagkatapos ma-shortlist/ma-interview (mas magaan gawin, admin-side lang)?
8. Gagamitin lang ba ang valid ID bilang patunay ng pagkatao (ID verification), o kasama rin dapat itong basehan ng "pirma" sa employment contract mismo (dalawang magkaibang layunin na pwedeng magkahiwalay na hakbang)?
