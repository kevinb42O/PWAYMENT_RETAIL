import fs from "node:fs";
import path from "node:path";

const workspace = "/Users/kevin/PROJECTS/pwayment RETAIL";
const imageDirectory = path.join(workspace, "public/mail-assets/fabrice");
const outputPath = path.join(workspace, "Pwayment Retail update voor Fabrice.eml");
const editableOutputPath = path.join(workspace, "MAIL AAN FABRICE — BEWERKBAAR.html");
const boundary = "----=_Pwayment_Fabrice_Update_20260820";
const alternativeBoundary = "----=_Pwayment_Fabrice_Text_20260820";

const images = [
  { file: "00-klantenscherm-configuratie.png", cid: "klantenscherm", alt: "Klantenscherm met live verbinding en eigen uitstraling" },
  { file: "01-facturatie-aan-de-kassa.png", cid: "facturatie", alt: "Facturatie rechtstreeks aan de kassa" },
  { file: "02-servicedesk.png", cid: "hersteldienst", alt: "Hersteldienst" },
  { file: "03-personeelsplanning.png", cid: "personeelsplanning", alt: "Personeelsplanning en verlof" },
  { file: "04-platform-console.png", cid: "platform-console", alt: "Platform Console" },
  { file: "06-winkelstatus-en-support.png", cid: "support", alt: "Winkelstatus en support" },
  { file: "07-team-en-releases.png", cid: "releases", alt: "Team en releases" },
  { file: "05-integratiehub.png", cid: "integratiehub", alt: "Integration Hub" },
];

const encodeBase64 = (buffer) => buffer.toString("base64").match(/.{1,76}/g).join("\r\n");

const text = `Hoi Fabrice,

Ik wil je graag een compacte update geven van wat er de voorbije week in Pwayment Retail is bijgekomen. Hieronder staan de onderdelen die nu voldoende concreet zijn om samen te bekijken.

FACTURATIE RECHTSTREEKS AAN DE KASSA
Een medewerker kan vanuit de actieve verkoop een factuur opmaken. Bestaande klantgegevens worden gebruikt waar mogelijk; ontbrekende bedrijfsgegevens kunnen meteen aangevuld en gekoppeld worden, zonder de verkoopflow te verlaten. Daarna kan de factuur als PDF worden aangemaakt.

HERSTELDIENST
Een apart hersteldossier brengt klantgegevens, status, diagnose/oplossing en QR-opvolging samen. Zo wordt een herstelling een traceerbaar proces van intake tot afhaling.

PERSONEELSPLANNING EN VERLOF
Roosters, verlof en bezetting staan samen in één overzicht. De bezettingsrij maakt meteen zichtbaar of er voldoende mensen ingepland zijn.

PLATFORM CONSOLE
Een afgeschermd centraal overzicht voor winkelstatus, incidenten, synchronisatierisico's en meetdekking, met een duidelijke actiewachtrij wanneer een winkel nog geactiveerd moet worden.

INTEGRATION HUB
De kernflow staat er al: bronbestanden inladen, velden controleren en mappen, aantallen vooraf zien en pas daarna veilig activeren. De migratie blijft omkeerbaar tot de eerste echte activiteit.

Ik licht dit graag eens live toe. Vooral de combinatie van kassaflow, herstellingen en het centrale beheer lijkt me interessant om samen door te nemen. Laat maar weten wanneer het past.

Groeten,
Kevin`;

const section = (title, body, cid, alt) => `
  <tr><td style="padding: 30px 0 0;">
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.3px; color: #0782a2; text-transform: uppercase;">${title}</div>
    <p style="margin: 8px 0 16px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #334155;">${body}</p>
    <img src="cid:${cid}" alt="${alt}" width="680" style="display: block; width: 100%; max-width: 680px; height: auto; border: 1px solid #dbe4ee; border-radius: 12px;" />
  </td></tr>`;

const html = `<!doctype html>
<html lang="nl">
  <body style="margin: 0; padding: 0; background: #f1f5f9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f1f5f9;"><tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 680px; background: #ffffff; border-radius: 16px; overflow: hidden;">
        <tr><td style="padding: 30px 36px 28px; background: #0b1f3a;">
          <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.6px; color: #5eead4; text-transform: uppercase;">Pwayment Retail</div>
          <div style="margin-top: 9px; font-family: Arial, Helvetica, sans-serif; font-size: 28px; line-height: 34px; font-weight: 700; color: #ffffff;">Concrete productupdate</div>
        </td></tr>
        <tr><td style="padding: 30px 36px 38px;">
          <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px; color: #334155;">Hoi Fabrice,</p>
          <p style="margin: 16px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px; color: #334155;">Ik wil je graag een compacte update geven van wat er de voorbije week in Pwayment Retail is bijgekomen. Hieronder staan de onderdelen die nu voldoende concreet zijn om samen te bekijken.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${section("Klantenscherm — tweede scherm aan de kassa", "De kassa stuurt live door naar een apart klantenscherm. Daar ziet de klant artikelen, prijsopbouw en totaal; op rustige momenten verschijnt een eigen welkomsscherm. De module werkt lokaal en deelt geen kostprijzen, voorraad, klantgegevens of interne notities.", "klantenscherm", "Klantenscherm met live verbinding en eigen uitstraling")}
            ${section("Facturatie rechtstreeks aan de kassa", "Een medewerker kan vanuit de actieve verkoop een factuur opmaken. Bestaande klantgegevens worden gebruikt waar mogelijk; ontbrekende bedrijfsgegevens kunnen meteen aangevuld en gekoppeld worden, zonder de verkoopflow te verlaten. Daarna kan de factuur als PDF worden aangemaakt.", "facturatie", "Facturatie rechtstreeks aan de kassa")}
            ${section("Hersteldienst", "Een apart hersteldossier brengt klantgegevens, status, diagnose/oplossing en QR-opvolging samen. Zo wordt een herstelling een traceerbaar proces van intake tot afhaling.", "hersteldienst", "Hersteldienst")}
            ${section("Personeelsplanning en verlof", "Roosters, verlof en bezetting staan samen in één overzicht. De bezettingsrij maakt meteen zichtbaar of er voldoende mensen ingepland zijn.", "personeelsplanning", "Personeelsplanning en verlof")}
            ${section("Platform Console", "Een afgeschermd centraal overzicht voor winkelstatus, incidenten, synchronisatierisico's en meetdekking, met een duidelijke actiewachtrij wanneer een winkel nog geactiveerd moet worden.", "platform-console", "Platform Console")}
            ${section("Winkelstatus en veilige support", "Per winkel is er een duidelijk operationeel overzicht: synchronisatie, integraties, abonnement en open actiepunten. Vanuit die context kan support gericht en gecontroleerd opvolgen, zonder dat de winkelier losse informatie moet verzamelen.", "support", "Winkelstatus en support")}
            ${section("Team en releases", "De Platform Console bevat ook rollen voor het interne team en een gecontroleerde releaseflow. Zo kunnen rechten, feature-flags en uitrolmomenten bewust beheerd worden naarmate er meer winkels bijkomen.", "releases", "Team en releases")}
            ${section("Integration Hub — eerste werkende fundering", "De kernflow staat er al: bronbestanden inladen, velden controleren en mappen, aantallen vooraf zien en pas daarna veilig activeren. De migratie blijft omkeerbaar tot de eerste echte activiteit.", "integratiehub", "Integration Hub")}
          </table>
          <p style="margin: 30px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px; color: #334155;">Ik licht dit graag eens live toe. Vooral de combinatie van kassaflow, herstellingen en het centrale beheer lijkt me interessant om samen door te nemen. Laat maar weten wanneer het past.</p>
          <p style="margin: 22px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px; color: #334155;">Groeten,<br />Kevin</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;

const parts = [
  "From: Kevin <kevin@pwayment.be>",
  "To: Fabrice",
  "Subject: Pwayment Retail — concrete productupdate",
  "MIME-Version: 1.0",
  `Content-Type: multipart/related; boundary=\"${boundary}\"`,
  "",
  `--${boundary}`,
  `Content-Type: multipart/alternative; boundary=\"${alternativeBoundary}\"`,
  "",
  `--${alternativeBoundary}`,
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  text,
  "",
  `--${alternativeBoundary}`,
  "Content-Type: text/html; charset=UTF-8",
  "Content-Transfer-Encoding: 8bit",
  "",
  html,
  "",
  `--${alternativeBoundary}--`,
];

for (const image of images) {
  const buffer = fs.readFileSync(path.join(imageDirectory, image.file));
  parts.push(
    `--${boundary}`,
    "Content-Type: image/png",
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${image.cid}>`,
    `Content-Disposition: inline; filename=\"${image.file}\"`,
    "",
    encodeBase64(buffer),
  );
}

parts.push(`--${boundary}--`, "");
fs.writeFileSync(outputPath, parts.join("\r\n"));
const editableHtml = images.reduce(
  (document, image) => document.replace(`src=\"cid:${image.cid}\"`, `src=\"public/mail-assets/fabrice/${image.file}\"`),
  html,
).replace("<body ", "<body contenteditable=\"true\" ");
fs.writeFileSync(editableOutputPath, editableHtml);
console.log(`Created ${outputPath}`);
console.log(`Created ${editableOutputPath}`);
