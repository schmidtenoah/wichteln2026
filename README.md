# Wichteln 2026

Private Secret-Santa-Seite. Statisch, keine Datenbank, kein Tracking, keine externen Requests.
Jede Person gibt ihr Passwort ein, sieht, wen sie beschenkt, und bekommt deren Wunschzettel.
Die Wunschlisten pflegst du selbst über `admin.html`, ganz ohne Server.

```
public/              die Website (genau dieser Ordner wird veröffentlicht)
  index.html         die Seite für alle
  admin.html         Wunschlisten verwalten (nur für dich, mit Admin-Passwort)
  config.js          Datum, Budget, Ort, Organisator: frei änderbar
  data.json          Auslosung + Wunschlisten, verschlüsselt
  models/            das 3D-Geschenk aus Blender (wichteln.glb)
  img/               Renders der Baumszene aus Blender; img/leer/ = dieselbe Szene ohne das jeweils geöffnete Geschenk
  js/ css/ fonts/ vendor/
blender/
  wichteln-modelle.blend   Quelldatei der 3D-Modelle
  wichtel-baum.blend       Baum-Szene der Startseite (Renders, Anhänger)
  textures/                Geschenkpapier, Satinband, Seidenpapier
tools/
  participants.config.mjs  wer mitmacht + verbotene Paare
  generate.mjs             lost aus, verschlüsselt, schreibt public/data.json
  upgrade.mjs              alte data.json auf Wunschlisten umstellen (Passwörter bleiben)
  render-plates.py         rendert public/img/leer/ neu (nur nach Änderungen an der Baumszene)
  serve.mjs                lokale Vorschau
```

Voraussetzung: Node.js 20 oder neuer. Sonst wird nichts installiert.

---

## 1. Auslosen

### a) Die Passwörter sind noch nicht verschickt

```sh
node tools/generate.mjs --force
```

Das Skript lost **einen einzigen Kreis** durch alle aus (niemand zieht sich selbst, keine Pärchen, die sich gegenseitig beschenken, keine Grüppchen), hält die verbotenen Paare ein, erzeugt Passwörter wie `zimtstern-kerze-47` und dein **Admin-Passwort** für die Wunschlisten. Ausgegeben werden nur `Name -> Passwort` und das Admin-Passwort. Wer wen hat, steht nirgends.

### b) Die Passwörter sind schon verschickt (alte data.json ohne Wunschlisten)

Dann nicht neu auslosen, sondern umstellen. Auslosung und Passwörter bleiben genau gleich:

1. Die Passwort-Liste, wie der Generator sie damals ausgegeben hat, in eine Datei `passwoerter.txt` kopieren (eine Zeile pro Person, z. B. `Irene  ->  zimtstern-kerze-47`).
2. ```sh
   node tools/upgrade.mjs passwoerter.txt
   ```
3. Das ausgegebene **Admin-Passwort** notieren, `passwoerter.txt` löschen.

`passwoerter.txt` steht in `.gitignore`, landet also nicht aus Versehen auf GitHub.

## 2. Auf GitHub Pages veröffentlichen (kostenlos)

1. Neues Repository auf GitHub anlegen, **öffentlich** (GitHub Pages ist im kostenlosen Konto nur für öffentliche Repositories da). Das ist okay: `data.json` ist verschlüsselt, `passwoerter.txt` steht in `.gitignore`.
2. Alles pushen, inklusive `public/data.json`:
   ```sh
   git init
   git add .
   git commit -m "Wichteln 2026"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/wichteln.git
   git push -u origin main
   ```
3. Auf GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Der Workflow `.github/workflows/pages.yml` veröffentlicht nur den Ordner `public/`, bei jedem Push auf `main` (Fortschritt unter **Actions**). Nach etwa einer Minute ist die Seite unter `https://DEIN-NAME.github.io/wichteln/` erreichbar, die Verwaltung unter `https://DEIN-NAME.github.io/wichteln/admin.html`.

## 3. Passwörter verschicken

Jede Person bekommt **nur ihr eigenes** Passwort, am besten als einzelne WhatsApp-Nachricht:

> Hier ist dein Wichtel-Passwort: **zimtstern-kerze-47**
> https://DEIN-NAME.github.io/wichteln/
> Tipp auf deinen Namen, gib das Passwort ein, pack aus. Schick mir bis zum 1. Dezember deine Wünsche (gern mit Preis und Link), dann stehen sie auf deinem Wunschzettel.

Groß-/Kleinschreibung und Leerzeichen statt Bindestrichen sind beim Eintippen egal.

## 4. Wunschlisten pflegen

Alle schicken dir ihre Wünsche, du trägst sie ein:

1. `admin.html` öffnen (online oder lokal), Admin-Passwort eingeben.
2. Links die Person wählen. Auf dem Wunschzettel stehen pro Wunsch nur **Bild und Name**; beides ist der Link zum Shop. Am schnellsten geht es mit dem Feld **„Bild oder Link einfügen“** (die Vorlage):
   - Im Shop mit Rechtsklick „Bild kopieren“, ins Feld klicken, Strg+V: ein neuer Wunsch mit diesem Bild.
   - Dann die Adresse aus der Adresszeile kopieren und wieder Strg+V: der Link landet im selben Wunsch, der Name wird aus dem Link vorgeschlagen. Andersherum (erst Link, dann Bild) geht es genauso.
   - Namen kurz anpassen, fertig. Bilder kann man auch hineinziehen. Leere oder weiße Ränder schneidet die Seite automatisch ab, damit alle Bilder gleich groß wirken.
   - Rechts (auf breiten Bildschirmen) bzw. unten steht die **Vorschau**: genau der Zettel, den der Wichtel sieht.

   Alternativ einzeln über „Wunsch hinzufügen“ oder die WhatsApp-Nachricht unter **„Aus einer Nachricht übernehmen“** (eine Zeile pro Wunsch, Links werden erkannt). Bilder werden verkleinert und verschlüsselt in der Wunschliste gespeichert. Es wird also nichts von fremden Servern nachgeladen.
   Tipp: Produktfotos auf weißem Grund oder mit transparentem Hintergrund (PNG/WebP) sehen am besten aus. Weiß verschmilzt mit dem Papier des Zettels.
3. Speichern, auf einem von zwei Wegen:

**Ohne Einrichtung:** „data.json herunterladen“, dann auf GitHub im Ordner `public/` auf **Add file → Upload files** und die Datei hochladen (ersetzt die alte). Eine Minute später ist alles live.

**Mit einem Klick:** Einmal unter **Einstellungen** Konto, Repository und einen Zugangs-Token eintragen. Danach heißt der Knopf „Veröffentlichen“ und speichert direkt ins Repository. So bekommst du den Token:

1. GitHub → Profilbild → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name z. B. „Wichteln“, Ablauf z. B. 60 Tage.
3. **Repository access: Only select repositories** → dein Wichtel-Repository.
4. **Permissions → Repository permissions → Contents: Read and write**. Sonst nichts.
5. Token kopieren und in `admin.html` unter Einstellungen einfügen. „Auf diesem Gerät merken“ nur auf deinem eigenen Gerät anhaken.

Der Token liegt nur in deinem Browser, nie im Repository. Mit diesem Weg lädt `admin.html` die Daten auch immer frisch von GitHub, du überschreibst also nie versehentlich eine neuere Fassung.

Unter Einstellungen gibt es außerdem eine **Sicherung** aller Wunschlisten (Klartext, ohne Auslosung). Falls du doch neu auslosen musst, bleiben die Wünsche so erhalten:

```sh
node tools/generate.mjs --force --wishes wunschlisten-sicherung.json
```

### Was die Leute sehen

- Einen geschmückten Weihnachtsbaum, darunter für jede Person ein Geschenk in eigenem Papier. An jedem hängt an einer Kordel ein Papieranhänger (mitgerendert, mit Licht und Schatten), darauf der Name in Handschrift.
- Tippt man auf das eigene Geschenk, kommt der Anhänger groß nach vorn. Unten verschließt ihn ein Wachssiegel „Freigeben“ (mit Licht und Relief, der Schriftzug im Bogen auf dem Siegel). Mit dem Passwort bricht das Siegel in zwei Hälften, die auf dem Anhänger bleiben, und der Name wird auf die Für-Zeile geschrieben.
- Dann fliegt die Seite **in dasselbe Bild hinein**, hinunter zu genau diesem Geschenk; der Raum wird dabei unscharf, das Geschenk bleibt scharf. Unterwegs übernimmt das 3D-Geschenk den Platz des gerenderten (gleiche Kamera wie in Blender, ein Ausschnitt ohne das Geschenk deckt das gerenderte ab). Geschenke, die davor stehen, verdecken es weiterhin. Die Kordel verschwindet sofort, der Anhänger selbst (dasselbe Element, kein Ersatzbild) fliegt hinunter und lehnt sich an den Karton.
- Die Schleife fällt, der Deckel springt ab und landet daneben, Licht strömt heraus, und der **Wunschzettel** steigt aus dem Licht auf: eine Karte mit feinem Goldrahmen (Budget und Bescherung sitzen in der oberen Rahmenlinie, „Die Wichtel-Redaktion“ in der unteren), oben eine Schleife mit Tannenzweigen, die Wünsche frei darauf verteilt: freigestelltes Bild, kursiver Name, ein kleiner goldener Pfeil. Ist die Liste noch nicht da, zeigt der Zettel „Noch ganz leer.“, das Versprechen der Redaktion („Spätestens am 1. Dezember steht hier alles drauf.“) und drei gestrichelte Platzhalter.
- Antippen: Der Zettel kommt nach vorn und ist lesbar; Bild oder Name öffnen den Link im neuen Tab. Zurück legt ihn wieder über das Geschenk, nochmal Zurück fliegt aus dem Bild heraus zum Baum.
- Oben „Mein Wunschzettel“: die **eigene** Wunschliste, um zu prüfen, ob alles angekommen ist.

Wenn sich Wünsche ändern: einfach im Admin aktualisieren. Alle sehen die neue Fassung beim nächsten Öffnen mit demselben Passwort.

## 5. Datum, Budget, Ort

Stehen in `public/config.js`:

- `budget`: Betrag in Euro (50), `budgetTolerance`: wie viel drüber noch als „passt“ gilt (3).
- `date`, `place`: Platzhalter, trag die echten ein. Leeres `place` blendet die Zeile aus.
- `wishDeadline`: bis wann alle Wunschzettel drin sind (`'1. Dezember'`), steht auf leeren Wunschzetteln.
- `organizer`: wem man Wünsche schickt (erscheint auf der Seite).
- `organizerWhatsApp`: optional deine Nummer (z. B. `'491701234567'`), dann gibt es einen „Wünsche schicken“-Knopf. Achtung: `config.js` ist öffentlich.

Dafür muss nichts neu ausgelost werden.

## 6. Lokal ansehen

```sh
node tools/serve.mjs
```

Dann <http://localhost:8000/> bzw. <http://localhost:8000/admin.html> öffnen. Per Doppelklick auf `index.html` geht es nicht, Browser blockieren Module und `fetch` von `file://`.

Zum Ausprobieren mit Testdaten, ohne die echte `data.json` anzufassen:

```sh
node tools/generate.mjs --out test.json --admin-password test
WICHTEL_DATA=test.json node tools/serve.mjs
```

## Wie sicher ist das?

Gut genug gegen Neugier, nicht gegen Entschlossenheit, und für Wichteln ist das genau richtig.

- In `data.json` stehen nur Namen, Zufallswerte und verschlüsselte Blöcke (AES-256-GCM, Passwort-Schlüssel per PBKDF2-SHA256 mit 600.000 Runden).
- Jede Wunschliste hat einen eigenen Zufallsschlüssel. Den bekommen nur die Person selbst und ihr Wichtel (im verschlüsselten Ergebnis). Andere können fremde Wunschlisten nicht lesen.
- Das Admin-Passwort öffnet nur die Wunschlisten-Schlüssel, **nicht** die Auslosung. Du kannst also alle Listen pflegen und mitwichteln, ohne zu wissen, wer wen hat.
- Jeder Block ist an seinen Namen gebunden und lässt sich nicht auf einen anderen Namen umkopieren. Ergebnisse sind gleich lang, Wunschlisten auf 512-Byte-Stufen aufgefüllt.
- Die Passwörter sind bewusst leicht zu tippen. Wer sehr viel Rechenzeit investiert, könnte sie durchprobieren. Das Admin-Passwort ist deshalb länger.
- Wer die Passwörter verschickt, kennt sie alle und könnte theoretisch reinschauen. Ehrensache.
- Auf der Seite selbst: Suchmaschinen und Crawler bleiben draußen (`robots.txt`, `noindex`), die Seiten lassen sich nicht in fremde Seiten einbetten, und wer im Anhänger Passwörter durchprobiert, muss ab dem dritten Fehlversuch immer länger warten (bis 60 s). Strenge Inhaltsregeln (CSP): kein fremdes Skript, keine fremden Bilder, Links in Wunschzetteln nur `http(s)`.
- Ehrlich gesagt: Gegen jemanden, der `data.json` herunterlädt und mit einer starken Grafikkarte offline rät, hilft keine Bot-Sperre. Bei rund 200.000 möglichen Passwörtern pro Person ist das eine Frage von Minuten. Wer das ausschließen will, lost mit längeren Passwörtern neu aus (dann müssen alle neu verschickt werden).
- `wishesOpen: false` in `config.js`: Bis du das umstellst, sieht jede Person den leeren Wunschzettel, egal was schon in `data.json` steht. Es wird dann auch nichts entschlüsselt.

## Barrierefreiheit und Bewegung

- Komplett per Tastatur bedienbar, sichtbare Fokuszustände, der Anhänger ist ein echter modaler Dialog (Esc schließt).
- Bei „Bewegung reduzieren“ gibt es keinen fallenden Schnee, keinen Flug und keine Animation: Die Seite steht sofort beim geöffneten Geschenk mit dem Wunschzettel darüber. Ohne WebGL fliegt die Seite zum Geschenk (es bleibt verpackt) und legt den Wunschzettel direkt vor dich.
- Der Wunschzettel ist echtes HTML: echte Links, für Screenreader lesbar. Solange er über dem Geschenk schwebt, ist er ein Knopf („Wunschzettel ansehen“).
- Ton ist an, startet aber erst mit dem ersten Tippen (so verlangen es die Browser). Der Lautsprecher-Knopf schaltet ihn aus; das merkt sich nur das eigene Gerät.

## Ton

Die Seite spielt Hintergrundmusik und kurze Effekte aus `public/audio/`. Fehlt eine Datei, bleibt es an dieser Stelle einfach still. Alle Dateien als **MP3** (44,1 kHz; Effekte mono, Musik stereo), ohne Stille am Anfang (unter 10 ms), Ausklang in die Datei eingebaut, Spitzenpegel um −3 dBFS. Die Musik leiser abmischen (etwa −20 LUFS).

| Datei | Moment | Länge | Klang |
|---|---|---|---|
| `musik.mp3` | läuft ab dem ersten Tippen in Schleife | 60–120 s, nahtlos loopbar | ruhig, instrumental: Celesta oder Spieluhr, weiche Streicher, ein paar Schlittenglöckchen; 70–80 BPM, kein Gesang |
| `tippen.mp3` | Geschenk antippen | 0,15–0,3 s | gedämpftes Klopfen auf Karton, leises Papierrascheln |
| `anhaenger.mp3` | Anhänger kommt nach vorn | 0,4–0,7 s | Papier, das kurz durch die Luft schwingt |
| `stift.mp3` | Name wird auf den Anhänger geschrieben | 0,9–1,2 s | Füller oder Filzstift auf Papier, eine kurze Schreibbewegung |
| `falsch.mp3` | falsches Passwort | 0,2–0,4 s | weiches, dumpfes Holz-Tock, nicht schrill |
| `landung.mp3` | Geschenk, Schleife und Deckel landen | 0,15–0,35 s | gedämpfter Aufprall auf Teppich oder Holzboden |
| `schleife.mp3` | Schleife wird aufgezogen | 0,5–0,9 s | Satinband, das durch die Finger gleitet |
| `deckel.mp3` | Deckel springt ab | 0,3–0,6 s | Karton-„Plopp“ mit etwas Luft |
| `glanz.mp3` | Licht strömt, Wunschzettel steigt auf | 1,5–2,5 s | warmer, magischer Schimmer (Glöckchen, Glissando), nicht zu hell |
| `blaettern.mp3` | Wunschzettel kommt nach vorn, eigenen Zettel zeigen | 0,4–0,7 s | ein Blatt Karton, das aufgenommen wird |
| `zuklappen.mp3` | Wunschzettel zurücklegen | 0,3–0,5 s | Karton, der leise abgelegt wird |

Damit nichts durcheinanderklingt, gilt in `public/js/sound.js`: Jeder Effekt läuft höchstens einmal gleichzeitig (erneutes Auslösen startet ihn neu) und hat eine kurze Sperrzeit. Insgesamt spielen höchstens drei Effekte, und bei Deckel, Glanz und Stift wird die Musik kurz leiser und kommt danach von selbst zurück. Die Lautstärke pro Effekt steht dort in `EFFECTS`.

## Die 3D-Modelle

Alles ist in Blender modelliert (`blender/wichteln-modelle.blend`):

- **Geschenk:** Karton und Deckel mit 7 bzw. 5 cm Wandstärke (Solidify), Stützkanten, Bevel und Subdivision Surface, damit die Kanten weich sind, die Öffnung aber eckig bleibt. Bänder und Schleife sind echte Satinstreifen mit Raffung am Knoten und Schwalbenschwanz-Enden; die Bandfarbe wird pro Geschenk eingefärbt.
- **Wunschzettel:** kein 3D-Modell, sondern HTML (`public/js/wishlist.js`, `public/css/wishlist.css`), das die 3D-Szene auf eine Ebene über dem Geschenk legt (projektive CSS-Transformation). Das alte Objekt `Magazin` steckt noch im Modell, wird aber nicht mehr benutzt.
- **Papiere:** acht Geschenkpapiere (Goldsterne, Nadelstreifen, Schneeflocken, Kraftpapier, Zuckerstange, Goldfolie, Pflaume, Schottenkaro) in `blender/textures/papiere/` und als WebP in `public/models/papiere/`.
- **Baum:** sechs gewellte Ebenen mit Solidify, Subdivision und Displace, 36 Kugeln (Rot, Gold, Chrom, Eisblau, Flieder), 110 Lichter, Goldstern. Collection „Baum“ in der Blend-Datei.
- **Startseite:** Baum und zehn Geschenke als Cycles-Szene mit Schattenfänger, einmal breit für Laptops (`public/img/baum-breit.webp`) und einmal hoch für Handys (`baum-hoch.webp`). Quelle: `blender/wichtel-baum.blend`, Text-Block `wichtel_layout.py` (`apply("breit")`, `build_tags()`, `tag_anchors()`). Die Papieranhänger mit Kordel und Messingöse sind echte Objekte; ihre Papierfarbe steht in `GIFT_TAG_PAPER` in `public/js/tagart.js`. Wo Klickfläche und Schreibfläche des Anhängers liegen (Position, Breite, Winkel), steht in `public/js/gifts.js`, ebenso Kamera und Geschenkpositionen (`VIEWS`, `placement()`), damit die 3D-Szene genau auf dem Bild liegt.
- **Leere Ausschnitte:** `public/img/leer/{breit,hoch}-{0..9}.webp`, die Baumszene rund um Geschenk n **ohne** dieses Geschenk (und seinen Anhänger), mit Cycles gerendert. Nach Änderungen an der Baumszene neu rendern, die ausgegebenen Rechtecke kommen nach `PLATES` in `public/js/gifts.js`:
  ```sh
  blender -b blender/wichtel-baum.blend --python tools/render-plates.py
  ```

Neu exportieren nach Änderungen: In Blender die Objekte `Gift` und `Magazin` (jeweils mit allen Kindern) auswählen, dann **File → Export → glTF 2.0** mit

- Format: glTF Binary (`.glb`), Include: Selected Objects
- Mesh: Apply Modifiers
- Material → Images: WebP
- Compression: **meshopt** an

und nach `public/models/wichteln.glb` speichern. Die Objekt- und Materialnamen (`Lid`, `Bow`, `BowLoopL`, `Magazin`, `Geschenkpapier`, `Satinband`, `MagazinTitel` usw.) müssen bleiben, die Animation greift darauf zu.

## Technik in Kürze

- Kein Build-Schritt. ES-Module direkt im Browser.
- Die Startseite braucht kein WebGL: Die Geschenke sind gerenderte Bilder. Three.js (r187, reduziert, mit GLTF-Loader und Meshopt) und das Modell (≈ 0,8 MB) laden erst, wenn jemand einen Anhänger öffnet. Während das Passwort getippt wird, baut die Seite die 3D-Szene schon fertig auf (Shader, Texturen), damit in der Animation nichts mehr ruckelt.
- Der Flug ins Bild ist ein Zoom auf das gerenderte Bild; die 3D-Kamera folgt mit einem passenden Bildausschnitt (`setViewOffset`), so liegen Bild und 3D in jedem Frame exakt aufeinander. Die übrigen Geschenke stehen unsichtbar (nur Tiefe) in der Szene und verdecken das eigene, wo sie im Bild davor stehen.
- Flüssig auch auf schwächeren Geräten: Während des Flugs bewegt der Browser nur fertig gezeichnete Ebenen (Bild, Anhänger, Wunschzettel, Licht), nichts wird pro Bild neu gemalt. Die Unschärfe des Raums ist ein fester, leichter Weichzeichner, der mit dem Zoom von selbst wächst; die beleuchtete Wachsoberfläche des Siegels wird einmal als Bild berechnet; der Wunschzettel steigt durch ein „Fenster“ aus dem Karton statt mit einem pro Bild neu berechneten Zuschnitt. Als unsichtbare Verdecker zählen nur die Geschenke, die im Bild wirklich vor dem eigenen stehen.
- Die 3D-Szene startet mit höchstens 1,5-facher (Handys 1,25-facher) Pixeldichte und senkt sie ab dem ersten Bild selbst, wenn Bilder zu langsam kommen. Sie pausiert, solange der Wunschzettel gelesen wird (das letzte Bild bleibt stehen). Der Schnee fällt weiter, es ist ja derselbe Raum.
- Schriften: Pinyon Script, Hanken Grotesk, Fraunces (Wunschzettel, Siegel), Caveat, Archivo, alle SIL Open Font License, in `public/fonts/`. Bagel Fat One liegt noch bei, wird aber nicht mehr verwendet.

### Three.js neu bauen (nur falls nötig)

`public/vendor/three.min.js` ist ein auf das Nötigste reduzierter Build von Three.js r187 (MIT-Lizenz, siehe `three.LICENSE.txt`). Falls du in der Szene neue Three.js-Klassen brauchst, trag sie in `tools/three-entry.js` ein und baue neu:

```sh
mkdir /tmp/three-build && cd /tmp/three-build
npm init -y && npm i three@0.187.0 esbuild
cp /pfad/zum/repo/tools/three-entry.js entry.js
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=/pfad/zum/repo/public/vendor/three.min.js
```
