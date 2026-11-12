# Renders the "clean plates" for the reveal: for every gift, the part of the
# tree scene around it WITHOUT that gift (and its tag). When someone opens their
# gift, the page lays this patch over the landing picture and the live 3D gift
# takes the rendered one's place, in the same spot, seen by the same camera.
#
# Run:  blender -b blender/wichtel-baum.blend --python tools/render-plates.py
# Writes public/img/leer/{breit,hoch}-{i}.webp and prints the JSON for gifts.js (PLATES).
import bpy, json, os, math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))
OUT = os.path.join(ROOT, 'public', 'img', 'leer')
os.makedirs(OUT, exist_ok=True)
exec(bpy.data.texts['wichtel_layout.py'].as_string())
sc = bpy.context.scene
r = sc.render
r.engine = 'CYCLES'
r.image_settings.color_mode = 'RGBA'
r.film_transparent = True
r.use_border = True
r.use_crop_to_border = True
r.image_settings.file_format = 'WEBP'
r.image_settings.quality = 88

def parts(i):
    g = O[f"Geschenk{i}"]
    return [g] + list(g.children_recursive) + [O[f"TagKarte{i}"], O[f"TagOese{i}"], O[f"TagKordel{i}"]]

result = {}
for layout in ('hoch', 'breit'):
    apply(layout)
    build_tags()
    bpy.context.view_layer.update()
    anchors = tag_anchors()
    cam = sc.camera
    rx, ry = r.resolution_x, r.resolution_y
    info = {"cam": [list(cam.matrix_world.translation), list(O["CamTarget"].location)], "angle": math.degrees(cam.data.angle), "fit": cam.data.sensor_fit, "res": [rx, ry], "plates": []}
    for i in range(10):
        bx, by, bw, bh = anchors[i]['box']
        # The floor shadow falls to the left (key light from the right): more room on that side.
        x0 = max(0, math.floor((bx - bw * 1.2) * rx)); x1 = min(rx, math.ceil((bx + bw * 1.35) * rx))
        y0 = max(0, math.floor((by - bh * 0.35) * ry)); y1 = min(ry, math.ceil((by + bh * 1.35) * ry))
        r.border_min_x, r.border_max_x = x0 / rx, x1 / rx
        r.border_min_y, r.border_max_y = 1 - y1 / ry, 1 - y0 / ry
        hidden = parts(i)
        for o in hidden: o.hide_render = True
        r.filepath = os.path.join(OUT, f'{layout}-{i}.webp')
        bpy.ops.render.render(write_still=True)
        for o in hidden: o.hide_render = False
        info["plates"].append([round(x0 / rx, 5), round(y0 / ry, 5), round((x1 - x0) / rx, 5), round((y1 - y0) / ry, 5)])
        print('PLATE', layout, i, flush=True)
    result[layout] = info
print('JSON>>' + json.dumps(result))
