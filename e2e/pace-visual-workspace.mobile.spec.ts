import { expect, openApp, test } from "./fixtures";

test("Pace keeps its composer inside narrow and keyboard-sized viewports", async ({ appPage }) => {
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Open Pace, operationele assistent" }).click();
  const panel = appPage.getByRole("dialog", { name: "Pace operationele assistent" });
  await expect(panel.getByRole("button", { name: "Vergroot Pace" })).toBeHidden();
  await panel.getByRole("textbox", { name: "Vraag Pace", exact: true }).fill("Hoe scan ik een product?");
  await panel.getByRole("button", { name: "Stuur vraag", exact: true }).click();
  await expect(panel.locator(".pace-response")).toBeVisible();
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 420 }]) {
    await appPage.setViewportSize(viewport);
    const input = panel.getByRole("textbox", { name: "Vervolgvraag aan Pace" });
    await input.fill("Een vervolgvraag\nmet meer context\nen een derde regel");
    await expect(input).toBeInViewport();
    await expect(panel.getByRole("button", { name: "Stuur vervolgvraag" })).toBeInViewport();
    await expect.poll(() => panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const inputBox = element.querySelector("textarea")!.getBoundingClientRect();
      const close = element.querySelector('[aria-label="Sluit Pace"]')!.getBoundingClientRect();
      return {
        overflow: element.scrollWidth > element.clientWidth,
        inputInside: inputBox.top >= box.top && inputBox.bottom <= box.bottom,
        closeInside: close.left >= box.left && close.right <= box.right,
      };
    })).toEqual({ overflow: false, inputInside: true, closeInside: true });
  }
});