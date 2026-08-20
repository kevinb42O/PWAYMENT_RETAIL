set theBody to "Hoi Fabrice," & return & return & ¬
  "Ik wil je even tonen waar Pwayment Retail vandaag staat. De voorbije week is er veel meer bijgekomen dan alleen een kassa: we hebben nu een volledigere winkelervaring voor de klant, een sterkere operationele laag voor de winkel én de basis om meerdere winkels goed te beheren." & return & return & ¬
  "Ik heb de belangrijkste schermen toegevoegd:" & return & ¬
  "• Klantenscherm: een echte tweede display aan de kassa, met een welkomsscherm wanneer er geen aankoop actief is en een live aankoopoverzicht tijdens het afrekenen." & return & ¬
  "• Factuur rechtstreeks vanuit de actieve verkoop." & return & ¬
  "• Hersteldienst: intake, status, diagnose, klantcontact en QR-opvolging in één dossier." & return & ¬
  "• Personeelsplanning, verlof en bezetting." & return & ¬
  "• Platform Console voor winkelgezondheid, incidenten, synchronisatie en support." & return & ¬
  "• Teamrollen en gecontroleerd beheer." & return & ¬
  "• Integration Hub voor gecontroleerde import en migratie." & return & return & ¬
  "Ik wil dit graag eens live met je doornemen. Vooral het klantenscherm, de hersteldienst en de Platform Console tonen goed hoe groot de stap ondertussen is geworden." & return & return & ¬
  "Groeten," & return & "Kevin"

set assetFolder to POSIX file "/Users/kevin/PROJECTS/pwayment RETAIL/public/mail-assets/" as alias
set assetNames to {"screenshot_1_customer_display_idle.png", "screenshot_1_customer_display.png", "screenshot_2_invoicing_and_receipt_barcode.png", "screenshot_3_servicedesk_and_onboarding.png", "screenshot_4_workforce_management.png", "screenshot_5_platform_admin_console.png", "screenshot_5_stores_and_support_triage.png", "screenshot_5_team_and_releases.png", "screenshot_6_integration_hub.png"}

tell application "Mail"
  activate
  set newMessage to make new outgoing message with properties {subject:"Pwayment Retail — grote productupdate", content:theBody, visible:true}
  tell newMessage
    repeat with assetName in assetNames
      set assetFile to (POSIX path of assetFolder) & (contents of assetName)
      make new attachment with properties {file name:(POSIX file assetFile)} at after the last paragraph
    end repeat
  end tell
end tell
