# Notifications Plan (MR.DIY Careers)

Nakasulat din ang kopya nito sa admin project (`mrdiyreact-admin/mrdiy-admin/NOTIFICATIONS_PLAN.md`). Kung may babaguhin, baguhin sa dalawa.

Status: **Plano pa lang, wala pang naisusulat na code.**

## Ano ang meron na ngayon

| Bahagi | Kalagayan |
|---|---|
| `alerts` table sa Supabase | May mga column (`user_id`, `type`, `title`, `message`, `is_read`, `job_id`) at nababasa na ng app. **Walang nagsusulat dito**, kaya laging "No notifications yet." |
| Pagbabago ng status ng application | Nagpapadala lang ng **message**. Walang notification at walang email. |
| Push sa phone | May Firebase at `supabase/functions/send-push`, pero **hindi gumagana**: wala ang `push_tokens` table sa database (`push_token_register failed` sa log). |
| Bilang ng hindi pa nababasa sa kampana | Walang laman (`MainActivity.markAlertsRead()` ay walang ginagawa). |
| Oras ng notification | Naka-text na "Just now" (`time_ago`), kaya hindi nagbabago habang tumatagal. |

## Mga Bahagi

### Bahagi 1: Database at pag-save per user
- [ ] Idagdag ang `created_at timestamptz default now()` sa `alerts`; ang oras sa app ay kukuwentahin mula rito ("5m ago", "2d ago").
- [ ] Policy: ang user ay makakabasa, makaka-mark as read, at makakaburan ng **sariling** notification lang. Ang admin (service role) lang ang nagsusulat.
- [ ] Mga uri (`type`): `NEW_JOB`, `NEARBY_JOB`, `JOB_MATCH`, `APPLICATION_UPDATE`, `MESSAGE`, `SYSTEM`.
- [ ] Bagong SQL migration sa `supabase/migrations/` (kailangang i-run sa Supabase SQL Editor).

### Bahagi 2: Kailan magse-send
| Pangyayari | Sino ang makakatanggap | Halimbawa |
|---|---|---|
| Bagong job na published | Lahat ng applicant | "New job: Cashier sa SM City Taytay" |
| Malapit ang branch (sa loob ng radius) | Ang malapit lang; **ipapalit** sa karaniwang bago, kaya walang doble | "New job near you, ~4 km: Cashier" |
| Mataas ang match ng profile sa bagong job | Ang may match na 50% pataas | "Matches your profile (68%)" |
| Reviewed / Approved / Rejected | Ang applicant na iyon | "Your application was reviewed" |
| Bagong message mula sa HR | Ang applicant na iyon | "New message from MR.DIY HR" |
| Nag-apply na | Ang applicant | "Application received" |
| Paalala | Halimbawa walang resume o kulang ang profile | "Add your resume to improve matches" |

- [ ] Admin: kapag nag-publish ng job (bagong job, o draft na naging published), gagawa ng notification para sa bawat applicant.
- [ ] Admin: kapag nagpalit ng status ang application, gagawa ng notification (kasabay ng message na ginagawa na).
- [ ] Ang pagkuwenta ng "malapit" ay gagamit ng parehong listahan ng lungsod sa `LocationDistance.kt` ng app, na ilalagay din sa admin (`lib/location.ts`). Ang "match" ay gagamit ng `lib/matching.ts` na meron na.
- [ ] App: pulang bilang ng hindi pa nababasa sa kampana; mawawala kapag binuksan ang notifications.
- [ ] App: kapag pinindot ang notification, dadalhin sa job, application o messages (ayon sa `type`).

### Bahagi 3: Email (admin)
- [ ] Ipapadala rin sa email ng applicant ang Reviewed, Approved at Rejected, gamit ang Gmail SMTP (`nodemailer`).
- [ ] Ang mga password ay sa `.env.local` ng admin lang. Hindi dapat nasa app o sa git.
- [ ] Kailangan: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` sa `.env.local`.

### Bahagi 4: Notification sa loob ng phone (tray)
- [ ] Gawin ang `push_tokens` table (`user_id`, `token`, `updated_at`) na may policy per user.
- [ ] Ayusin ang `PushTokenRegistrar` para mairehistro ang token pagka-login at maalis pagka-logout (per user).
- [ ] I-deploy ang `send-push` function at i-hook sa pag-insert ng `alerts`, para may banner at tunog kahit nakasara ang app.
- [ ] Kailangan: **Firebase service account key** (Firebase Console, Project settings, Service accounts) na ilalagay sa Supabase function secrets.

### Opsyonal (para mas malawak)
- [ ] Settings kung anong notification ang gusto (halimbawa patayin ang "nearby").
- [ ] I-group ang listahan: Today, Yesterday, Earlier.
- [ ] Mark all as read at burahin ang notification.

## Mga desisyon

| Tanong | Mungkahi |
|---|---|
| Radius ng "malapit" | 15 km (sa Angono: Taytay, Cainta, Antipolo, Pasig) |
| Sino ang makakatanggap ng bagong job | Lahat ng applicant, pero iba ang mensahe ng malapit |
| Anong match % ang may notification | 50% pataas |

## Pagkakasunod-sunod na mungkahi
1. **Bahagi 1 at 2** muna: walang bagong susi na kailangan, at ito ang makikita agad sa defense.
2. **Bahagi 3 (email)** pagkalagay ng SMTP sa `.env.local`.
3. **Bahagi 4 (push)** pagkakuha ng Firebase service account key.

## Mga paalala
- Palitan ang Gmail app password at ang database password na na-paste sa chat, dahil nakita na ang mga ito sa usapan.
- Ang SQL migrations ay kailangang i-run mo mismo sa Supabase SQL Editor. Hindi kayang gawin ng Claude ang pagbabago sa istruktura ng database.
