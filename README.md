# Společný rozpočet Viki & Káti

## Architektura
Aplikace je jednoduchá webová aplikace bez frameworku. Frontend běží staticky (HTML/CSS/JS) a data ukládá do Supabase přes REST API.

## Souborová struktura
- index.html — základní HTML šablona
- style.css — responzivní vizuál a navigace
- app.js — aplikace s CRUD pro transakce a rozpočty

## Spuštění lokálně
1. Stáhněte nebo naklonujte repozitář.
2. V Supabase SQL editoru spusťte obsah souboru `supabase.sql`.
3. Ověřte, že v `app.js` je správně vyplněné `SUPABASE_URL` a `SUPABASE_ANON_KEY`.
4. Otevřete složku a spusťte jednoduchý lokální server, např.:
   - `python3 -m http.server 8000`
5. V prohlížeči otevřete `http://localhost:8000`.
6. Data se načítají a zapisují do Supabase.

## Spuštění přes GitHub Pages
1. V GitHub repozitáři otevřete Settings → Pages.
2. Zvolte branch `main` a složku `/root`.
3. Publikujte projekt.
4. Aplikace bude dostupná přes veřejnou URL (např. https://viktoriekob.github.io/home/).

## Použití
- Klikněte na "Nové období" a vytvořte první rozpočtové období.
- Přidejte kategorie rozpočtu (Potraviny, Bydlení, atd.).
- Přidávejte transakce — výdaje a příjmy.
- Data se automaticky ukládají do Supabase.

## Poznámky
- Aplikace aktuálně běží bez přihlášení, proto vyžaduje správně nastavené RLS policy ze souboru `supabase.sql`.
- Pokud se objeví chyba `row-level security policy`, SQL politiky nebyly aplikovány nebo se aplikovaly jen částečně.
