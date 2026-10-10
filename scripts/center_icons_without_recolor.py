#!/usr/bin/env python3
"""One-time fix: center KonDate icons without ever changing the source colors."""
from collections import Counter
from io import BytesIO
from pathlib import Path
import json, subprocess
from PIL import Image

SOURCE_COMMIT = "c0d07971e5339a80ce1e5c08ff9831b18b439918"
ICON_512 = "icons/icon-512.png"
ICON_192 = "icons/icon-192.png"
ICON_180 = "icons/apple-touch-icon.png"

def load_original(path):
    data = subprocess.check_output(["git", "show", f"{SOURCE_COMMIT}:{path}"])
    result = Image.open(BytesIO(data))
    result.load()
    return result

def center_preserving_colors(original):
    assert original.mode == "P"
    bg = original.getpixel((0,0))
    pts = [(x,y) for y in range(original.height) for x in range(original.width)
           if original.getpixel((x,y)) != bg]
    xmin=min(x for x,_ in pts);xmax=max(x for x,_ in pts)
    ymin=min(y for _,y in pts);ymax=max(y for _,y in pts)
    dx=round((original.width-1-xmin-xmax)/2)
    dy=round((original.height-1-ymin-ymax)/2)
    out=Image.new("P",original.size,bg)
    out.putpalette(original.getpalette())
    out.paste(original,(dx,dy))
    assert Counter(out.convert("RGB").getdata()) == Counter(original.convert("RGB").getdata()), "COLOR CHANGED"
    return out,(dx,dy)

def main():
    if json.loads(Path("package.json").read_text())["version"] != "1.3.63":
        return
    image512=load_original(ICON_512)
    image180=load_original(ICON_180)
    # The v1.3.61 192px PNG had a damaged data stream; regenerate it from
    # the undamaged 512px image with no interpolation or recoloring.
    image192=image512.resize((192,192),Image.Resampling.NEAREST)
    for name,src in [(ICON_512,image512),(ICON_192,image192),(ICON_180,image180)]:
        centered,offset=center_preserving_colors(src)
        centered.save(name,optimize=True)
        validate=Image.open(name)
        validate.load()
        assert validate.size==src.size
        assert Counter(validate.convert("RGB").getdata())==Counter(src.convert("RGB").getdata())
        print(f"{name}: centered by {offset}, original colors preserved")

if __name__=="__main__":
    main()
