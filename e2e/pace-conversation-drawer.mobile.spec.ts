import { expect, openApp, test } from "./fixtures";

test("the Pace conversation uses the full mobile drawer without hiding the question or composer", async ({ appPage }) => {
  await appPage.route("**/api/pace/respond", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        answer: "#### Voorraadadvies\n\n- Combineer het trage artikel met een hardloper.\n  - Bewaak minstens 25 procent brutomarge.",
        model: "PWAYMENT Analytics",
        source: "analytics",
      }),
    });
  });
  await openApp(appPage);

  await appPage.getByRole("button", { name: "Open Pace, operationele assistent" }).click();
  const drawer = appPage.getByRole("dialog", { name: "Pace operationele assistent" });
  const question = "Welke voorraad moet ik eerst wegwerken?";
  await drawer.getByRole("textbox", { name: "Vraag Pace" }).fill(question);
  await drawer.getByRole("textbox", { name: "Vraag Pace" }).press("Enter");

  await expect(drawer.getByLabel("Jouw vraag").getByText(question)).toBeVisible();
  await expect(drawer.getByText("Nu belangrijk")).toHaveCount(0);
  await expect(drawer.getByRole("textbox", { name: "Vervolgvraag aan Pace" })).toBeVisible();

  const geometry = await appPage.evaluate(() => {
    const panel = document.querySelector(".pace-panel")!.getBoundingClientRect();
    const questionBox = document.querySelector(".pace-question-card")!.getBoundingClientRect();
    const composer = document.querySelector(".pace-conversation-composer")!.getBoundingClientRect();
    return {
      panelLeft: Math.round(panel.left),
      panelWidth: Math.round(panel.width),
      viewportWidth: window.innerWidth,
      questionVisible: questionBox.top >= panel.top && questionBox.bottom <= panel.bottom,
      composerVisible: composer.top >= panel.top && composer.bottom <= panel.bottom,
    };
  });
  expect(geometry).toMatchObject({ panelLeft: 0, questionVisible: true, composerVisible: true });
  expect(geometry.panelWidth).toBe(geometry.viewportWidth);
});
