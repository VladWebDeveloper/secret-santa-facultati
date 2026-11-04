# 🎁 Secret Santa Campus

Aplicație web în limba română pentru un Secret Santa între facultăți, cu înscrieri autentificate prin email, wishlist privat, repartizare sigură și administrare a evenimentului.

## Ce face

- Înscriere cu nume, universitate, facultate, email, wishlist și cadouri de evitat.
- Autentificare fără parolă (magic link prin Supabase Auth).
- Un singur participant per cont de email; pot exista mai mulți participanți din aceeași facultate.
- Extragere atomică **o singură dată**, declanșată de organizator **după închiderea înscrierilor**.
- Fiecare participant oferă un cadou unei alte persoane, fără duplicate și fără autoatribuire.
- Maximizează potrivirile între facultăți. Dacă o facultate are peste jumătate din înscriși, unele perechi din aceeași facultate sunt matematic inevitabile.
- Fiecare participant vede **numai** persoana proprie extrasă și wishlistul acesteia. Organizatorii văd lista și progresul cadourilor, dar interfața lor nu dezvăluie repartizările.
- Organizatorii setează data și locul întâlnirii, închid înscrierile și pornesc extragerea.
- Suma minimă: **100 MDL**.
- Interfață responsive pentru telefon și desktop.

## Vezi designul imediat

Deschide `index.html` printr-un server local (`python3 -m http.server 4173`), apoi vizitează `http://localhost:4173`. Fără configurare, aplicația pornește în **MOD DEMO**, folosind date fictive salvate doar în browser. Datele demo **nu sunt partajate** și nu reprezintă înscrieri reale.

## Configurează o aplicație REALĂ, cu înscrieri partajate

1. Creează un proiect Supabase (plan gratuit este suficient pentru un eveniment mic).
2. În **SQL Editor**, rulează `supabase/schema.sql` integral. Scriptul activează RLS, protejează datele personale și instalează toate funcțiile de înscriere și extragere.
3. În **Authentication → Providers → Email**, asigură-te că autentificarea prin email este activă. Configurează SMTP propriu pentru mai multe înscrieri; trimiterea implicită Supabase are limite.
4. În **Authentication → URL Configuration**, adaugă URL-ul final GitHub Pages la **Site URL** și **Redirect URLs** (de exemplu `https://UTILIZATOR.github.io/secret-santa-facultati/`).
5. În `config.js`, completează `SUPABASE_URL` și cheia **publishable/anon** din **Project Settings → API Keys**. Aceste valori sunt destinate frontendului. **NU pune cheia `service_role`, `secret` sau parole aici!**
6. Încarcă fișierele într-un repo GitHub complet separat de alte site-uri. În GitHub → repo → **Settings → Pages** alege `Deploy from a branch`, `main`, `/ (root)`. Aplicația se va publica pe `https://UTILIZATOR.github.io/secret-santa-facultati/`.
7. Intră o dată cu emailul organizatorului, apoi execută în **SQL Editor** (înlocuiește adresa):

```sql
insert into public.admins(user_id)
select id from auth.users where lower(email) = lower('organizator@universitate.md')
on conflict (user_id) do nothing;
```

8. Reîncarcă pagina și autentifică-te: acum ai panoul de organizator.

**Important:** cheia publică Supabase se poate publica în repo, dar securitatea datelor depinde de politicile RLS și de funcțiile SQL din proiect; nu dezactiva RLS. Un utilizator normal nu poate declanșa extragerea sau citi identitatea destinatarilor celorlalți.

## Fluxul evenimentului

**Înscrieri deschise** → studenții se autentifică și completează profilul → **organizatorul închide înscrierile** → **pornește extragerea** → studenții se autentifică și văd persoana extrasă → marchează cadoul drept pregătit → schimb de cadouri.

Extragerea nu se face individual la fiecare înscriere deoarece acel mecanism poate lăsa ultimul student fără destinatar corect sau poate genera repartizări duplicate.

## Teste

```bash
npm test
```

Testele verifică rotația de repartizare pe mii de configurații de facultăți, inclusiv cazuri în care nu se poate evita aceeași facultate.

## Limitări operaționale

- Proiectul este **un singur eveniment**. Pentru ediția de anul următor, arhivează baza de date și inițializează un proiect nou; nu reseta extragerea în mijlocul evenimentului.
- Nicio persoană nu este notificată automat după extragere. Participanții verifică secțiunea „Contul meu”; poți trimite un anunț comun fără a dezvălui repartizările.
- Verificarea emailului nu dovedește statutul de student. Dacă ai nevoie de acces exclusiv studenților, folosește domenii instituționale sau o verificare manuală a înscrierilor înainte de extragere.
- Organizatorii au acces la nume și emailuri (date cu caracter personal): publică o notă de informare adecvată instituției.

## Izolare

Nu se face nicio modificare în repository-ul/site-ul AlviTravel. Acest proiect are propriile fișiere, autentificare și bază de date.
