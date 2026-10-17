# MY DISCIPLINE OS — MVP Awamu ya 1

Programu ya browser inayotumia HTML5, CSS3 na Vanilla JavaScript. Data inahifadhiwa kwenye LocalStorage ikiwa local, na inaweza kusawazishwa kwenye Supabase ukisanidi cloud. Interface ni Kiswahili na imeundwa kwa simu na kompyuta.

## Kile kinachofanya kazi katika MVP hii

- Dashboard: kazi za leo, progress, XP, focus time, kazi inayofuata, MIT na ratiba.
- Tasks: kuongeza, kuhariri, kufuta, kuchuja, kuweka status, deadline, priority, muda, MIT na subtasks.
- Ratiba: day view, calendar ya mwezi, kuhariri/kufuta shughuli, status na onyo la vipindi vinavyogongana. Mfumo hauhamishi vipindi kimyakimya.
- Focus Mode: chagua 25, 45, 60, 90 au muda maalum wa dakika 1–360 (hadi saa 6); pause/resume, reset, alarm inayojirudia hadi uisimamishe, na arifa ya browser ukiruhusu.
- Miradi: kuongeza/kuhariri/kufuta, progress, deadline, active project mmoja na backlog.
- Masomo: subjects, study sessions, reflection baada ya kusoma na flashcards.
- Biashara: kurekodi oda/mapato/gharama kwa TZS.
- Tathmini: daily review, weekly review inayotumia takwimu zilizohifadhiwa.
- Settings: muda wa kuamka/kulala, milo, Pomodoro, malengo na theme. Muda wa Focus uliochagua huhifadhiwa kiotomatiki.
- Backup: JSON export/import yenye ukaguzi wa muundo; CSV export ya tasks na reports.
- PWA/service worker kwa offline cache katika hosting ya HTTP/HTTPS.
- Responsive kwenye simu na kompyuta; manifest ina app icon kwa kuongeza kwenye home screen ukiihostisha kwa HTTPS.
- Supabase email/password login na cloud sync ya workspace nzima, baada ya kuweka Project URL/Publishable key na kuendesha SQL ya RLS.

## Kuendesha kwenye kompyuta

### Njia rahisi
Fungua `index.html` kwenye browser. Vipengele vya msingi na LocalStorage hufanya kazi, lakini service worker/PWA haitapatikana kwa uhakika kwenye `file://`.

### Njia inayopendekezwa
Kama una Python 3:
```bash
cd my_discipline_os
python -m http.server 8000
```
Fungua `http://localhost:8000` kwenye browser.

Unaweza pia kutumia VS Code Live Server. Kwa PWA na service worker kwenye hosting, tumia HTTPS (au localhost wakati wa maendeleo).

## Faili
- `index.html` — muundo wa programu.
- `styles.css` — responsive UI na light/dark theme.
- `app.js` — application logic, LocalStorage, forms, timer, export/import.
- `manifest.webmanifest` — taarifa za PWA.
- `sw.js` — cache ya offline.

## Data na faragha
Bila cloud config, data inahifadhiwa ndani ya browser kupitia LocalStorage na haijasawazishwa. Ukiweka Supabase, data ina nakala ya ndani na cloud; Realtime huleta mabadiliko ya kifaa kingine, na hali ya offline huhifadhi mabadiliko kwenye kifaa mpaka internet irudi. Export JSON mara kwa mara na hifadhi backup mahali salama.

## Kuwasha cloud login na sync
1. Fuata `MWONGOZO-KISWAHILI.txt` kwa hatua za Supabase na hosting ya HTTPS.
2. Endesha `supabase-schema.sql` kwenye Supabase SQL Editor. Jedwali lina RLS na kila user anaruhusiwa kwenye row yake pekee.
3. Weka Project URL na Publishable key ndani ya `cloud-config.js`. Usitumie `secret` au `service_role` key kwenye browser.
4. Hosted app itaanza na email/password login. Ikiwa data ya browser na cloud zinatofautiana, app itauliza ipi itumike.
5. Supabase JS hupakiwa kutoka CDN; internet inahitajika kwa login na sync. Data huhifadhiwa pia kwenye browser na mabadiliko ya offline husawazishwa ukirudi online.

## Mipaka inayojulikana
- Browser notifications zinahitaji ruhusa na hutegemea browser/kifaa. Reminders za MVP ni best-effort wakati ukurasa uko wazi; hazihakikishwi browser/app ikiwa imefungwa.
- Alarm ya Focus inategemea sauti ya kifaa na browser inayoruhusu Web Audio. Timer na arifa za mwisho hufanya kazi ukurasa ukiwa wazi; browser au kifaa kikifungwa/kulala, browser inaweza kuchelewesha countdown/arifa. Kwa ruhusa za notifications tumia `http://localhost` au tovuti ya HTTPS; `file://` ina vizuizi.
- Website haiwezi kuzuia TikTok, Instagram au app nyingine moja kwa moja.
- Takwimu za biashara huingizwa kwa mkono; hakuna muunganisho rasmi wa Halotel au mfumo wa malipo.
- Cloud sync inahitaji Supabase URL/key, SQL setup na HTTPS hosting; template hii haina credentials au hosting.
- Supabase JS inatumika kutoka CDN, kwa hiyo login/cloud sync inahitaji internet. Local-only mode bado inafanya kazi bila cloud configuration.
- Charts za kina, spaced repetition iliyopangwa kiotomatiki, repeated schedule rules na full exam-day planner ni kazi za awamu zinazofuata.
- Google Fonts hutumika ikiwa mtandao upo; fallback font bado inafanya kazi offline.

## Mpango wa awamu zinazofuata
1. Awamu ya 2: study system iliyopanuliwa, spaced repetition, flashcard review scheduler, focus/reminders.
2. Awamu ya 3: project milestones, biashara na reports zilizo pana.
3. Awamu ya 4: XP/levels/streaks na weekly insights zaidi.
4. Awamu ya 5: PWA polish, icons, tests na usability checks.

## QA ya awali
Nimejenga interactions kuu katika JavaScript na kuweka uthibitisho wa forms, confirmation kabla ya kufuta/reset, validation ya import, na detection ya ratiba zinazogongana. Kwa sababu mazingira ya kutengeneza mafaili haya si browser halisi ya mtumiaji, fanya majaribio ya mwisho kwenye browser yako kwa kufuata checklist iliyo kwenye `QA-CHECKLIST.md`.
