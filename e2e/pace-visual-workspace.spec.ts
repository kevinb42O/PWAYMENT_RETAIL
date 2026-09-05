import AxeBuilder from "@axe-core/playwright";
import { expect, openApp, test } from "./fixtures";

test("Pace is frameless and its greeting genuinely morphs geometry back into the ribbon", async ({ appPage }) => {
  await appPage.emulateMedia({ reducedMotion: "no-preference" });
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Open Pace, operationele assistent" }).click();
  const character = appPage.locator(".pace-welcome-mark");
  await expect(character.locator(".pace-mark-shell")).toHaveCount(0);
  const geometry = await character.evaluate((element) => {
    const svg = element.querySelector<SVGSVGElement>(".pace-mark-vector")!;
    const animation = svg.querySelector<SVGAnimateElement>("animate")!;
    const shape = svg.querySelector<SVGUseElement>(".pace-mark-vector-front")!;
    svg.pauseAnimations();
    const start = animation.getStartTime();
    const duration = Number.parseFloat(animation.getAttribute("dur")!);
    const frames = [0, duration * .4, duration + .01].map((time) => {
      svg.setCurrentTime(start + time);
      const box = shape.getBBox();
      return { width: box.width, height: box.height };
    });
    svg.unpauseAnimations();
    return { frames, easing: animation.getAttribute("calcMode"), repeat: animation.getAttribute("repeatCount") };
  });
  expect(geometry.easing).toBe("spline");
  expect(geometry.repeat).toBe("1");
  expect(Math.abs(geometry.frames[1].width - geometry.frames[0].width)).toBeGreaterThan(5);
  expect(geometry.frames[2].width).toBeCloseTo(geometry.frames[0].width, 1);
  expect(geometry.frames[2].height).toBeCloseTo(geometry.frames[0].height, 1);
});

test("Pace expands without losing a multiline draft and returns keyboard focus", async ({ appPage }) => {
  await openApp(appPage);
  const launcher = appPage.getByRole("button", { name: "Open Pace, operationele assistent" });
  await launcher.click();
  const panel = appPage.getByRole("dialog", { name: "Pace operationele assistent" });
  const input = panel.getByRole("textbox", { name: "Vraag Pace", exact: true });
  await input.fill("Hoe scan ik");
  await input.press("Shift+Enter");
  await input.pressSequentially("een product?");
  await expect(input).toHaveValue("Hoe scan ik\neen product?");
  await expect(panel.getByLabel("Jouw vraag")).toHaveCount(0);
  await panel.getByRole("button", { name: "Vergroot Pace" }).click();
  await expect(panel).toHaveClass(/is-expanded/);
  await expect(input).toHaveValue("Hoe scan ik\neen product?");
  expect((await panel.boundingBox())!.width).toBeGreaterThan(700);
  await input.fill("Hoe scan ik een product?");
  await input.press("Enter");
  await expect(panel.locator(".pace-response")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Vervolgvraag aan Pace" })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Vervolgvraag aan Pace" })).toBeFocused();
  await panel.getByRole("button", { name: "Maak Pace compacter" }).click();
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(482);
  await panel.getByRole("textbox", { name: "Vervolgvraag aan Pace" }).focus();
  await appPage.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("Pace supports light and dark contrast and reduced motion", async ({ appPage }) => {
  await appPage.emulateMedia({ reducedMotion: "reduce" });
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Open Pace, operationele assistent" }).click();
  const panel = appPage.locator(".pace-panel");
  await expect(panel).toHaveAttribute("data-motion", "off");
  await expect(panel.locator(".pace-mark-stage").first()).toHaveAttribute("data-motion", "off");
  for (const dark of [false, true]) {
    await appPage.evaluate((enabled) => document.documentElement.classList.toggle("theme-dark", enabled), dark);
    const results = await new AxeBuilder({ page: appPage }).include(".pace-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations, `${dark ? "dark" : "light"} PACE accessibility`).toEqual([]);
  }
  const backgrounds = await panel.evaluate((element) => ({
    panel: getComputedStyle(element).backgroundColor,
    input: getComputedStyle(element.querySelector("textarea")!).backgroundColor,
  }));
  expect(backgrounds).toEqual({ panel: "rgb(16, 35, 40)", input: "rgb(23, 46, 51)" });
  await panel.getByRole("textbox", { name: "Vraag Pace", exact: true }).fill("Hoe scan ik een product?");
  await panel.getByRole("button", { name: "Stuur vraag", exact: true }).click();
  await expect(panel.locator(".pace-response")).toBeVisible();
  expect((await new AxeBuilder({ page: appPage }).include(".pace-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});