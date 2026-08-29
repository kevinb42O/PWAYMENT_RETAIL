import { expect, openApp, test } from "./fixtures";

test("a question turns the existing Pace drawer into a dedicated conversation", async ({ appPage }) => {
  await appPage.route("**/api/pace/respond", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        answer: "#### Beste verkoopsdag\n\n- zaterdag\n  - Gemiddelde dagomzet: € 856,96\n  - Verkopen: 20",
        model: "PWAYMENT Analytics",
        source: "analytics",
      }),
    });
  });
  await openApp(appPage);

  await appPage.getByRole("button", { name: "Open Pace, operationele assistent" }).click();
  const drawer = appPage.getByRole("dialog", { name: "Pace operationele assistent" });
  await expect(drawer.getByText("Nu belangrijk")).toBeVisible();

  const question = "Welke dag is historisch gezien de beste verkoopsdag?";
  await drawer.getByRole("textbox", { name: "Vraag Pace" }).fill(question);
  await drawer.getByRole("textbox", { name: "Vraag Pace" }).press("Enter");

  const questionCard = drawer.getByLabel("Jouw vraag");
  await expect(questionCard.getByText(question)).toBeVisible();
  await expect(drawer.getByText("Nu belangrijk")).toHaveCount(0);
  await expect(drawer.getByText("WINKELSETUP")).toHaveCount(0);
  await expect(drawer.getByRole("textbox", { name: "Vervolgvraag aan Pace" })).toBeVisible();
  await expect(drawer.locator(".pace-response")).toBeVisible();
  await expect(drawer.getByText(/PACE · (LIVE GEGEVENS|LOKALE KENNIS)/)).toBeVisible();
  await expect(drawer.getByRole("img", { name: "Pace · oplossing beschikbaar" }).first()).toBeVisible();

  const geometry = await appPage.evaluate(() => {
    const panel = document.querySelector(".pace-panel")!.getBoundingClientRect();
    const questionBox = document.querySelector(".pace-question-card")!.getBoundingClientRect();
    const answer = document.querySelector(".pace-conversation-body")!.getBoundingClientRect();
    const composer = document.querySelector(".pace-conversation-composer")!.getBoundingClientRect();
    return {
      drawerWidth: Math.round(panel.width),
      questionAboveAnswer: questionBox.bottom <= answer.top + 1,
      answerAboveComposer: answer.bottom <= composer.top + 1,
      composerInsideDrawer: composer.bottom <= panel.bottom,
    };
  });
  expect(geometry.drawerWidth).toBeLessThanOrEqual(482);
  expect(geometry).toMatchObject({
    questionAboveAnswer: true,
    answerAboveComposer: true,
    composerInsideDrawer: true,
  });

  await drawer.getByRole("button", { name: "Terug naar Nu belangrijk" }).click();
  await expect(drawer.getByText("Nu belangrijk")).toBeVisible();
  await expect(drawer.getByLabel("Jouw vraag")).toHaveCount(0);
});
