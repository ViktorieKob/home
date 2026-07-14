# Společný rozpočet Viki & Káti

## Architektura
Aplikace je jednoduchá jednosložková webová aplikace bez frameworku. Uživatel se přihlásí přes Supabase Auth, data se načítají z PostgreSQL přes Supabase klienta a UI reaguje okamžitě po změnách.

## Souborová struktura
- index.html — základní HTML šablona
- style.css — responzivní vizuál a navigace
- app.js — aplikace, přihlášení, CRUD pro transakce a rozpočty
- supabase.sql — SQL skript pro vytvoření struktury a RLS

## Spuštění lokálně
1. Otevřete složku v prohlížeči nebo spusťte jednoduchý lokální server, např.:
   - `python3 -m http.server 8000`
2. V prohlížeči otevřete `http://localhost:8000`.

## Nastavení Supabase
1. Vytvořte projekt v Supabase.
2. V SQL editoru spusťte obsah souboru `supabase.sql`.
3. V projektu otevřete Settings → API a zkopírujte:
   - `project URL`
   - `anon public key`
4. Do místního úložiště prohlížeče uložte klíče:
   - `supabaseUrl`
   - `supabaseAnonKey`
5. Po načtení aplikace se zobrazí přihlašovací obrazovka.

## Vytvoření uživatelů
1. V Supabase Auth vytvořte dva účty s e-mail a heslem.
2. Po potvrzení e-mailu se uživatelé mohou přihlásit.
3. Oba uživatelé musí být přidáni do stejné domácnosti.

## Přidání uživatelů do domácnosti
1. V tabulce `households` vytvořte řádek s názvem domácnosti.
2. Do `household_members` vložte oba uživatele s jejich `user_id`.
3. Poté mohou oba vidět stejné data.

## GitHub Pages
1. V GitHub repozitáři otevřete Settings → Pages.
2. Zvolte branch `main` a složku `/root`.
3. Publikujte projekt.
4. Aplikace bude dostupná přes veřejnou URL.
