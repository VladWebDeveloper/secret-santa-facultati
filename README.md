# 🎁 Secret Santa Campus — ASEM 2026

Aplicație web pentru **Secret Santa între facultăți**, organizat de comunitatea studențească. Interfață în limba română, optimizată pentru mobil și desktop.

## Linkuri

- **Aplicație:** https://alvitravel.md/secret-santa-facultati/
- **Cod sursă:** https://github.com/alvitravel-md/secret-santa-facultati
- **Backend separat:** Supabase, proiect *Secret Santa Campus 2026* (referință `mqmqtqvjlhbfrbadxbux`).

**Notă despre adresă:** GitHub Pages aplică automat domeniul personalizat deja configurat pe contul GitHub, de aceea aplicația se afișează la adresa de mai sus. Este un **repository și proiect Supabase complet separate**, iar codul AlviTravel nu a fost modificat.

## Ce poate face un student

1. Creează un cont cu email + parolă de cel puțin 8 caractere (sau se autentifică într-un cont existent).
2. Își completează numele, universitatea, facultatea, wishlistul și eventual cadourile de evitat.
3. Poate edita datele până la închiderea înscrierilor; după închidere poate edita doar wishlistul.
4. După extragere, vede numai persoana extrasă, facultatea și dorințele acesteia.
5. Poate marca acel cadou drept pregătit.

**Valoare minimă obligatorie a cadoului: 100 MDL.**

## Ce poate face un organizator

După crearea contului, organizatorul introduce **codul privat de organizator** în secțiunea „Contul meu”. Codul se distribuie privat și nu se publică pe site.

- Setează data, ora, locul de întâlnire și stadiul înscrierilor.
- Consultă lista participanților și exportă CSV.
- Elimină înscrieri greșite **numai înainte de închiderea înscrierilor**.
- Pornește extragerea **o singură dată**. Extragerea închide definitiv înscrierile.
- Urmărește câte cadouri au fost marcate pregătite.

## Reguli de repartizare

La extragere, fiecare student devine o singură dată Secret Santa pentru un alt student și primește o singură dată un cadou. Nu există autoatribuiri sau destinatari dublați. Algoritmul maximizează perechile între facultăți diferite. Dacă o facultate are mai mult de jumătate din participanți, unele perechi din aceeași facultate sunt inevitabile.

Extragerea este executată **atomic în PostgreSQL**, nu separat în fiecare browser. Numele persoanelor extrase sunt afișate individual, doar după finalizarea extragerii.

## Tehnologie și securitate

- **GitHub Pages:** interfață web statică (HTML, CSS, JavaScript).
- **Supabase Auth:** înregistrare și autentificare cu email + parolă.
- **PostgreSQL + Row Level Security (RLS):** studenții nu pot citi profilurile altor studenți; destinația se obține doar prin RPC-ul propriului cont. Adminii pot accesa lista participanților.
- **RPC-uri cu control de acces:** înscriere, extragere, revendicare rol de organizator, eliminare participanți.
- Codul de organizator este stocat în baza de date ca **hash SHA-256**; parola în clar nu se află în repository.
- Cheia Supabase din `config.js` este exclusiv **publishable**, intenționată pentru frontend; nu se publică niciodată o cheie secretă/service_role.

### Limitare importantă: verificarea emailului

Pentru ca înscrierea să funcționeze fără furnizor SMTP plătit/configurat, **Confirm email este dezactivat**. Prin urmare, utilizatorii trebuie să își amintească parola, iar posesia adresei de email **nu este verificată**. Organizatorul trebuie să verifice înscrierile înainte de extragere și să elimine intrările nevalide. Pentru evenimente instituționale mari se recomandă ulterior SMTP propriu + confirmare email sau login instituțional.

## Instalație și mentenanță

Structura:
- `index.html`, `styles.css`, `app.js`: frontend
- `config.js`: URL Supabase și publishable key
- `supabase/schema.sql`: schema, RLS, funcțiile de bază
- `supabase/organizer-tools.sql`: acces organizator și moderare (conține **doar hash-ul** codului privat)
- `demo.html`: versiune independentă, date fictive în browser. **Nu înregistrați studenți reali în demo.**
- `tests/draw.test.mjs`: teste ale algoritmului de repartizare

Pentru o nouă ediție, creează un nou eveniment / proiect; **nu reseta repartizările în timpul evenimentului**.

```bash
npm test
```

## Confidențialitate

Numele, emailurile, facultățile și preferințele sunt date cu caracter personal. Coordonați informarea participanților, accesul organizatorilor, păstrarea și ștergerea lor conform regulilor aplicabile. Nu divulgați codul de organizator și nici exporturile CSV în spații publice.
