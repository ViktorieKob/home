# Společný rozpočet Viki & Káti

## Architektura
Aplikace je jednoduchá jednosložková webová aplikace bez frameworku a bez přihlášení. Data jsou ukládána v místním úložišti prohlížeče (localStorage), takže pracují offline a změny se projevují okamžitě.

## Souborová struktura
- index.html — základní HTML šablona
- style.css — responzivní vizuál a navigace
- app.js — aplikace s CRUD pro transakce a rozpočty

## Spuštění lokálně
1. Stáhněte nebo naklonujte repozitář.
2. Otevřete složku a spusťte jednoduchý lokální server, např.:
   - `python3 -m http.server 8000`
3. V prohlížeči otevřete `http://localhost:8000`.
4. Data se automaticky ukládají v prohlížeči.

## Spuštění přes GitHub Pages
1. V GitHub repozitáři otevřete Settings → Pages.
2. Zvolte branch `main` a složku `/root`.
3. Publikujte projekt.
4. Aplikace bude dostupná přes veřejnou URL (např. https://viktoriekob.github.io/home/).

## Použití
- Klikněte na "Nové období" a vytvořte první rozpočtové období.
- Přidejte kategorie rozpočtu (Potraviny, Bydlení, atd.).
- Přidávejte transakce — výdaje a příjmy.
- Data se automaticky ukládají do prohlížeče.

## Poznámky
- Bez přihlášení a bez databáze — vše běží lokálně.
- Funguje offline.
- Data zůstanou v prohlížeči, dokud nevymažete historii/cookies.
