from PIL import Image
import numpy as np

img = Image.open('student.png').convert('RGBA')
data = np.array(img)

# sum alpha across rows to find empty columns
alpha_cols = np.sum(data[:,:,3], axis=0)

# Print width and height
print(f"Image size: {img.size}")

# Print regions where alpha > 0 (meaning pixels exist)
in_sprite = False
start = 0
sprites = []
for i, a in enumerate(alpha_cols):
    if a > 0 and not in_sprite:
        in_sprite = True
        start = i
    elif a == 0 and in_sprite:
        in_sprite = False
        sprites.append((start, i-1))
if in_sprite:
    sprites.append((start, len(alpha_cols)-1))

print("Sprite column chunks:", sprites)
print("Estimated columns:", len(sprites))
