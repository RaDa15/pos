# Prototype (read-only reference)

The original browser-only POS SYSTEM prototype (vanilla JS, data in localStorage), reviewed on 2026-10-23.

- **Don't edit, import from, or deploy anything in this folder.** It's kept only to check how a feature behaved.
- Find the matching v1 code through the map in `docs/04-ARCHITECTURE.md` §3 (Prototype → v1 map).
- Known problems in this code are listed in `docs/13-MEMORY.md` → Known issues. Don't copy its patterns (global state, `innerHTML` templates, inline `onclick`, plain-text passwords, localStorage storage).
- To run it: open `index.html` in Chrome. Demo companies: Pema Store, Norbu General Store, Test Restaurant, Menjong Kitchen — company and `admin` password `1234`.
