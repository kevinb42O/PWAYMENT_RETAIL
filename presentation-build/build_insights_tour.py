from pathlib import Path
from PIL import Image
import math


ASSETS = Path(__file__).parent / "assets"
SOURCES = [ASSETS / f"insights-tour-{index}.png" for index in range(4)]
OUTPUT = ASSETS / "pwayment-inzichten-tour.gif"

# The application has a fixed header and one vertically scrolling content pane.
# Each browser capture is 470 px further down that pane, allowing us to stitch
# the real UI into one continuous page and then pan a camera over it.
HEADER_HEIGHT = 70
SCROLL_STEPS = [0, 470, 940, 1413]
VIEWPORT_HEIGHT = 720


def eased_positions(max_scroll: int):
    positions = [0] * 8
    frames = 54
    for index in range(frames):
        progress = index / (frames - 1)
        eased = 0.5 - 0.5 * math.cos(math.pi * progress)
        positions.append(round(max_scroll * eased))
    positions.extend([max_scroll] * 14)
    return positions


def main():
    captures = [Image.open(path).convert("RGB") for path in SOURCES]
    width, height = captures[0].size
    if height != VIEWPORT_HEIGHT:
        raise RuntimeError(f"Unexpected capture height: {height}")

    visible_height = height - HEADER_HEIGHT
    header = captures[0].crop((0, 0, width, HEADER_HEIGHT))
    full_height = visible_height + sum(
        SCROLL_STEPS[index] - SCROLL_STEPS[index - 1]
        for index in range(1, len(SCROLL_STEPS))
    )
    full_page = Image.new("RGB", (width, full_height), "white")
    full_page.paste(captures[0].crop((0, HEADER_HEIGHT, width, height)), (0, 0))

    previous_position = SCROLL_STEPS[0]
    previous_end = visible_height
    for index in range(1, len(captures)):
        position = SCROLL_STEPS[index]
        overlap = max(0, previous_end - position)
        new_content = captures[index].crop((0, HEADER_HEIGHT + overlap, width, height))
        full_page.paste(new_content, (0, previous_end))
        previous_end += new_content.height
        previous_position = position

    output_size = (1152, 648)
    frames = []
    max_scroll = full_page.height - visible_height
    for position in eased_positions(max_scroll):
        frame = Image.new("RGB", (width, height), "white")
        frame.paste(header, (0, 0))
        frame.paste(full_page.crop((0, position, width, position + visible_height)), (0, HEADER_HEIGHT))
        frames.append(frame.resize(output_size, Image.Resampling.LANCZOS).quantize(colors=192, method=Image.Quantize.MEDIANCUT))

    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=92,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
